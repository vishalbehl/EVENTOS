import uuid
import inspect
import io
from pathlib import Path
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.core.concurrency import require_if_match, update_with_version
from app.core.cache_policy import CacheTTL, ttl
from app.core.cache import CacheService
from app.infrastructure.repositories import OrganizationRepository
import app.core.cache as cache_module
from app.core.response import ResponseEnvelope
from app.core.idempotency_service import replay_response
from app.core.task_policy import TaskPolicy
from app.core.idempotency import request_hash
from app.core.job_status import progress_from_counts
from app.core.upload_state import transition_upload
from app.core.upload_validation import validate_upload_metadata, validate_file_signature
from app.core.cache_keys import TenantCacheKey, TenantCacheKeyError
from app.infrastructure.repositories import Repository
from ops.production_release_gate import validate as validate_release_gate
from app.config import Settings
from app.core.antivirus import scan_bytes, scan_chunks
import app.core.antivirus as antivirus_module
from app.modules.presentations.services.upload_service import _assert_tenant_storage_path
import app.modules.presentations.services.upload_service as upload_service
from app.modules.platform_health.router import _sanitize_query
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor


def test_cursor_is_round_trip_and_page_size_is_bounded():
    record_id = uuid.uuid4()
    occurred_at = datetime.now(timezone.utc)
    assert decode_cursor(encode_cursor(occurred_at, record_id)).record_id == record_id
    page = CursorPage(items=[], has_next=True)
    assert page.has_more is True
    assert page.model_dump()["has_more"] is True
    assert bounded_page_size(None) == 20
    assert bounded_page_size(100) == 100
    with pytest.raises(HTTPException):
        bounded_page_size(101)
    with pytest.raises(HTTPException) as error:
        decode_cursor("x" * 513)
    assert error.value.detail["code"] == "INVALID_CURSOR"


def test_concurrency_requires_positive_if_match():
    assert require_if_match('"4"') == 4
    with pytest.raises(HTTPException) as error:
        require_if_match(None)
    assert error.value.status_code == 428


def test_versioned_updates_scope_event_owned_models_to_their_organization():
    source = (Path(__file__).resolve().parents[1] / "app/core/concurrency.py").read_text(encoding="utf-8")
    assert "Event.organization_id == organization_id" in source
    assert ".exists()" in source
    assert "Cannot apply organization scope" in source


def test_version_conflicts_read_the_authoritative_current_version():
    source = (Path(__file__).resolve().parents[1] / "app/core/concurrency.py").read_text(encoding="utf-8")
    assert "current_stmt = select(model.version)" in source
    assert "current_version = await db.scalar(current_stmt)" in source
    assert "raise_version_conflict(int(current_version or expected_version))" in source


@pytest.mark.asyncio
async def test_optimistic_update_rejects_invalid_version(db):
    with pytest.raises(HTTPException) as error:
        await update_with_version(db, object, uuid.uuid4(), 0, {})
    assert error.value.status_code == 400


def test_idempotency_hash_is_stable_and_order_independent():
    assert request_hash({"b": 2, "a": 1}) == request_hash({"a": 1, "b": 2})
    assert request_hash({"a": 1}) != request_hash({"a": 2})


def test_upload_state_machine_rejects_skipping_security_stages():
    assert transition_upload("uploaded", "verifying") == "verifying"
    with pytest.raises(HTTPException):
        transition_upload("uploaded", "ready")


def test_upload_validation_rejects_non_hex_checksum():
    with pytest.raises(HTTPException) as error:
        validate_upload_metadata(
            filename="presentation.pdf",
            mime_type="application/pdf",
            size_bytes=100,
            declared_checksum="z" * 64,
        )
    assert error.value.detail["code"] == "INVALID_CHECKSUM"


def test_upload_validation_checks_file_signature():
    validate_file_signature(b"%PDF-1.7", "application/pdf")
    with pytest.raises(HTTPException) as error:
        validate_file_signature(b"not a pdf", "application/pdf")
    assert error.value.detail["code"] == "FILE_SIGNATURE_MISMATCH"


