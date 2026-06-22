import uuid
from datetime import date, datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_, or_, desc, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.resource_management.models import (
    ResourcePlan, ResourceAllocation, StaffAssignment, EquipmentAssignment, TravelPlan
)
from app.modules.inventory.models import HardwareItem, HardwareStock
from app.modules.commercial.models import StaffRole

class ResourcePlanningService:
    @staticmethod
    async def create_resource_plan(
        db: AsyncSession,
        project_id: uuid.UUID,
        name: str,
        description: Optional[str] = None
    ) -> ResourcePlan:
        plan = ResourcePlan(
            id=uuid.uuid4(),
            project_id=project_id,
            name=name,
            description=description
        )
        db.add(plan)
        await db.flush()
        return plan

    @staticmethod
    async def allocate_staff(
        db: AsyncSession,
        project_id: uuid.UUID,
        employee_id: uuid.UUID,
        role_id: uuid.UUID,
        allocation_percentage: float,
        start_date: date,
        end_date: date
    ) -> StaffAssignment:
        assignment = StaffAssignment(
            id=uuid.uuid4(),
            project_id=project_id,
            employee_id=employee_id,
            role_id=role_id,
            allocation_percentage=allocation_percentage,
            start_date=start_date,
            end_date=end_date
        )
        db.add(assignment)
        await db.flush()

        # Add generic allocation
        allocation = ResourceAllocation(
            id=uuid.uuid4(),
            project_id=project_id,
            resource_type="STAFF",
            resource_id=employee_id,
            quantity=1,
            start_date=start_date,
            end_date=end_date,
            status="ALLOCATED"
        )
        db.add(allocation)
        await db.flush()

        # Trigger conflict detection
        await ResourcePlanningService.detect_resource_conflicts(db, project_id)

        return assignment

    @staticmethod
    async def allocate_equipment(
        db: AsyncSession,
        project_id: uuid.UUID,
        hardware_id: uuid.UUID,
        quantity: int,
        start_date: date,
        end_date: date
    ) -> EquipmentAssignment:
        assignment = EquipmentAssignment(
            id=uuid.uuid4(),
            project_id=project_id,
            hardware_id=hardware_id,
            quantity=quantity,
            start_date=start_date,
            end_date=end_date
        )
        db.add(assignment)
        await db.flush()

        # Add generic allocation
        allocation = ResourceAllocation(
            id=uuid.uuid4(),
            project_id=project_id,
            resource_type="EQUIPMENT",
            resource_id=hardware_id,
            quantity=quantity,
            start_date=start_date,
            end_date=end_date,
            status="ALLOCATED"
        )
        db.add(allocation)
        await db.flush()

        # Update inventory stock levels if stock table exists
        stock_stmt = select(HardwareStock).where(HardwareStock.hardware_id == hardware_id)
        res = await db.execute(stock_stmt)
        stock = res.scalar_one_or_none()
        if stock:
            stock.reserved_quantity += quantity
            stock.available_quantity = max(0, stock.quantity - stock.reserved_quantity)
            await db.flush()

        # Trigger conflict detection
        await ResourcePlanningService.detect_resource_conflicts(db, project_id)

        return assignment

    @staticmethod
    async def detect_resource_conflicts(db: AsyncSession, project_id: uuid.UUID) -> List[Dict[str, Any]]:
        conflicts = []
        
        # 1. Staff Conflicts: overlapping dates sum > 100%
        # Fetch all assignments
        stmt = select(StaffAssignment)
        res = await db.execute(stmt)
        all_assignments = res.scalars().all()
        
        # Simple overlap check: group by employee and check overlap
        for a1 in all_assignments:
            overlap_sum = a1.allocation_percentage
            for a2 in all_assignments:
                if a1.id != a2.id and a1.employee_id == a2.employee_id:
                    # Check overlap
                    if not (a1.end_date < a2.start_date or a1.start_date > a2.end_date):
                        overlap_sum += a2.allocation_percentage
            
            if overlap_sum > 100.0:
                # Conflict detected! Update allocation status
                alloc_stmt = select(ResourceAllocation).where(
                    and_(
                        ResourceAllocation.resource_type == "STAFF",
                        ResourceAllocation.resource_id == a1.employee_id,
                        ResourceAllocation.project_id == a1.project_id
                    )
                )
                alloc_res = await db.execute(alloc_stmt)
                allocation = alloc_res.scalar_one_or_none()
                if allocation:
                    allocation.status = "CONFLICT"
                    await db.flush()
                
                conflicts.append({
                    "type": "STAFF",
                    "resource_id": a1.employee_id,
                    "project_id": a1.project_id,
                    "details": f"Staff allocation exceeds 100% (Sum: {overlap_sum}%)"
                })

        # 2. Equipment Conflicts: overlapping sum exceeds available stock
        stmt = select(EquipmentAssignment)
        res = await db.execute(stmt)
        all_equip = res.scalars().all()
        
        for e1 in all_equip:
            overlap_qty = e1.quantity
            for e2 in all_equip:
                if e1.id != e2.id and e1.hardware_id == e2.hardware_id:
                    if not (e1.end_date < e2.start_date or e1.start_date > e2.end_date):
                        overlap_qty += e2.quantity
            
            # Fetch total stock
            stock_stmt = select(HardwareStock).where(HardwareStock.hardware_id == e1.hardware_id)
            stock_res = await db.execute(stock_stmt)
            stock = stock_res.scalar_one_or_none()
            total_stock = stock.quantity if stock else 5 # default mock stock to prevent false alarms
            
            if overlap_qty > total_stock:
                alloc_stmt = select(ResourceAllocation).where(
                    and_(
                        ResourceAllocation.resource_type == "EQUIPMENT",
                        ResourceAllocation.resource_id == e1.hardware_id,
                        ResourceAllocation.project_id == e1.project_id
                    )
                )
                alloc_res = await db.execute(alloc_stmt)
                allocation = alloc_res.scalar_one_or_none()
                if allocation:
                    allocation.status = "CONFLICT"
                    await db.flush()
                
                conflicts.append({
                    "type": "EQUIPMENT",
                    "resource_id": e1.hardware_id,
                    "project_id": e1.project_id,
                    "details": f"Allocated quantity ({overlap_qty}) exceeds stock ({total_stock})"
                })
                
        return conflicts

    @staticmethod
    async def create_travel_plan(
        db: AsyncSession,
        project_id: uuid.UUID,
        employee_id: uuid.UUID,
        city: str,
        hotel: Optional[str],
        arrival_date: date,
        departure_date: date
    ) -> TravelPlan:
        travel = TravelPlan(
            id=uuid.uuid4(),
            project_id=project_id,
            employee_id=employee_id,
            city=city,
            hotel=hotel,
            arrival_date=arrival_date,
            departure_date=departure_date,
            status="PLANNED"
        )
        db.add(travel)
        await db.flush()
        return travel
