from __future__ import annotations

import hashlib
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from jose import JWTError, jwt
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.events.models.event import Event
from app.modules.events.models.room import Room
from app.modules.events.models.session import Session
from app.modules.identity.models.user import User
from app.modules.rbac.models.rbac import UserAccessNode
from app.modules.rbac.models.user_assignment import UserEventAssignment
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

    def to_session(self) -> dict[str, Any]:
        data = asdict(self)
        return {key: str(value) if isinstance(value, uuid.UUID) else value for key, value in data.items()}

    @classmethod
    def from_session(cls, data: dict[str, Any]) -> "RealtimePrincipal":
        converted = dict(data)
        for key in ("organization_id", "user_id", "device_id", "event_id", "room_id"):
            if converted.get(key):
                converted[key] = uuid.UUID(str(converted[key]))
        converted["amr"] = tuple(converted.get("amr") or ())
        return cls(**converted)


async def authenticate_realtime(db: AsyncSession, credentials: dict[str, Any] | None) -> RealtimePrincipal:
    credentials = credentials or {}
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
        organization_id = uuid.UUID(str(payload["org"]))
    except (JWTError, KeyError, TypeError, ValueError) as exc:
        raise RealtimeAuthError("Invalid or expired access token.") from exc

    user = await db.scalar(
        select(User)
        .where(User.id == user_id)
        .execution_options(skip_tenant_filter=True)
    )
    if user is None or not user.is_active or user.deleted_at is not None:
        raise RealtimeAuthError("User account is unavailable.")
    if user.role != "super_admin" and user.organization_id != organization_id:
        raise RealtimeAuthError("Token tenant does not match the user account.")

    return RealtimePrincipal(
        kind="user",
        user_id=user.id,
        organization_id=organization_id,
        role=user.role,
        amr=tuple(str(item) for item in (payload.get("amr") or ())),
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
    event = await db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .execution_options(skip_tenant_filter=True)
    )
    if event is None:
        raise RealtimeAuthError("Event is unavailable.")

    if principal.kind == "device":
        if principal.event_id != event.id or principal.organization_id != event.organization_id:
            raise RealtimeAuthError("Event is unavailable.")
        return event

    if principal.role != "super_admin" and principal.organization_id != event.organization_id:
        raise RealtimeAuthError("Event is unavailable.")

    if principal.role in {"session_manager", "technician", "volunteer"}:
        assigned = await db.scalar(
            select(UserAccessNode.id)
            .where(
                UserAccessNode.user_id == principal.user_id,
                or_(
                    and_(UserAccessNode.node_type == "EVENT", UserAccessNode.node_id == event.id),
                    and_(
                        UserAccessNode.node_type == "ROOM",
                        UserAccessNode.node_id.in_(select(Room.id).where(Room.event_id == event.id)),
                    ),
                    and_(
                        UserAccessNode.node_type == "SESSION",
                        UserAccessNode.node_id.in_(select(Session.id).where(Session.event_id == event.id)),
                    ),
                ),
            )
            .execution_options(skip_tenant_filter=True)
        )
        if not assigned:
            assigned = await db.scalar(
                select(UserEventAssignment.id)
                .where(
                    UserEventAssignment.user_id == principal.user_id,
                    UserEventAssignment.event_id == event.id,
                )
                .execution_options(skip_tenant_filter=True)
            )
        if not assigned:
            raise RealtimeAuthError("Event assignment is required.")
    return event


async def authorize_room(db: AsyncSession, principal: RealtimePrincipal, room_id: uuid.UUID) -> Room:
    room = await db.scalar(
        select(Room)
        .where(Room.id == room_id)
        .execution_options(skip_tenant_filter=True)
    )
    if room is None:
        raise RealtimeAuthError("Room is unavailable.")
    await authorize_event(db, principal, room.event_id)
    if principal.kind == "device" and principal.room_id != room.id:
        raise RealtimeAuthError("Room is unavailable.")
    return room


def authorize_moderator_command(principal: RealtimePrincipal) -> None:
    if principal.kind == "device":
        if principal.device_type not in {"moderator_tablet", "technician_tablet", "presentation_pc"}:
            raise RealtimeAuthError("Device cannot issue presentation commands.")
        return
    if principal.role not in {"super_admin", "organiser", "admin", "room_manager", "technician"}:
        raise RealtimeAuthError("Presentation-control permission is required.")
