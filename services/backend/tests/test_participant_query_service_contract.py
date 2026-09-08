from __future__ import annotations

import importlib
import inspect

from app.modules.registration.application.queries import ParticipantQueryService
from app.modules.events.application.queries import EventQueryService
from app.modules.speakers.application.queries import SpeakerQueryService


def test_participant_query_service_is_read_only_and_cursor_bounded():
    source = inspect.getsource(ParticipantQueryService)
    assert "db.commit" not in source
    assert "cursor_page" in source
    assert "maximum=100" in source


def test_event_query_service_is_read_only_and_cursor_bounded():
    source = inspect.getsource(EventQueryService)
    assert "db.commit" not in source
    assert "cursor_page" in source
    assert "maximum=100" in source


def test_event_legacy_list_is_bounded_and_uses_explicit_projection():
    source = inspect.getsource(EventQueryService.list_offset)
    assert "load_only" in source
    assert "list_page" in source
    assert "maximum=100" in source
    assert "db.commit" not in source


def test_speaker_query_service_is_projection_only_and_bounded():
    source = inspect.getsource(SpeakerQueryService)
    assert "db.commit" not in source
    assert "load_only" in source
    # The portal lookup must filter by the credential, but the bounded read
    # projections must not select it for response serialization.
    assert "load_only(Speaker.upload_token" not in source
    assert "maximum=100" in source
    assert "cursor_page" in source


def test_speaker_mutation_exposes_optimistic_concurrency():
    from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService

    source = inspect.getsource(EventResourceMutationService.update_speaker)
    assert "expected_version" in source
    assert "raise_version_conflict" in source
    assert "speaker.version" in source


def test_speaker_command_owns_idempotent_transaction_and_cache_invalidation():
    from app.modules.speakers.application.commands import SpeakerCommandService

    source = inspect.getsource(SpeakerCommandService.update)
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert "await db.commit()" in source
    assert "invalidate_event" in source
    assert "await db.rollback()" in source


def test_speaker_archive_is_replayable_and_version_bound():
    from app.modules.speakers.application.commands import SpeakerCommandService
    from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService

    source = inspect.getsource(SpeakerCommandService.archive)
    archive_source = inspect.getsource(EventResourceMutationService.archive_speaker)
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert "invalidate_event" in source
    assert "expected_version" in archive_source
    assert "raise_version_conflict" in archive_source


def test_session_command_owns_versioned_idempotent_transaction():
    from app.modules.agenda.application.commands import SessionCommandService
    from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService

    source = inspect.getsource(SessionCommandService.update)
    mutation_source = inspect.getsource(EventResourceMutationService.update_session)
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert "invalidate_event" in source
    assert "await db.rollback()" in source
    assert "expected_version" in mutation_source
    assert "raise_version_conflict" in mutation_source


def test_session_archive_uses_the_same_command_boundary():
    from app.modules.agenda.application.commands import SessionCommandService
    from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService

    source = inspect.getsource(SessionCommandService.archive)
    mutation_source = inspect.getsource(EventResourceMutationService.archive_session)
    assert "sessions.archive" in source
    assert "complete_idempotent" in source
    assert "invalidate_event" in source
    assert "expected_version" in mutation_source
    assert "raise_version_conflict" in mutation_source


def test_room_commands_are_versioned_idempotent_and_cache_aware():
    from app.modules.agenda.application.commands import RoomCommandService
    from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService

    create_source = inspect.getsource(RoomCommandService.create_room)
    update_source = inspect.getsource(RoomCommandService.update_room)
    archive_source = inspect.getsource(RoomCommandService.archive_room)
    mutation_source = inspect.getsource(EventResourceMutationService.update_room)
    assert "rooms.create" in create_source
    assert "complete_idempotent" in create_source
    assert "invalidate_event" in create_source
    assert "rooms.update" in update_source
    assert "complete_idempotent" in update_source
    assert "invalidate_event" in update_source
    assert "rooms.archive" in archive_source
    assert "complete_idempotent" in archive_source
    assert "expected_version" in mutation_source
    assert "raise_version_conflict" in mutation_source


