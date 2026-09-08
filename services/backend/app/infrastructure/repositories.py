from __future__ import annotations

from typing import Generic, TypeVar

from sqlalchemy import Select, and_, desc, func, inspect as sa_inspect, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.events.models.event import Event
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor

ModelT = TypeVar("ModelT")


class Repository(Generic[ModelT]):
    """Small persistence boundary: callers own transaction and authorization."""

    def __init__(self, db: AsyncSession, model: type[ModelT]):
        self.db = db
        self.model = model

    def _apply_tenant_scope(self, stmt, *, organization_id):
        """Apply a verified tenant boundary, or fail closed when it is unknown."""
        if organization_id is None:
            return stmt
        if hasattr(self.model, "organization_id"):
            return stmt.where(self.model.organization_id == organization_id)
        if hasattr(self.model, "event_id"):
            return stmt.join(Event, self.model.event_id == Event.id).where(
                Event.organization_id == organization_id
            )
        raise ValueError(
            f"Cannot apply organization scope to {self.model.__name__}; "
            "provide a tenant-aware repository query."
        )

    async def get_by_id(self, record_id, *, organization_id=None) -> ModelT | None:
        stmt = Select(self.model).where(self.model.id == record_id)
        stmt = self._apply_tenant_scope(stmt, organization_id=organization_id)
        return await self.db.scalar(stmt)

    async def get_for_event(self, record_id, event_id, *, organization_id=None) -> ModelT | None:
        """Fetch one event-owned record with an explicit tenant boundary."""
        stmt = select(self.model).where(
            self.model.id == record_id,
            self.model.event_id == event_id,
        )
        stmt = self._apply_tenant_scope(stmt, organization_id=organization_id)
        return await self.db.scalar(stmt)

    async def list_for_event(
        self,
        event_id,
        stmt=None,
        *,
        organization_id=None,
        limit: int = 100,
    ) -> list[ModelT]:
        """Return a bounded event collection with an optional tenant boundary."""
        query = stmt if stmt is not None else select(self.model)
        query = query.where(self.model.event_id == event_id)
        query = self._apply_tenant_scope(query, organization_id=organization_id)
        return await self.list_page(query, limit=limit)

    async def count(self, stmt) -> int:
        """Count an already-scoped query without materializing rows."""
        query = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        return int(await self.db.scalar(query) or 0)

    def create(self, entity: ModelT) -> ModelT:
        return self.add(entity)

    def update(self, entity: ModelT, values: dict) -> ModelT:
        mapped_fields = {attribute.key for attribute in sa_inspect(entity).mapper.column_attrs}
        for name, value in values.items():
            if name.startswith("_") or name not in mapped_fields:
                raise ValueError(f"Unsupported repository update field: {name}")
            setattr(entity, name, value)
        return entity

    async def delete(self, entity: ModelT) -> None:
        await self.db.delete(entity)

    async def list_page(self, stmt, *, limit: int = 100) -> list[ModelT]:
        if not stmt._order_by_clauses:
            created_at = getattr(self.model, "created_at", None)
            record_id = getattr(self.model, "id", None)
            if created_at is not None and record_id is not None:
                stmt = stmt.order_by(desc(created_at), desc(record_id))
        result = await self.db.scalars(stmt.limit(bounded_page_size(limit, default=100, maximum=100)))
        return list(result.all())

    async def exists(self, stmt) -> bool:
        return (await self.db.scalar(stmt.limit(1))) is not None

    async def count_for_event(self, event_id, *, organization_id=None) -> int:
        """Count an event-scoped model without materializing rows."""
        stmt = select(func.count()).select_from(self.model).where(self.model.event_id == event_id)
        stmt = self._apply_tenant_scope(stmt, organization_id=organization_id)
        return int(await self.db.scalar(stmt) or 0)

    async def exists_for_event(self, event_id, *, organization_id=None) -> bool:
        """Perform a bounded event-scoped existence check."""
        stmt = select(self.model.id).where(self.model.event_id == event_id).limit(1)
        stmt = self._apply_tenant_scope(stmt, organization_id=organization_id)
        return (await self.db.scalar(stmt)) is not None

    def bulk_insert(self, entities: list[ModelT]) -> list[ModelT]:
        """Stage bounded bulk inserts; the application service owns commit."""
        if len(entities) > 1000:
            raise ValueError("bulk insert is limited to 1000 records per transaction")
        self.db.add_all(entities)
        return entities

    async def cursor_page(
        self,
        stmt,
        *,
        limit: int = 20,
        cursor: str | None = None,
        cursor_column=None,
        descending: bool = False,
    ) -> CursorPage[ModelT]:
        """Fetch a stable page using a unique ``(timestamp, id)`` continuation key."""
        bounded_limit = bounded_page_size(limit, default=20, maximum=100)
        if not isinstance(cursor_column, (tuple, list)) or len(cursor_column) != 2:
            raise ValueError("cursor_column must contain timestamp and unique-id field names")
        occurred_attr = getattr(self.model, cursor_column[0], None)
        id_attr = getattr(self.model, cursor_column[1], None)
        if occurred_attr is None or id_attr is None:
            raise ValueError("cursor columns must exist on the repository model")
        if cursor:
            token = decode_cursor(cursor)
            stmt = stmt.where(
                or_(
                    occurred_attr < token.occurred_at if descending else occurred_attr > token.occurred_at,
                    and_(
                        occurred_attr == token.occurred_at,
                        id_attr < token.record_id if descending else id_attr > token.record_id,
                    ),
                )
            )
        # The continuation predicate and ordering must use the same
        # unique key, otherwise rows can be skipped or repeated.
        stmt = stmt.order_by(None).order_by(
            occurred_attr.desc() if descending else occurred_attr.asc(),
            id_attr.desc() if descending else id_attr.asc(),
        )
        page_rows = list((await self.db.scalars(stmt.limit(bounded_limit + 1))).all())
        has_next = len(page_rows) > bounded_limit
        items = page_rows[:bounded_limit]
        next_cursor = None
        if has_next and items:
            last = items[-1]
            next_cursor = encode_cursor(getattr(last, cursor_column[0]), getattr(last, cursor_column[1]))
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)

    def add(self, entity: ModelT) -> ModelT:
        self.db.add(entity)
        return entity


