from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Vendor, VendorService as VendorServiceModel
from app.modules.commercial.models import Service


class VendorService:
    @staticmethod
    async def create_vendor(db: AsyncSession, **values):
        vendor = Vendor(**values)
        db.add(vendor)
        await db.flush()
        return vendor

    @staticmethod
    async def assign_vendor(db: AsyncSession, vendor_id, service_id, cost):
        row = VendorServiceModel(vendor_id=vendor_id, service_id=service_id, cost=cost)
        db.add(row)
        await db.flush()
        return row

    @staticmethod
    async def compare_vendors(db: AsyncSession, service_id):
        rows = await db.execute(
            select(Vendor.name, VendorServiceModel.cost)
            .join(VendorServiceModel, VendorServiceModel.vendor_id == Vendor.id)
            .where(VendorServiceModel.service_id == service_id)
            .order_by(VendorServiceModel.cost.asc())
        )
        return [{"vendor_name": name, "cost": float(cost)} for name, cost in rows.all()]
