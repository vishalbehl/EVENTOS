from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.concurrency import raise_version_conflict
from app.modules.events.models.event import Event
from app.modules.rbac.schemas.event import EventCreate, EventUpdate


class EventMutationService:
    """Canonical event-settings mutation shared by both administrative portals."""

    @staticmethod
    def update_operations(payload: EventUpdate) -> tuple[str, ...]:
        """Bounded canonical action set, shared by fresh writes and receipt replay."""
        operations = ["events.planning.manage"]
        changes = payload.model_dump(exclude_unset=True)
        if "registration_settings" in changes:
            operations.append("registration.forms.manage")
            registration = changes["registration_settings"] or {}
            if {"tier_cutoffs", "auto_approve_paid", "auto_approve_free"} & registration.keys():
                operations.append("registration.payments.manage")
            if "badge_design" in registration:
                operations.append("badges.templates.manage")
        if "currency" in changes:
            operations.append("registration.payments.manage")
        if "speaker_settings" in changes:
            operations.append("speakers.manage")
            speaker_branding = (changes["speaker_settings"] or {}).get("branding")
            if isinstance(speaker_branding, dict):
                operations.append("branding.theme.manage")
                if {"logo_url", "banner_url", "header_images", "favicon_url"} & speaker_branding.keys():
                    operations.append("branding.logo.manage")
                if {"theme", "theme_color", "primary_color", "secondary_color"} & speaker_branding.keys():
                    operations.append("branding.colors.manage")
                if "font_family" in speaker_branding:
                    operations.append("branding.fonts.manage")
        if "theme_color" in changes:
            operations.extend(("branding.theme.manage", "branding.colors.manage"))
        if {"logo_url", "banner_url"} & changes.keys():
            operations.extend(("branding.theme.manage", "branding.logo.manage"))
        registration = changes.get("registration_settings")
        if isinstance(registration, dict) and (
            {"theme_config", "theme_preset", "primary_color", "secondary_color",
             "bg_mode", "svg_pattern", "bg_image_url", "bg_solid_color"} & registration.keys()
        ):
            operations.extend(("branding.theme.manage", "branding.colors.manage"))
        branding = changes.get("branding_settings")
        if branding is not None:
            fields = set(branding)
            operations.append("branding.theme.manage")
            if "theme_color" in fields or any("color" in field for field in fields):
                operations.append("branding.colors.manage")
            if any("font" in field for field in fields):
                operations.append("branding.fonts.manage")
            if fields & {"logo_url", "banner_url", "header_images", "favicon_url"}:
                operations.append("branding.logo.manage")
        return tuple(dict.fromkeys(operations))

    @staticmethod
    async def authorize_update(db, *, event, payload, actor_user_id, audience="CUSTOMER"):
        for operation in EventMutationService.update_operations(payload):
            await enforce_event_operation(db, event.organization_id, event.id,
                operation, user_id=actor_user_id, _audience=audience)

    @staticmethod
    async def create(db: AsyncSession, *, organization_id: uuid.UUID, payload: EventCreate,
                     actor_user_id: uuid.UUID, idempotency_key: str, source: str) -> Event:
        from app.core.tenant_context import TenantContextGuard
        workspace_id = await EventMutationService.authorize_creation(db,
            organization_id=organization_id, payload=payload, actor_user_id=actor_user_id)
        async with TenantContextGuard.scoped(db, organization_id):
            return await EventMutationService._create_owned(db, organization_id=organization_id,
                payload=payload, actor_user_id=actor_user_id, idempotency_key=idempotency_key,
                source=source, workspace_id=workspace_id)

    @staticmethod
    async def authorize_creation(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        payload: EventCreate,
        actor_user_id: uuid.UUID,
    ) -> uuid.UUID:
        from app.core.tenant_context import TenantContextGuard
        from app.modules.identity.models.user import User
        from app.modules.platform.models.organization import Organization
        from app.modules.rbac.models.access_foundation import OperationalWorkspace
        from app.modules.rbac.services.access_foundation import lock_revision
        from app.modules.rbac.services.permission_service import get_user_permissions
        from app.modules.rbac.services.platform_permissions import platform_permission_authority
        selector = db.info.get("customer_request_selector")
        selected_workspace = None
        if selector is not None:
            if (db.info.get("customer_request_identity") != actor_user_id or
                    selector.active_organization_id != organization_id):
                raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
            if selector.access_mode != "DIRECT":
                raise HTTPException(403, detail={"code": "DIRECT_MEMBERSHIP_REQUIRED"})
            from types import SimpleNamespace
            from app.modules.rbac.services.access_contexts import validate_request_selector
            await validate_request_selector(db, SimpleNamespace(id=actor_user_id,
                organization_id=selector.organization_id), selector)
            selected_workspace = selector.active_workspace_id
            if (selected_workspace is not None and payload.operational_workspace_id is not None
                    and selected_workspace != payload.operational_workspace_id):
                raise HTTPException(404, detail={"code": "WORKSPACE_NOT_FOUND"})

        identity = (await db.execute(select(User.__table__.c.id, User.__table__.c.platform_role).where(
            User.__table__.c.id == actor_user_id, User.__table__.c.is_active.is_(True),
            User.__table__.c.deleted_at.is_(None)))).first()
        if identity is None:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        if identity.platform_role is not None:
            await platform_permission_authority(db, actor_user_id, "platform:organizations:manage")
        async with TenantContextGuard.scoped(db, organization_id):
            # Shared lock orders creation before archival/revocation. It remains
            # held until the owning command commits, including bulk imports.
            await lock_revision(db, organization_id, write=False)
            organization = await db.scalar(select(Organization.id).where(
                Organization.id == organization_id, Organization.is_active.is_(True),
                Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)))
            if organization is None:
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
            query = select(OperationalWorkspace.id).where(
                OperationalWorkspace.organization_id == organization_id,
                OperationalWorkspace.status == "ACTIVE")
            requested_workspace = payload.operational_workspace_id or selected_workspace
            if requested_workspace is None:
                query = query.where(OperationalWorkspace.is_default.is_(True))
            else:
                query = query.where(OperationalWorkspace.id == requested_workspace)
            workspace_id = await db.scalar(query)
            if workspace_id is None:
                raise HTTPException(503 if requested_workspace is None else 404,
                    detail={"code": "ACCESS_RECONCILIATION_REQUIRED" if requested_workspace is None else "RESOURCE_NOT_FOUND"})
            if identity.platform_role is None and "EVENTS:CREATE" not in await get_user_permissions(
                db, actor_user_id, organization_id=organization_id, workspace_id=workspace_id):
                raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
            return workspace_id

    @staticmethod
    async def _create_owned(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        payload: EventCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
        workspace_id: uuid.UUID,
    ) -> Event:
        existing = await db.scalar(
            select(Event.id).where(
                Event.organization_id == organization_id,
                Event.short_code == payload.short_code,
            )
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Short code '{payload.short_code}' already in use.",
            )

        event = Event(
            organization_id=organization_id,
            created_by=actor_user_id,
            **{**payload.model_dump_for_db(), "operational_workspace_id": workspace_id},
        )
        # The unified portal relationship may be initialized by Event.__init__;
        # reapply nested command settings explicitly so requested mode flags win
        # over relationship defaults.
        event.speaker_settings = payload.speaker_settings.model_dump()
        event.registration_settings = payload.registration_settings.model_dump()
        event.branding_settings = payload.branding_settings.model_dump()
        from app.modules.registration.models.portal_theme_setting import (
            PortalThemeSetting,
        )
        from app.modules.registration.routers.registration_portal import (
            DEFAULT_FAQS,
            DEFAULT_TERMS,
        )

        if event.portal_theme_setting is None:
            event.portal_theme_setting = PortalThemeSetting()
        if not event.portal_theme_setting.terms_and_conditions:
            event.portal_theme_setting.terms_and_conditions = DEFAULT_TERMS
        if not event.portal_theme_setting.faqs:
            event.portal_theme_setting.faqs = DEFAULT_FAQS
        db.add(event)
        await db.flush()


        from app.modules.registration.routers.participant_roles import (
            seed_default_roles,
        )
        # Email defaults are inherited through EmailTemplateResolver. Materializing
        # a copy here made platform fixes invisible and bypassed organisation-level
        # overrides; an event row is now created only on explicit customization.
        await seed_default_roles(event.id, db, commit=False)
        await db.flush()
        return event

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        payload: EventUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        _audience: str = "CUSTOMER",
    ) -> tuple[Event, dict[str, Any], list[str]]:
        if _audience not in {"CUSTOMER", "PLATFORM"}:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        await EventMutationService.authorize_update(db, event=event, payload=payload,
            actor_user_id=actor_user_id, audience=_audience)

        if expected_version is not None:
            # Serialize only protected concurrent edits. The route's event
            # dependency may have loaded a stale snapshot before this command.
            event = await db.scalar(
                select(Event)
                .where(
                    Event.id == event.id,
                    Event.organization_id == event.organization_id,
                    Event.deleted_at.is_(None),
                )
                # The event has an optional eagerly-loaded theme relationship;
                # lock only the authoritative event row, not the outer-joined
                # nullable side of that relationship.
                .with_for_update(of=Event)
                .execution_options(populate_existing=True)
            )
            if event is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
        current_version = int(event.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                "message": "The event was changed by another user. Reload before saving.",
                "details": {"current_version": current_version}})
        # Re-evaluate the locked row, not only the dependency's earlier snapshot.
        await EventMutationService.authorize_update(db, event=event, payload=payload,
            actor_user_id=actor_user_id, audience=_audience)

        if payload.short_code and payload.short_code != event.short_code:
            existing = await db.scalar(
                select(Event.id).where(
                    Event.organization_id == event.organization_id,
                    Event.short_code == payload.short_code,
                    Event.id != event.id,
                )
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Short code '{payload.short_code}' already in use.",
                )

        update_data = payload.model_dump(exclude_unset=True)
        if update_data.get("status") == "active":
            from app.modules.billing.models.event_activation import EventActivation

            activation_id = await db.scalar(
                select(EventActivation.id)
                .where(
                    EventActivation.organization_id == event.organization_id,
                    EventActivation.event_id == event.id,
                    EventActivation.status == "ACTIVE",
                )
                .limit(1)
            )
            if activation_id is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "EVENT_PLAN_ACTIVATION_REQUIRED"},
                )
        badge = (update_data.get("registration_settings") or {}).get("badge_design")
        if isinstance(badge, dict):
            from app.modules.registration.models.print_template import PrintTemplate
            assignments = badge.get("role_template_assignments") or {}
            if not isinstance(assignments, dict) or len(assignments) > 100:
                raise HTTPException(422, detail={"code": "INVALID_TEMPLATE_ASSIGNMENTS"})
            references = [badge.get("default_template_id"), *assignments.values()]
            try:
                template_ids = {uuid.UUID(value) for value in references if value}
            except (ValueError, TypeError, AttributeError) as exc:
                raise HTTPException(422, detail={"code": "INVALID_TEMPLATE_REFERENCE"}) from exc
            if template_ids:
                # Assign only event-owned copies; global/foreign templates must
                # pass through the authorised copy operation first.
                owned = set((await db.scalars(select(PrintTemplate.id).where(
                    PrintTemplate.id.in_(template_ids), PrintTemplate.event_id == event.id,
                    PrintTemplate.deleted_at.is_(None)).order_by(PrintTemplate.id)
                    .with_for_update(read=True, of=PrintTemplate))).all())
                if owned != template_ids:
                    raise HTTPException(404, detail={"code": "TEMPLATE_NOT_FOUND"})
        for settings_field in (
            "speaker_settings",
            "registration_settings",
            "branding_settings",
        ):
            if settings_field in update_data and update_data[settings_field] is not None:
                from app.modules.events.services.settings_policy import merge_settings
                update_data[settings_field] = merge_settings(
                    dict(getattr(event, settings_field) or {}), update_data[settings_field])

        effective_start = update_data.get("start_date", event.start_date)
        effective_end = update_data.get("end_date", event.end_date)
        if effective_end < effective_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="end_date must be on or after start_date",
            )

        old_state = {
            field: getattr(event, field, None)
            for field in update_data
        }
        for field, value in update_data.items():
            setattr(event, field, value)

        event.version = current_version + 1

        if not event.speaker_mode_enabled and not event.registration_mode_enabled:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="At least one mode (Speaker or Registration) must be enabled.",
            )

        await db.flush()
        return event, old_state, sorted(update_data)
