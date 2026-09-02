"""Guard the application convention that GET handlers do not own writes."""

from __future__ import annotations

import ast
from pathlib import Path


# These endpoints intentionally record access or invalidate a bad cache entry.
# Any new exception must be reviewed and added explicitly with its reason.
INTENTIONAL_READ_SIDE_EFFECTS = {
    ("modules/commercial/quotes_router.py", "view_public_proposal"),
    ("modules/venue/routers/sync.py", "get_registration_source_context"),
    ("modules/venue/routers/sync.py", "get_registration_source_event_queue"),
    ("modules/speakers/routers/portal.py", "speaker_portal_auth"),
    ("modules/speakers/routers/portal.py", "download_speaker_qr"),
    ("modules/presentations/routers/files.py", "get_download_url"),
    ("modules/presentations/routers/posters.py", "get_poster_download_url"),
    ("modules/notifications/routers/notifications.py", "download_logs"),
    ("modules/notifications/routers/notifications.py", "track_open"),
}


def _backend_app_root() -> Path:
    local_root = Path(__file__).resolve().parents[1] / "app"
    container_root = Path("/workspace/services/backend/app")
    # The staging test mount is authoritative; the image may contain an older
    # copy of the source under /app/app.
    return container_root if container_root.exists() else local_root


def _is_get_route(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    return any(
        isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr == "get"
        for decorator in node.decorator_list
    )


def test_get_routes_do_not_commit_or_mutate_the_database():
    violations: list[str] = []
    app_root = _backend_app_root()
    for path in app_root.rglob("*.py"):
        relative = path.relative_to(app_root).as_posix()
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.iter_child_nodes(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or not _is_get_route(node):
                continue
            effects = []
            for child in ast.walk(node):
                if isinstance(child, ast.Await) and isinstance(child.value, ast.Call):
                    call = child.value
                    if isinstance(call.func, ast.Attribute) and call.func.attr == "commit":
                        effects.append("commit")
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                    if (
                        child.func.attr in {"add", "delete"}
                        and isinstance(child.func.value, ast.Name)
                        and child.func.value.id == "db"
                    ):
                        effects.append(child.func.attr)
            if effects and (relative, node.name) not in INTENTIONAL_READ_SIDE_EFFECTS:
                violations.append(f"{relative}:{node.lineno}:{node.name}: {sorted(set(effects))}")

    assert not violations, "Unexpected database write in GET route:\n" + "\n".join(violations)


def test_platform_organization_list_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_organizations", 1)[1].split("@router.", 1)[0]
    assert "OrganizationConsoleQueryService(db).organization_list" in region
    assert "await db.execute" not in region


def test_agenda_catalog_reads_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/agenda/routers/catalogs_router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("list_agenda_roles", "list_roles"),
        ("list_session_types", "list_session_types"),
        ("list_room_types", "list_room_types"),
        ("list_track_types", "list_track_types"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"AgendaCatalogQueryService(db).{method_name}" in region
        assert "await db.execute" not in region


def test_pricing_reads_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/ticket_types.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("get_tiers", "list_distinct_tiers"),
        ("get_tier_schedules", "schedules"),
        ("get_pricing", "pricing_map"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"PricingQueryService(db).{method_name}" in region
        assert "await db.execute" not in region


def test_form_builder_reads_use_explicit_query_service():
    category_router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/form_categories.py"
    ).read_text(encoding="utf-8-sig")
    template_router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/form_templates.py"
    ).read_text(encoding="utf-8-sig")
    assert "FormBuilderQueryService(db).list_categories" in category_router
    assert "FormBuilderQueryService(db).list_templates" in template_router
    assert "FormBuilderQueryService(db).get_template" in template_router
    assert "await db.execute" not in category_router
    assert "await db.execute" not in template_router


def test_registration_catalog_reads_are_query_owned_and_read_only():
    role_router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/participant_roles.py"
    ).read_text(encoding="utf-8-sig")
    print_router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/print_templates.py"
    ).read_text(encoding="utf-8-sig")
    role_region = role_router.split("async def list_roles", 1)[1].split("@router.", 1)[0]
    print_region = print_router.split("async def list_print_templates", 1)[1].split("@router.", 1)[0]
    get_print_region = print_router.split("async def get_print_template", 1)[1].split("@router.", 1)[0]
    assert "ParticipantRoleQueryService(db).list_for_event" in role_region
    assert "PrintTemplateQueryService(db).list_for_event" in print_region
    assert "PrintTemplateQueryService(db).get_for_event" in get_print_region
    assert "seed_default_roles" not in role_region
    assert "await db.commit" not in role_region
    assert "await db.execute" not in role_region
    assert "await db.execute" not in print_region
    assert "await db.execute" not in get_print_region


