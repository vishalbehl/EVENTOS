from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_operations_query_service_uses_tenant_aware_repositories():
    queries = (ROOT / "app/modules/operations_planning/application/queries.py").read_text(encoding="utf-8")
    repositories = (ROOT / "app/modules/operations_planning/infrastructure/repositories.py").read_text(encoding="utf-8")

    assert "ProjectRepository" in queries
    assert "ProjectTaskRepository" in queries
    assert "MilestoneRepository" in queries
    assert "organization_id" in repositories
    assert "Project.organization_id == organization_id" in repositories
    assert "Project.organization_id == organization_id" in repositories


def test_operations_repository_reads_are_bounded_and_do_not_commit():
    repositories = (ROOT / "app/modules/operations_planning/infrastructure/repositories.py").read_text(encoding="utf-8")

    assert ".limit(bounded_limit)" in repositories
    assert ".order_by(ProjectTask.id)" in repositories
    assert ".order_by(Milestone.id)" in repositories
    assert ".commit(" not in repositories


def test_operations_commands_use_repository_transaction_boundary():
    commands = (ROOT / "app/modules/operations_planning/application/commands.py").read_text(encoding="utf-8")

    assert "ProjectRepository" in commands
    assert "ProjectTaskRepository" in commands
    assert "MilestoneRepository" in commands
    assert "ProjectRepository(self.db).create" in commands
    assert "ProjectTaskRepository(self.db).create" in commands


def test_operations_commands_resolve_events_through_event_repository():
    commands = (ROOT / "app/modules/operations_planning/application/commands.py").read_text(encoding="utf-8")
    assert "EventRepository(self.db).get_for_organization" in commands
