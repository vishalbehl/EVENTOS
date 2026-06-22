import pytest
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from tests.conftest import auth_headers
from app.modules.platform_audit.services import AuditService
from app.modules.platform_activity.services import ActivityService
from app.modules.platform_compliance.services import ComplianceService
from app.modules.platform_compliance.security_services import SecurityEventService
from app.modules.platform_audit.models import (
    PlatformAuditLog, EntityHistory, LoginHistory, ApiActivityLog,
    ExportLog, PlatformImpersonationLog, DataAccessLog
)
from app.modules.platform_activity.models import UserActivityLog, ActivityFeed
from app.modules.platform_compliance.models import PlatformSecurityEvent, ComplianceReport, RetentionPolicy

@pytest.mark.asyncio
async def test_audit_service_crud(db: AsyncSession, organization, organizer):
    org_id = organization.id
    user_id = organizer.id

    # 1. Log Action
    log = await AuditService.log_action(
        db=db,
        organization_id=org_id,
        module="test_module",
        entity_type="test_entity",
        entity_id=uuid.uuid4(),
        action="CREATE",
        performed_by=user_id,
        old_values={"state": "none"},
        new_values={"state": "active"},
        metadata={"reason": "test"}
    )
    await db.flush()
    assert log.id is not None
    assert log.action == "CREATE"

    # Verify EntityHistory snapshot created on CREATE action
    hist_stmt = select(EntityHistory).where(EntityHistory.entity_id == log.entity_id)
    history = (await db.execute(hist_stmt)).scalars().all()
    assert len(history) == 1
    assert history[0].version == 1
    assert history[0].change_type == "CREATE"

    # 2. Log Access
    access = await AuditService.log_access(
        db=db,
        organization_id=org_id,
        user_id=user_id,
        entity_type="test_entity",
        entity_id=log.entity_id,
        access_type="READ"
    )
    await db.flush()
    assert access.id is not None
    assert access.access_type == "READ"

    # 3. Log Export
    export = await AuditService.log_export(
        db=db,
        organization_id=org_id,
        user_id=user_id,
        module="test_module",
        export_type="CSV",
        file_name="test_export.csv"
    )
    await db.flush()
    assert export.id is not None
    assert export.file_name == "test_export.csv"

    # 4. Log Impersonation
    impersonation = await AuditService.log_impersonation(
        db=db,
        organization_id=org_id,
        admin_user_id=user_id,
        target_user_id=uuid.uuid4(),
        reason="Assisting customer"
    )
    await db.flush()
    assert impersonation.id is not None
    assert impersonation.reason == "Assisting customer"


@pytest.mark.asyncio
async def test_activity_service_and_feed(db: AsyncSession, organization, organizer):
    org_id = organization.id
    user_id = organizer.id

    # 1. Log User Activity
    user_log = await ActivityService.log_user_activity(
        db=db,
        organization_id=org_id,
        user_id=user_id,
        activity_type="DASHBOARD_VIEW",
        description="Viewed dashboard"
    )
    await db.flush()
    assert user_log.id is not None
    assert user_log.activity_type == "DASHBOARD_VIEW"

    # 2. Create Activity Feed item
    feed_item = await ActivityService.create_activity(
        db=db,
        organization_id=org_id,
        entity_type="event",
        entity_id=uuid.uuid4(),
        activity_type="EVENT_PUBLISHED",
        title="Event Published",
        description="Event was successfully published",
        user_id=user_id
    )
    await db.flush()
    assert feed_item.id is not None

    # 3. Subscribe & Unsubscribe
    sub = await ActivityService.subscribe(
        db=db,
        user_id=user_id,
        entity_type="event",
        entity_id=feed_item.entity_id
    )
    await db.flush()
    assert sub.id is not None

    # Fetch subscribed feed
    feed = await ActivityService.get_feed(
        db=db,
        organization_id=org_id,
        user_id=user_id,
        subscribed_only=True
    )
    assert len(feed) == 1
    assert feed[0].entity_id == feed_item.entity_id

    # Unsubscribe
    unsubbed = await ActivityService.unsubscribe(
        db=db,
        user_id=user_id,
        entity_type="event",
        entity_id=feed_item.entity_id
    )
    await db.flush()
    assert unsubbed is True


@pytest.mark.asyncio
async def test_compliance_and_retention(db: AsyncSession, organization, organizer):
    org_id = organization.id
    user_id = organizer.id

    # 1. Generate report
    report = await ComplianceService.generate_report(
        db=db,
        organization_id=org_id,
        report_type="SOC2",
        generated_by=user_id
    )
    await db.flush()
    assert report.id is not None
    assert report.report_type == "SOC2"

    # 2. Configure Retention Policy
    policy = await ComplianceService.configure_retention_policy(
        db=db,
        organization_id=org_id,
        module="audit_logs",
        retention_days=30,
        archive_enabled=False,
        delete_enabled=True
    )
    await db.flush()
    assert policy.id is not None
    assert policy.retention_days == 30

    # 3. Validate Retention (eviction summary)
    summary = await ComplianceService.validate_retention(db, organization_id=org_id)
    assert "audit_logs" in summary