def test_upload_validation_accepts_spreadsheet_types_and_signatures():
    validate_upload_metadata(
        filename="schedule.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes=128,
        declared_checksum="a" * 64,
    )
    validate_file_signature(
        b"PK\x03\x04spreadsheet",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    validate_file_signature(
        b"\xd0\xcf\x11\xe0legacy-xls",
        "application/vnd.ms-excel",
    )


def test_antivirus_boundary_classifies_clean_and_infected(monkeypatch):
    class Result:
        def __init__(self, returncode, stdout=""):
            self.returncode = returncode
            self.stdout = stdout
            self.stderr = ""

    monkeypatch.setattr(antivirus_module.settings, "ANTIVIRUS_COMMAND", "clamdscan --no-summary")
    monkeypatch.setattr(antivirus_module.subprocess, "run", lambda *args, **kwargs: Result(0))
    assert scan_bytes(b"safe").status == "clean"
    monkeypatch.setattr(antivirus_module.subprocess, "run", lambda *args, **kwargs: Result(1, "Eicar-Test-Signature"))
    result = scan_bytes(b"unsafe")
    assert result.status == "infected"
    assert result.signature == "Eicar-Test-Signature"


def test_antivirus_chunk_boundary(monkeypatch):
    monkeypatch.setattr(antivirus_module.settings, "ANTIVIRUS_COMMAND", "clamd://127.0.0.1:1")

    def fake_scan(chunks, endpoint):
        assert b"".join(chunks) == b"safe-payload"
        return antivirus_module.ScanResult("clean")

    monkeypatch.setattr(antivirus_module, "_scan_chunks_with_clamd", fake_scan)
    assert scan_chunks((b"safe-", b"payload")).status == "clean"


def test_identity_cache_key_cannot_drop_viewer_dimensions():
    organization_id = uuid.uuid4()
    user_id = uuid.uuid4()
    key = TenantCacheKey.identity(
        "dashboard", organization_id=organization_id, user_id=user_id,
        role="organizer", capability_revision="r7", locale="en-IN",
    )
    assert str(organization_id) in key and str(user_id) in key
    assert ":role:organizer:capabilities:r7:locale:en-IN" in key
    with pytest.raises(TenantCacheKeyError):
        TenantCacheKey.identity("dashboard", organization_id=organization_id, user_id=user_id, role="", capability_revision="r7")


def test_storage_guard_accepts_canonical_tenant_prefix_only_for_verified_org():
    organization_id = uuid.uuid4()
    assert _assert_tenant_storage_path(
        f"tenant/{organization_id}/event/uploads/object/file.pdf",
        verified_organization_id=organization_id,
    ) == organization_id
    with pytest.raises(RuntimeError):
        _assert_tenant_storage_path(
            f"tenant/{uuid.uuid4()}/event/uploads/object/file.pdf",
            verified_organization_id=organization_id,
        )


def test_file_object_upload_uses_bounded_storage_path(tmp_path, monkeypatch):
    organization_id = uuid.uuid4()
    monkeypatch.setattr(upload_service.settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(upload_service, "LOCAL_STORAGE_ROOT", tmp_path)
    upload_service.upload_fileobj(
        "imports",
        f"{organization_id}/imports/event/file.xlsx",
        io.BytesIO(b"spreadsheet"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        verified_organization_id=organization_id,
    )
    assert (tmp_path / "imports" / str(organization_id) / "imports" / "event" / "file.xlsx").read_bytes() == b"spreadsheet"


def test_s3_client_has_bounded_timeout_retry_and_pool_policy(monkeypatch):
    captured = {}

    class FakeBoto3:
        @staticmethod
        def client(service_name, **kwargs):
            captured["service_name"] = service_name
            captured.update(kwargs)
            return object()

    monkeypatch.setattr(upload_service, "boto3", FakeBoto3())
    monkeypatch.setattr(upload_service.settings, "S3_ENDPOINT_URL", "http://minio:9000")
    monkeypatch.setattr(upload_service.settings, "STORAGE_CONNECT_TIMEOUT_SECONDS", 3)
    monkeypatch.setattr(upload_service.settings, "STORAGE_READ_TIMEOUT_SECONDS", 17)
    monkeypatch.setattr(upload_service.settings, "STORAGE_MAX_RETRIES", 4)
    monkeypatch.setattr(upload_service.settings, "STORAGE_MAX_CONNECTIONS", 19)

    upload_service._get_s3_client()

    config = captured["config"]
    assert captured["service_name"] == "s3"
    assert config.connect_timeout == 3
    assert config.read_timeout == 17
    assert config.max_pool_connections == 19
    assert config.retries == {"mode": "standard", "max_attempts": 4}


def test_repository_cursor_contract_rejects_invalid_ordering_fields():
    repository = Repository(object(), object)
    with pytest.raises(ValueError, match="timestamp and unique-id"):
        import asyncio
        asyncio.run(repository.cursor_page(None, cursor_column=("created_at",)))


def test_repository_delete_contract_is_async_and_transaction_neutral():
    from app.infrastructure.contracts import RepositoryContract

    assert inspect.iscoroutinefunction(Repository.delete)
    assert inspect.iscoroutinefunction(RepositoryContract.delete)


def test_production_gate_requires_mandatory_antivirus():
    from types import SimpleNamespace
    base = dict(environment="production", DATABASE_URL_SYNC="x", DATABASE_URL_ASYNC="x", REDIS_URL="rediss://x/0", REDIS_CACHE_URL="rediss://x/2", REDIS_LOCK_URL="rediss://x/3", CELERY_BROKER_URL="rediss://x/0", CELERY_RESULT_BACKEND="rediss://x/1", DB_POOL_SIZE=10, DB_MAX_OVERFLOW=20, REDIS_OPERATION_TIMEOUT_SECONDS=1, REDIS_LOCK_TTL_SECONDS=30, CACHE_MAX_VALUE_BYTES=1024, ANTIVIRUS_REQUIRED=False, ANTIVIRUS_COMMAND="", CACHE_PUBLIC_FORM_TTL_SECONDS=1, CACHE_PUBLISHED_WEBSITE_TTL_SECONDS=1, CACHE_PRICING_TTL_SECONDS=1, CACHE_ROLES_TTL_SECONDS=1, CACHE_CAPABILITIES_TTL_SECONDS=1, CACHE_SEARCH_SUGGESTIONS_TTL_SECONDS=1, CACHE_DASHBOARD_TTL_SECONDS=1)
    assert any("ANTIVIRUS_REQUIRED" in error for error in validate_release_gate(SimpleNamespace(**base)))


def test_release_gate_checks_operational_runbook_procedures():
    from pathlib import Path
    committed = Path("ops/production_operations_runbook.md").read_text(encoding="utf-8").lower()
    assert all(term in committed for term in ("pg_stat_statements", "restore", "rollback", "dead-letter"))


def test_settings_reject_invalid_operational_limits():
    with pytest.raises(ValueError, match="Operational limits"):
        Settings(DATABASE_URL_SYNC="postgresql://localhost/db", DB_SLOW_QUERY_MS=0)


def test_slow_query_diagnostics_redact_literals():
    query = _sanitize_query("SELECT * FROM users WHERE email='person@example.com' AND id=42")
    assert "person@example.com" not in query
    assert "42" not in query


def test_job_progress_is_bounded():
    assert progress_from_counts(5, 10) == 50
    assert progress_from_counts(20, 10) == 100
    assert progress_from_counts(1, 0) == 0


def test_cache_ttl_uses_named_environment_policy(monkeypatch):
    monkeypatch.setattr("app.core.cache_policy.settings.CACHE_PUBLIC_FORM_TTL_SECONDS", 7)
    assert ttl(CacheTTL.PUBLIC_FORM) == 7


def test_cache_service_exposes_lock_contract():
    service = CacheService()
    assert callable(service.acquire_lock)
    assert callable(service.release_lock)
    assert callable(service.lock)
    assert set(service.metrics()) >= {"hits", "misses", "failures", "latency_ms", "lock_contention"}


def test_organization_repository_exposes_standard_contract():
    import inspect

    methods = {
        "get_by_id",
        "list_page",
        "count_for_organization",
        "exists_for_organization",
        "create",
        "update",
        "delete",
        "bulk_insert",
    }
    assert methods.issubset(set(dir(OrganizationRepository)))
    assert "organization_id" in inspect.signature(OrganizationRepository.get_by_id).parameters
    assert "organization_id" in inspect.signature(OrganizationRepository.list_page).parameters
    assert "commit" not in inspect.getsource(OrganizationRepository)


def test_response_envelope_helpers_keep_success_and_error_shapes():
    success = ResponseEnvelope.success({"ok": True}, request_id="req-1")
    failure = ResponseEnvelope.failure("CONFLICT", "Changed", request_id="req-1")
    assert success.model_dump() == {"data": {"ok": True}, "meta": {"request_id": "req-1", "next_cursor": None, "freshness_at": None}, "error": None}
    assert failure.error.code == "CONFLICT"


def test_form_command_exposes_optional_idempotency_contract():
    import inspect
    from app.modules.registration.application.commands import RegistrationFormCommandService

    parameters = inspect.signature(RegistrationFormCommandService.update).parameters
    assert "actor_user_id" in parameters
    assert "idempotency_key" in parameters


def test_task_policy_rejects_invalid_timeout_order():
    with pytest.raises(ValueError):
        TaskPolicy(soft_timeout_seconds=10, hard_timeout_seconds=5)


@pytest.mark.asyncio
async def test_cache_invalidation_matches_canonical_key_namespace(monkeypatch):
    seen = []

    async def capture(pattern):
        seen.append(pattern)
        return 1

    monkeypatch.setattr(cache_module, "delete_pattern", capture)
    await cache_module.invalidate_event(uuid.UUID(int=1), uuid.UUID(int=2))
    await cache_module.invalidate_organization(uuid.UUID(int=1))
    assert seen == [
        "cache:v1:tenant:00000000-0000-0000-0000-000000000001:event:00000000-0000-0000-0000-000000000002:*",
        "cache:v1:tenant:00000000-0000-0000-0000-000000000001:search-v1:*",
        "cache:v1:tenant:00000000-0000-0000-0000-000000000001:*",
    ]


@pytest.mark.asyncio
async def test_cache_read_exports_low_cardinality_prometheus_outcome(monkeypatch):
    observed = []

    class FakeCache:
        async def get(self, key):
            return None

    monkeypatch.setattr(cache_module, "cache_client", FakeCache())
    monkeypatch.setattr(
        cache_module,
        "observe_cache",
        lambda operation, outcome, duration_ms: observed.append((operation, outcome)),
    )

    assert await cache_module.get_json("cache:v1:tenant:test:event:test:form:1") is None
    assert observed == [("get", "miss")]


@pytest.mark.asyncio
async def test_cache_stampede_retries_lock_before_loading(monkeypatch):
    calls = {"locks": 0, "loads": 0, "reads": 0}
    published = []

    async def read(_key):
        calls["reads"] += 1
        return published[0] if published else None

    async def write(_key, value, _ttl):
        published.append(value)
        return True

    class Lock:
        async def __aenter__(self):
            calls["locks"] += 1
            return calls["locks"] == 2

        async def __aexit__(self, *_args):
            return False

    async def load():
        calls["loads"] += 1
        return {"ok": True}

    monkeypatch.setattr(cache_module, "get_json", read)
    monkeypatch.setattr(cache_module, "set_json", write)
    monkeypatch.setattr(cache_module, "distributed_lock", lambda _name: Lock())
    result = await cache_module.get_or_set_json("cache:test", load, 30)
    assert result == {"ok": True}
    assert calls["locks"] == 2
    assert calls["loads"] == 1
