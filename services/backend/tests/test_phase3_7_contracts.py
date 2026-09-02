"""Fast contract tests for the shared production interfaces.

These tests deliberately avoid a live database or Redis so they run in every
developer environment and can be used as migration guardrails.
"""
import uuid
import importlib.util
import inspect
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.cache_keys import TenantCacheKey, TenantCacheKeyError
from app.core.concurrency import require_if_match
from app.core.idempotency import request_hash
from app.core.response import ResponseEnvelope
from app.core.task_policy import PermanentTaskError, is_retryable, policy_for
from app.core.upload_state import transition_upload
from app.modules.events.models.event import Event
from app.schemas.cursor_pagination import bounded_page_size, decode_cursor, encode_cursor


def test_cursor_contract_is_stable_and_bounded():
    record_id = uuid.uuid4()
    stamp = datetime.now(timezone.utc)
    assert decode_cursor(encode_cursor(stamp, record_id)).record_id == record_id
    assert bounded_page_size(None) == 20
    assert bounded_page_size(100) == 100
    with pytest.raises(HTTPException) as error:
        bounded_page_size(101)
    assert error.value.detail["code"] == "INVALID_PAGE_SIZE"


def test_concurrency_and_idempotency_contracts_are_machine_readable():
    assert require_if_match('"4"') == 4
    with pytest.raises(HTTPException) as error:
        require_if_match(None)
    assert error.value.status_code == 428
    assert request_hash({"a": 1, "b": 2}) == request_hash({"b": 2, "a": 1})
    assert request_hash({"a": 1}) != request_hash({"a": 2})
    from app.core.concurrency import raise_version_conflict
    with pytest.raises(HTTPException) as conflict:
        raise_version_conflict(7)
    assert conflict.value.status_code == 409
    assert conflict.value.detail["code"] == "RESOURCE_VERSION_CONFLICT"


def test_upload_state_machine_does_not_skip_verification():
    assert transition_upload("uploaded", "verifying") == "verifying"
    with pytest.raises(HTTPException) as error:
        transition_upload("uploaded", "ready")
    assert error.value.detail["code"] == "INVALID_UPLOAD_TRANSITION"


def test_upload_state_same_state_retry_is_idempotent():
    assert transition_upload("ready", "ready") == "ready"
    assert transition_upload("failed", "failed") == "failed"


def test_terminal_upload_states_are_explicitly_final():
    from app.core.upload_state import TERMINAL_UPLOAD_STATES

    assert TERMINAL_UPLOAD_STATES == {"ready", "failed", "quarantined", "deleted"}


def test_capability_cache_uses_shared_cache_service():
    from pathlib import Path

    source = Path("app/modules/billing/services/capability_cache_service.py").read_text(encoding="utf-8")
    assert "from app.core.cache import cache_service" in source
    assert "cache_service.get_json" in source
    assert "cache_service.set_json" in source
    assert "from app.redis import cache_client" not in source


def test_capability_cache_uses_named_configurable_ttl(monkeypatch):
    from app.modules.billing.services.capability_cache_service import CapabilityCacheService

    monkeypatch.setattr("app.core.cache_policy.settings.CACHE_CAPABILITIES_TTL_SECONDS", 17)
    assert CapabilityCacheService.ttl_seconds() == 17


def test_cache_policy_defaults_remain_distinct_and_intended(monkeypatch):
    from app.core.cache_policy import CacheTTL, ttl

    for name in (
        "CACHE_PUBLIC_FORM_TTL_SECONDS",
        "CACHE_PUBLISHED_WEBSITE_TTL_SECONDS",
        "CACHE_PRICING_TTL_SECONDS",
        "CACHE_ROLES_TTL_SECONDS",
        "CACHE_CAPABILITIES_TTL_SECONDS",
        "CACHE_SEARCH_SUGGESTIONS_TTL_SECONDS",
        "CACHE_DASHBOARD_TTL_SECONDS",
    ):
        monkeypatch.setattr("app.core.cache_policy.settings." + name, None)
    assert [ttl(policy) for policy in CacheTTL] == [30, 60, 30, 30, 60, 300, 15]


def test_cache_keys_require_verified_context_and_include_version():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    key = TenantCacheKey.event(event_id, "form", "r3", organization_id=organization_id)
    assert key.startswith(f"cache:v1:tenant:{organization_id}:event:{event_id}:")
    with pytest.raises(TenantCacheKeyError):
        TenantCacheKey.event(event_id, "form")
    with pytest.raises(TenantCacheKeyError):
        TenantCacheKey.build("unsafe:segment", organization_id=organization_id)


