from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/deployment_management/router.py"
SERVICE = ROOT / "app/modules/deployment_management/application/commands.py"


def test_deployment_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "DeploymentCommandService(db).create_deployment" in source
    assert "DeploymentCommandService(db).update_checklist" in source
    assert "DeploymentCommandService(db).complete" in source
    assert "DeploymentCommandService(db).create_risk" in source
    assert "DeploymentCommandService(db).update_risk" in source

    mutation_region = source.split("@router.post(\"\")", 1)[1]
    assert "await db.commit()" not in mutation_region


def test_deployment_commands_own_transactions_and_verify_project_tenant():
    source = SERVICE.read_text(encoding="utf-8")
    assert "Project.organization_id == organization_id" in source
    assert source.count("await self.db.commit()") == 5
    assert "HTTPException" in source
