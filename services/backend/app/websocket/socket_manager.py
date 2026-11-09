"""Bounded JSON fanout with recipient-side authorisation on every API replica."""
import asyncio
import json
import uuid

import socketio
from socketio.async_manager import AsyncManager
from loguru import logger

from app.database import AsyncSessionLocal
from app.redis import coordination_client
from app.websocket.auth import RealtimeAuthError, RealtimePrincipal
from app.websocket.publication import (ACTION_EVENTS, CONTROL_FIELDS, FIELDS,
    RealtimeOutputContractError, authorized_output, scalar_projection, output_contract)

CHANNEL = "category-a:realtime:json:v1"
MAX_MESSAGE = 1024 * 1024
CONTROL_OUTPUTS = frozenset({"connected", "error", "room_joined"})


def resource_message(event, data):
    if not isinstance(data, dict):
        raise RealtimeOutputContractError("Realtime data must be an object")
    if event in ACTION_EVENTS:
        return {"type": event, "payload": data}, "payload"
    if event not in {"notification", "room_event", "srr_event"}:
        raise RealtimeOutputContractError("Realtime output requires registration")
    kind = data.get("type")
    if kind not in ACTION_EVENTS:
        raise RealtimeOutputContractError("Notification type requires registration")
    if isinstance(data.get("payload"), dict):
        return data, "envelope"
    metadata = data.get("metadata", {})
    if not isinstance(metadata, dict):
        raise RealtimeOutputContractError("Invalid notification metadata")
    # Flatten only for the shared allowlist; no nested metadata passthrough.
    return {"type": kind, "payload": {**metadata, **data}}, "flat"


def transport_projection(projected, shape):
    if shape == "envelope":
        return projected
    if shape == "payload":
        return projected["payload"]
    return {"type": projected["type"], **projected["payload"],
            "metadata": scalar_projection(projected["payload"], FIELDS)}


class ScopedSocketManager(socketio.AsyncRedisManager):
    def __init__(self, url, *, write_only=False):
        super().__init__(url, channel=CHANNEL, write_only=write_only)
        self._delivery_slots = asyncio.Semaphore(8)

    async def _publish(self, data):
        if data.get("method") == "emit":
            data = dict(data)
            if data.get("event") in CONTROL_OUTPUTS:
                data["data"] = scalar_projection(data.get("data"), CONTROL_FIELDS)
            else:
                envelope, shape = resource_message(data.get("event"), data.get("data"))
                projected, _action = output_contract(envelope)
                data["data"] = transport_projection(projected, shape)
        encoded = json.dumps(data, allow_nan=False, separators=(",", ":")).encode()
        if len(encoded) > MAX_MESSAGE:
            raise RealtimeOutputContractError("Realtime fanout message exceeds its bound")
        # Do not inherit the library's retry-and-swallow publish failure path.
        listeners = 0
        try:
            listeners = await coordination_client.publish(CHANNEL, encoded)
        except Exception as exc:
            logger.warning("Realtime coordination publish failed: {}", type(exc).__name__)
        return listeners

    async def _listen(self):
        async for encoded in super()._listen():
            if not isinstance(encoded, bytes) or len(encoded) > MAX_MESSAGE:
                continue
            try:
                message = json.loads(encoded)
            except (ValueError, TypeError, RecursionError):
                logger.warning("Rejected malformed realtime coordination message")
                continue
            if not isinstance(message, dict) or message.get("method") not in {"emit", "disconnect"}:
                continue
            # Returning dicts prevents the parent receive loop from attempting
            # binary object deserialisation. Remote room mutation is not allowed.
            yield message

    async def emit(self, *args, **kwargs):
        if kwargs.get("ignore_queue"):
            raise RealtimeOutputContractError("Local emit bypass is not supported")
        return await super().emit(*args, **kwargs)

    async def _handle_emit(self, message):
        namespace = message.get("namespace") or "/"
        room = message.get("room")
        event = message.get("event")
        if namespace != "/" or not isinstance(room, str) or len(room) > 255 or message.get("callback") is not None:
            raise RealtimeOutputContractError("An explicit realtime audience is required")
        if event in CONTROL_OUTPUTS:
            if ":" in room:
                raise RealtimeOutputContractError("Control acknowledgements must address one connection")
            data = scalar_projection(message.get("data"), CONTROL_FIELDS)
            return await AsyncManager.emit(self, event, data, namespace, room=room)
        envelope, shape = resource_message(event, message.get("data"))
        prefix, separator, identifier = room.partition(":")
        if not separator or prefix not in {"event", "room", "srr", "venue-ops"}:
            raise RealtimeOutputContractError("Resource output needs an owned channel")
        resource_id = uuid.UUID(identifier)
        skip = message.get("skip_sid")
        skipped = {skip} if isinstance(skip, str) else set(skip or ())
        pending = []
        for sid, _engine_id in self.get_participants(namespace, room):
            if sid in skipped:
                continue
            pending.append(self._deliver(sid, event, envelope, shape, prefix, resource_id))
            if len(pending) == 8:
                await asyncio.gather(*pending)
                pending = []
        if pending:
            await asyncio.gather(*pending)

    async def _deliver(self, sid, event, envelope, shape, prefix, resource_id):
        async with self._delivery_slots:
            try:
                await asyncio.wait_for(self._deliver_authorized(sid, event, envelope, shape, prefix, resource_id), timeout=3)
            except RealtimeAuthError:
                # A subject may legitimately lack this domain action. Omit this
                # output, not its authorised connection to other domains.
                return
            except Exception as exc:
                logger.warning("Realtime recipient delivery unavailable: {}", type(exc).__name__)

    async def _deliver_authorized(self, sid, event, envelope, shape, prefix, resource_id):
        getter = getattr(self, "recipient_lease", None)
        lease = getter(sid) if getter is not None else None
        if lease is None:
            raise RealtimeAuthError("Recipient connection lease is unavailable")
        await lease.action("renew")
        principal = RealtimePrincipal.from_session(await self.server.get_session(sid))
        async with AsyncSessionLocal() as db:
            async with authorized_output(db, principal,
                    resource_id if prefix == "room" else None,
                    None if prefix == "room" else resource_id, envelope) as projected:
                data = transport_projection(projected, shape)
                # The current policy lock orders this local transport enqueue
                # before revocation. No room-wide unchecked emit is used.
                await asyncio.wait_for(AsyncManager.emit(self, event, data, "/", room=sid), timeout=1)
