from __future__ import annotations

import inspect
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import DateTime, String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.infrastructure.repositories import OrganizationRepository, Repository
from app.infrastructure.contracts import OrganizationRepositoryContract
from app.modules.platform.departments.repository import DepartmentRepository
from app.modules.platform.roles.repository import RoleRepository
from app.modules.platform.teams.repository import TeamRepository


class Base(DeclarativeBase):
    pass


class TenantRecord(Base):
    __tablename__ = "tenant_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)


class ScalarResult:
    def __init__(self, rows=None, value=None):
        self.rows = rows or []
        self.value = value

    def all(self):
        return self.rows


class CaptureDb:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.statement = None

    async def scalars(self, statement):
        self.statement = statement
        return ScalarResult(self.rows)

    async def scalar(self, statement):
        self.statement = statement
        return None

    def add_all(self, entities):
        self.entities = entities


def test_repository_exposes_the_standard_persistence_contract():
    required = {
        "get_by_id",
        "get_for_event",
        "list_page",
        "count_for_event",
        "exists_for_event",
        "create",
        "update",
        "delete",
        "bulk_insert",
        "cursor_page",
    }
    assert required.issubset(set(dir(Repository)))
    assert inspect.iscoroutinefunction(Repository.delete)


def test_tenant_scope_adds_organization_predicate():
    statement = select(TenantRecord)
    scoped = Repository(CaptureDb(), TenantRecord)._apply_tenant_scope(
        statement, organization_id=uuid.uuid4()
    )
    sql = str(scoped.compile(compile_kwargs={"literal_binds": False}))
    assert "tenant_records.organization_id" in sql


def test_list_page_is_bounded_and_rejects_oversized_requests():
    db = CaptureDb()
    repository = Repository(db, TenantRecord)

    import asyncio

    asyncio.run(repository.list_page(select(TenantRecord), limit=100))
    assert db.statement._limit_clause.value == 100
    with pytest.raises(Exception, match="between 1 and 100"):
        asyncio.run(repository.list_page(select(TenantRecord), limit=101))


def test_generic_list_page_has_deterministic_default_ordering():
    db = CaptureDb()
    repository = Repository(db, TenantRecord)
    import asyncio

    asyncio.run(repository.list_page(select(TenantRecord), limit=20))
    statement = str(db.statement.compile(compile_kwargs={"literal_binds": False}))
    assert "tenant_records.created_at DESC" in statement
    assert "tenant_records.id DESC" in statement


def test_organization_list_page_has_deterministic_default_ordering():
    db = CaptureDb()
    repository = OrganizationRepository(db, TenantRecord)
    import asyncio

    asyncio.run(repository.list_page(uuid.uuid4(), limit=20))
    ordering = str(
        db.statement.compile(compile_kwargs={"literal_binds": False})
    )
    assert "tenant_records.created_at DESC" in ordering
    assert "tenant_records.id DESC" in ordering


def test_bulk_insert_is_bounded_before_staging_records():
    db = CaptureDb()
    repository = Repository(db, TenantRecord)
    with pytest.raises(ValueError, match="limited to 1000"):
        repository.bulk_insert([object()] * 1001)
    assert not hasattr(db, "entities")


def test_cursor_page_requires_stable_timestamp_and_id_key():
    repository = Repository(CaptureDb(), TenantRecord)
    import asyncio

    with pytest.raises(ValueError, match="timestamp and unique-id"):
        asyncio.run(repository.cursor_page(select(TenantRecord)))


def test_cursor_page_fetches_one_extra_row_and_emits_a_continuation_token():
    record_id = uuid.uuid4()
    rows = [
        TenantRecord(
            id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            name="first",
        ),
        TenantRecord(
            id=record_id,
            organization_id=uuid.uuid4(),
            created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            name="second",
        ),
    ]
    db = CaptureDb(rows)
    repository = Repository(db, TenantRecord)
    import asyncio

    page = asyncio.run(
        repository.cursor_page(
            select(TenantRecord),
            limit=1,
            cursor_column=("created_at", "id"),
        )
    )
    assert len(page.items) == 1
    assert page.has_more is True
    assert page.next_cursor
    assert db.statement._limit_clause.value == 2


def test_organization_repositories_expose_the_shared_contract():
    required = {
        "get_by_id",
        "list_page",
        "count_for_organization",
        "exists_for_organization",
        "update",
        "delete",
    }
    assert required.issubset(set(dir(TeamRepository)))
    assert required.issubset(set(dir(DepartmentRepository)))
    assert required.issubset(set(dir(RoleRepository)))
    assert OrganizationRepositoryContract
    assert inspect.iscoroutinefunction(TeamRepository.delete)
    assert inspect.iscoroutinefunction(DepartmentRepository.delete)
    assert inspect.iscoroutinefunction(RoleRepository.delete)


def test_organization_repositories_expose_stable_cursor_paging():
    assert all(
        hasattr(repository, "cursor_page")
        for repository in (TeamRepository, DepartmentRepository, RoleRepository)
    )


def test_generic_organization_repository_exposes_stable_cursor_paging():
    assert hasattr(OrganizationRepository, "cursor_page")
    method = inspect.getsource(OrganizationRepository.cursor_page)
    assert "created_at" in method
    assert "organization_id" in method
    assert "commit(" not in method


def test_generic_organization_repository_cursor_page_is_tenant_scoped_and_bounded():
    organization_id = uuid.uuid4()
    rows = [
        TenantRecord(
            id=uuid.uuid4(),
            organization_id=organization_id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            name="first",
        ),
        TenantRecord(
            id=uuid.uuid4(),
            organization_id=organization_id,
            created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            name="second",
        ),
    ]
    db = CaptureDb(rows)
    repository = OrganizationRepository(db, TenantRecord)
    import asyncio

    page = asyncio.run(repository.cursor_page(organization_id, limit=1))
    assert len(page.items) == 1
    assert page.has_more is True
    assert page.next_cursor
    assert db.statement._limit_clause.value == 2
    assert "tenant_records.organization_id" in str(
        db.statement.compile(compile_kwargs={"literal_binds": False})
    )


def test_organization_repository_rejects_unknown_update_fields():
    repository = OrganizationRepository(CaptureDb(), TenantRecord)
    record = TenantRecord(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        name="record",
    )
    with pytest.raises(ValueError, match="Unsupported repository update field"):
        repository.update(record, {"not_a_column": "unexpected"})


def test_organization_repository_updates_only_mapped_columns():
    repository = OrganizationRepository(CaptureDb(), TenantRecord)
    record = TenantRecord(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        name="record",
    )
    repository.update(record, {"name": "updated"})
    assert record.name == "updated"
    with pytest.raises(ValueError, match="Unsupported repository update field"):
        repository.update(record, {"__repr__": "unexpected"})