def test_cache_key_builders_cover_dashboard_capability_and_search_isolation():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    dashboard = TenantCacheKey.dashboard(event_id, "r4", organization_id)
    capabilities = TenantCacheKey.capabilities(event_id, "r5", organization_id)
    search = TenantCacheKey.search("a" * 64, organization_id)
    assert ":dashboard-v1:r4" in dashboard
    assert ":capabilities-v1:r5" in capabilities
    assert search.startswith(f"cache:v1:tenant:{organization_id}:search-v1:")


def test_response_envelope_preserves_new_api_contract():
    result = ResponseEnvelope.success({"items": []}, request_id="req-1", next_cursor="next")
    assert result.data == {"items": []}
    assert result.meta.request_id == "req-1"
    assert result.meta.next_cursor == "next"
    failure = ResponseEnvelope.failure("RESOURCE_VERSION_CONFLICT", "Changed", request_id="req-1")
    assert failure.data is None
    assert failure.error.code == "RESOURCE_VERSION_CONFLICT"


def test_task_policies_separate_retryable_and_permanent_failures():
    policy = policy_for("files")
    assert policy.queue == "files"
    assert policy.hard_timeout_seconds > policy.soft_timeout_seconds
    assert policy.retry_delay(2) == policy.backoff_seconds * 4
    assert not is_retryable(PermanentTaskError("invalid file"))
    assert not is_retryable(ValueError("bad input"))
    assert is_retryable(ConnectionError("temporary storage outage"))
    assert not is_retryable(HTTPException(status_code=422, detail="invalid file"))
    assert is_retryable(HTTPException(status_code=503, detail="scanner unavailable"))
    assert not is_retryable(FileNotFoundError("missing object"))


def test_provider_deliveries_use_bounded_claim_leases_outside_db_transactions():
    from app.modules.communications.models.channel_delivery import CommunicationDelivery
    from app.modules.notifications.services import channel_delivery_service

    columns = set(CommunicationDelivery.__table__.columns.keys())
    assert {"processing_owner", "processing_started_at"} <= columns
    source = inspect.getsource(channel_delivery_service.ChannelDeliveryService.process_batch)
    assert "_DELIVERY_CLAIM_LEASE" in source
    assert "worker_id" in source
    assert "Commit the claim before any provider call" in source
    claim_commit = source.index("await db.commit()")
    provider_call = source.index("ChannelProviderService.deliver")
    assert claim_commit < provider_call
    assert "Do not turn that healthy" in source


def test_projection_failures_leave_a_durable_stale_marker_when_first_build_fails():
    from app.tasks.projection_task_support import mark_projection_failed

    source = inspect.getsource(mark_projection_failed)
    assert "event_exists" in source
    assert "freshness_at=datetime(1970, 1, 1" in source
    assert "rebuild_status=\"failed\"" in source
    assert "with_for_update" in source


def test_campaign_email_delivery_claims_are_unique_and_recoverable():
    from app.modules.communications.models.email_log import EmailLog
    from app.modules.notifications.services import email_service

    index_names = {index.name for index in EmailLog.__table__.indexes}
    assert "uq_email_logs_campaign_recipient" in index_names
    source = inspect.getsource(email_service.claim_campaign_recipient)
    assert "with_for_update" in source
    assert "_EMAIL_CLAIM_LEASE" in source
    assert "IntegrityError" in source
    send_source = inspect.getsource(email_service.send_email)
    assert "log_id" in send_source
    assert "provider delivery failed" in send_source


def test_email_log_history_has_a_bounded_cursor_query_service():
    from app.modules.notifications.application.queries import EmailLogQueryService
    from app.modules.notifications.routers.notifications import get_email_logs_cursor
    from app.modules.communications.models.email_log import EmailLog

    source = inspect.getsource(EmailLogQueryService.list_for_event)
    route_source = inspect.getsource(get_email_logs_cursor)
    assert "CursorPage[EmailLogResponse]" in route_source
    assert "limit + 1" in source
    assert "decode_cursor" in source and "encode_cursor" in source
    assert "EmailLog.sent_at < position.occurred_at" in source
    assert "EmailLog.id < position.record_id" in source
    assert "db.commit" not in inspect.getsource(EmailLogQueryService)
    assert "ix_email_logs_event_sent_id" in {
        index.name for index in EmailLog.__table__.indexes
    }