def test_room_query_service_is_bounded_and_projection_based():
    from app.modules.agenda.application.queries import RoomQueryService

    source = inspect.getsource(RoomQueryService.list_for_event)
    assert "load_only" in source
    assert "limit(100)" in source
    assert "Room.event_id == event_id" in source
    assert "db.commit" not in source


def test_room_detail_and_assignment_checks_stay_in_query_service():
    from app.modules.agenda.application.queries import RoomQueryService

    room_source = inspect.getsource(RoomQueryService.get_for_event)
    access_source = inspect.getsource(RoomQueryService.user_can_access)
    router_source = importlib.import_module("app.modules.venue.routers.rooms")
    helper_source = inspect.getsource(router_source._get_room_or_404)
    assert "Event.organization_id == organization_id" in room_source
    assert "selectinload(Room.event).load_only(Event.timezone)" in room_source
    assert ".limit(1)" in access_source
    assert "query_service.get_for_event" in helper_source
    assert "query_service.user_can_access" in helper_source
    assert "await db.execute" not in helper_source


def test_track_query_and_commands_are_bounded_and_transactional():
    from app.modules.agenda.application.commands import TrackCommandService
    from app.modules.agenda.application.queries import TrackQueryService
    from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService

    query_source = inspect.getsource(TrackQueryService.list_for_event)
    command_source = inspect.getsource(TrackCommandService.update)
    mutation_source = inspect.getsource(EventResourceMutationService.update_track)
    assert "load_only" in query_source
    assert "limit(100)" in query_source
    assert "Track.event_id == event_id" in query_source
    assert "begin_idempotent" in command_source
    assert "complete_idempotent" in command_source
    assert "invalidate_event" in command_source
    assert "expected_version" in mutation_source
    assert "raise_version_conflict" in mutation_source


def test_agenda_reads_do_not_seed_or_commit_default_state():
    import importlib
    from app.modules.agenda.services.agenda_service import AgendaService
    agenda_router = importlib.import_module("app.modules.agenda.routers.agenda_router")

    read_source = inspect.getsource(AgendaService.get_default_agenda)
    router_source = inspect.getsource(agenda_router.get_agenda_snapshot)
    assert "db.commit" not in read_source
    assert "get_or_create_default_agenda" not in router_source


def test_agenda_query_service_is_tenant_scoped_and_bounded():
    from app.modules.agenda.application.queries import AgendaQueryService

    source = inspect.getsource(AgendaQueryService)
    assert "Event.organization_id == organization_id" in source
    assert "load_only" in source
    assert "limit(100)" in source
    assert "db.commit" not in source


def test_agenda_snapshot_router_delegates_to_tenant_scoped_query_service():
    import importlib
    router = importlib.import_module("app.modules.agenda.routers.agenda_router")
    source = inspect.getsource(router.get_agenda_snapshot)
    assert "AgendaQueryService(db).full_snapshot" in source
    assert "organization_id=event.organization_id" in source
    assert "AgendaService.get_full_snapshot" not in source


def test_registration_query_service_uses_explicit_projection():
    from app.modules.registration.application.queries import RegistrationQueryService

    source = inspect.getsource(RegistrationQueryService.list_page)
    assert "load_only" in source
    assert "ParticipantRegistration.registration_data" in source
    assert "ParticipantRegistration.version" in source
    assert "cursor_column=(\"submitted_at\", \"id\")" in source


def test_registration_submit_owns_capacity_and_idempotent_transaction():
    import importlib
    from app.modules.registration.application.commands import RegistrationCommandService
    registrations = importlib.import_module("app.modules.registration.routers.registrations")

    command_source = inspect.getsource(RegistrationCommandService.submit)
    router_source = inspect.getsource(registrations.submit_registration)
    assert "begin_idempotent" in command_source
    assert "complete_idempotent" in command_source
    assert "await db.rollback()" in command_source
    assert "await db.commit()" in command_source
    assert "RegistrationCommandService.submit" in router_source
    assert "q_rule" not in router_source