def test_organiser_event_list_uses_one_bounded_query_service_boundary():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_events", 1)[1].split("@router.", 1)[0]
    assert "OrganiserEventQueryService(db).list_events" in region
    assert "_event_readiness" not in region
    assert "await db.execute" not in region


def test_organiser_integrations_uses_bounded_projection_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_integrations", 1)[1].split("@router.", 1)[0]
    assert "OrganiserIntegrationQueryService(db).list_connections" in region
    assert "await db.execute" not in region
    assert "le=1000" in region


def test_organiser_audit_uses_bounded_audit_query_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_audit", 1)[1].split("@router.", 1)[0]
    assert "AuditQueryService(db).list_organization_activity" in region
    assert "effective_page_size = min(page_size, AuditQueryService.MAX_PAGE_SIZE)" in region
    assert "await db.execute" not in region


def test_public_registration_form_serializes_cold_cache_misses():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/registration_portal.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_public_registration_form", 1)[1].split(
        "@router.", 1
    )[0]
    assert "acquire_lock_status" in region
    assert "lock:{form_cache_key}" in region
    assert "release_lock(form_lock_name, form_lock_token)" in region


def test_import_job_compatibility_reads_use_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/import_jobs.py"
    ).read_text(encoding="utf-8-sig")
    list_region = router.split("async def list_import_jobs", 1)[1].split("@router.", 1)[0]
    get_region = router.split("async def get_import_job", 1)[1].split("@router.", 1)[0]
    assert "ImportJobQueryService(db).list_recent" in list_region
    assert "ImportJobQueryService(db).get_for_event" in get_region
    assert "await db.execute" not in list_region
    assert "await db.execute" not in get_region


def test_organiser_locations_read_uses_bounded_projection_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_locations", 1)[1].split("@router.", 1)[0]
    assert "OrganiserLocationQueryService(db).list_locations" in region
    assert "await db.scalars" not in region
    assert "MAX_PAGE_SIZE" in region


def test_organiser_custom_fields_read_uses_bounded_projection_service():
    router = (
        _backend_app_root() / "modules/organiser/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_organiser_custom_fields", 1)[1].split("@router.", 1)[0]
    assert "OrganiserCustomFieldQueryService(db).list_fields" in region
    assert "await db.scalars" not in region
    assert "MAX_PAGE_SIZE" in region


def test_organiser_developer_settings_read_uses_batched_projection_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split('if domain == "developer":', 1)[1].split("raise HTTPException", 1)[0]
    assert "OrganiserDeveloperSettingsQueryService(db).get_settings" in region
    assert "await db.scalar" not in region
    assert "for webhook, event_name in webhook_rows" not in region


def test_organiser_notification_settings_read_uses_bounded_projection_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split('if domain == "notifications":', 1)[1].split(
        'if domain == "security":', 1
    )[0]
    assert "OrganiserNotificationSettingsQueryService(db).get_settings" in region
    assert "await db.scalars" not in region


def test_organiser_security_and_branding_reads_use_projection_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    security = router.split('if domain == "security":', 1)[1].split(
        'if domain == "branding":', 1
    )[0]
    branding = router.split('if domain == "branding":', 1)[1].split(
        'if domain == "developer":', 1
    )[0]
    assert "OrganiserSecurityBrandingQueryService(db).get_security_policy" in security
    assert "OrganiserSecurityBrandingQueryService(db).get_brand_profile" in branding
    assert "await db.scalar" not in security
    assert "await db.scalar" not in branding


def test_organiser_team_list_uses_batched_query_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_teams", 1)[1].split("@router.", 1)[0]
    assert "OrganiserTeamQueryService(db).list_teams" in region
    assert "for team in teams" not in region
    assert "await db.execute" not in region


def test_organiser_member_list_uses_batched_query_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_members", 1)[1].split("@router.", 1)[0]
    assert "OrganiserMemberQueryService(db).list_members" in region
    assert "await db.execute" not in region
    assert "for member, user in rows" not in region


def test_organiser_feature_catalogue_uses_entitlement_query_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_effective_features", 1)[1].split(
        "@router.", 1
    )[0]
    assert "OrganiserEntitlementQueryService(db).list_effective_features" in region
    assert "select(FeatureCatalog)" not in region
    assert "for feature in catalogue" not in region


def test_organiser_report_event_reads_use_aggregate_query_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_report", 1)[1].split(
        "@router.post(\"/reports/exports\")", 1
    )[0]
    assert "OrganiserReportQueryService(db).list_event_reports" in region
    assert "for event in events" not in region
    assert "_event_readiness(db, event.id)" not in region


