from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/organization_console_router.py"
SERVICE = ROOT / "app/modules/platform/application/governance_commands.py"


def test_privacy_request_creation_delegates_transaction():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def create_privacy_request", 1)[1].split("@router.", 1)[0]
    assert "OrganizationGovernanceCommandService(db).create_privacy_request" in region
    assert "await db.commit()" not in region


def test_privacy_request_command_is_tenant_safe_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "subject_reference_hash" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_privacy_request_update_delegates_state_transition():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    region = router.split("async def update_privacy_request", 1)[1].split("@router.", 1)[0]
    assert "OrganizationGovernanceCommandService(db).update_privacy_request" in region
    assert "await db.commit()" not in region
    assert "OrganizationLegalHold" in service and "async def update_privacy_request" in service


def test_retention_policy_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    region = router.split("async def upsert_retention_policy", 1)[1].split("@router.", 1)[0]
    assert "OrganizationGovernanceCommandService(db).upsert_retention_policy" in region
    assert "await db.commit()" not in region
    assert "OrganizationRetentionPolicy" in service
    assert "await self.db.rollback()" in service


def test_legal_hold_mutations_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    for function_name, method_name in (("create_legal_hold", "create_legal_hold"), ("release_legal_hold", "release_legal_hold")):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationGovernanceCommandService(db).{method_name}" in region
        assert "await db.commit()" not in region
    assert "async def create_legal_hold" in service
    assert "async def release_legal_hold" in service


def test_compliance_mutations_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    for function_name, method_name in (("create_compliance_control", "create_compliance_control"), ("update_compliance_control", "update_compliance_control"), ("create_compliance_evidence", "create_compliance_evidence")):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationGovernanceCommandService(db).{method_name}" in region
        assert "await db.commit()" not in region
    assert "OrganizationComplianceControl" in service
    assert "OrganizationComplianceEvidence" in service


def test_platform_branding_mutations_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def update_branding", 1)[1].split("@router.", 1)[0]
    assert "PlatformBrandingCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_impersonation_handoff_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def create_impersonation_handoff", 1)[1].split("@router.", 1)[0]
    assert "ImpersonationCommandService(db).create_handoff" in region
    assert "await db.commit()" not in region


def test_rollout_update_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def update_organizer_rollout", 1)[1].split("@router.", 1)[0]
    assert "OrganizationRolloutCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_lifecycle_mutations_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    for function_name, method_name in (("create_lifecycle_job", "create"), ("decide_lifecycle_job", "decide"), ("retry_lifecycle_job", "retry")):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationLifecycleCommandService(db).{method_name}" in region
        assert "await db.commit()" not in region


def test_api_key_mutations_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    for function_name, method_name in (("create_organization_api_key", "create"), ("revoke_organization_api_key", "revoke")):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationApiKeyCommandService(db).{method_name}" in region
        assert "await db.commit()" not in region


def test_notification_rule_mutations_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    for function_name, method_name in (("create_notification_rule", "create"), ("update_notification_rule", "update"), ("archive_notification_rule", "archive")):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationNotificationRuleCommandService(db).{method_name}" in region
        assert "await db.commit()" not in region


def test_notification_channel_create_and_archive_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    for function_name, method_name in (("create_notification_channel", "create"), ("archive_notification_channel", "archive")):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationNotificationChannelCommandService(db).{method_name}" in region
        assert "await db.commit()" not in region


def test_notification_channel_update_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def update_notification_channel", 1)[1].split("@router.", 1)[0]
    assert "OrganizationNotificationChannelCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_notification_channel_verification_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def verify_notification_channel", 1)[1].split("@router.", 1)[0]
    assert "OrganizationNotificationChannelCommandService(db).verify" in region
    assert "await db.commit()" not in region


def test_privileged_access_mutations_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    for function_name, method_name in (("create_privileged_access_session", "create"), ("revoke_privileged_access_session", "revoke")):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert f"PrivilegedAccessCommandService(db).{method_name}" in region
        assert "await db.commit()" not in region


def test_usage_reconciliation_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def reconcile_usage", 1)[1].split("@router.", 1)[0]
    assert "OrganizationUsageCommandService(db).reconcile" in region
    assert "await db.commit()" not in region


def test_financial_adjustment_creation_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def create_financial_adjustment", 1)[1].split("@router.", 1)[0]
    assert "FinancialAdjustmentCommandService(db).create" in region
    assert "await db.commit()" not in region


def test_financial_adjustment_decision_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def decide_financial_adjustment", 1)[1].split("@router.", 1)[0]
    assert "FinancialAdjustmentCommandService(db).decide" in region
    assert "await db.commit()" not in region


def test_integration_connection_creation_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def create_integration_connection", 1)[1].split("@router.", 1)[0]
    assert "IntegrationConnectionCommandService(db).create" in region
    assert "await db.commit()" not in region


def test_integration_connection_update_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def update_integration_connection", 1)[1].split("@router.", 1)[0]
    assert "IntegrationConnectionCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_console_export_creation_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def create_console_export", 1)[1].split("@router.", 1)[0]
    assert "OrganizationExportCommandService(db).create" in region
    assert "await db.commit()" not in region


def test_commercial_access_decision_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def decide_commercial_access_request", 1)[1].split("@router.", 1)[0]
    assert "CommercialAccessCommandService(db).decide" in region
    assert "await db.commit()" not in region


def test_event_operational_controls_delegate_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def update_event_operational_controls", 1)[1].split("@router.", 1)[0]
    assert "EventOperationalControlCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_event_settings_delegate_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def update_event_settings", 1)[1].split("@router.", 1)[0]
    assert "EventSettingsCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_registration_correction_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def correct_event_registration", 1)[1].split("@router.", 1)[0]
    assert "RegistrationCorrectionCommandService(db).correct" in region
    assert "await db.commit()" not in region


def test_event_contract_creation_delegates_transaction():
    router = ROUTER.read_text(encoding="utf-8")
    region = router.split("async def create_event_contract", 1)[1].split("@router.", 1)[0]
    assert "EventContractCommandService(db).apply" in region
    assert "await db.commit()" not in region


def test_event_workspace_mutations_delegate_transaction_boundary():
    router = ROUTER.read_text(encoding="utf-8")
    for function_name in (
        "create_event_workspace_resource",
        "update_event_workspace_resource",
        "archive_event_workspace_resource",
        "restore_event_workspace_resource",
        "execute_event_workspace_action",
    ):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert "await db.commit()" not in region
        assert "EventWorkspaceCommandService(db)" in region


def test_platform_governance_mutations_delegate_transaction_boundary():
    router = ROUTER.read_text(encoding="utf-8")
    for function_name in (
        "provision_organization_event",
        "request_override",
        "decide_override",
        "request_override_revocation",
        "decide_override_revocation",
        "request_capability_restriction",
        "decide_capability_restriction",
        "request_capability_restriction_revocation",
        "decide_capability_restriction_revocation",
        "create_usage_adjustment",
    ):
        region = router.split(f"async def {function_name}", 1)[1].split("@router.", 1)[0]
        assert "await db.commit()" not in region
        assert "GovernedMutationCommandService(db)" in region
    region = router.split("async def publish_branding", 1)[1].split("@router.", 1)[0]
    assert "PlatformBrandingCommandService(db).publish" in region
    assert "await db.commit()" not in region
