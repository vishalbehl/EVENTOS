import uuid

import pytest


@pytest.mark.asyncio
async def test_task_failure_query_service_uses_bounded_explicit_projection():
    from app.modules.operations_control.application.queries import TaskFailureQueryService

    organization_id = uuid.uuid4()
    captured = {}

    class Rows:
        def mappings(self):
            return self

        def all(self):
            return []

    class SessionDouble:
        async def execute(self, statement):
            captured["statement"] = statement
            compiled = statement.compile()
            sql = str(compiled)
            assert "operations.task_failures" in sql
            assert organization_id in compiled.params.values()
            assert "LIMIT" in sql.upper()
            return Rows()

    result = await TaskFailureQueryService(SessionDouble()).list_page(
        organization_id=organization_id,
        limit=1000,
    )
    assert result == []


@pytest.mark.asyncio
async def test_task_failure_cursor_query_is_scoped_and_has_extra_row_bound():
    from datetime import datetime, timezone
    from app.modules.operations_control.application.queries import TaskFailureQueryService

    organization_id = uuid.uuid4()
    cursor_id = uuid.uuid4()
    captured = {}

    class Rows:
        def mappings(self):
            return self

        def all(self):
            return []

    class SessionDouble:
        async def execute(self, statement):
            captured["statement"] = statement
            compiled = statement.compile()
            sql = str(compiled).upper()
            assert "OPERATIONS.TASK_FAILURES" in sql
            assert organization_id in compiled.params.values()
            assert cursor_id in compiled.params.values()
            assert "LIMIT" in sql
            return Rows()

    result, has_next = await TaskFailureQueryService(SessionDouble()).list_cursor(
        organization_id=organization_id,
        cursor_time=datetime.now(timezone.utc),
        cursor_id=cursor_id,
        limit=1000,
    )
    assert result == []
    assert has_next is False


@pytest.mark.asyncio
async def test_project_query_service_is_tenant_scoped_and_bounded():
    from types import SimpleNamespace

    from app.modules.operations_planning.application.queries import ProjectQueryService

    organization_id = uuid.uuid4()
    project_id = uuid.uuid4()
    calls = []

    class Rows:
        def __init__(self, rows):
            self.rows = rows

        def all(self):
            return self.rows

    class SessionDouble:
        async def scalar(self, statement):
            compiled = statement.compile()
            assert organization_id in compiled.params.values()
            assert project_id in compiled.params.values()
            calls.append("project")
            return SimpleNamespace(id=project_id)

        async def scalars(self, statement):
            sql = str(statement.compile()).upper()
            assert "LIMIT" in sql
            calls.append("child")
            return Rows([])

    result = await ProjectQueryService(SessionDouble()).get_project(
        project_id=project_id,
        organization_id=organization_id,
    )
    assert result is not None
    assert calls == ["project", "child", "child"]
