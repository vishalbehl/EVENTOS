import json

import pytest

from app.core.log_redaction import redact_credentials
from app.middleware.audit_middleware import AuditMiddleware


def test_nested_credential_redaction_preserves_safe_metadata():
    result = redact_credentials({"id": "member", "owner_invitation": {"invite_token": "private"},
                                 "password_hash": "private", "items": [{"mfa_code": "123456", "version": 2}]})
    assert result["id"] == "member" and result["items"][0]["version"] == 2
    assert "private" not in json.dumps(result) and "123456" not in json.dumps(result)


@pytest.mark.asyncio
async def test_audit_never_records_issued_credentials(monkeypatch):
    records = []
    sent = []

    async def write(ctx):
        records.append(ctx)

    monkeypatch.setattr("app.middleware.audit_middleware.AuditService.write_log", write)
    body = json.dumps({"version": 1, "owner_invitation": {"invite_token": "private-invitation"}}).encode()

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 201, "headers": []})
        await send({"type": "http.response.body", "body": body})

    async def send(message):
        sent.append(message)

    async def receive():
        return {"type": "http.request", "body": b""}

    await AuditMiddleware(app)({"type": "http", "method": "POST", "path": "/api/v1/organisations/me/members/invite",
                                "headers": [], "client": ("127.0.0.1", 1234), "query_string": b""}, receive, send)
    assert sent[-1]["body"] == body  # One-time authorised response is unchanged.
    assert len(records) == 1
    assert "private-invitation" not in json.dumps(records[0].new_state)
    assert "private-invitation" not in json.dumps(records[0].change_diff)


@pytest.mark.asyncio
async def test_audit_capture_is_bounded(monkeypatch):
    records = []

    async def write(ctx):
        records.append(ctx)

    monkeypatch.setattr("app.middleware.audit_middleware.AuditService.write_log", write)

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        for _ in range(8):
            await send({"type": "http.response.body", "body": b"x" * 65536, "more_body": True})
        await send({"type": "http.response.body", "body": b"", "more_body": False})

    async def noop(*args):
        pass

    await AuditMiddleware(app)({"type": "http", "method": "POST", "path": "/api/v1/exports",
                                "headers": [], "client": ("127.0.0.1", 1234), "query_string": b""}, noop, noop)
    assert len(records) == 1 and records[0].new_state is None


@pytest.mark.asyncio
async def test_supplemental_audit_publication_is_bounded_outside_tests(monkeypatch):
    from app.config import settings
    from app.core import bounded_task_dispatch

    dispatched = []

    def admit(task, *, args=(), **kwargs):
        dispatched.append((task.name, args))
        return True

    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(bounded_task_dispatch, "admit_best_effort_celery_task", admit)
    body = json.dumps({"id": "71bd4a6f-18cc-4db0-9577-ad72d89317d8", "secret": "redacted"}).encode()

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 201, "headers": []})
        await send({"type": "http.response.body", "body": body})

    async def noop(*args):
        pass

    await AuditMiddleware(app)({
        "type": "http",
        "method": "POST",
        "path": "/api/v1/exports",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "query_string": b"",
    }, noop, noop)

    assert len(dispatched) == 1
    task_name, args = dispatched[0]
    assert task_name == "app.tasks.write_audit_log"
    assert args[0]["resource_type"] == "export"
