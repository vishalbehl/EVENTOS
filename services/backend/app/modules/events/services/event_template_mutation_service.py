from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.billing.services.usage_reservation_service import (
    UsageReservationService,
)
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.events.models.event import Event
from app.modules.notifications.schemas.notification import (
    EmailTemplateCreate,
    EmailTemplateUpdate,
)
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.schemas.print_template import (
    PrintTemplateCreate,
    PrintTemplateUpdate,
)


class EventTemplateMutationService:
    """Canonical email/print template writes shared by both admin portals."""

    @staticmethod
    def _contains_qr_element(value: object) -> bool:
        if isinstance(value, dict):
            element_type = str(
                value.get("type")
                or value.get("element_type")
                or value.get("kind")
                or ""
            ).strip().lower().replace("_", "").replace("-", "")
            if element_type in {"qr", "qrcode"}:
                return True
            return any(
                EventTemplateMutationService._contains_qr_element(item)
                for item in value.values()
            )
        if isinstance(value, list):
            return any(
                EventTemplateMutationService._contains_qr_element(item)
                for item in value
            )
        return False

    @staticmethod
    async def _enforce_email(
        db: AsyncSession,
        event: Event,
        actor_user_id: uuid.UUID,
        template_type: str,
    ) -> None:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.email_designer.manage",
            user_id=actor_user_id,
        )
        if template_type in {"reminder", "deadline"}:
            await enforce_event_operation(
                db,
                event.organization_id,
                event.id,
                "communications.reminders.manage",
                user_id=actor_user_id,
            )

    @staticmethod
    async def _enforce_print(
        db: AsyncSession,
        event: Event,
        actor_user_id: uuid.UUID,
        template_type: str,
        template_data: object,
    ) -> tuple[str, str]:
        is_certificate = template_type == "certificate"
        operation = (
            "certificates.templates.manage"
            if is_certificate
            else "badges.templates.manage"
        )
        limit_key = (
            "max_certificate_templates"
            if is_certificate
            else "max_badge_templates"
        )
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            operation,
            user_id=actor_user_id,
        )
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            (
                "certificates.custom_design.manage"
                if is_certificate
                else "badges.custom_design.manage"
            ),
            user_id=actor_user_id,
        )
        if not is_certificate and EventTemplateMutationService._contains_qr_element(
            template_data
        ):
            await enforce_event_operation(
                db,
                event.organization_id,
                event.id,
                "badges.qr.manage",
                user_id=actor_user_id,
            )
        return operation, limit_key

    @staticmethod
    async def create_email(
        db: AsyncSession,
        *,
        event: Event,
        payload: EmailTemplateCreate,
        actor_user_id: uuid.UUID,
    ) -> EmailTemplate:
        await EventTemplateMutationService._enforce_email(
            db, event, actor_user_id, payload.template_type
        )
        duplicate = await db.scalar(
            select(EmailTemplate.id).where(
                EmailTemplate.event_id == event.id,
                EmailTemplate.name == payload.name,
                EmailTemplate.target_type == payload.target_type,
                EmailTemplate.deleted_at.is_(None),
            ).execution_options(skip_tenant_filter=True)
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An active email template with this name and target already exists.",
            )
        row = EmailTemplate(
            event_id=event.id,
            created_by=actor_user_id,
            **payload.model_dump(),
        )
        db.add(row)
        await db.flush()
        return row

    @staticmethod
    async def update_email(
        db: AsyncSession,
        *,
        event: Event,
        template_id: uuid.UUID,
        payload: EmailTemplateUpdate,
        actor_user_id: uuid.UUID,
    ) -> tuple[EmailTemplate, dict[str, Any], list[str], bool]:
        source = await db.scalar(
            select(EmailTemplate)
            .where(
                EmailTemplate.id == template_id,
                (
                    (EmailTemplate.event_id == event.id)
                    | EmailTemplate.event_id.is_(None)
                ),
                EmailTemplate.deleted_at.is_(None),
            )
            .with_for_update()
            .execution_options(skip_tenant_filter=True)
        )
        if source is None:
            raise HTTPException(status_code=404, detail="Email template not found")
        await EventTemplateMutationService._enforce_email(
            db, event, actor_user_id, source.template_type
        )
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(status_code=422, detail="No template fields supplied")

        cloned = source.event_id is None
        if cloned:
            target = await db.scalar(
                select(EmailTemplate)
                .where(
                    EmailTemplate.event_id == event.id,
                    EmailTemplate.name == source.name,
                    EmailTemplate.target_type == source.target_type,
                    EmailTemplate.deleted_at.is_(None),
                )
                .with_for_update()
                .execution_options(skip_tenant_filter=True)
            )
            if target is None:
                target = EmailTemplate(
                    event_id=event.id,
                    created_by=actor_user_id,
                    name=source.name,
                    template_type=source.template_type,
                    target_type=source.target_type,
                    subject=source.subject,
                    body_html=source.body_html,
                    body_text=source.body_text,
                    designer_json=source.designer_json,
                    scope_type="EVENT",
                    stable_key=source.stable_key,
                    parent_template_id=source.id,
                    is_default=False,
                )
                db.add(target)
                await db.flush()
        else:
            target = source

        old = {key: getattr(target, key, None) for key in changes}
        for key, value in changes.items():
            setattr(target, key, value)
        await db.flush()
        return target, old, sorted(changes), cloned

    @staticmethod
    async def archive_email(
        db: AsyncSession,
        *,
        event: Event,
        template_id: uuid.UUID,
        actor_user_id: uuid.UUID,
    ) -> tuple[EmailTemplate, str]:
        row = await db.scalar(
            select(EmailTemplate)
            .where(
                EmailTemplate.id == template_id,
                EmailTemplate.event_id == event.id,
            )
            .with_for_update()
            .execution_options(skip_tenant_filter=True)
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Email template not found")
        await EventTemplateMutationService._enforce_email(
            db, event, actor_user_id, row.template_type
        )
        if row.deleted_at is not None:
            return row, "ALREADY_ARCHIVED"
        row.deleted_at = datetime.now(timezone.utc)
        row.deleted_by = actor_user_id
        await db.flush()
        return row, "SOFT_DELETED"

    @staticmethod
    async def restore_email(
        db: AsyncSession,
        *,
        event: Event,
        template_id: uuid.UUID,
        actor_user_id: uuid.UUID,
    ) -> tuple[EmailTemplate, str]:
        row = await db.scalar(
            select(EmailTemplate)
            .where(
                EmailTemplate.id == template_id,
                EmailTemplate.event_id == event.id,
            )
            .with_for_update()
            .execution_options(skip_tenant_filter=True)
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Email template not found")
        await EventTemplateMutationService._enforce_email(
            db, event, actor_user_id, row.template_type
        )
        if row.deleted_at is None:
            return row, "ALREADY_ACTIVE"
        row.deleted_at = None
        row.deleted_by = None
        await db.flush()
        return row, "RESTORED"

    @staticmethod
    async def create_print(
        db: AsyncSession,
        *,
        event: Event,
        payload: PrintTemplateCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> PrintTemplate:
        _, limit_key = await EventTemplateMutationService._enforce_print(
            db,
            event,
            actor_user_id,
            payload.template_type,
            payload.template_data,
        )
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key=limit_key,
            quantity=1,
            unit="template",
            idempotency_key=f"print-template-create:{idempotency_key}",
            metadata={
                "template_type": payload.template_type,
                "template_name": payload.template_name,
                "source": source,
            },
        )
        row = PrintTemplate(event_id=event.id, **payload.model_dump())
        db.add(row)
        await db.flush()
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.print_templates.create",
            actor_user_id=actor_user_id,
        )
        await db.flush()
        return row

    @staticmethod
    async def update_print(
        db: AsyncSession,
        *,
        event: Event,
        template_id: uuid.UUID,
        payload: PrintTemplateUpdate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> tuple[PrintTemplate, dict[str, Any], list[str]]:
        row = await db.scalar(
            select(PrintTemplate)
            .where(
                PrintTemplate.id == template_id,
                PrintTemplate.event_id == event.id,
                PrintTemplate.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Print template not found")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(status_code=422, detail="No template fields supplied")
        target_type = changes.get("template_type", row.template_type)
        target_data = changes.get("template_data", row.template_data)
        _, limit_key = await EventTemplateMutationService._enforce_print(
            db, event, actor_user_id, target_type, target_data
        )
        reservation = None
        if target_type != row.template_type:
            reservation = await UsageReservationService.reserve(
                db,
                organization_id=event.organization_id,
                event_id=event.id,
                limit_key=limit_key,
                quantity=1,
                unit="template",
                idempotency_key=f"print-template-transition:{idempotency_key}",
                metadata={
                    "template_id": str(row.id),
                    "from": row.template_type,
                    "to": target_type,
                    "source": source,
                },
            )
        old = {key: getattr(row, key, None) for key in changes}
        for key, value in changes.items():
            setattr(row, key, value)
        await db.flush()
        if reservation is not None:
            await UsageReservationService.consume(
                db,
                reservation.id,
                source=f"{source}.print_templates.transition",
                actor_user_id=actor_user_id,
            )
        await db.flush()
        return row, old, sorted(changes)

    @staticmethod
    async def archive_print(
        db: AsyncSession,
        *,
        event: Event,
        template_id: uuid.UUID,
        actor_user_id: uuid.UUID,
    ) -> tuple[PrintTemplate, str]:
        row = await db.scalar(
            select(PrintTemplate)
            .where(
                PrintTemplate.id == template_id,
                PrintTemplate.event_id == event.id,
            )
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Print template not found")
        await EventTemplateMutationService._enforce_print(
            db, event, actor_user_id, row.template_type, row.template_data
        )
        if row.deleted_at is not None:
            return row, "ALREADY_ARCHIVED"
        row.deleted_at = datetime.now(timezone.utc)
        row.deleted_by = actor_user_id
        await db.flush()
        return row, "SOFT_DELETED"

    @staticmethod
    async def restore_print(
        db: AsyncSession,
        *,
        event: Event,
        template_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> tuple[PrintTemplate, str]:
        row = await db.scalar(
            select(PrintTemplate)
            .where(
                PrintTemplate.id == template_id,
                PrintTemplate.event_id == event.id,
            )
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Print template not found")
        _, limit_key = await EventTemplateMutationService._enforce_print(
            db, event, actor_user_id, row.template_type, row.template_data
        )
        if row.deleted_at is None:
            return row, "ALREADY_ACTIVE"
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key=limit_key,
            quantity=1,
            unit="template",
            idempotency_key=f"print-template-restore:{idempotency_key}",
            metadata={"template_id": str(row.id), "source": source},
        )
        row.deleted_at = None
        row.deleted_by = None
        await db.flush()
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.print_templates.restore",
            actor_user_id=actor_user_id,
        )
        await db.flush()
        return row, "RESTORED"
