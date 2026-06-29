import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_, or_, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.models import (
    HardwareCategory, HardwareItem, HardwareStock, HardwareMovement, HardwareMaintenance
)

class InventoryService:
    """
    Service handling hardware inventory items, stock counts, lifecycle movement logs, and maintenance.
    """

    @staticmethod
    async def create_category(
        db: AsyncSession,
        name: str,
        description: Optional[str] = None
    ) -> HardwareCategory:
        """Create a hardware category."""
        category = HardwareCategory(
            id=uuid.uuid4(),
            name=name,
            description=description
        )
        db.add(category)
        await db.flush()
        return category

    @staticmethod
    async def create_hardware_item(
        db: AsyncSession,
        category_id: uuid.UUID,
        asset_code: str,
        name: str,
        brand: str,
        model: str,
        renting_price: float = 0.0,
        purchase_cost: float = 0.0,
        status: str = "AVAILABLE",
        pricing_unit: str = "PER_EVENT",
        description: Optional[str] = None,
        tax_category: str = "GST_18",
        **kwargs
    ) -> HardwareItem:
        """Record a new individual hardware asset in catalog, and initialize stock."""
        if "replacement_cost" in kwargs and renting_price == 0.0:
            renting_price = kwargs["replacement_cost"]

        item = HardwareItem(
            id=uuid.uuid4(),
            category_id=category_id,
            asset_code=asset_code,
            name=name,
            brand=brand,
            model=model,
            purchase_cost=purchase_cost,
            renting_price=renting_price,
            status=status,
            pricing_unit=pricing_unit,
            description=description,
            tax_category=tax_category
        )
        if "location" in kwargs:
            item.location = kwargs["location"]
        if "condition" in kwargs:
            item.condition = kwargs["condition"]
        db.add(item)
        await db.flush()

        # Initialize stock counters
        stock = HardwareStock(
            id=uuid.uuid4(),
            hardware_id=item.id,
            quantity=1,
            reserved_quantity=0,
            available_quantity=1
        )
        db.add(stock)
        await db.flush()

        return item

    @staticmethod
    async def list_hardware_items(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[HardwareItem]:
        """Fetch all hardware items."""
        stmt = select(HardwareItem)
        filters = []
        if status:
            filters.append(HardwareItem.status == status.upper())
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(HardwareItem.asset_code).limit(limit).offset(offset)
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def allocate_hardware(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        hardware_id: uuid.UUID,
        to_location: str,
        notes: Optional[str] = None
    ) -> Optional[HardwareItem]:
        """Allocate equipment to a destination (event, office, etc.) and transition status."""
        stmt = select(HardwareItem).where(HardwareItem.id == hardware_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item or item.status != "AVAILABLE":
            return None

        # Update status
        item.status = "ALLOCATED"
        item.location = to_location

        # Update stock count
        stock_stmt = select(HardwareStock).where(HardwareStock.hardware_id == hardware_id)
        stock = (await db.execute(stock_stmt)).scalar_one_or_none()
        if stock:
            stock.reserved_quantity = max(0, stock.reserved_quantity - 1)
            stock.available_quantity = 0

        # Log allocation movement
        movement = HardwareMovement(
            id=uuid.uuid4(),
            organization_id=organization_id,
            hardware_id=hardware_id,
            type="Assignment",
            quantity=1,
            from_location=item.location or "Base inventory",
            to_location=to_location,
            notes=notes or f"Allocated to {to_location}",
            created_at=datetime.now(timezone.utc)
        )
        db.add(movement)
        await db.flush()

        return item

    @staticmethod
    async def return_hardware(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        hardware_id: uuid.UUID,
        return_location: str,
        condition: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Optional[HardwareItem]:
        """Return allocated/maintenance equipment back to base inventory."""
        stmt = select(HardwareItem).where(HardwareItem.id == hardware_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            return None

        old_location = item.location
        item.status = "AVAILABLE"
        item.location = return_location
        if condition:
            item.condition = condition

        # Update stock counts
        stock_stmt = select(HardwareStock).where(HardwareStock.hardware_id == hardware_id)
        stock = (await db.execute(stock_stmt)).scalar_one_or_none()
        if stock:
            stock.available_quantity = 1

        # Log movement
        movement = HardwareMovement(
            id=uuid.uuid4(),
            organization_id=organization_id,
            hardware_id=hardware_id,
            type="Return",
            quantity=1,
            from_location=old_location or return_location,
            to_location="Base inventory",
            notes=notes or "Returned to base inventory",
            created_at=datetime.now(timezone.utc)
        )
        db.add(movement)
        await db.flush()

        return item

    @staticmethod
    async def reserve_hardware(
        db: AsyncSession,
        hardware_id: uuid.UUID
    ) -> bool:
        """Reserve a piece of available hardware for upcoming deploy requests."""
        stock_stmt = select(HardwareStock).where(HardwareStock.hardware_id == hardware_id)
        stock = (await db.execute(stock_stmt)).scalar_one_or_none()
        if not stock or stock.available_quantity < 1:
            return False

        stock.reserved_quantity += 1
        stock.available_quantity = max(0, stock.available_quantity - 1)
        await db.flush()
        return True

    @staticmethod
    async def transfer_hardware(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID],
        hardware_id: uuid.UUID,
        from_location: str,
        to_location: str,
        notes: Optional[str] = None
    ) -> Optional[HardwareItem]:
        """Transfer equipment between depots."""
        stmt = select(HardwareItem).where(HardwareItem.id == hardware_id)
        item = (await db.execute(stmt)).scalar_one_or_none()
        if not item:
            return None

        item.location = to_location

        movement = HardwareMovement(
            id=uuid.uuid4(),
            organization_id=organization_id,
            hardware_id=hardware_id,
            type="Transfer",
            quantity=1,
            from_location=from_location,
            to_location=to_location,
            notes=notes or "Transferred between locations",
            created_at=datetime.now(timezone.utc)
        )
        db.add(movement)
        await db.flush()
        return item