def test_registration_review_transitions_are_command_owned_and_versioned():
    import importlib
    from app.modules.registration.application.commands import RegistrationCommandService

    registrations = importlib.import_module("app.modules.registration.routers.registrations")
    reject_source = inspect.getsource(RegistrationCommandService.reject)
    waitlist_source = inspect.getsource(RegistrationCommandService.waitlist)
    transition_source = inspect.getsource(RegistrationCommandService._review_transition)
    router_source = inspect.getsource(registrations.reject_registration)
    waitlist_router_source = inspect.getsource(registrations.waitlist_registration)

    assert "begin_idempotent" in transition_source
    assert "with_for_update" in transition_source
    assert "raise_version_conflict" in transition_source
    assert "await db.rollback()" in transition_source
    assert "RegistrationCommandService.reject" in router_source
    assert "RegistrationCommandService.waitlist" in waitlist_router_source
    assert "expected_version" in reject_source
    assert "expected_version" in waitlist_source


def test_registration_approval_and_promotion_are_command_owned():
    import importlib
    from app.modules.registration.application.commands import RegistrationCommandService

    registrations = importlib.import_module("app.modules.registration.routers.registrations")
    command_source = inspect.getsource(RegistrationCommandService._approve_or_promote)
    approve_router = inspect.getsource(registrations.approve_registration)
    promote_router = inspect.getsource(registrations.promote_registration)

    assert "begin_idempotent" in command_source
    assert "with_for_update" in command_source
    assert "await db.commit()" in command_source
    assert "await db.rollback()" in command_source
    assert "RegistrationCommandService.approve" in approve_router
    assert "RegistrationCommandService.promote" in promote_router


def test_participant_archive_and_restore_are_command_owned():
    import importlib
    from app.modules.registration.application.commands import ParticipantCommandService

    participants = importlib.import_module("app.modules.registration.routers.participants")
    archive_source = inspect.getsource(ParticipantCommandService.archive)
    restore_source = inspect.getsource(ParticipantCommandService.restore)
    delete_router = inspect.getsource(participants.delete_participant)
    restore_router = inspect.getsource(participants.restore_participant)

    assert "begin_idempotent" in archive_source
    assert "await db.commit()" in archive_source
    assert "await db.rollback()" in archive_source
    assert "begin_idempotent" in restore_source
    assert "ParticipantCommandService.archive" in delete_router
    assert "ParticipantCommandService.restore" in restore_router


def test_attendance_projection_is_tenant_scoped_and_read_only():
    from app.modules.analytics.application.queries import EventAttendanceSummaryQueryService
    from app.modules.analytics.services.event_attendance_projection import refresh_event_attendance_summary

    query_source = inspect.getsource(EventAttendanceSummaryQueryService.get_for_event)
    refresh_source = inspect.getsource(refresh_event_attendance_summary)
    assert "organization_id == organization_id" in query_source
    assert "event_id == event_id" in query_source
    assert "db.commit" not in query_source
    assert "Event.organization_id == organization_id" in refresh_source
    assert "CheckIn.participant_id" in refresh_source


def test_attendance_projection_refresh_is_dispatched_after_attendance_mutation():
    import importlib
    attendance = importlib.import_module("app.modules.venue.routers.attendance")
    source = inspect.getsource(attendance.check_in_participant)
    checkout_source = inspect.getsource(attendance.check_out_participant)
    assert "enqueue_event_attendance_projection_refresh" in source
    assert "enqueue_event_attendance_projection_refresh" in checkout_source


def test_organization_console_attendee_mutations_refresh_registration_projection_after_commit():
    from pathlib import Path

    source = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "modules"
        / "platform"
        / "organization_console_router.py"
    ).read_text(encoding="utf-8")
    assert "enqueue_event_registration_projection_refresh" in source
    for operation in ("create", "update", "archive", "restore"):
        marker = f"EventParticipantMutationService.{operation}"
        start = source.index(marker)
        end = source.find("if workspace", start + len(marker))
        section = source[start : end if end != -1 else len(source)]
        assert "await command.commit" in section
        assert "enqueue_event_registration_projection_refresh" in section
