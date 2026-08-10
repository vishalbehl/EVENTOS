import io
import uuid
import zipfile

import pytest

from app.config import settings
from app.models.venue_user import VenueUser
from app.routers.admin_reports import _canonical_hash, _docx_bytes, _pdf_bytes, _premium_docx_bytes, _premium_pdf_bytes, get_event_report
from app.routers.auth import create_token, decode_token, ensure_bootstrap_admin, hash_password, require_admin, verify_password


def _report_fixture():
    return {
        "metadata": {
            "event_id": str(uuid.uuid4()), "event_name": "Clinical Congress 2026", "short_code": "CC26",
            "venue_name": "Convention Hall", "start_date": "2026-08-08", "end_date": "2026-08-09",
            "event_status": "completed", "generated_at": "2026-08-09T18:00:00+00:00",
        },
        "summary": {"total_delegates": 1, "checked_in_delegates": 1, "no_shows": 0},
        "breakdowns": {"roles": [{"role": "Delegate", "count": 1}]},
        "delegates": [{
            "registration_code": "REG-001", "name": "Asha Rao", "email": "asha@example.test",
            "phone": "+91-9000000000", "role": "Delegate", "company": "Example Hospital",
            "designation": "Doctor", "country": "India", "registration_status": "approved",
            "payment_status": "Paid", "source": "cloud", "registered_at": "2026-08-01T10:00:00+00:00",
        }],
        "attendance": [{
            "registration_code": "REG-001", "delegate": "Asha Rao", "role": "Delegate", "session": "Opening",
            "checkin_time": "2026-08-08T09:00:00+00:00", "checkout_time": "2026-08-08T10:00:00+00:00",
            "duration_seconds": 3600, "state": "completed", "method": "qr", "device_id": "SCAN-01",
        }],
        "venue_scans": [], "companions": [], "badges": [], "kits": [], "actions": [],
        "sync": {"total_jobs": 0, "status_counts": {}}, "warnings": [],
    }


def test_password_hash_is_salted_and_verifiable():
    first = hash_password("correct-horse-battery-staple")
    second = hash_password("correct-horse-battery-staple")
    assert first != second
    assert verify_password("correct-horse-battery-staple", first)
    assert not verify_password("wrong-password", first)


@pytest.mark.asyncio
async def test_first_boot_creates_default_admin(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    monkeypatch.setattr(settings, "VENUE_BOOTSTRAP_ADMIN_USERNAME", "admin")
    monkeypatch.setattr(settings, "VENUE_BOOTSTRAP_ADMIN_EMAIL", "admin@eventos.com")
    monkeypatch.setattr(settings, "VENUE_BOOTSTRAP_ADMIN_PASSWORD", "admin123")
    monkeypatch.setattr(settings, "VENUE_AUTH_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")
    db = AsyncMock()
    db.add = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    await ensure_bootstrap_admin(db)

    created = db.add.call_args.args[0]
    assert created.username == "admin"
    assert created.email == "admin@eventos.com"
    assert created.role == "admin"
    assert created.allowed_modes == ["admin", "registration", "scanning"]
    assert verify_password("admin123", created.password_hash)
    db.commit.assert_awaited_once()


def test_signed_token_rejects_tampering(monkeypatch):
    monkeypatch.setattr(settings, "VENUE_AUTH_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")
    user = VenueUser(
        id=uuid.uuid4(), email="admin@example.test", username="admin", first_name="Venue", last_name="Admin",
        password_hash=hash_password("secure-password"), role="admin", allowed_modes=["admin"],
    )
    token = create_token(user, "access", "admin", __import__("datetime").timedelta(minutes=5))
    assert decode_token(token, "access")["sub"] == str(user.id)
    with pytest.raises(Exception):
        decode_token(token[:-1] + ("A" if token[-1] != "A" else "B"), "access")


@pytest.mark.asyncio
async def test_report_access_rejects_non_admin():
    user = VenueUser(id=uuid.uuid4(), email="operator@example.test", username="operator", password_hash="x", role="volunteer", allowed_modes=["registration"])
    with pytest.raises(Exception) as exc:
        await require_admin(user)
    assert exc.value.status_code == 403


def test_report_hash_is_stable_and_changes_with_data():
    report = _report_fixture()
    assert _canonical_hash(report) == _canonical_hash(dict(report))
    changed = _report_fixture()
    changed["delegates"][0]["phone"] = "+91-9111111111"
    assert _canonical_hash(report) != _canonical_hash(changed)


def test_pdf_and_docx_exports_contain_complete_report():
    report = _report_fixture()
    pdf = _pdf_bytes(report, "Final v1")
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 2_000

    docx = _docx_bytes(report, "Final v1")
    with zipfile.ZipFile(io.BytesIO(docx)) as archive:
        document_xml = archive.read("word/document.xml").decode("utf-8")
    assert "Clinical Congress 2026" in document_xml
    assert "asha@example.test" in document_xml
    assert "+91-9000000000" in document_xml
    assert "Opening" in document_xml


def test_premium_exports_have_cover_toc_and_selected_sections():
    report = _report_fixture()
    report["metadata"]["layout"] = {"sections": ["executive_summary", "registration", "attendance"], "columns": {"delegates": ["registration_code", "name"]}}
    pdf = _premium_pdf_bytes(report, "Final v1")
    assert pdf.startswith(b"%PDF")
    assert pdf.count(b"/Type /Page") >= 5

    docx = _premium_docx_bytes(report, "Final v1")
    with zipfile.ZipFile(io.BytesIO(docx)) as archive:
        document_xml = archive.read("word/document.xml").decode("utf-8")
    assert "Table of Contents" in document_xml
    assert "Registration Report" in document_xml


@pytest.mark.asyncio
async def test_get_event_report_does_not_use_snapshot_payload(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    import app.routers.admin_reports as reports_router

    report = _report_fixture()
    event = MagicMock(id=uuid.uuid4())
    db = AsyncMock()
    monkeypatch.setattr(reports_router, "_event_or_404", AsyncMock(return_value=event))
    monkeypatch.setattr(reports_router, "build_event_report", AsyncMock(return_value=report))
    monkeypatch.setattr(reports_router, "_audit", AsyncMock())

    response = await get_event_report(event.id, db=db, actor=MagicMock(id=uuid.uuid4()))

    assert response["metadata"]["event_name"] == "Clinical Congress 2026"
