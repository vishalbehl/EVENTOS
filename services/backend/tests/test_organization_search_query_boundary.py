from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
SERVICE = (ROOT / "app/modules/platform/application/organization_search_queries.py").read_text(encoding="utf-8")
PLATFORM_QUERIES = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")


def test_console_search_delegates_database_reads_to_query_service():
    region = ROUTER.split("async def search_organization_console", 1)[1].split("@router.", 1)[0]
    assert "OrganizationConsoleSearchQueryService(db).search" in region
    assert "db.scalars" not in region
    assert "db.execute" not in region


def test_console_search_query_service_has_tenant_scoped_bounded_projections():
    assert "Event.organization_id == organization_id" in SERVICE
    assert "User.organization_id == organization_id" in SERVICE
    assert ".order_by(" in SERVICE
    assert ".limit(fetch_limit)" in SERVICE
    assert "Speaker.first_name" in SERVICE and "Speaker.email" in SERVICE
    assert "ParticipantRegistration.registration_data" in SERVICE


def test_console_search_uses_stable_seek_cursor_with_legacy_offset_compatibility():
    assert "cursor_position: tuple[datetime, uuid.UUID] | None = None" in SERVICE
    assert "_after_cursor(" in SERVICE
    assert "items[:limit]" in SERVICE
    assert "_search_seek_cursor(cursor)" in ROUTER
    assert "_encode_search_seek_cursor" in ROUTER
    assert "_search_cursor(cursor)" in ROUTER


def test_console_event_directory_delegates_to_explicit_projection():
    region = ROUTER.split("async def list_organization_console_events", 1)[1].split("@router.", 1)[0]
    assert "OrganizationConsoleQueryService(db).list_events" in region
    assert "db.scalars" not in region
    assert "db.execute" not in region
    method = PLATFORM_QUERIES.split("    async def list_events", 1)[1].split("    async def counts", 1)[0]
    assert "Event.organization_id == organization_id" in method
    assert ".order_by(Event.start_date" in method
    assert ".limit(bounded_limit)" in method


def test_event_registration_workspace_delegates_database_reads():
    region = ROUTER.split("async def event_registration_workspace", 1)[1].split("@router.", 1)[0]
    assert "OrganizationConsoleRegistrationQueryService(db).list_page" in region
    assert "db.scalars" not in region
    assert "db.execute" not in region
    assert "registration_status=registration_status" in region
    assert "Event.organization_id == organization_id" in SERVICE
    assert "ParticipantRegistration.event_id == event_id" in SERVICE
    assert "load_only(" in SERVICE


def test_event_workspace_overview_uses_single_tenant_scoped_projection():
    region = ROUTER.split('if workspace == "overview":', 1)[1].split('elif workspace == "settings":', 1)[0]
    assert "OrganizationConsoleQueryService(db).event_overview_counts" in region
    assert "db.scalar" not in region
    method = PLATFORM_QUERIES.split("    async def event_overview_counts", 1)[1].split("    async def list_events", 1)[0]
    assert "Event.organization_id == organization_id" in method
    assert 'label("registrations")' in method
    assert 'label("payments")' in method


