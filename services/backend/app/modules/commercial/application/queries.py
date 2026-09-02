"""Read-only commercial query services."""

from __future__ import annotations

from typing import Any

from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.commercial.models import (
    CommercialQuote,
    Service,
    ServicePackage,
    StaffRole,
)


class CommercialCatalogQueryService:
    """Own bounded staff-catalog reads and response projection logic."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_staff(
        self,
        *,
        search: str | None,
        status: str | None,
        skip: int,
        limit: int,
    ) -> dict[str, Any]:
        statement = select(StaffRole)
        if search:
            needle = f"%{search}%"
            statement = statement.where(or_(
                StaffRole.role_name.ilike(needle),
                StaffRole.role_code.ilike(needle),
                StaffRole.description.ilike(needle),
            ))
        if status:
            statement = statement.where(StaffRole.status == status)

        total = int((await self.db.scalar(
            select(func.count()).select_from(statement.subquery())
        )) or 0)
        rows = list((await self.db.scalars(
            statement.order_by(StaffRole.role_name, StaffRole.id)
            .offset(skip)
            .limit(limit)
        )).all())
        summary_row = (await self.db.execute(select(
            func.count(StaffRole.id).label("total_roles"),
            func.sum(case((StaffRole.status == "ACTIVE", 1), else_=0)).label("active_roles"),
            func.avg(StaffRole.cost_per_day).label("avg_cost_day"),
            func.avg(StaffRole.selling_per_day).label("avg_selling_day"),
        ))).one()
        items = []
        for row in rows:
            margin_pct = ((row.selling_per_day - row.cost_per_day) / row.selling_per_day) * 100 if row.selling_per_day > 0 else 0.0
            items.append({
                "id": str(row.id), "role_code": row.role_code, "name": row.role_name,
                "description": row.description or "", "cost_per_day": float(row.cost_per_day),
                "selling_per_day": float(row.selling_per_day), "margin_pct": round(margin_pct, 2),
                "region": "Global", "is_active": row.status == "ACTIVE", "grade": row.grade,
                "team_category": row.team_category, "department": row.team_category,
                "available_count": row.available_count, "status": row.status,
            })
        return {
            "items": items,
            "total": total,
            "summary": {
                "total_roles": summary_row.total_roles or 0,
                "active_roles": summary_row.active_roles or 0,
                "avg_cost_per_day": float(summary_row.avg_cost_day or 0),
                "avg_selling_per_day": float(summary_row.avg_selling_day or 0),
                "total_staff_deployed": 0,
            },
        }


class QuoteQueryService:
    """Read bounded tenant-scoped quotes without owning a transaction."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_page(
        self,
        *,
        organization_id,
        event_id=None,
        request_id=None,
        quote_status=None,
        limit: int = 100,
    ) -> list[CommercialQuote]:
        bounded_limit = max(1, min(limit, 250))
        statement = (
            select(CommercialQuote)
            .options(selectinload(CommercialQuote.line_items))
            .where(CommercialQuote.organization_id == organization_id)
        )
        if event_id:
            statement = statement.where(CommercialQuote.event_id == event_id)
        if request_id:
            statement = statement.where(CommercialQuote.service_request_id == request_id)
        if quote_status:
            statement = statement.where(CommercialQuote.status == quote_status.upper())
        return list((await self.db.scalars(
            statement.order_by(
                CommercialQuote.created_at.desc(), CommercialQuote.id.desc()
            ).limit(bounded_limit)
        )).unique().all())


class ServiceCatalogQueryService:
    """Read-only, bounded service-catalog queries for the commercial module."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def search_services(
        self,
        *,
        organization_id,
        category_id=None,
        query: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Service]:
        bounded_limit = max(1, min(int(limit), 100))
        bounded_offset = max(0, min(int(offset), 100_000))
        filters = [or_(
            Service.organization_id == organization_id,
            Service.organization_id.is_(None),
        )]
        if category_id:
            filters.append(Service.category_id == category_id)
        if query:
            needle = f"%{query}%"
            filters.append(or_(
                Service.service_name.ilike(needle),
                Service.service_code.ilike(needle),
                Service.description.ilike(needle),
            ))
        return list((await self.db.scalars(
            select(Service).where(and_(*filters)).order_by(
                desc(Service.created_at), Service.id.desc()
            ).offset(bounded_offset).limit(bounded_limit)
        )).all())

    async def list_packages(
        self, *, organization_id, limit: int = 50, offset: int = 0
    ) -> list[ServicePackage]:
        bounded_limit = max(1, min(int(limit), 100))
        bounded_offset = max(0, min(int(offset), 100_000))
        return list((await self.db.scalars(
            select(ServicePackage).where(or_(
                ServicePackage.organization_id == organization_id,
                ServicePackage.organization_id.is_(None),
            )).order_by(
                desc(ServicePackage.created_at), ServicePackage.id.desc()
            ).offset(bounded_offset).limit(bounded_limit)
        )).all())