def test_session_schedule_has_a_bounded_cursor_query_service():
    from app.modules.speakers.application.queries import SessionQueryService
    from app.modules.speakers.routers.sessions import list_sessions_page

    source = inspect.getsource(SessionQueryService.list_page)
    route_source = inspect.getsource(list_sessions_page)
    assert 'router.get("/page", response_model=CursorPage[SessionSummary])' in Path(
        Path(__file__).resolve().parents[1] / "app/modules/speakers/routers/sessions.py"
    ).read_text()
    assert "SessionQueryService" in route_source
    assert "limit=bounded_page_size(page_size, maximum=100)" in source
    assert 'cursor_column=("start_time", "id")' in source
    assert "Session.event_id == event_id" in source
    assert "Event.organization_id == organization_id" in source
    assert ".commit(" not in source
    from app.modules.agenda.models import Session
    assert "ix_agenda_sessions_event_start_id" in {
        index.name for index in Session.__table__.indexes
    }


def test_badge_reads_have_bounded_cursor_services():
    from app.modules.registration.application.queries import BadgeQueryService
    from app.modules.registration.routers.badges import (
        list_badges_page, list_badge_history_page, list_badge_print_jobs_page,
    )

    source = inspect.getsource(BadgeQueryService)
    assert "cursor_column=(\"created_at\", \"id\")" in source
    assert "cursor_column=(\"queued_at\", \"id\")" in source
    assert "Event.organization_id == organization_id" in source
    assert "Participant.event_id == event_id" in source
    assert ".commit(" not in source
    assert "CursorPage[BadgeResponse]" in inspect.getsource(list_badges_page)
    assert "CursorPage[BadgeHistoryResponse]" in inspect.getsource(list_badge_history_page)
    assert "CursorPage[BadgePrintJobResponse]" in inspect.getsource(list_badge_print_jobs_page)


def test_import_history_has_a_bounded_cursor_service():
    from app.modules.registration.application.queries import ImportJobQueryService
    from app.modules.registration.routers.import_jobs import list_import_jobs_page

    source = inspect.getsource(ImportJobQueryService.list_page)
    route_source = inspect.getsource(list_import_jobs_page)
    assert "CursorPage[ImportJobResponse]" in route_source
    assert 'cursor_column=("created_at", "id")' in source
    assert "Event.organization_id == organization_id" in source
    assert "ImportJob.event_id == event_id" in source
    assert ".commit(" not in source


def test_hot_plan_inventory_covers_cursor_paths():
    script = Path(__file__).resolve().parents[1] / "ops" / "database_hot_query_plans.py"
    source = script.read_text()
    for name in (
        "sessions_cursor", "badges_cursor", "badge_history_cursor",
        "badge_print_jobs_cursor", "import_jobs_cursor",
    ):
        assert f'"{name}"' in source
    migration = Path(__file__).resolve().parents[1] / "alembic/versions/20260901_6000_import_event_cursor_index.py"
    migration_source = migration.read_text()
    assert all(column in migration_source for column in ("event_id", "created_at", "id"))


def test_database_evidence_redacts_query_literals():
    script = Path(__file__).resolve().parents[1] / "ops" / "database_evidence.py"
    spec = importlib.util.spec_from_file_location("database_evidence", script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)

    fingerprint, query = module._safe_query_fingerprint(
        "SELECT * FROM participants WHERE email='person@example.com' "
        "AND event_id='123e4567-e89b-12d3-a456-426614174000'"
    )
    assert len(fingerprint) == 16
    assert "person@example.com" not in query
    assert "123e4567-e89b-12d3-a456-426614174000" not in query
    assert "<literal>" in query
    assert module._is_operational_query("SELECT 1") is True
    assert module._is_operational_query("DROP SCHEMA test CASCADE") is False
    assert module._query_class("COPY registration.participants FROM STDIN") == "bulk"
    assert module._query_class("SELECT * FROM registration.participants") == "application"


