from __future__ import annotations

import hashlib
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from jose import JWTError, jwt
from sqlalchemy import select
from fastapi import HTTPException
from types import SimpleNamespace
from app.core.tenant_context import TenantContextGuard
from app.modules.rbac.services.access_contexts import direct_request_context
from app.modules.rbac.services.permission_service import get_user_permissions
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.events.models.event import Event
from app.modules.agenda.models import Room
from app.modules.identity.models.user import User
from app.modules.venue.models.room_device import RoomDevice


class RealtimeAuthError(ValueError):
    pass


@dataclass(frozen=True)
class RealtimePrincipal:
    kind: str
    organization_id: uuid.UUID
    role: str
    user_id: uuid.UUID | None = None
    device_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    room_id: uuid.UUID | None = None
    device_type: str | None = None
    amr: tuple[str, ...] = ()
    expires_at: int | None = None
    auth_revision: int | None = None
    access_mode: str = "DIRECT"
    acting_organization_id: uuid.UUID | None = None
    active_organization_id: uuid.UUID | None = None
    workspace_id: uuid.UUID | None = None
    relationship_id: uuid.UUID | None = None
    session_id: uuid.UUID | None = None
    policy_revision: int | None = None

    def to_session(self) -> dict[str, Any]:
        data = asdict(self)
        return {key: str(value) if isinstance(value, uuid.UUID) else value for key, value in data.items()}

    @classmethod
    def from_session(cls, data: dict[str, Any]) -> "RealtimePrincipal":
        converted = dict(data)
        for key in (
            "organization_id", "user_id", "device_id", "event_id", "room_id",
            "acting_organization_id", "active_organization_id", "workspace_id",
            "relationship_id", "session_id",
        ):
            if converted.get(key):
                converted[key] = uuid.UUID(str(converted[key]))
        converted["amr"] = tuple(converted.get("amr") or ())
        return cls(**converted)


async def authenticate_realtime(db: AsyncSession, credentials: dict[str, Any] | None) -> RealtimePrincipal:
    credentials = credentials or {}
    if not isinstance(credentials, dict) or any(key not in {"token", "access_token", "device_key"} for key in credentials):
        raise RealtimeAuthError("Invalid realtime credentials.")
    values = [value for value in credentials.values() if value]
    if len(values) != 1 or not isinstance(values[0], str) or len(values[0]) > 16 * 1024:
        raise RealtimeAuthError("One bounded realtime credential is required.")
    token = credentials.get("token") or credentials.get("access_token")
    if token:
        return await _authenticate_user_token(db, str(token))

    device_key = credentials.get("device_key")
    if device_key:
        return await _authenticate_device_key(db, str(device_key))

    raise RealtimeAuthError("Authentication credentials are required.")


async def _authenticate_user_token(db: AsyncSession, token: str) -> RealtimePrincipal:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": True},
        )
        if payload.get("type") != "access":
            raise RealtimeAuthError("An access token is required.")
        user_id = uuid.UUID(str(payload["sub"]))
        session_id_raw = payload.get("sid")
        access_mode = payload.get("ctx_mode") or "DIRECT"
        active_org_claim = payload.get("ctx_org") or payload.get("org")
        active_organization_id = uuid.UUID(str(active_org_claim))
        acting_org_claim = payload.get("ctx_actor_org") or active_org_claim
        acting_organization_id = uuid.UUID(str(acting_org_claim))
        workspace_id = uuid.UUID(str(payload["ctx_ws"])) if payload.get("ctx_ws") else None
        event_id = uuid.UUID(str(payload["ctx_event"])) if payload.get("ctx_event") else None
        relationship_id = uuid.UUID(str(payload["ctx_rel"])) if payload.get("ctx_rel") else None
        session_id = uuid.UUID(str(session_id_raw)) if session_id_raw else None
    except (JWTError, KeyError, TypeError, ValueError) as exc:
        raise RealtimeAuthError("Invalid or expired access token.") from exc

    if payload.get("role") == "developer" or "api_key" in (payload.get("amr") or ()) or payload.get("impersonator_id"):
        raise RealtimeAuthError("Browser realtime identity is required.")
    if not payload.get("jti") or type(payload.get("exp")) not in {int, float}:
        raise RealtimeAuthError("A bounded access session is required.")
    identity = User.__table__
    auth_revision = payload.get("auth_revision")
    if type(auth_revision) is not int or auth_revision < 1:
        raise RealtimeAuthError("A current authentication revision is required.")
    user = (await db.execute(select(identity.c.id, identity.c.role).where(
        identity.c.id == user_id, identity.c.is_active.is_(True), identity.c.deleted_at.is_(None),
        identity.c.auth_revision == auth_revision
    ))).first()
    if user is None:
        raise RealtimeAuthError("User account is unavailable.")

    if session_id is not None:
        from app.modules.identity.models.refresh_token import RefreshToken
        session_exists = await db.scalar(select(RefreshToken.id).where(
            RefreshToken.family_id == session_id,
            RefreshToken.user_id == user_id,
            RefreshToken.is_revoked.is_(False),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        ).limit(1))
        if session_exists is None:
            raise RealtimeAuthError("Realtime session has been revoked.")

    policy_revision = None
    try:
        if access_mode == "DIRECT":
            async with direct_request_context(db, user, active_organization_id, workspace_id=workspace_id) as direct_ctx:
                policy_revision = direct_ctx.policy_revision
        elif access_mode == "DELEGATED":
            from app.modules.rbac.services.delegated_access import delegated_request_context
            if not relationship_id or not workspace_id:
                raise RealtimeAuthError("Delegated context parameters are missing.")
            async with delegated_request_context(
                db,
                user,
                emc_organization_id=acting_organization_id,
                client_organization_id=active_organization_id,
                relationship_id=relationship_id,
                workspace_id=workspace_id,
                event_id=event_id,
            ) as delegated_ctx:
                revisions = getattr(delegated_ctx, "policy_revisions", ())
                policy_revision = max(revisions) if revisions else 1
        else:
            raise RealtimeAuthError("Unsupported realtime access mode.")
    except HTTPException as exc:
        if exc.status_code >= 500:
            raise
        raise RealtimeAuthError("Realtime context is unavailable.") from exc

    return RealtimePrincipal(
        kind="user",
        user_id=user.id,
        organization_id=active_organization_id,
        role=user.role if access_mode == "DIRECT" else "emc_staff",
        amr=tuple(str(item) for item in (payload.get("amr") or ())),
        expires_at=int(payload["exp"]),
        auth_revision=auth_revision,
        access_mode=access_mode,
        acting_organization_id=acting_organization_id,
        active_organization_id=active_organization_id,
        workspace_id=workspace_id,
        event_id=event_id,
        relationship_id=relationship_id,
        session_id=session_id,
        policy_revision=policy_revision,
    )