@pytest.mark.asyncio
async def test_security_event_service(db: AsyncSession, organization, organizer):
    org_id = organization.id

    # 1. Record Security Event
    event = await SecurityEventService.record_security_event(
        db=db,
        organization_id=org_id,
        event_type="UNAUTHORIZED_ACCESS",
        severity="HIGH",
        title="Brute force login detected",
        description="Repeated failed logins from IP 1.2.3.4"
    )
    await db.flush()
    assert event.id is not None
    assert event.severity == "HIGH"
    assert event.status == "OPEN"

    # 2. Resolve Security Event
    resolved = await SecurityEventService.mark_resolved(
        db=db,
        event_id=event.id,
        organization_id=org_id,
        resolution_metadata={"notes": "Resolved after password reset."}
    )
    await db.flush()
    assert resolved is not None
    assert resolved.status == "RESOLVED"
    assert resolved.metadata_data["resolution"]["notes"] == "Resolved after password reset."


@pytest.mark.asyncio
async def test_audit_api_endpoints(client: AsyncClient, db: AsyncSession, organization, organizer):
    organizer.is_platform_admin = True
    await db.flush()
    headers = auth_headers(organizer)
    org_id = organization.id

    # Seed an audit log for API testing
    await AuditService.log_action(
        db=db,
        organization_id=org_id,
        module="events",
        entity_type="event",
        entity_id=uuid.uuid4(),
        action="UPDATE",
        performed_by=organizer.id,
        old_values={"name": "Old Event Name"},
        new_values={"name": "New Event Name"}
    )
    await db.commit()

    # 1. GET Dashboard
    response = await client.get("/api/v1/platform/audit/dashboard", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["audit_logs_count"] >= 1

    # 2. GET Logs
    response = await client.get("/api/v1/platform/audit/logs", headers=headers)
    assert response.status_code == 200
    logs = response.json()
    assert len(logs) >= 1

    # 3. GET Users timeline
    response = await client.get(f"/api/v1/platform/audit/users?user_id={organizer.id}", headers=headers)
    assert response.status_code == 200

    # 4. POST Export
    export_payload = {
        "module": "events",
        "export_type": "CSV",
        "file_name": "event_export.csv"
    }
    response = await client.post("/api/v1/platform/audit/export", json=export_payload, headers=headers)
    assert response.status_code == 200
    export_data = response.json()
    assert export_data["status"] == "success"
    assert "download_url" in export_data


@pytest.mark.asyncio
async def test_compliance_and_security_endpoints(client: AsyncClient, db: AsyncSession, organization, organizer):
    organizer.is_platform_admin = True
    await db.flush()
    headers = auth_headers(organizer)
    org_id = organization.id

    # Seed compliance policy and security event
    await ComplianceService.configure_retention_policy(
        db=db,
        organization_id=org_id,
        module="audit_logs",
        retention_days=180
    )
    sec_event = await SecurityEventService.record_security_event(
        db=db,
        organization_id=org_id,
        event_type="SUSPICIOUS_API_BEHAVIOR",
        severity="MEDIUM",
        title="Suspicious request frequency",
        description="IP 2.3.4.5 exceeded rate limits 50 times in 1 min."
    )
    await db.commit()

    # 1. GET Compliance reports
    response = await client.get("/api/v1/platform/compliance/reports", headers=headers)
    assert response.status_code == 200

    # 2. POST Compliance reports generate
    response = await client.post("/api/v1/platform/compliance/reports/generate", json={"report_type": "SOC2"}, headers=headers)
    assert response.status_code == 200

    # 3. GET Compliance retention
    response = await client.get("/api/v1/platform/compliance/retention", headers=headers)
    assert response.status_code == 200
    policies = response.json()
    assert len(policies) >= 1
    assert policies[0]["module"] == "audit_logs"

    # 4. PUT Compliance retention
    put_payload = {
        "module": "audit_logs",
        "retention_days": 365,
        "archive_enabled": True,
        "delete_enabled": True
    }
    response = await client.put("/api/v1/platform/compliance/retention", json=put_payload, headers=headers)
    assert response.status_code == 200

    # 5. GET Security events
    response = await client.get("/api/v1/platform/security/events", headers=headers)
    assert response.status_code == 200
    events = response.json()
    assert len(events) >= 1

    # 6. POST Resolve security event
    response = await client.post(
        f"/api/v1/platform/security/events/{sec_event.id}/resolve",
        json={"resolution_details": "False positive; verified user IP."},
        headers=headers
    )
    assert response.status_code == 200
    assert response.json()["event_status"] == "RESOLVED"