def test_attendance_query_service_is_bounded_and_tenant_scoped():
    from app.modules.venue.application.queries import AttendanceQueryService

    source = inspect.getsource(AttendanceQueryService)
    assert "Event.organization_id == organization_id" in source
    assert "load_only" in source
    assert "limit(max(1, min(limit, 500)))" in source
    assert "db.commit" not in source


def test_payment_projection_is_tenant_scoped_and_rebuildable():
    from app.modules.analytics.application.queries import EventPaymentSummaryQueryService
    from app.modules.analytics.services.event_payment_projection import refresh_event_payment_summary

    query_source = inspect.getsource(EventPaymentSummaryQueryService.get_for_event)
    refresh_source = inspect.getsource(refresh_event_payment_summary)
    assert "EventPaymentSummary.organization_id == organization_id" in query_source
    assert "EventPaymentSummary.event_id == event_id" in query_source
    assert "PaymentTransaction.event_id == event_id" in refresh_source
    assert "Event.organization_id == organization_id" in refresh_source


def test_payment_projection_refresh_is_wired_to_public_payment_changes():
    import importlib
    portal = importlib.import_module("app.modules.registration.routers.registration_portal")
    source = inspect.getsource(portal.verify_public_payment)
    checkout_source = inspect.getsource(portal.public_checkout_payment)
    assert "enqueue_event_payment_projection_refresh" in source
    assert "enqueue_event_payment_projection_refresh" in checkout_source
    dashboard = importlib.import_module("app.modules.registration.routers.portal_dashboard")
    dashboard_source = inspect.getsource(dashboard.attendee_payment_confirm)
    assert "enqueue_event_payment_projection_refresh" in dashboard_source


def test_speaker_projection_is_tenant_scoped_rebuildable_and_wired_to_file_changes():
    from app.modules.analytics.application.queries import EventSpeakerSummaryQueryService
    from app.modules.analytics.services.event_speaker_projection import refresh_event_speaker_summary

    query_source = inspect.getsource(EventSpeakerSummaryQueryService.get_for_event)
    refresh_source = inspect.getsource(refresh_event_speaker_summary)
    files = importlib.import_module("app.modules.presentations.routers.files")
    files_source = inspect.getsource(files.request_upload_url)
    confirm_source = inspect.getsource(files.confirm_upload)
    validation = importlib.import_module("app.modules.presentations.services.validation_service")
    validation_source = inspect.getsource(validation.validate_presentation_file)

    assert "EventSpeakerSummary.organization_id == organization_id" in query_source
    assert "EventSpeakerSummary.event_id == event_id" in query_source
    assert "db.commit" not in query_source
    assert "Event.organization_id == organization_id" in refresh_source
    assert "PresentationFile.is_current_version" in refresh_source
    assert "enqueue_event_speaker_projection_refresh" in files_source
    assert "enqueue_event_speaker_projection_refresh" in confirm_source
    assert "enqueue_event_speaker_projection_refresh" in validation_source
    speakers_router = importlib.import_module("app.modules.speakers.routers.speakers")
    assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(
        speakers_router.manual_register_speaker
    )
    sessions_router = importlib.import_module("app.modules.speakers.routers.sessions")
    for route_name in ("create_session", "add_speaker_to_session", "remove_speaker_from_session"):
        assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(
            getattr(sessions_router, route_name)
        )
    assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(
        speakers_router.fetch_speakers_from_registration
    )
    agenda_commands = importlib.import_module("app.modules.agenda.application.commands")
    assert "Session.deleted_at.is_(None)" in inspect.getsource(
        importlib.import_module("app.modules.analytics.services.event_speaker_projection")
    )
    for method_name in ("update", "archive"):
        assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(
            getattr(agenda_commands.SessionCommandService, method_name)
        )
    capacity_router = importlib.import_module("app.modules.venue.routers.capacity")
    assert "enqueue_event_registration_projection_refresh" in inspect.getsource(
        capacity_router.trigger_waitlist_promotions
    )
    participants_router = importlib.import_module("app.modules.registration.routers.participants")
    assert "enqueue_event_attendance_projection_refresh" in inspect.getsource(
        participants_router.checkin_participant
    )
    organization_console = importlib.import_module(
        "app.modules.platform.organization_console_router"
    )
    assert "enqueue_event_attendance_projection_refresh" in inspect.getsource(
        organization_console.execute_event_workspace_action
    )
    venue_commands = importlib.import_module("app.modules.venue.application.commands")
    assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(
        venue_commands.SrrStationCommandService.assign
    )
    sync_router = importlib.import_module("app.modules.venue.routers.sync")
    assert "attendance_projection_changed" in inspect.getsource(
        sync_router.push_sync_payload
    )
    assert "enqueue_event_attendance_projection_refresh" in inspect.getsource(
        sync_router.push_sync_payload
    )
    session_builder = importlib.import_module("app.modules.speakers.routers.session_builder")
    assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(session_builder.duplicate_session_endpoint)
    speaker_commands = importlib.import_module("app.modules.speakers.application.commands")
    assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(speaker_commands.SpeakerCommandService.update)
    assert "enqueue_event_speaker_projection_refresh" in inspect.getsource(speaker_commands.SpeakerCommandService.archive)
    correction_commands = importlib.import_module(
        "app.modules.platform.application.registration_correction_commands"
    )
    assert "enqueue_event_registration_projection_refresh" in inspect.getsource(
        correction_commands.RegistrationCorrectionCommandService.correct
    )


