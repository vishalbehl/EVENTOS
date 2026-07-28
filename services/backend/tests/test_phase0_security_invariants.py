from __future__ import annotations

import pathlib
import uuid
from datetime import date

import pytest

from app.config import Settings
from app.modules.events.models.event import Event
from app.modules.identity.services.auth_service import create_access_token
from app.modules.identity.services.mfa_service import _totp, verify_totp
from app.modules.platform.models.organization import Organization
from app.websocket.auth import (
    RealtimeAuthError,
    authenticate_realtime,
    authorize_event,
)


BACKEND_APP = pathlib.Path(__file__).resolve().parents[1] / "app"


def test_runtime_code_contains_no_schema_ddl() -> None:
    violations = []
    for path in BACKEND_APP.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if any(statement in source.upper() for statement in ("ALTER TABLE", "CREATE TABLE", "DROP TABLE")):
            violations.append(str(path.relative_to(BACKEND_APP)))
    assert violations == []


def test_runtime_code_does_not_disable_database_triggers() -> None:
    violations = []
    for path in BACKEND_APP.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if "session_replication_role" in source:
            violations.append(str(path.relative_to(BACKEND_APP)))
    assert violations == []


def test_runtime_code_does_not_trust_organization_header() -> None:
    violations = []
    for path in BACKEND_APP.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if "X-Organization-ID" in source:
            violations.append(str(path.relative_to(BACKEND_APP)))
    assert violations == []


def test_production_configuration_rejects_development_secrets() -> None:
    with pytest.raises(ValueError, match="Unsafe production configuration"):
        Settings(
            _env_file=None,
            DATABASE_URL_SYNC="postgresql://user:pass@db/Event",
            environment="production",
        )


def test_totp_verification_is_time_windowed() -> None:
    secret = "JBSWY3DPEHPK3PXP"
    timestamp = 1_700_000_000
    code = _totp(secret, timestamp // 30)
    assert verify_totp(secret, code, at_time=timestamp)
    assert not verify_totp(secret, "000000", at_time=timestamp)


@pytest.mark.asyncio
async def test_realtime_requires_credentials(db) -> None:
    with pytest.raises(RealtimeAuthError, match="required"):
        await authenticate_realtime(db, None)


@pytest.mark.asyncio
async def test_realtime_user_cannot_join_cross_tenant_event(db, organizer) -> None:
    other_org = Organization(
        name="Realtime Other Org",
        slug=f"realtime-other-{uuid.uuid4().hex[:8]}",
    )
    db.add(other_org)
    await db.flush()
    other_event = Event(
        organization_id=other_org.id,
        created_by=organizer.id,
        name="Other Tenant Event",
        short_code=f"RT{uuid.uuid4().hex[:6].upper()}",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 2),
        timezone="UTC",
    )
    db.add(other_event)
    await db.flush()

    principal = await authenticate_realtime(db, {"token": create_access_token(organizer)})
    with pytest.raises(RealtimeAuthError, match="unavailable"):
        await authorize_event(db, principal, other_event.id)