class OrganizationRepository(Generic[ModelT]):
    """Organization-scoped persistence boundary; callers own transactions."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession, model: type[ModelT]):
        self.db = db
        self.model = model

    def _scope(self, stmt, organization_id):
        if organization_id is None or not hasattr(self.model, "organization_id"):
            raise ValueError(
                f"{self.model.__name__} must expose organization_id for organization scope"
            )
        return stmt.where(self.model.organization_id == organization_id)

    async def get_by_id(self, organization_id, record_id) -> ModelT | None:
        return await self.db.scalar(
            self._scope(select(self.model).where(self.model.id == record_id), organization_id)
        )

    async def list_page(
        self, organization_id, *, offset: int = 0, limit: int = 100, **filters
    ) -> list[ModelT]:
        if offset < 0:
            raise ValueError("offset must be non-negative")
        bounded_limit = bounded_page_size(limit, default=100, maximum=self.MAX_PAGE_SIZE)
        stmt = self._scope(select(self.model), organization_id)
        for field, value in filters.items():
            column = getattr(self.model, field, None)
            if column is None:
                raise ValueError(f"Unsupported repository filter: {field}")
            stmt = stmt.where(column == value)
        created_at = getattr(self.model, "created_at", None)
        record_id = getattr(self.model, "id", None)
        if created_at is not None and record_id is not None:
            stmt = stmt.order_by(desc(created_at), desc(record_id))
        result = await self.db.scalars(stmt.offset(offset).limit(bounded_limit))
        return list(result.all())

    async def cursor_page(
        self,
        organization_id,
        *,
        cursor: str | None = None,
        limit: int = 20,
        **filters,
    ) -> CursorPage[ModelT]:
        """Fetch a stable organization-scoped page without offset drift."""
        bounded_limit = bounded_page_size(limit, default=20, maximum=self.MAX_PAGE_SIZE)
        occurred_attr = getattr(self.model, "created_at", None)
        id_attr = getattr(self.model, "id", None)
        if occurred_attr is None or id_attr is None:
            raise ValueError("cursor pagination requires created_at and id fields")

        stmt = self._scope(select(self.model), organization_id)
        for field, value in filters.items():
            column = getattr(self.model, field, None)
            if column is None:
                raise ValueError(f"Unsupported repository filter: {field}")
            stmt = stmt.where(column == value)
        if cursor:
            position = decode_cursor(cursor)
            stmt = stmt.where(
                or_(
                    occurred_attr < position.occurred_at,
                    and_(
                        occurred_attr == position.occurred_at,
                        id_attr < position.record_id,
                    ),
                )
            )
        stmt = stmt.order_by(occurred_attr.desc(), id_attr.desc())
        rows = list((await self.db.scalars(stmt.limit(bounded_limit + 1))).all())
        items = rows[:bounded_limit]
        has_next = len(rows) > bounded_limit
        next_cursor = (
            encode_cursor(getattr(items[-1], "created_at"), getattr(items[-1], "id"))
            if has_next and items
            else None
        )
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)

    async def count_for_organization(self, organization_id) -> int:
        stmt = self._scope(
            select(func.count()).select_from(self.model), organization_id
        )
        return int(await self.db.scalar(stmt) or 0)

    async def exists_for_organization(self, organization_id, record_id) -> bool:
        stmt = self._scope(
            select(self.model.id).where(self.model.id == record_id), organization_id
        ).limit(1)
        return (await self.db.scalar(stmt)) is not None

    def create(self, entity: ModelT) -> ModelT:
        self.db.add(entity)
        return entity

    def update(self, entity: ModelT, values: dict) -> ModelT:
        mapped_fields = {attribute.key for attribute in sa_inspect(entity).mapper.column_attrs}
        for name, value in values.items():
            if name.startswith("_") or name not in mapped_fields:
                raise ValueError(f"Unsupported repository update field: {name}")
            setattr(entity, name, value)
        return entity

    async def delete(self, entity: ModelT) -> None:
        await self.db.delete(entity)

    def bulk_insert(self, entities: list[ModelT]) -> list[ModelT]:
        if len(entities) > 1000:
            raise ValueError("bulk insert is limited to 1000 records per transaction")
        self.db.add_all(entities)
        return entities