async def _authenticate_device_key(db: AsyncSession, device_key: str) -> RealtimePrincipal:
    key_hash = hashlib.sha256(device_key.encode("utf-8")).hexdigest()
    device = await db.scalar(
        select(RoomDevice)
        .where(RoomDevice.device_key_hash == key_hash)
        .execution_options(skip_tenant_filter=True)
    )
    if device is None:
        raise RealtimeAuthError("Invalid device credentials.")
    now = datetime.now(timezone.utc)
    if device.device_key_revoked_at is not None:
        raise RealtimeAuthError("Device credentials have been revoked.")
    if device.device_key_expires_at is not None and device.device_key_expires_at <= now:
        raise RealtimeAuthError("Device credentials have expired.")
    if device.trust_status != "TRUSTED" or device.compromise_detected or device.status == "maintenance":
        raise RealtimeAuthError("Device is not authorized for realtime access.")

    return RealtimePrincipal(
        kind="device",
        device_id=device.id,
        organization_id=device.organization_id,
        role="device",
        event_id=device.event_id,
        room_id=device.room_id,
        device_type=device.device_type,
        amr=("device_key",),
    )


async def authorize_event(db: AsyncSession, principal: RealtimePrincipal, event_id: uuid.UUID) -> Event:
    if principal.kind == "device":
        async with TenantContextGuard.scoped(db, principal.organization_id):
            device = await db.scalar(select(RoomDevice).where(
                RoomDevice.id == principal.device_id, RoomDevice.organization_id == principal.organization_id,
                RoomDevice.event_id == principal.event_id, RoomDevice.room_id == principal.room_id,
                RoomDevice.device_key_revoked_at.is_(None), RoomDevice.trust_status == "TRUSTED",
                RoomDevice.compromise_detected.is_(False), RoomDevice.status != "maintenance",
            ).execution_options(populate_existing=True))
            if device is None or (device.device_key_expires_at is not None and device.device_key_expires_at <= datetime.now(timezone.utc)):
                raise RealtimeAuthError("Device session is unavailable.")
            event = await db.scalar(select(Event).where(Event.id == event_id,
                Event.organization_id == principal.organization_id, Event.deleted_at.is_(None)))
            if event is None or principal.event_id != event.id:
                raise RealtimeAuthError("Event is unavailable.")
            return event
    if principal.kind != "user" or principal.user_id is None or principal.expires_at is None or principal.expires_at <= datetime.now(timezone.utc).timestamp():
        raise RealtimeAuthError("Realtime session is unavailable.")
    if principal.event_id is not None and principal.event_id != event_id:
        raise RealtimeAuthError("Event is outside authorized scope.")
    try:
        await reauthorize_principal(db, principal)
        if principal.access_mode == "DIRECT":
            async with direct_request_context(db, SimpleNamespace(id=principal.user_id), principal.organization_id, workspace_id=principal.workspace_id):
                actions = await get_user_permissions(db, principal.user_id, event_id,
                                                    organization_id=principal.organization_id,
                                                    workspace_id=principal.workspace_id)
                if "EVENTS:VIEW" not in actions:
                    raise RealtimeAuthError("Event is unavailable.")
                event = await db.scalar(select(Event).where(Event.id == event_id,
                    Event.organization_id == principal.organization_id, Event.deleted_at.is_(None)))
                if event is None:
                    raise RealtimeAuthError("Event is unavailable.")
                if principal.workspace_id is not None and event.operational_workspace_id != principal.workspace_id:
                    raise RealtimeAuthError("Event is outside authorized workspace.")
                return event
        else:
            from app.modules.rbac.services.delegated_access import delegated_request_context
            async with delegated_request_context(
                db,
                SimpleNamespace(id=principal.user_id),
                emc_organization_id=principal.acting_organization_id or principal.organization_id,
                client_organization_id=principal.organization_id,
                relationship_id=principal.relationship_id,
                workspace_id=principal.workspace_id,
                event_id=event_id,
                action="EVENTS:VIEW",
            ):
                event = await db.scalar(select(Event).where(Event.id == event_id,
                    Event.organization_id == principal.organization_id, Event.deleted_at.is_(None)))
                if event is None:
                    raise RealtimeAuthError("Event is unavailable.")
                if principal.workspace_id is not None and event.operational_workspace_id != principal.workspace_id:
                    raise RealtimeAuthError("Event is outside authorized workspace.")
                return event
    except HTTPException as exc:
        if exc.status_code >= 500:
            raise
        raise RealtimeAuthError("Event is unavailable.") from exc


