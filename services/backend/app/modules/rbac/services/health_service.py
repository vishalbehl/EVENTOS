import uuid
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.platform.models.health import OrganizationHealth
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.billing.models.subscription import OrganizationSubscription, SupportTicket

class OrganizationHealthService:
    @staticmethod
    async def calculate_health(db: AsyncSession, organization_id: uuid.UUID) -> int:
        """
        Calculate health score (0-100) based on multiple factors.
        """
        score = 100
        warnings = []
        
        # 1. Billing Status (Critical impact)
        sub_stmt = select(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization_id)
        sub = (await db.execute(sub_stmt)).scalar_one_or_none()
        
        if sub:
            if sub.status in ["SUSPENDED", "EXPIRED", "CANCELLED"]:
                score -= 80
                warnings.append("BILLING_SUSPENDED")
            elif sub.status in ["PENDING_PAYMENT", "GRACE_PERIOD"]:
                score -= 40
                warnings.append("BILLING_FAILED_PAYMENT")
                
        # 2. Storage Limits (Warning impact)
        usage = await db.get(OrganizationUsage, organization_id)
        if usage and sub and sub.plan:
            # Plan relationships aren't loaded here by default, so we'd fetch plan.
            from app.modules.billing.models.subscription import SubscriptionPlan
            plan = await db.get(SubscriptionPlan, sub.plan_id)
            if plan:
                storage_limit_bytes = plan.storage_quota_mb * 1024 * 1024
                if usage.storage_used_bytes > storage_limit_bytes * 0.9: # 90% full
                    score -= 15
                    warnings.append("STORAGE_CRITICAL")
                elif usage.storage_used_bytes > storage_limit_bytes * 0.75: # 75% full
                    score -= 5
                    warnings.append("STORAGE_WARNING")

        # 3. Support Tickets (Warning impact)
        # Many open high-priority tickets indicates poor health/experience
        ticket_stmt = select(func.count(SupportTicket.id)).where(
            SupportTicket.organization_id == organization_id,
            SupportTicket.status == "OPEN",
            SupportTicket.priority.in_(["HIGH", "CRITICAL"])
        )
        high_tickets = await db.scalar(ticket_stmt) or 0
        
        if high_tickets > 0:
            score -= (high_tickets * 5)
            warnings.append(f"UNRESOLVED_CRITICAL_TICKETS: {high_tickets}")

        # 4. Activity (Optional degradation if totally inactive)
        if usage and usage.active_events_count == 0 and usage.active_users_count <= 1:
            score -= 10
            warnings.append("LOW_ACTIVITY")

        # Normalize score
        score = max(0, min(100, score))
        
        status = "HEALTHY"
        if score < 50:
            status = "CRITICAL"
        elif score < 80:
            status = "WARNING"
            
        # Update database
        health_record = await db.get(OrganizationHealth, organization_id)
        if health_record:
            health_record.health_score = score
            health_record.status = status
            health_record.warnings = warnings
            health_record.last_calculated_at = datetime.now(timezone.utc)
        else:
            health_record = OrganizationHealth(
                organization_id=organization_id,
                health_score=score,
                status=status,
                warnings=warnings
            )
            db.add(health_record)
            
        await db.commit()
        return score