def test_database_plan_comparator_reports_indexes_and_event_comparability():
    script = Path(__file__).resolve().parents[1] / "ops" / "database_plan_compare.py"
    spec = importlib.util.spec_from_file_location("database_plan_compare", script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    baseline = {
        "event_id_hash": "same-event",
        "plans": {"count": {"execution_time_ms": 10, "plan": {"Plans": [{"Index Name": "old_idx"}]}}},
    }
    current = {
        "event_id_hash": "same-event",
        "plans": {"count": {"execution_time_ms": 5, "plan": {"Plans": [{"Index Name": "new_idx"}]}}},
    }
    report = module.compare_reports(baseline, current)
    assert report["same_event"] is True
    assert report["queries"]["count"]["delta_pct"] == -50.0
    assert report["queries"]["count"]["current_indexes"] == ["new_idx"]


def test_legacy_badge_collection_routes_are_bounded():
    source = Path(__file__).resolve().parents[1].joinpath(
        "app/modules/registration/routers/badges.py"
    ).read_text(encoding="utf-8")
    assert "limit: int = Query(100, ge=1, le=1000)" in source
    assert "BadgeHistory.id.desc()" in source
    assert "BadgePrintJob.id.desc()" in source
    assert "Badge.id.desc()" in source


@pytest.mark.asyncio
async def test_repository_event_lists_accept_explicit_tenant_scope():
    from app.infrastructure.repositories import Repository
    from app.modules.registration.models.check_in import AttendanceMutation

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    repository = Repository(db=None, model=AttendanceMutation)
    # Compile the helper's query through a lightweight session double so the
    # test verifies the generated predicates without opening a database.
    class SessionDouble:
        async def scalars(self, query):
            compiled = str(query.compile(compile_kwargs={"literal_binds": True}))
            assert "organization_id" in compiled
            assert organization_id.hex in compiled
            return type("Rows", (), {"all": lambda self: []})()

    repository.db = SessionDouble()
    await repository.list_for_event(event_id, organization_id=organization_id)


@pytest.mark.asyncio
async def test_repository_derives_tenant_scope_for_event_owned_models_without_org_column():
    from app.infrastructure.repositories import Repository
    from app.modules.events.models.capacity_rule import CapacityRule

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class SessionDouble:
        async def scalar(self, query):
            compiled = query.compile()
            sql = str(compiled)
            assert "events.organization_id" in sql
            assert organization_id in compiled.params.values()
            assert event_id in compiled.params.values()
            return None

    result = await Repository(SessionDouble(), CapacityRule).get_for_event(
        uuid.uuid4(), event_id, organization_id=organization_id
    )
    assert result is None


@pytest.mark.asyncio
async def test_repository_fails_closed_for_unscopable_models():
    from app.infrastructure.repositories import Repository

    with pytest.raises(ValueError, match="Cannot apply organization scope"):
        Repository(object(), object)._apply_tenant_scope(
            None, organization_id=uuid.uuid4()
        )


@pytest.mark.asyncio
async def test_platform_event_query_service_is_explicit_and_read_only():
    from types import SimpleNamespace

    from app.modules.platform.application.queries import OrganizationConsoleQueryService

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class Result:
        def all(self):
            return [SimpleNamespace(
                id=event_id,
                name="Measured Event",
                short_code="MEASURED",
                status="active",
                start_date=None,
                end_date=None,
                registration_count=12,
            )]

    class SessionDouble:
        async def execute(self, statement):
            assert statement._execution_options.get("skip_tenant_filter") is True
            compiled = statement.compile()
            assert organization_id in compiled.params.values()
            return Result()

    result = await OrganizationConsoleQueryService(SessionDouble()).events_with_registration_counts(
        organization_id=organization_id
    )
    assert result[0].registration_count == 12
    assert result[0].name == "Measured Event"


@pytest.mark.asyncio
async def test_speaker_query_requires_and_applies_verified_organization_scope():
    from app.modules.speakers.application.queries import SpeakerQueryService

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class Rows:
        def all(self):
            return []

    class SessionDouble:
        async def scalars(self, statement):
            compiled = statement.compile()
            sql = str(compiled)
            assert "events.organization_id" in sql
            assert "speakers.event_id" in sql
            assert organization_id in compiled.params.values()
            assert event_id in compiled.params.values()
            return Rows()

    page = await SpeakerQueryService(SessionDouble()).list_page(
        organization_id=organization_id,
        event_id=event_id,
        page_size=20,
    )
    assert page.items == []


def test_upload_session_route_accepts_idempotency_key():
    from app.modules.files.routers.files import create_upload_session
    import inspect

    parameter = inspect.signature(create_upload_session).parameters["idempotency_key"]
    assert parameter.default.alias == "Idempotency-Key"


@pytest.mark.asyncio
async def test_legacy_inline_upload_reader_is_memory_bounded():
    from app.modules.files.routers.files import _read_bounded_upload

    class UploadDouble:
        def __init__(self):
            self.chunks = [b"a" * 4, b"b" * 4, b""]

        async def read(self, _size):
            return self.chunks.pop(0)

    assert await _read_bounded_upload(UploadDouble(), maximum_bytes=8) == b"a" * 4 + b"b" * 4

    class OversizedUpload:
        async def read(self, _size):
            return b"x" * 9

    with pytest.raises(HTTPException) as error:
        await _read_bounded_upload(OversizedUpload(), maximum_bytes=8)
    assert error.value.status_code == 413
    assert error.value.detail["code"] == "INLINE_UPLOAD_TOO_LARGE"


@pytest.mark.asyncio
async def test_participant_and_registration_queries_require_explicit_tenant_scope():
    from app.modules.registration.application.queries import (
        ParticipantQueryService,
        RegistrationQueryService,
    )

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class Rows:
        def all(self):
            return []

    class SessionDouble:
        async def scalars(self, statement):
            compiled = statement.compile()
            sql = str(compiled)
            assert "events.organization_id" in sql
            assert organization_id in compiled.params.values()
            assert event_id in compiled.params.values()
            return Rows()

    await ParticipantQueryService(SessionDouble()).list_page(
        organization_id=organization_id,
        event_id=event_id,
        page_size=20,
    )
    await RegistrationQueryService(SessionDouble()).list_page(
        organization_id=organization_id,
        event_id=event_id,
        page_size=20,
    )


@pytest.mark.asyncio
async def test_event_query_requires_explicit_organization_scope():
    from app.modules.events.application.queries import EventQueryService

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class Rows:
        def all(self):
            return []

    class SessionDouble:
        async def scalars(self, statement):
            compiled = statement.compile()
            sql = str(compiled)
            assert "events.organization_id" in sql
            assert organization_id in compiled.params.values()
            return Rows()

    await EventQueryService(SessionDouble()).list_page(
        organization_id=organization_id,
        page_size=20,
        allowed_event_ids=select(Event.id).where(Event.id == event_id),
    )


@pytest.mark.asyncio
async def test_registration_summary_query_requires_explicit_tenant_scope():
    from app.modules.analytics.application.queries import EventRegistrationSummaryQueryService

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class Rows:
        def mappings(self):
            return self

        def one_or_none(self):
            return None

    class SessionDouble:
        async def execute(self, statement):
            compiled = statement.compile()
            sql = str(compiled)
            assert "event_registration_summary.organization_id" in sql
            assert organization_id in compiled.params.values()
            assert event_id in compiled.params.values()
            return Rows()

    assert await EventRegistrationSummaryQueryService(SessionDouble()).get_for_event(
        organization_id=organization_id,
        event_id=event_id,
    ) is None


@pytest.mark.asyncio
async def test_speaker_query_requires_explicit_organization_and_event_scope():
    from app.modules.speakers.application.queries import SpeakerQueryService

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class Rows:
        def all(self):
            return []

    class SessionDouble:
        async def scalars(self, statement):
            compiled = statement.compile()
            sql = str(compiled)
            assert "events.organization_id" in sql
            assert organization_id in compiled.params.values()
            assert event_id in compiled.params.values()
            return Rows()

    page = await SpeakerQueryService(SessionDouble()).list_page(
        organization_id=organization_id,
        event_id=event_id,
        page_size=20,
    )
    assert page.items == []


@pytest.mark.asyncio
async def test_role_invalidation_uses_canonical_event_cache_namespace(monkeypatch):
    from app.modules.registration.routers import participant_roles

    seen = []

    async def capture(pattern):
        seen.append(pattern)
        return 1

    monkeypatch.setattr(participant_roles, "delete", lambda key: capture(key))
    monkeypatch.setattr(participant_roles, "delete_pattern", capture)
    event = type(
        "EventContext",
        (),
        {"id": uuid.UUID(int=2), "organization_id": uuid.UUID(int=1)},
    )()
    await participant_roles._invalidate_role_cache(event)
    assert seen[1] == "cache:v1:tenant:00000000-0000-0000-0000-000000000001:event:00000000-0000-0000-0000-000000000002:*"
