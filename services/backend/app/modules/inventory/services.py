from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import HardwareCategory, HardwareItem, HardwareStock


class InventoryService:
    @staticmethod
    async def create_category(db: AsyncSession, name: str, description: str | None = None):
        category = HardwareCategory(name=name, description=description)
        db.add(category)
        await db.flush()
        return category

    @staticmethod
    async def create_hardware_item(db: AsyncSession, **values):
        item = HardwareItem(**values)
        db.add(item)
        await db.flush()
        db.add(HardwareStock(hardware_id=item.id, quantity=1, available_quantity=1))
        await db.flush()
        return item

    @staticmethod
    async def _get(db: AsyncSession, hardware_id, organization_id=None):
        stmt = select(HardwareItem).where(HardwareItem.id == hardware_id)
        if organization_id is not None:
            stmt = stmt.where(HardwareItem.organization_id == organization_id)
        return await db.scalar(stmt)

    @staticmethod
    async def reserve_hardware(db: AsyncSession, hardware_id) -> bool:
        item = await InventoryService._get(db, hardware_id)
        if item is None or item.status != "AVAILABLE":
            return False
        item.status = "RESERVED"
        await db.flush()
        return True

    @staticmethod
    async def allocate_hardware(db: AsyncSession, organization_id, hardware_id, to_location: str, notes: str | None = None):
        item = await InventoryService._get(db, hardware_id, organization_id)
        if item is None:
            return None
        item.status, item.location, item.notes = "ALLOCATED", to_location, notes
        await db.flush()
        return item

    @staticmethod
    async def return_hardware(db: AsyncSession, organization_id, hardware_id, return_location: str, condition: str, notes: str | None = None):
        item = await InventoryService._get(db, hardware_id, organization_id)
        if item is None:
            return None
        item.status, item.location, item.condition, item.notes = "AVAILABLE", return_location, condition, notes
        await db.flush()
        return item
