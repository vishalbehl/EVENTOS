from pathlib import Path

import uuid

import pytest
from sqlalchemy import delete, update

from app.modules.operations_planning.models import Project
from tests.conftest import _TestSessionLocal


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "app/modules/operations_planning/models.py"
COMMANDS = ROOT / "app/modules/operations_planning/application/commands.py"
ROUTER = ROOT / "app/modules/operations_planning/router.py"
MIGRATION = ROOT / "alembic/versions/20260901_5000_operations_planning_versions.py"


def test_planning_resources_have_versions_and_if_match_support():
    model = MODEL.read_text(encoding="utf-8")
    commands = COMMANDS.read_text(encoding="utf-8")
    router = ROUTER.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")
    assert model.count("version: Mapped[int]") >= 2
    assert "raise_version_conflict(project.version)" in commands
    assert "raise_version_conflict(task.version)" in commands
    assert 'alias="If-Match"' in router
    assert 'revision = "20260901_5000"' in migration


@pytest.mark.asyncio
async def test_two_sessions_cannot_overwrite_the_same_project_version():
    """The database predicate, not application timing, wins the stale race."""
    project_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    async with _TestSessionLocal() as seed:
        seed.add(
            Project(
                id=project_id,
                organization_id=organization_id,
                project_code=f"CONC-{project_id.hex[:8]}",
                name="Concurrent version test",
                status="PLANNING",
                version=1,
            )
        )
        await seed.commit()

    try:
        async with _TestSessionLocal() as first, _TestSessionLocal() as second:
            first_row = await first.get(Project, project_id)
            second_row = await second.get(Project, project_id)
            assert first_row.version == second_row.version == 1

            first_result = await first.execute(
                update(Project)
                .where(Project.id == project_id, Project.version == 1)
                .values(status="IN_PROGRESS", version=2)
            )
            await first.commit()

            stale_result = await second.execute(
                update(Project)
                .where(Project.id == project_id, Project.version == 1)
                .values(status="CANCELLED", version=2)
            )
            await second.commit()

            assert first_result.rowcount == 1
            assert stale_result.rowcount == 0

        async with _TestSessionLocal() as verify:
            final_row = await verify.get(Project, project_id)
            assert final_row.status == "IN_PROGRESS"
            assert final_row.version == 2
    finally:
        async with _TestSessionLocal() as cleanup:
            await cleanup.execute(delete(Project).where(Project.id == project_id))
            await cleanup.commit()