def test_organiser_attention_feed_uses_bounded_aggregate_query_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_needs_attention", 1)[1].split(
        "async def _attention_state", 1
    )[0]
    assert "OrganiserAttentionQueryService(db).list_candidates" in region
    assert "for event in events" not in region
    assert "await _attention_for_event(db, event)" not in region


def test_organiser_dashboard_reuses_aggregate_event_projection():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_dashboard", 1)[1].split(
        "@router.get(\"/addons/status\")", 1
    )[0]
    assert "OrganiserReportQueryService(db).list_event_reports" in region
    assert "for event in all_events[:6]" not in region
    assert "_event_readiness(db, event.id)" not in region
    assert "for i in range(7)" not in region
    assert "registration_revenue_trend" in region
    assert "AuditQueryService(db).list_organization_activity" in region
    assert "select(AuditLog)" not in region
    assert "list_dashboard_event_refs" in region
    assert "select(Event)" not in region


def test_organiser_addon_status_uses_explicit_query_service():
    router = (_backend_app_root() / "modules/organiser/router.py").read_text(
        encoding="utf-8-sig"
    )
    region = router.split("async def organiser_addon_status", 1)[1].split(
        "@router.", 1
    )[0]
    assert "OrganiserAddonQueryService(db).get_status_data" in region
    assert "await db.scalars" not in region


def test_participant_checkin_history_uses_tenant_scoped_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/participants.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_participant_checkins", 1)[1].split("@router.", 1)[0]
    assert "CheckInQueryService(db).list_for_participant" in region
    assert "await db.execute" not in region


def test_participant_analytics_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/registration/routers/participants.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_registration_analytics", 1)[1].split("@router.", 1)[0]
    assert "ParticipantAnalyticsQueryService(db).dashboard" in region


