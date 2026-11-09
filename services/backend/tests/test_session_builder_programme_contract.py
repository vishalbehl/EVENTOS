"""Focused contract coverage for Session Builder programme integration."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_builder_exposes_accepted_content_and_readiness_checks():
    source = (ROOT / "app/modules/speakers/services/session_builder_service.py").read_text(encoding="utf-8")
    assert "accepted_abstract_candidates" in source
    assert 'type="speaker_unconfirmed"' in source
    assert 'type="speaker_upload_pending"' in source
    assert 'type="missing_room"' in source
    assert 'type="unassigned_moderator"' in source
    assert 'type="travel_time"' in source or "travel_time" in source
    assert 'severity="error"' in source


def test_materialisation_is_linked_and_retry_safe():
    source = (ROOT / "app/modules/speakers/services/session_builder_programme_service.py").read_text(encoding="utf-8")
    assert "with_for_update()" in source
    assert "submission.linked_session_id" in source
    assert "return existing, False" in source
    assert "SessionPerson" in source


def test_revisions_checkpoint_before_restore_and_feed_is_gated():
    service = (ROOT / "app/modules/speakers/services/session_builder_programme_service.py").read_text(encoding="utf-8")
    router = (ROOT / "app/modules/programme/router.py").read_text(encoding="utf-8")
    assert "Automatic checkpoint before restore" in service
    assert "SCHEDULE_FEED_UNAVAILABLE" in router
    assert "json_feed_enabled" in router
    assert "embed_enabled" in router


def test_schedule_writes_are_version_bound_and_can_unassign_a_room():
    schema = (ROOT / "app/modules/speakers/schemas/session_builder.py").read_text(encoding="utf-8")
    service = (ROOT / "app/modules/speakers/services/session_builder_service.py").read_text(encoding="utf-8")
    router = (ROOT / "app/modules/speakers/routers/session_builder.py").read_text(encoding="utf-8")
    assert "expected_version" in schema
    assert "with_for_update()" in service
    assert "session.room_id = item.room_id" in service
    assert '"RESOURCE_VERSION_CONFLICT"' in router
    assert "SCHEDULE_CONFLICTS_BLOCK_PUBLICATION" in router


def test_candidate_materialisation_is_durable_and_schedule_preview_reports_conflicts():
    import inspect
    from app.modules.speakers.routers.session_builder import materialize_candidate, schedule_preview

    materialize_source = inspect.getsource(materialize_candidate)
    preview_source = inspect.getsource(schedule_preview)
    assert "begin_idempotent" in materialize_source
    assert "complete_idempotent" in materialize_source
    assert "Session.event_id == event.id" in preview_source
    assert "detect_conflicts" in preview_source
    assert "publication_ready" in preview_source


def test_session_update_preserves_legacy_moderator_name_compatibility():
    import inspect
    from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService

    source = inspect.getsource(EventResourceMutationService.update_session)
    assert 'changes.pop("moderator_name", None)' in source


def test_session_detail_query_eager_loads_relationships_before_response_serialization():
    import inspect
    from app.modules.speakers.application.queries import SessionQueryService

    source = inspect.getsource(SessionQueryService.get_for_event)
    assert "selectinload(Session.event)" in source
    assert "selectinload(Session.room)" in source


def test_builder_speaker_times_use_parent_session_window():
    source = (ROOT / "app/modules/speakers/schemas/session_builder.py").read_text(encoding="utf-8")
    assert 'data.start_time.isoformat()' in source
    assert 'data.end_time.isoformat()' in source
    assert 'ss.start_time.isoformat()' not in source


def test_schedule_announcement_is_durable_and_replay_bound():
    import inspect
    from app.modules.speakers.routers.session_builder import create_schedule_announcement

    source = inspect.getsource(create_schedule_announcement)
    assert "programme.schedule_announcement.create" in source
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert "EventCampaignMutationService.create" in source


def test_session_duplication_is_replay_safe():
    import inspect
    from app.modules.speakers.routers.session_builder import duplicate_session_endpoint

    source = inspect.getsource(duplicate_session_endpoint)
    assert 'operation="session_builder.session.duplicate"' in source
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert "IDEMPOTENCY_RESOURCE_MISSING" in source


def test_schedule_publication_commands_are_replay_safe():
    import inspect
    from app.modules.speakers.routers.session_builder import publish_schedule, unpublish_schedule

    publish_source = inspect.getsource(publish_schedule)
    unpublish_source = inspect.getsource(unpublish_schedule)
    for source, operation in (
        (publish_source, "session_builder.schedule.publish"),
        (unpublish_source, "session_builder.schedule.unpublish"),
    ):
        assert operation in source
        assert "begin_idempotent" in source
        assert "complete_idempotent" in source
        assert "replay_response" in source