def test_event_workspace_speakers_and_sessions_delegate_to_bounded_projections():
    region = ROUTER.split("async def event_domain_workspace", 1)[1].split("@router.patch", 1)[0]
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_attendees" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_speakers" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_sessions" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_files" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_payments" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_checkins" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_rooms" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_tickets" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_users" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_communications" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_templates" in region
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_integrations" in region
    assert "speaker_filter =" not in region
    assert "session_filter =" not in region

    assert "Event.organization_id == organization_id" in SERVICE
    assert "Speaker.event_id == event_id" in SERVICE
    assert "Session.event_id == event_id" in SERVICE
    assert "PresentationFile.event_id == event_id" in SERVICE
    assert "PaymentTransaction.event_id == event_id" in SERVICE
    assert "CheckIn.event_id == event_id" in SERVICE
    assert "Room.event_id == event_id" in SERVICE
    assert "TicketType.event_id == event_id" in SERVICE
    assert "User.organization_id == organization_id" in SERVICE
    assert "EmailCampaign.event_id == event_id" in SERVICE
    assert "EmailLog.event_id == event_id" in SERVICE
    assert "EmailTemplate.event_id == event_id" in SERVICE
    assert "PrintTemplate.event_id == event_id" in SERVICE
    assert "Webhook.event_id == event_id" in SERVICE
    assert "RegistrationConfirmationQR.participant_id == Participant.id" in SERVICE
    assert "Event.organization_id == organization_id" in SERVICE
    assert ".limit(101)" in SERVICE
    assert "Speaker.created_at.desc(), Speaker.id.desc()" in SERVICE
    assert "Session.start_time, Session.id" in SERVICE


def test_event_workspace_audit_delegates_to_audit_query_service():
    region = ROUTER.split("async def event_domain_workspace", 1)[1].split("@router.patch", 1)[0]
    assert "AuditQueryService(db).list_organization_cursor" in region
    assert "resource_id=event_id" in region


def test_event_workspace_settings_delegates_to_explicit_event_projection():
    region = ROUTER.split('if workspace == "overview":', 1)[1].split('elif workspace == "operations":', 1)[0]
    assert "OrganizationConsoleQueryService(db).event_settings" in region
    assert "db.scalar" not in region
    method = PLATFORM_QUERIES.split("    async def event_settings", 1)[1].split("    async def list_events", 1)[0]
    assert "Event.organization_id == organization_id" in method
    assert "Event.branding_settings" in method


def test_event_workspace_operations_uses_one_scoped_failure_projection():
    region = ROUTER.split('elif workspace == "operations":', 1)[1].split('elif workspace == "attendees":', 1)[0]
    assert "OrganizationConsoleQueryService(db).event_operations_failures" in region
    assert "db.scalar" not in region
    method = PLATFORM_QUERIES.split("    async def event_operations_failures", 1)[1].split("    async def list_events", 1)[0]
    assert "Event.organization_id == organization_id" in method
    assert "ImportJob.event_id == Event.id" in method
    assert "VenueSyncJob.event_id == Event.id" in method


def test_event_workspace_jobs_delegate_all_job_reads_to_bounded_projection():
    region = ROUTER.split('elif workspace == "jobs":', 1)[1].split('elif workspace == "integrations":', 1)[0]
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_jobs" in region
    assert "db.scalars" not in region
    assert "db.execute" not in region
    assert "ImportJob.event_id == event_id" in SERVICE
    assert "VenueSyncJob.event_id == event_id" in SERVICE
    assert "PresentationFile.event_id == event_id" in SERVICE


def test_event_workspace_abstracts_delegate_to_canonical_query_service():
    region = ROUTER.split('elif workspace == "abstracts":', 1)[1].split('elif workspace == "sessions":', 1)[0]
    assert "OrganizationConsoleEventWorkspaceQueryService(db).list_abstracts" in region
    assert "select(SessionSpeaker" not in region
    assert "abstract.abstract_submissions" in region

    method = SERVICE.split("    async def list_abstracts", 1)[1].split("    async def list_sessions", 1)[0]
    assert "AbstractSubmission.organization_id == organization_id" in method
    assert "AbstractSubmission.event_id == event_id" in method
    assert ".limit(101)" in method


def test_event_workspace_analytics_delegates_through_tenant_query_boundary():
    region = ROUTER.split('elif workspace == "analytics":', 1)[1].split('elif workspace == "audit":', 1)[0]
    assert "OrganizationConsoleAnalyticsQueryService(db).snapshot" in region
    assert "build_analytics_snapshot(db, event_id)" not in region
    assert "AnalyticsDashboardQueryService(self.db).get_event_for_scope" in SERVICE
