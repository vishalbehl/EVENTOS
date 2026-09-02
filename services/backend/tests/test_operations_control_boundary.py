from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/operations_control/router.py"
COMMANDS = ROOT / "app/modules/operations_control/application/commands.py"


def test_operational_mutations_delegate_to_transaction_service():
    source = ROUTER.read_text(encoding="utf-8")
    for method in (
        "create_source_access",
        "revoke_source_access",
        "transition_service_request",
        "retry_job",
        "cancel_job",
    ):
        function = source.split(f"async def {method}", 1)[1]
        assert "OperationsControlCommandService" in function

    mutation_region = source.split('@router.post("/source-access"', 1)[1]
    assert "await db.commit()" not in mutation_region
    assert "db.add(" not in mutation_region


def test_operational_commands_keep_tenant_predicates_and_audit_resource_types():
    source = COMMANDS.read_text(encoding="utf-8")
    assert "Event.organization_id == organization_id" in source
    assert "SourceApiKey.organization_id == organization_id" in source
    assert "ServiceRequest.organization_id == organization_id" in source
    assert 'resource_type="source_api_key"' in source
    assert 'resource_type="service_request"' in source
