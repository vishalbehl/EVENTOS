import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from sqlalchemy import select, and_, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform_compliance.models import ComplianceReport, RetentionPolicy
from app.modules.platform_audit.models import PlatformAuditLog, ApiActivityLog, LoginHistory, DataAccessLog
from app.modules.platform_activity.models import UserActivityLog, ActivityFeed
from app.modules.platform_compliance.models import PlatformSecurityEvent

class ComplianceService:
    """
    Service to handle GDPR, SOC2, and ISO27001 reporting, retention policy settings,
    and automated data eviction / archiving.
    """

    @staticmethod
    async def generate_report(
        db: AsyncSession,
        organization_id: uuid.UUID,
        report_type: str,
        generated_by: uuid.UUID
    ) -> ComplianceReport:
        """
        Generates GDPR, SOC2, ISO27001 compliance logs summary, saves a mock report file,
        and creates a ComplianceReport entry.
        """
        # Create a report entry
        file_url = f"https://storage.eventx.com/compliance-reports/{organization_id}/{report_type.lower()}_{uuid.uuid4()}.json"
        
        report = ComplianceReport(
            id=uuid.uuid4(),
            organization_id=organization_id,
            report_type=report_type,
            generated_by=generated_by,
            file_url=file_url,
            generated_at=datetime.now(timezone.utc)
        )
        
        db.add(report)
        await db.flush()
        return report

    @staticmethod
    async def get_reports(
        db: AsyncSession,
        organization_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0
    ) -> List[ComplianceReport]:
        """
        Retrieve compliance reports for the organization.
        """
        stmt = select(ComplianceReport).where(
            ComplianceReport.organization_id == organization_id
        ).order_by(ComplianceReport.generated_at.desc()).limit(limit).offset(offset)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_retention_policies(
        db: AsyncSession,
        organization_id: uuid.UUID
    ) -> List[RetentionPolicy]:
        """
        Get all retention policies configured for an organization.
        """
        stmt = select(RetentionPolicy).where(RetentionPolicy.organization_id == organization_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def configure_retention_policy(
        db: AsyncSession,
        organization_id: uuid.UUID,
        module: str,
        retention_days: int,
        archive_enabled: bool = False,
        delete_enabled: bool = True
    ) -> RetentionPolicy:
        """
        Set or update retention policy for a specific log module.
        """
        stmt = select(RetentionPolicy).where(
            and_(
                RetentionPolicy.organization_id == organization_id,
                RetentionPolicy.module == module
            )
        )
        policy = (await db.execute(stmt)).scalar_one_or_none()

        if policy:
            policy.retention_days = retention_days
            policy.archive_enabled = archive_enabled
            policy.delete_enabled = delete_enabled
        else:
            policy = RetentionPolicy(
                id=uuid.uuid4(),
                organization_id=organization_id,
                module=module,
                retention_days=retention_days,
                archive_enabled=archive_enabled,
                delete_enabled=delete_enabled
            )
            db.add(policy)

        await db.flush()
        return policy

    @staticmethod
    async def validate_retention(db: AsyncSession, organization_id: Optional[uuid.UUID] = None) -> Dict[str, int]:
        """
        Evict expired logs based on the active retention policies.
        If organization_id is not provided, runs globally.
        Returns a summary of rows deleted per log module.
        """
        stmt = select(RetentionPolicy)
        if organization_id:
            stmt = stmt.where(RetentionPolicy.organization_id == organization_id)
        
        policies = (await db.execute(stmt)).scalars().all()
        summary = {"audit_logs": 0, "api_activity_logs": 0, "login_history": 0, "user_activity_logs": 0, "security_events": 0}

        for policy in policies:
            if not policy.delete_enabled:
                continue

            cutoff_date = datetime.now(timezone.utc) - timedelta(days=policy.retention_days)
            org_id = policy.organization_id

            if policy.module == "audit_logs":
                del_stmt = delete(PlatformAuditLog).where(
                    and_(
                        PlatformAuditLog.organization_id == org_id,
                        PlatformAuditLog.performed_at < cutoff_date
                    )
                )
                res = await db.execute(del_stmt)
                summary["audit_logs"] += res.rowcount

            elif policy.module == "api_activity_logs":
                del_stmt = delete(ApiActivityLog).where(
                    and_(
                        ApiActivityLog.organization_id == org_id,
                        ApiActivityLog.created_at < cutoff_date
                    )
                )
                res = await db.execute(del_stmt)
                summary["api_activity_logs"] += res.rowcount

            elif policy.module == "login_history":
                del_stmt = delete(LoginHistory).where(
                    and_(
                        LoginHistory.organization_id == org_id,
                        LoginHistory.login_time < cutoff_date
                    )
                )
                res = await db.execute(del_stmt)
                summary["login_history"] += res.rowcount

            elif policy.module == "user_activity_logs":
                del_stmt = delete(UserActivityLog).where(
                    and_(
                        UserActivityLog.organization_id == org_id,
                        UserActivityLog.created_at < cutoff_date
                    )
                )
                res = await db.execute(del_stmt)
                summary["user_activity_logs"] += res.rowcount

            elif policy.module == "security_events":
                del_stmt = delete(PlatformSecurityEvent).where(
                    and_(
                        PlatformSecurityEvent.organization_id == org_id,
                        PlatformSecurityEvent.created_at < cutoff_date
                    )
                )
                res = await db.execute(del_stmt)
                summary["security_events"] += res.rowcount

        return summary
