import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_, or_, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.commercial.models import (
    ServiceCategory, Service, ServiceFeature, ServicePackage,
    PackageService, StaffRole, StaffRate, StaffSkill
)

class ServiceCatalogService:
    """
    Service handling technology services, categories, feature structures, and service packages.
    """

    @staticmethod
    async def create_category(
        db: AsyncSession,
        name: str,
        description: Optional[str] = None
    ) -> ServiceCategory:
        """Create a service category."""
        category = ServiceCategory(
            id=uuid.uuid4(),
            name=name,
            description=description,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(category)
        await db.flush()
        return category

    @staticmethod
    async def create_service(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        category_id: uuid.UUID,
        service_code: str,
        service_name: str,
        description: Optional[str] = None,
        unit_type: str = "flat",
        is_internal: bool = False,
        features: Optional[List[str]] = None
    ) -> Service:
        """Create a new technology service catalog item with optional features."""
        service = Service(
            id=uuid.uuid4(),
            organization_id=organization_id,
            category_id=category_id,
            service_code=service_code,
            service_name=service_name,
            description=description,
            unit_type=unit_type,
            is_active=True,
            is_internal=is_internal,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(service)
        await db.flush()

        if features:
            for feat_name in features:
                feat = ServiceFeature(
                    id=uuid.uuid4(),
                    service_id=service.id,
                    name=feat_name,
                    description=f"Feature {feat_name} for service {service_name}"
                )
                db.add(feat)
            await db.flush()

        return service

    @staticmethod
    async def clone_service(
        db: AsyncSession,
        service_id: uuid.UUID
    ) -> Optional[Service]:
        """Clone an existing service catalog item."""
        stmt = select(Service).where(Service.id == service_id)
        original = (await db.execute(stmt)).scalar_one_or_none()
        if not original:
            return None

        # Fetch original features
        feat_stmt = select(ServiceFeature).where(ServiceFeature.service_id == service_id)
        original_features = (await db.execute(feat_stmt)).scalars().all()

        cloned_code = f"{original.service_code}_CLONE_{uuid.uuid4().hex[:6].upper()}"
        cloned_service = Service(
            id=uuid.uuid4(),
            organization_id=original.organization_id,
            category_id=original.category_id,
            service_code=cloned_code,
            service_name=f"{original.service_name} (Clone)",
            description=original.description,
            unit_type=original.unit_type,
            is_active=original.is_active,
            is_internal=original.is_internal,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(cloned_service)
        await db.flush()

        for feat in original_features:
            cloned_feat = ServiceFeature(
                id=uuid.uuid4(),
                service_id=cloned_service.id,
                name=feat.name,
                description=feat.description
            )
            db.add(cloned_feat)
        await db.flush()

        return cloned_service

    @staticmethod
    async def archive_service(
        db: AsyncSession,
        service_id: uuid.UUID
    ) -> bool:
        """Mark a service as archived (inactive)."""
        stmt = update(Service).where(Service.id == service_id).values(
            is_active=False,
            updated_at=datetime.now(timezone.utc)
        )
        res = await db.execute(stmt)
        return res.rowcount > 0

    @staticmethod
    async def search_service(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID] = None,
        category_id: Optional[uuid.UUID] = None,
        query: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Service]:
        """Search technology services by name, code, or description."""
        stmt = select(Service)
        filters = []
        
        if organization_id:
            filters.append(or_(Service.organization_id == organization_id, Service.organization_id.is_(None)))
        if category_id:
            filters.append(Service.category_id == category_id)
        if query:
            filters.append(or_(
                Service.service_name.ilike(f"%{query}%"),
                Service.service_code.ilike(f"%{query}%"),
                Service.description.ilike(f"%{query}%")
            ))

        if filters:
            stmt = stmt.where(and_(*filters))

        stmt = stmt.order_by(desc(Service.created_at)).limit(limit).offset(offset)
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def create_package(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        package_name: str,
        package_code: str,
        description: Optional[str] = None,
        price: Optional[float] = None,
        services: Optional[List[Dict[str, Any]]] = None
    ) -> ServicePackage:
        """Create a service package grouping multiple services."""
        package = ServicePackage(
            id=uuid.uuid4(),
            organization_id=organization_id,
            package_name=package_name,
            package_code=package_code,
            description=description,
            price=price,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(package)
        await db.flush()

        if services:
            for s in services:
                pkg_svc = PackageService(
                    package_id=package.id,
                    service_id=uuid.UUID(str(s["service_id"])),
                    quantity=s.get("quantity", 1)
                )
                db.add(pkg_svc)
            await db.flush()

        return package

    @staticmethod
    async def get_packages(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[ServicePackage]:
        """Fetch all packages."""
        stmt = select(ServicePackage)
        if organization_id:
            stmt = stmt.where(or_(ServicePackage.organization_id == organization_id, ServicePackage.organization_id.is_(None)))
        stmt = stmt.order_by(desc(ServicePackage.created_at)).limit(limit).offset(offset)
        res = await db.execute(stmt)
        return list(res.scalars().all())