async def authorize_room(db: AsyncSession, principal: RealtimePrincipal, room_id: uuid.UUID) -> Room:
    async with TenantContextGuard.scoped(db, principal.organization_id):
        room = await db.scalar(select(Room).join(Event, Event.id == Room.event_id).where(
            Room.id == room_id, Event.organization_id == principal.organization_id,
            Event.deleted_at.is_(None)))
        if room is None:
            raise RealtimeAuthError("Room is unavailable.")
        await authorize_event(db, principal, room.event_id)
        if principal.kind == "device" and principal.room_id != room.id:
            raise RealtimeAuthError("Room is unavailable.")
        return room


async def authorize_moderator_command(db, principal: RealtimePrincipal, event_id: uuid.UUID) -> None:
    await authorize_event(db, principal, event_id)
    if principal.kind == "device":
        if principal.device_type not in {"moderator_tablet", "technician_tablet", "presentation_pc"}:
            raise RealtimeAuthError("Device cannot issue presentation commands.")
        return
    async with TenantContextGuard.scoped(db, principal.organization_id):
        actions = await get_user_permissions(db, principal.user_id, event_id,
                                            organization_id=principal.organization_id,
                                            workspace_id=principal.workspace_id)
        if "QUEUE:OVERRIDE" not in actions:
            raise RealtimeAuthError("Presentation-control permission is required.")


async def reauthorize_principal(db, principal: RealtimePrincipal) -> None:
    if principal.kind == "device":
        await authorize_event(db, principal, principal.event_id)
        return
    if principal.user_id is None or principal.expires_at is None or principal.expires_at <= datetime.now(timezone.utc).timestamp():
        raise RealtimeAuthError("Realtime session is unavailable.")
    identity = User.__table__
    if type(principal.auth_revision) is not int or principal.auth_revision < 1:
        raise RealtimeAuthError("Realtime identity is unavailable.")
    if await db.scalar(select(identity.c.id).where(identity.c.id == principal.user_id,
            identity.c.is_active.is_(True), identity.c.deleted_at.is_(None),
            identity.c.auth_revision == principal.auth_revision)) is None:
        raise RealtimeAuthError("Realtime identity is unavailable.")

    if principal.session_id is not None:
        from app.modules.identity.models.refresh_token import RefreshToken
        session_active = await db.scalar(select(RefreshToken.id).where(
            RefreshToken.family_id == principal.session_id,
            RefreshToken.user_id == principal.user_id,
            RefreshToken.is_revoked.is_(False),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        ).limit(1))
        if session_active is None:
            raise RealtimeAuthError("Realtime session has been revoked.")

    try:
        if principal.access_mode == "DIRECT":
            async with direct_request_context(db, SimpleNamespace(id=principal.user_id), principal.organization_id, workspace_id=principal.workspace_id):
                pass
        else:
            from app.modules.rbac.services.delegated_access import delegated_request_context
            async with delegated_request_context(
                db, SimpleNamespace(id=principal.user_id),
                emc_organization_id=principal.acting_organization_id or principal.organization_id,
                client_organization_id=principal.organization_id,
                relationship_id=principal.relationship_id,
                workspace_id=principal.workspace_id,
                event_id=principal.event_id,
            ):
                pass
    except HTTPException as exc:
        if exc.status_code >= 500:
            raise
        raise RealtimeAuthError("Realtime context is unavailable.") from exc