def test_organization_usage_query_is_explicit_and_read_only():
    from app.modules.analytics.application.queries import OrganizationUsageQueryService

    source = inspect.getsource(OrganizationUsageQueryService.get)
    assert "OrganizationUsage.organization_id == organization_id" in source
    assert "OrganizationUsage.storage_used_bytes" in source
    assert "db.commit" not in source


def test_projection_tasks_persist_sanitized_terminal_failures_and_use_backoff():
    for module_name, model_name in (
        ("app.tasks.attendance_projection_tasks", "EventAttendanceSummary"),
        ("app.tasks.payment_projection_tasks", "EventPaymentSummary"),
        ("app.tasks.speaker_projection_tasks", "EventSpeakerSummary"),
    ):
        module = importlib.import_module(module_name)
        source = inspect.getsource(module)
        assert "mark_projection_failed" in source
        assert model_name in source
        assert "policy.retry_delay" in source
        assert "is_retryable" in source


def test_all_analytics_projection_tasks_route_to_reports_queue():
    worker = importlib.import_module("app.worker")
    routes = worker.celery_app.conf.task_routes
    for task_name in (
        "app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
        "app.tasks.attendance_projection_tasks.refresh_event_attendance_summary",
        "app.tasks.payment_projection_tasks.refresh_event_payment_summary",
        "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary",
    ):
        assert routes[task_name]["queue"] == "reports"


def test_speaker_profile_upsert_owns_transaction_and_router_is_thin():
    commands = importlib.import_module("app.modules.speakers.application.commands")
    profiles = importlib.import_module("app.modules.speakers.routers.speaker_profiles")
    command_source = inspect.getsource(commands.SpeakerCommandService.upsert_profile)
    router_source = inspect.getsource(profiles.upsert_speaker_profile)
    assert "begin_idempotent" in command_source
    assert "await db.commit()" in command_source
    assert "await db.rollback()" in command_source
    assert "SpeakerCommandService.upsert_profile" in router_source
    assert "await db.commit()" not in router_source


def test_organization_console_counts_are_one_explicit_read_only_projection():
    queries = importlib.import_module("app.modules.platform.application.queries")
    service_source = inspect.getsource(queries.OrganizationConsoleQueryService.counts)
    console = importlib.import_module("app.modules.platform.services.organization_console_service")
    summary_source = inspect.getsource(console.OrganizationConsoleService.summary)
    assert "def count_for(model" in service_source
    assert "scalar_subquery()" in service_source
    assert "organization_id == organization_id" in service_source
    assert "db.commit" not in service_source
    assert "OrganizationConsoleQueryService" in summary_source
