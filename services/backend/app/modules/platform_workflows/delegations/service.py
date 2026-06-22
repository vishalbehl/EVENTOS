import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform_workflows.delegations.models import ApprovalDelegation

class DelegationService:
    @staticmethod
    async def create_delegation(
        db: AsyncSession,
        from_user_id: uuid.UUID,
        to_user_id: uuid.UUID,
        start_date: datetime,
        end_date: datetime
    ) -> ApprovalDelegation:
        delegation = ApprovalDelegation(
            id=uuid.uuid4(),
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            start_date=start_date,
            end_date=end_date,
            is_active=True
        )
        db.add(delegation)
        await db.flush()
        return delegation

    @staticmethod
    async def get_active_delegate(db: AsyncSession, user_id: uuid.UUID) -> Optional[uuid.UUID]:
        now = datetime.now(timezone.utc)
        stmt = select(ApprovalDelegation).where(
            and_(
                ApprovalDelegation.from_user_id == user_id,
                ApprovalDelegation.is_active == True,
                ApprovalDelegation.start_date <= now,
                ApprovalDelegation.end_date >= now
            )
        )
        result = await db.execute(stmt)
        delegation = result.scalar_one_or_none()
        return delegation.to_user_id if delegation else None
