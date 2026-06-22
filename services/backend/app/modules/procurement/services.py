import uuid
from typing import Optional, List
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.procurement.models import Vendor, VendorService as DBVendorService

class VendorService:
    """
    Service handling vendor directory, contacts, rating profiles, and commercial service connections.
    """

    @staticmethod
    async def create_vendor(
        db: AsyncSession,
        name: str,
        type: str,
        country: str,
        city: str,
        email: str,
        contact_person: Optional[str] = None,
        phone: Optional[str] = None,
        gst_number: Optional[str] = None,
        rating: float = 5.0,
        status: str = "ACTIVE"
    ) -> Vendor:
        """Record a new vendor profile."""
        vendor = Vendor(
            id=uuid.uuid4(),
            name=name,
            type=type,
            country=country,
            city=city,
            email=email,
            contact_person=contact_person,
            phone=phone,
            gst_number=gst_number,
            rating=rating,
            status=status
        )
        db.add(vendor)
        await db.flush()
        return vendor

    @staticmethod
    async def assign_vendor(
        db: AsyncSession,
        vendor_id: uuid.UUID,
        service_id: uuid.UUID,
        cost: float
    ) -> DBVendorService:
        """Link a vendor to a specific service catalog item with associated procurement cost."""
        vs = DBVendorService(
            id=uuid.uuid4(),
            vendor_id=vendor_id,
            service_id=service_id,
            cost=cost
        )
        db.add(vs)
        await db.flush()
        return vs

    @staticmethod
    async def compare_vendors(
        db: AsyncSession,
        service_id: uuid.UUID
    ) -> List[dict]:
        """Rank vendors offering a specific service by cost (ascending) and rating (descending)."""
        stmt = (
            select(DBVendorService, Vendor)
            .join(Vendor, DBVendorService.vendor_id == Vendor.id)
            .where(and_(
                DBVendorService.service_id == service_id,
                Vendor.status == "ACTIVE"
            ))
            .order_by(DBVendorService.cost.asc(), desc(Vendor.rating))
        )
        res = await db.execute(stmt)
        results = []
        for vs, v in res.all():
            results.append({
                "vendor_id": v.id,
                "vendor_name": v.name,
                "type": v.type,
                "rating": v.rating,
                "cost": float(vs.cost),
                "email": v.email,
                "contact_person": v.contact_person
            })
        return results

    @staticmethod
    async def get_vendors(
        db: AsyncSession,
        type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Vendor]:
        """Fetch vendors list with optional filtering."""
        stmt = select(Vendor)
        filters = []
        if type:
            filters.append(Vendor.type == type)
        if status:
            filters.append(Vendor.status == status)
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(Vendor.name).limit(limit).offset(offset)
        res = await db.execute(stmt)
        return list(res.scalars().all())