def test_session_compatibility_list_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/speakers/routers/sessions.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_sessions(\n", 1)[1].split("@router.", 1)[0]
    assert "SessionQueryService(db).list_legacy" in region


def test_speaker_detail_uses_tenant_scoped_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/speakers/routers/speakers.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_speaker(\n", 1)[1].split("@router.", 1)[0]
    assert "SpeakerQueryService(db).get_for_event" in region
    assert "await db.execute" not in region


def test_speaker_profile_read_uses_query_service_after_access_check():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/speakers/routers/speaker_profiles.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_speaker_profile(\n", 1)[1].split("@router.", 1)[0]
    assert "SpeakerQueryService(db).get_profile_for_event" in region
    assert "await db.execute" not in region


def test_speaker_portal_config_uses_explicit_event_projection():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/speakers/routers/portal.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_speaker_portal_config", 1)[1].split("@router.", 1)[0]
    assert "SpeakerQueryService(db).get_portal_config_event" in region
    assert "await db.get(Event" not in region


def test_deployment_read_routes_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/deployment_management/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("checklists", "list_checklists"),
        ("list_risks", "list_risks"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"DeploymentQueryService(db).{method_name}" in region
        assert "await db.execute" not in region


def test_console_summary_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/console_summary/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_console_summary", 1)[1]
    assert "ConsoleSummaryQueryService(db)" in region
    assert "await db.execute" not in region


def test_crm_catalog_read_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/crm/routers/crm_router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_pipeline_stages", 1)[1].split("@router.", 1)[0]
    assert "CrmCatalogQueryService(db).list_pipeline_stages" in region
    assert "await db.execute" not in region


def test_operations_event_scope_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/operations_planning/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def _event_for_user", 1)[1].split("@router.", 1)[0]
    assert "ProjectQueryService(db).get_event_for_scope" in region
    assert "await db.execute" not in region


def test_search_job_read_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/search/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_search_jobs", 1)[1].split("@router.", 1)[0]
    assert "SearchJobQueryService(db).list_page" in region
    assert "await db.execute" not in region


def test_abstract_read_routes_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/abstracts/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name in ("abstract_dashboard", "get_setup", "get_form"):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert "AbstractQueryService(db)" in region
        assert "await db.execute" not in region


def test_abstract_submission_reads_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/abstracts/router.py"
    ).read_text(encoding="utf-8-sig")
    list_region = router.split("async def list_submissions", 1)[1].split("@router.", 1)[0]
    get_region = router.split("async def _get_submission", 1)[1].split("@router.", 1)[0]
    assert "AbstractQueryService(db).list_submissions" in list_region
    assert "await db.execute" not in list_region
    assert "AbstractQueryService(db).get_submission" in get_region


def test_abstract_reviewer_assignment_reads_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/abstracts/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("list_reviewers", "list_reviewers"),
        ("list_assignments", "list_assignments"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"AbstractQueryService(db).{method_name}" in region
        assert "await db.execute" not in region
    update_region = router.split("async def update_reviewer", 1)[1].split("@router.", 1)[0]
    assert "AbstractQueryService(db).reviewer_stats" in update_region
    assert "await db.scalar" not in update_region


def test_abstract_publication_and_export_reads_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/abstracts/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("publish_all_accepted", "list_accepted_submissions"),
        ("accepted_directory", "list_accepted_submissions"),
        ("export_manifest", "list_submissions_for_export"),
        ("export_submissions_csv", "list_submissions_for_export"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"AbstractQueryService(db).{method_name}" in region
        assert "await db.execute" not in region


def test_platform_commercial_catalog_reads_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("list_subscription_plans", "list_subscription_plans"),
        ("get_features_matrix", "features_matrix"),
    ):
        region = router.split(f"async def {route_name}", 1)[1]
        if route_name == "get_features_matrix":
            region = region.split("async def calculate_addon_final_price", 1)[0]
        else:
            region = region.split("@router.", 1)[0]
        assert f"PlatformCommercialCatalogQueryService(db).{method_name}" in region
        assert "await db.execute" not in region


def test_platform_slow_query_read_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform_health/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def superadmin_slow_queries", 1)[1]
    assert "PlatformHealthQueryService(db).slow_queries" in region


def test_platform_database_stats_read_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform_health/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def superadmin_database_stats", 1)[1].split(
        "@router.", 1
    )[0]
    assert "PlatformHealthQueryService(db).database_stats" in region


def test_organization_lists_expose_bounded_cursor_routes():
    for module, route_name, response_name in (
        ("teams", "cursor_teams", "CursorPage[TeamResponse]"),
        ("departments", "cursor_departments", "CursorPage[DepartmentResponse]"),
        ("roles", "cursor_roles", "CursorPage[RoleResponse]"),
    ):
        router = (
            Path(__file__).resolve().parents[1]
            / f"app/modules/platform/{module}/router.py"
        ).read_text(encoding="utf-8-sig")
        assert f'@router.get("/cursor", response_model={response_name})' in router
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert "cursor=" in region
        assert "limit: int = Query(20, ge=1, le=100)" in region
        assert ".repository.cursor_page" in region


def test_organization_create_routes_use_durable_idempotency_when_requested():
    for module, route_name, operation in (
        ("teams", "create_team", "platform.team.create"),
        ("departments", "create_department", "platform.department.create"),
        ("roles", "create_role", "platform.role.create"),
    ):
        router = (
            Path(__file__).resolve().parents[1]
            / f"app/modules/platform/{module}/router.py"
        ).read_text(encoding="utf-8-sig")
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert "Idempotency-Key" in region
        assert "begin_idempotent" in region
        assert "replay_response" in region
        assert "complete_idempotent" in region
        assert operation in region


def test_platform_communications_read_routes_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/communications_router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name in ("list_global_announcements", "get_global_announcement", "list_maintenance_windows"):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert "PlatformCommunicationsQueryService(db)" in region
        assert "await db.execute" not in region


def test_commercial_staff_read_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/commercial/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def superadmin_get_staff", 1)[1].split("@router.", 1)[0]
    assert "CommercialCatalogQueryService(db).list_staff" in region
    assert "await db.execute" not in region


def test_operations_control_request_reads_use_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/operations_control/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (("service_request_projection", "list_requests"), ("operations_risks", "list_risks")):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"OperationsControlQueryService(db).{method_name}" in region
        assert "await db.execute" not in region


def test_operations_control_storage_read_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/operations_control/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def storage_telemetry", 1)[1].split("@router.", 1)[0]
    assert "OperationsControlQueryService(db).storage_totals" in region
    assert "await db.execute" not in region


def test_operations_control_source_access_read_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/operations_control/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_source_access", 1)[1].split("@router.", 1)[0]
    assert "OperationsControlQueryService(db).list_source_access" in region
    assert "await db.execute" not in region


def test_operations_control_venue_readiness_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/operations_control/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def venue_readiness", 1)[1].split("@router.", 1)[0]
    assert "OperationsControlQueryService(db).venue_readiness_rows" in region
    assert "await db.execute" not in region


def test_operations_control_overview_uses_explicit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/operations_control/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def operations_overview", 1)[1].split("@router.", 1)[0]
    assert "OperationsControlQueryService(db).overview_rows" in region
    assert "await db.execute" not in region
    assert "await db.scalar" not in region


def test_platform_permission_reads_and_mutations_use_separate_application_services():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/permissions/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, service_name in (
        ("list_permissions", "PermissionQueryService"),
        ("get_role_permissions", "PermissionQueryService"),
        ("toggle_role_permission", "PermissionCommandService"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert service_name in region
    assert "get_permission_query_service" in router
    assert "get_permission_command_service" in router

    query_service = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/permissions/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    assert "select(\n                    PlatformPermission.id" in query_service
    assert "await self.db.commit()" not in query_service


def test_audit_reads_use_bounded_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/audit/routers/audit.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("list_worker_logs", "list_worker_logs"),
        ("list_system_changes", "list_system_changes"),
        ("get_my_activity", "list_user_activity"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"AuditQueryService(db).{method_name}" in region
        assert "await db.execute" not in region
        assert "await db.scalar" not in region


def test_analytics_dashboard_summary_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_dashboard_summary", 1)[1].split("@router.", 1)[0]
    assert "AnalyticsDashboardQueryService(db).summary" in region


def test_analytics_event_scope_is_resolved_before_loading_the_event():
    root = Path(__file__).resolve().parents[1]
    router = (root / "app/modules/analytics/routers/dashboard.py").read_text(encoding="utf-8-sig")
    queries = (root / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8-sig")
    resolver = router.split("async def _get_accessible_event", 1)[1].split("@router.", 1)[0]
    assert "AnalyticsDashboardQueryService(db).get_event_for_scope" in resolver
    assert "await db.get(Event, event_id)" not in resolver
    assert "Event.organization_id == organization_id" in queries
    assert "Event.deleted_at.is_(None)" in queries
    assert "await db.execute" not in resolver


def test_analytics_registration_timeline_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_registrations_timeline", 1)[1].split("@router.", 1)[0]
    assert "AnalyticsDashboardQueryService(db).registrations_timeline" in region
    assert "await db.execute" not in region


def test_analytics_roles_breakdown_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_roles_breakdown", 1)[1].split("@router.", 1)[0]
    assert "AnalyticsDashboardQueryService(db).roles_breakdown" in region
    assert "await db.execute" not in region


def test_analytics_pending_actions_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_pending_actions", 1)[1].split("@router.", 1)[0]
    assert "AnalyticsDashboardQueryService(db).pending_actions" in region
    assert "await db.execute" not in region


def test_analytics_recent_activity_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_recent_activity", 1)[1].split("@router.", 1)[0]
    assert "AnalyticsDashboardQueryService(db).recent_activity" in region
    assert "await db.execute" not in region


def test_analytics_deadlines_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_upcoming_deadlines", 1)[1].split(
        "async def get_superadmin_overview", 1
    )[0]
    assert "AnalyticsDashboardQueryService(db).upcoming_deadlines" in region
    assert "await db.execute" not in region
    assert "datetime.combine" not in region


def test_analytics_superadmin_overview_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_superadmin_overview", 1)[1].split(
        "async def get_superadmin_mrr_history", 1
    )[0]
    assert "AnalyticsDashboardQueryService(db).superadmin_overview" in region
    assert "await db.execute" not in region
    assert "await db.scalar" not in region


def test_analytics_superadmin_activity_feed_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_superadmin_activity_feed", 1)[1]
    assert "AnalyticsDashboardQueryService(db).superadmin_activity_feed" in region
    assert "app.modules.platform_activity" not in region
    assert "await db.execute" not in region


def test_platform_payment_events_use_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_payment_events", 1)[1].split(
        "async def ", 1
    )[0]
    assert "OrganizationConsoleQueryService(db).payment_events" in region
    assert "await db.execute" not in region


def test_commercial_quote_list_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/commercial/quotes_router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_quotes", 1)[1].split(
        "async def create_quote", 1
    )[0]
    assert "QuoteQueryService(db).list_page" in region
    assert "await db.scalars" not in region


def test_commercial_catalog_reads_use_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/commercial/router.py"
    ).read_text(encoding="utf-8-sig")
    for route_name, method_name in (
        ("search_services", "search_services"),
        ("get_packages", "list_packages"),
    ):
        region = router.split(f"async def {route_name}", 1)[1].split(
            "async def ", 1
        )[0]
        assert f"ServiceCatalogQueryService(db).{method_name}" in region


def test_analytics_superadmin_mrr_history_uses_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/analytics/routers/dashboard.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_superadmin_mrr_history", 1)[1].split("@router.", 1)[0]
    assert "AnalyticsDashboardQueryService(db).superadmin_mrr_history" in region
    assert "await db.execute" not in region
