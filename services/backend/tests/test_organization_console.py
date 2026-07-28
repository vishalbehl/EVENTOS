from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import CapabilityDiagnosticEvent, CapabilityRestriction, EntitlementOverrideRequest, EntitlementShadowComparison, EventCommercialContract, OrganizationLifecycleJob, OrganizationLocation, OrganizationTeam, OrganizationTeamEvent, OrganizationTeamMember, UsageReservation
from app.modules.events.models.event import Event
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.session import Session
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.ticket_type import TicketType
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection, IntegrationProvider
from app.modules.developer.models.developer_registry import ApiKey
from app.modules.integrations.models.webhook import Webhook
from app.modules.billing.services.usage_service import UsageService
from app.modules.platform.services.metering_service import MeteringService
from app.modules.billing.services.capability_diagnostics_service import CapabilityDiagnosticsService
from app.modules.platform.services.lifecycle_service import OrganizationLifecycleService
from app.modules.platform.models.platform_domain_tables import FeatureFlag
from app.tasks.organization_console_rollout_tasks import backfill_organization_console_in_session
from app.tasks.organization_console_tasks import expire_tenant_capability_controls_in_session
from tests.conftest import activate_event_for_test, auth_headers


@pytest.mark.asyncio
async def test_member_governance_uses_membership_identity_and_guarded_mutations(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    super_admin: User,
):
    headers = auth_headers(super_admin)
    email = f"invite-{uuid.uuid4().hex[:8]}@example.com"
    invited = await client.post(
        f"/api/v1/platform/organisations/{organization.id}/members",
        headers=headers,
        json={"email": email, "org_role": "member", "reason": "Invite an approved event operations collaborator."},
    )
    assert invited.status_code == 201, invited.text
    membership_id = invited.json()["membership_id"]

    snapshot = await client.get(
        f"/api/v1/platform/organizations/{organization.id}/console/members",
        headers=headers,
    )
    assert snapshot.status_code == 200, snapshot.text
    row = next(item for item in snapshot.json()["data"]["items"] if item["email"] == email)
    assert str(row["id"]) == membership_id and row["user_id"] is None and row["event_ids"] == []

    updated = await client.patch(
        f"/api/v1/platform/organisations/{organization.id}/members/{membership_id}",
        headers=headers,
        json={"org_role": "billing_only", "reason": "Limit the pending collaborator to approved billing work."},
    )
    assert updated.status_code == 200 and updated.json()["org_role"] == "billing_only"
    removed = await client.request(
        "DELETE",
        f"/api/v1/platform/organisations/{organization.id}/members/{membership_id}",
        headers=headers,
        json={"reason": "Withdraw the invitation after the staffing plan changed."},
    )
    assert removed.status_code == 200, removed.text
    member = await db.get(OrganizationMember, uuid.UUID(membership_id))
    assert member and member.is_active is False


@pytest.mark.asyncio
async def test_operations_domain_is_tenant_scoped_and_reports_evidence_availability(
    client: AsyncClient,
    organization: Organization,
    super_admin: User,
):
    response = await client.get(
        f"/api/v1/platform/organizations/{organization.id}/console/operations",
        headers=auth_headers(super_admin),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["jobs"] == [] and data["failures"] == []
    assert data["global_policy_owner"] == "Operations Console"
    assert data["maintenance_mode"]["available"] is False
    assert data["incident_timeline"]["available"] is False


@pytest.mark.asyncio
async def test_organization_teams_are_versioned_tenant_scoped_and_assignable(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    organizer: User,
    super_admin: User,
):
    headers = auth_headers(super_admin)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == organization.id, OrganizationMember.user_id == organizer.id))
    assert member is not None
    event = Event(organization_id=organization.id, created_by=organizer.id, name="Team Event", short_code=f"TE{uuid.uuid4().hex[:6].upper()}", start_date=date(2026, 10, 1), end_date=date(2026, 10, 2), timezone="UTC", status="draft")
    db.add(event); await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console/teams"
    created = await client.post(base, headers=headers, json={"name": "Event Operations", "description": "Runs event delivery", "reason": "Create the approved event delivery team."})
    assert created.status_code == 201, created.text
    team_id = created.json()["id"]
    assigned_member = await client.put(f"{base}/{team_id}/members/{member.id}", headers=headers, json={"reason": "Assign the approved operator to the delivery team.", "permissions": {}})
    assert assigned_member.status_code == 200 and str(member.id) in assigned_member.json()["member_ids"]
    assigned_event = await client.put(f"{base}/{team_id}/events/{event.id}", headers=headers, json={"reason": "Assign the delivery team to the scheduled event.", "permissions": {"manage_sessions": True}})
    assert assigned_event.status_code == 200 and assigned_event.json()["events"][0]["permissions"]["manage_sessions"] is True
    updated = await client.patch(f"{base}/{team_id}", headers={**headers, "If-Match": "1"}, json={"name": "Event Delivery", "description": "Owns event delivery", "reason": "Rename the team to match its approved responsibility."})
    assert updated.status_code == 200 and updated.json()["version"] == 2
    stale = await client.patch(f"{base}/{team_id}", headers={**headers, "If-Match": "1"}, json={"name": "Stale Name", "reason": "Attempt a stale concurrent team update."})
    assert stale.status_code == 409 and stale.json()["detail"] == "VERSION_CONFLICT"
    archived = await client.request("DELETE", f"{base}/{team_id}", headers={**headers, "If-Match": "2"}, json={"reason": "Archive the team after its operational responsibility ended."})
    assert archived.status_code == 200 and archived.json()["version"] == 3
    row = await db.get(OrganizationTeam, uuid.UUID(team_id)); assert row and row.deleted_at is not None
    assert await db.scalar(select(OrganizationTeamMember.id).where(OrganizationTeamMember.team_id == row.id))
    assert await db.scalar(select(OrganizationTeamEvent.id).where(OrganizationTeamEvent.team_id == row.id))


@pytest.mark.asyncio
async def test_notification_rules_and_channels_are_versioned_redacted_and_recoverable(
    client: AsyncClient,
    organization: Organization,
    super_admin: User,
):
    headers = auth_headers(super_admin); base = f"/api/v1/platform/organizations/{organization.id}/console"
    channel_payload = {"channel": "EMAIL", "provider": "approved-email", "state": "CONFIGURED", "secret_reference": "vault://tenant/email", "configuration": {"from": "events@example.com"}, "reason": "Configure the approved organization email channel."}
    channel = await client.post(f"{base}/notification-channels", headers=headers, json=channel_payload)
    assert channel.status_code == 201, channel.text
    assert "secret_reference" not in channel.json()
    rule_payload = {"name": "Registration approved", "trigger_key": "event.registration.approved", "channel": "EMAIL", "recipients": {"roles": ["attendee"]}, "conditions": {}, "escalation_policy": {}, "is_enabled": True, "reason": "Create the approved registration notification rule."}
    rule = await client.post(f"{base}/notification-rules", headers=headers, json=rule_payload)
    assert rule.status_code == 201, rule.text
    snapshot = await client.get(f"{base}/notifications", headers=headers)
    assert snapshot.status_code == 200
    assert snapshot.json()["data"]["channels"][0]["secret_reference_present"] is True
    assert "secret_reference" not in snapshot.json()["data"]["channels"][0]
    changed = await client.patch(f"{base}/notification-rules/{rule.json()['id']}", headers={**headers, "If-Match": "1"}, json={**rule_payload, "is_enabled": False, "reason": "Pause the rule during the approved delivery maintenance."})
    assert changed.status_code == 200 and changed.json()["version"] == 2 and changed.json()["is_enabled"] is False
    stale = await client.patch(f"{base}/notification-rules/{rule.json()['id']}", headers={**headers, "If-Match": "1"}, json=rule_payload)
    assert stale.status_code == 409
    archived = await client.request("DELETE", f"{base}/notification-channels/{channel.json()['id']}", headers={**headers, "If-Match": "1"}, json={"reason": "Archive the channel after the provider contract ended."})
    assert archived.status_code == 200 and archived.json()["version"] == 2


@pytest.mark.asyncio
async def test_compliance_controls_are_versioned_and_evidence_is_integrity_bound(
    client: AsyncClient,
    organization: Organization,
    super_admin: User,
):
    headers = auth_headers(super_admin); base = f"/api/v1/platform/organizations/{organization.id}/console/compliance/controls"
    payload = {"framework": "SOC2", "control_key": "CC6.1", "title": "Logical access controls", "applicability": "APPLICABLE", "state": "IN_PROGRESS", "readiness_score": 60, "reason": "Record the approved organization compliance control."}
    created = await client.post(base, headers=headers, json=payload)
    assert created.status_code == 201, created.text
    control_id = created.json()["id"]
    updated = await client.patch(f"{base}/{control_id}", headers={**headers, "If-Match": "1"}, json={**payload, "state": "READY", "readiness_score": 100, "reason": "Mark the control ready after the approved evidence review."})
    assert updated.status_code == 200 and updated.json()["version"] == 2
    stale = await client.patch(f"{base}/{control_id}", headers={**headers, "If-Match": "1"}, json=payload)
    assert stale.status_code == 409
    evidence = await client.post(f"{base}/{control_id}/evidence", headers=headers, json={"evidence_type": "DOCUMENT", "storage_reference": "asset://compliance/access-review-2026", "checksum_sha256": "a" * 64, "classification": "CONFIDENTIAL", "collected_at": datetime.now(timezone.utc).isoformat(), "reason": "Attach the reviewed access-control evidence reference."})
    assert evidence.status_code == 201, evidence.text
    listed = await client.get(f"{base}/{control_id}/evidence", headers=headers)
    assert listed.status_code == 200 and listed.json()["items"][0]["checksum_sha256"] == "a" * 64


@pytest.mark.asyncio
async def test_audit_cursor_endpoint_verifies_payload_integrity(
    client: AsyncClient,
    organization: Organization,
    super_admin: User,
):
    request_headers = auth_headers(super_admin)
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    created = await client.post(
        f"{base}/teams",
        json={"name": "Integrity Reviewers", "description": "Audit verification", "reason": "Creating a record for integrity verification"},
        headers=request_headers,
    )
    assert created.status_code == 201, created.text
    response = await client.get(
        f"{base}/audit?limit=1&action_type=ORGANIZATION_TEAM_CREATED",
        headers=request_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["items"][0]["hash_version"] == 2
    assert body["items"][0]["integrity_valid"] is True
    assert body["integrity"] == {"verified": 1, "failed": 0}


@pytest.mark.asyncio
async def test_impersonation_handoff_is_single_use_attributed_and_revocable(
    client: AsyncClient,
    organization: Organization,
    organizer: User,
    super_admin: User,
):
    session_store: dict[str, str] = {}
    async def redis_set(key, value, ex=None): session_store[key] = value
    async def redis_get(key): return session_store.get(key)
    async def redis_delete(key): return 1 if session_store.pop(key, None) is not None else 0
    from app.redis import redis_client
    with patch.object(redis_client, "set", AsyncMock(side_effect=redis_set)), patch.object(redis_client, "get", AsyncMock(side_effect=redis_get)), patch.object(redis_client, "delete", AsyncMock(side_effect=redis_delete)):
        base = f"/api/v1/platform/organizations/{organization.id}/console"
        created = await client.post(f"{base}/impersonation-handoffs", headers=auth_headers(super_admin), json={"target_user_id": str(organizer.id), "reason": "Diagnose the approved organizer support incident", "case_reference": "SUP-9001"})
        assert created.status_code == 201, created.text
        code = created.json()["handoff_code"]
        exchanged = await client.post("/api/v1/auth/impersonation/handoff/exchange", json={"handoff_code": code})
        assert exchanged.status_code == 200, exchanged.text
        token = exchanged.json()["access_token"]
        from jose import jwt
        from app.config import settings
        claims = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert claims["sub"] == str(organizer.id)
        assert claims["impersonator_id"] == str(super_admin.id)
        assert claims["impersonation_session_id"] == exchanged.json()["session_id"]
        replay = await client.post("/api/v1/auth/impersonation/handoff/exchange", json={"handoff_code": code})
        assert replay.status_code == 401
        token_headers = {"Authorization": f"Bearer {token}"}
        active = await client.get("/api/v1/auth/me", headers=token_headers)
        assert active.status_code == 200, active.text
        ended = await client.post("/api/v1/auth/impersonation/handoff/end", headers=token_headers)
        assert ended.status_code == 200, ended.text
        revoked = await client.get("/api/v1/auth/me", headers=token_headers)
        assert revoked.status_code == 401


@pytest.mark.asyncio
async def test_purge_manifest_is_stable_and_executor_tombstones_without_losing_proof(
    db: AsyncSession,
    organization: Organization,
    organizer: User,
    super_admin: User,
):
    manifest, checksum = await OrganizationLifecycleService.build_manifest(db, organization.id, "PURGE", None)
    repeated_manifest, repeated_checksum = await OrganizationLifecycleService.build_manifest(db, organization.id, "PURGE", None)
    assert manifest["generated_at"] != repeated_manifest["generated_at"] or checksum == repeated_checksum
    assert checksum == repeated_checksum
    job = OrganizationLifecycleJob(organization_id=organization.id, job_type="PURGE", status="RUNNING", dry_run_manifest=manifest, approvals=[{"decision": "APPROVED", "actor_id": str(super_admin.id)}], reason="Permanent purge approved after retention and dependency review", idempotency_key=f"purge-{uuid.uuid4()}", requested_by=super_admin.id, manifest_checksum=checksum)
    db.add(job); await db.flush()
    result = await OrganizationLifecycleService.execute(db, job)
    assert result["organization_tombstoned"] is True
    assert result["users_anonymized"] >= 1
    assert organization.is_active is False
    assert organization.slug == f"purged-{organization.id}"
    await db.refresh(organizer)
    assert organizer.email == f"purged+{organizer.id}@invalid.local"
    assert organizer.password_hash is None and organizer.is_active is False
    assert await db.get(OrganizationLifecycleJob, job.id) is not None


@pytest.mark.asyncio
async def test_merge_executor_moves_tenant_records_and_tombstones_source_atomically(
    db: AsyncSession,
    organization: Organization,
    organizer: User,
    super_admin: User,
    event: Event,
):
    target = Organization(name="Merge Target", slug=f"merge-target-{uuid.uuid4().hex[:8]}", plan="pro", is_active=True)
    db.add(target); await db.flush()
    manifest, checksum = await OrganizationLifecycleService.build_manifest(db, organization.id, "MERGE", target.id)
    job = OrganizationLifecycleJob(organization_id=organization.id, target_organization_id=target.id, job_type="MERGE", status="RUNNING", dry_run_manifest=manifest, approvals=[{"decision": "APPROVED", "actor_id": str(super_admin.id)}], reason="Merge approved after reviewing identity and commercial conflicts", idempotency_key=f"merge-{uuid.uuid4()}", requested_by=super_admin.id, manifest_checksum=checksum)
    db.add(job); await db.flush()
    result = await OrganizationLifecycleService.execute(db, job)
    assert result["source_tombstoned"] is True
    await db.refresh(event); await db.refresh(organizer)
    assert event.organization_id == target.id
    assert organizer.organization_id == target.id
    assert organization.is_active is False
    assert str(target.id) in organization.suspension_reason
    assert await db.get(OrganizationLifecycleJob, job.id) is not None


@pytest.mark.asyncio
async def test_rollout_backfill_is_dry_run_safe_and_enforcement_is_evidence_gated(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    await activate_event_for_test(db, event)
    # Simulate an event activated before canonical contract snapshots existed.
    # New activations create the contract immediately, so the rollout backfill
    # must be tested against an intentionally removed legacy snapshot.
    await db.execute(delete(EventCommercialContract).where(EventCommercialContract.event_id == event.id))
    await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console/rollout"
    missing_status = await client.get(base, headers=auth_headers(super_admin))
    assert missing_status.status_code == 200
    assert missing_status.json()["activated_events"] == 1
    assert missing_status.json()["missing_contracts"] == 1
    blocked = await client.patch(
        base,
        headers=auth_headers(super_admin),
        json={
            "shadow_enabled": True,
            "enforcement_enabled": True,
            "reason": "Attempt enforcement before the required event contract exists.",
        },
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "EVENT_CONTRACTS_REQUIRED"
    dry_run = await backfill_organization_console_in_session(db, organization.id, apply=False)
    assert dry_run["contracts"] == 1
    assert await db.scalar(select(EventCommercialContract).where(EventCommercialContract.event_id == event.id)) is None
    applied = await backfill_organization_console_in_session(db, organization.id, apply=True)
    await db.flush()
    assert applied["contracts"] == 1 and applied["comparisons"] == 1
    contract = await db.scalar(select(EventCommercialContract).where(EventCommercialContract.event_id == event.id))
    assert contract and contract.source["type"] == "ACTIVATION_BACKFILL"
    comparison = await db.scalar(select(EntitlementShadowComparison).where(EntitlementShadowComparison.event_id == event.id))
    assert comparison and comparison.status == "MATCHED"
    enforce_flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.organization_id == organization.id, FeatureFlag.flag_key == "organizer_console_entitlement_enforce"))
    assert enforce_flag and enforce_flag.is_enabled is False
    status_response = await client.get(base, headers=auth_headers(super_admin))
    assert status_response.status_code == 200 and status_response.json()["comparisons"]["diverged"] == 0
    assert status_response.json()["missing_contracts"] == 0
    enabled = await client.patch(base, headers=auth_headers(super_admin), json={"shadow_enabled": True, "enforcement_enabled": True, "reason": "Enable enforcement after the complete matching shadow comparison"})
    assert enabled.status_code == 200, enabled.text
    await db.refresh(enforce_flag)
    assert enforce_flag.is_enabled is True


@pytest.mark.asyncio
async def test_capability_diagnostics_are_redacted_and_tenant_scoped(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    other = Organization(
        name="Other Diagnostics Tenant",
        slug=f"other-diagnostics-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other)
    await db.flush()
    scoped = CapabilityDiagnosticsService.add(
        db,
        event_type="GATE_DENIAL",
        source="test.capability_gate",
        organization_id=organization.id,
        event_id=event.id,
        actor_user_id=super_admin.id,
        severity="WARNING",
        reason_code="NOT_ENTITLED",
        capability_key="FEAT_API_ACCESS",
        operation_key="developer.api_keys.create",
        metadata={
            "path": "/api/v1/developer/api-keys",
            "authorization": "Bearer must-never-appear",
            "context": {"token": "nested-must-never-appear", "safe": "kept"},
        },
    )
    foreign = CapabilityDiagnosticsService.add(
        db,
        event_type="RESOLUTION_FAILURE",
        source="test.foreign",
        organization_id=other.id,
        severity="ERROR",
        reason_code="RESOLUTION_UNAVAILABLE",
    )
    await db.flush()

    assert scoped.metadata_json["authorization"] == "[REDACTED]"
    assert scoped.metadata_json["context"]["token"] == "[REDACTED]"
    assert scoped.metadata_json["context"]["safe"] == "kept"

    response = await client.get(
        f"/api/v1/platform/organizations/{organization.id}/console/diagnostics",
        headers=auth_headers(super_admin),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["organization_id"] == str(organization.id)
    assert body["availability"]["available"] is True
    assert body["summary"]["gate_denials"] == 1
    assert str(scoped.id) in {item["id"] for item in body["items"]}
    assert str(foreign.id) not in {item["id"] for item in body["items"]}
    returned = next(item for item in body["items"] if item["id"] == str(scoped.id))
    assert returned["metadata"]["authorization"] == "[REDACTED]"
    assert returned["metadata"]["context"]["token"] == "[REDACTED]"


@pytest.mark.asyncio
async def test_capability_control_expiry_preserves_history_and_expires_reservations(
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    now = datetime.now(timezone.utc)
    approval_time = now - timedelta(hours=2)
    expired_override = EntitlementOverrideRequest(
        organization_id=organization.id,
        event_id=event.id,
        entitlement_key="max_speakers",
        operation="INCREMENT",
        requested_value=25,
        reason="Temporary event capacity approved for the operating window.",
        case_reference="OPS-EXPIRY-1",
        status="APPROVED",
        requested_by=super_admin.id,
        approved_by=super_admin.id,
        effective_at=now - timedelta(days=1),
        expires_at=now - timedelta(minutes=1),
        idempotency_key=f"expiry-override-{uuid.uuid4()}",
        decided_at=approval_time,
    )
    future_override = EntitlementOverrideRequest(
        organization_id=organization.id,
        event_id=event.id,
        entitlement_key="max_rooms",
        operation="INCREMENT",
        requested_value=1,
        reason="Temporary room allocation remains active through tomorrow.",
        case_reference="OPS-EXPIRY-2",
        status="APPROVED",
        requested_by=super_admin.id,
        approved_by=super_admin.id,
        effective_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=1),
        idempotency_key=f"future-override-{uuid.uuid4()}",
        decided_at=approval_time,
    )
    restriction = CapabilityRestriction(
        organization_id=organization.id,
        event_id=event.id,
        capability_key="FEAT_API_ACCESS",
        restriction_type="TEMPORARY",
        reason_code="SECURITY_RESTRICTED",
        reason="Temporary containment period has ended.",
        case_reference="SEC-EXPIRY-1",
        status="APPROVED",
        effective_at=now - timedelta(hours=1),
        expires_at=now - timedelta(seconds=1),
        requested_by=super_admin.id,
        approved_by=super_admin.id,
        idempotency_key=f"expiry-restriction-{uuid.uuid4()}",
    )
    reservation = UsageReservation(
        organization_id=organization.id,
        event_id=event.id,
        metric_key="max_exports_per_event",
        quantity=10,
        unit="exports",
        status="RESERVED",
        idempotency_key=f"expiry-reservation-{uuid.uuid4()}",
        expires_at=now - timedelta(seconds=1),
    )
    db.add_all([expired_override, future_override, restriction, reservation])
    await db.flush()

    counts = await expire_tenant_capability_controls_in_session(
        db,
        organization.id,
        now=now,
    )
    assert counts == {
        "entitlement_overrides": 1,
        "restrictions": 1,
        "flag_overrides": 0,
        "reservations": 1,
    }
    assert expired_override.status == "EXPIRED"
    assert expired_override.decided_at == approval_time
    assert future_override.status == "APPROVED"
    assert restriction.status == "EXPIRED" and restriction.version == 2
    assert reservation.status == "EXPIRED"
    audit_types = set(
        (
            await db.scalars(
                select(AuditLog.action_type).where(
                    AuditLog.organization_id == organization.id,
                    AuditLog.action_type.in_(
                        [
                            "ENTITLEMENT_OVERRIDE_EXPIRED",
                            "CAPABILITY_RESTRICTION_EXPIRED",
                        ]
                    ),
                )
            )
        ).all()
    )
    assert audit_types == {
        "ENTITLEMENT_OVERRIDE_EXPIRED",
        "CAPABILITY_RESTRICTION_EXPIRED",
    }


@pytest.mark.asyncio
async def test_console_summary_uses_authoritative_records_and_requires_super_admin(
    client: AsyncClient,
    organization: Organization,
    organizer: User,
    super_admin: User,
):
    url = f"/api/v1/platform/organizations/{organization.id}/console/summary"

    denied = await client.get(url, headers=auth_headers(organizer))
    assert denied.status_code == 403

    response = await client.get(url, headers=auth_headers(super_admin))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["organization"]["id"] == str(organization.id)
    assert body["organization"]["name"] == organization.name
    assert body["generated_at"]
    assert {metric["source"] for metric in body["metrics"]} >= {
        "events.events",
        "rbac.organization_members",
        "identity.users",
    }
    assert body["availability"]["storage"]["available"] is False
    backup = next(item for item in body["health_factors"] if item["key"] == "backups")
    assert backup["status"] == "NOT_MEASURED"
    assert backup["score"] is None


@pytest.mark.asyncio
async def test_location_creation_is_tenant_scoped_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    super_admin: User,
):
    other = Organization(name="Other Organization", slug=f"other-{uuid.uuid4().hex[:8]}")
    db.add(other)
    await db.flush()
    outsider = User(
        organization_id=other.id,
        email=f"manager-{uuid.uuid4().hex[:8]}@test.com",
        password_hash="not-used",
        first_name="Outside",
        last_name="Manager",
        role="organiser",
        is_active=True,
    )
    db.add(outsider)
    await db.flush()

    url = f"/api/v1/platform/organizations/{organization.id}/console/locations"
    rejected = await client.post(
        url,
        headers=auth_headers(super_admin),
        json={
            "name": "Restricted Office",
            "location_type": "REGIONAL_OFFICE",
            "timezone": "Asia/Kolkata",
            "manager_user_id": str(outsider.id),
        },
    )
    assert rejected.status_code == 404

    created = await client.post(
        url,
        headers=auth_headers(super_admin),
        json={
            "name": "Operations Hub",
            "location_type": "REGIONAL_OFFICE",
            "timezone": "Asia/Kolkata",
            "address": {"country": "IN", "city": "Delhi"},
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["organization_id"] == str(organization.id)
    assert body["version"] == 1

    location = await db.scalar(select(OrganizationLocation).where(OrganizationLocation.id == uuid.UUID(body["id"])))
    assert location is not None
    assert location.organization_id == organization.id
    audit = await db.scalar(
        select(AuditLog).where(
            AuditLog.organization_id == organization.id,
            AuditLog.resource_id == location.id,
            AuditLog.action_type == "ORGANIZATION_LOCATION_CREATED",
        )
    )
    assert audit is not None


@pytest.mark.asyncio
async def test_unknown_console_domain_and_organization_do_not_leak_resources(
    client: AsyncClient,
    organization: Organization,
    super_admin: User,
):
    headers = auth_headers(super_admin)
    unknown_domain = await client.get(
        f"/api/v1/platform/organizations/{organization.id}/console/not-a-domain",
        headers=headers,
    )
    assert unknown_domain.status_code == 404

    unknown_org = await client.get(
        f"/api/v1/platform/organizations/{uuid.uuid4()}/console/summary",
        headers=headers,
    )
    assert unknown_org.status_code == 404


@pytest.mark.asyncio
async def test_event_contract_override_requires_independent_approval_and_resolves_sources(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    await activate_event_for_test(db, event)
    second_admin = User(
        organization_id=organization.id,
        email=f"approver-{uuid.uuid4().hex[:8]}@test.com",
        password_hash="not-used",
        first_name="Independent",
        last_name="Approver",
        role="super_admin",
        is_active=True,
    )
    db.add(second_admin)
    await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    contract_request = await client.post(
        f"{base}/override-requests",
        headers={**auth_headers(super_admin), "Idempotency-Key": f"contract-{uuid.uuid4()}"},
        json={
            "event_id": str(event.id),
            "entitlement_key": "event.contract",
            "operation": "REPLACE",
            "requested_value": {"plan_key": "enterprise-event", "plan_version": "2026.07"},
            "reason": "Request the signed event commercial contract amendment.",
            "case_reference": "SALES-1000",
        },
    )
    assert contract_request.status_code == 201, contract_request.text
    contract_request_id = contract_request.json()["id"]
    contract_approval = await client.post(
        f"{base}/override-requests/{contract_request_id}/decision",
        headers={
            **auth_headers(second_admin),
            "If-Match": "1",
            "Idempotency-Key": f"contract-approval-{uuid.uuid4()}",
        },
        json={"decision": "APPROVED", "reason": "Independently verified the signed event contract."},
    )
    assert contract_approval.status_code == 200, contract_approval.text
    contract_apply_key = f"contract-apply-{uuid.uuid4()}"
    contract_payload = {
        "approved_request_id": contract_request_id,
        "plan_key": "enterprise-event",
        "plan_version": "2026.07",
        "currency": "USD",
        "entitlements": {"max_registrations": 10000},
        "hard_ceilings": {"max_registrations": 250},
        "addons": [],
        "source": {"type": "MANUAL", "reference": "TEST-CONTRACT"},
        "effective_at": "2026-07-21T00:00:00Z",
        "reason": "Create the test event commercial contract.",
    }
    contract = await client.post(
        f"{base}/events/{event.id}/contract",
        headers={
            **auth_headers(super_admin),
            "If-Match": "1",
            "Idempotency-Key": contract_apply_key,
        },
        json=contract_payload,
    )
    assert contract.status_code == 201, contract.text
    contract_replay = await client.post(
        f"{base}/events/{event.id}/contract",
        headers={
            **auth_headers(super_admin),
            "If-Match": "1",
            "Idempotency-Key": contract_apply_key,
        },
        json=contract_payload,
    )
    assert contract_replay.status_code == 201
    assert contract_replay.json() == contract.json()
    enforce_flag = await db.scalar(select(FeatureFlag).where(
        FeatureFlag.organization_id == organization.id,
        FeatureFlag.flag_key == "organizer_console_entitlement_enforce",
    ))
    if enforce_flag:
        enforce_flag.is_enabled = True
    else:
        db.add(FeatureFlag(
            organization_id=organization.id,
            flag_key="organizer_console_entitlement_enforce",
            is_enabled=True,
        ))
    await db.commit()

    request_headers = {**auth_headers(super_admin), "Idempotency-Key": f"override-{uuid.uuid4()}"}
    requested = await client.post(
        f"{base}/override-requests",
        headers=request_headers,
        json={
            "event_id": str(event.id),
            "entitlement_key": "max_registrations",
            "operation": "INCREMENT",
            "requested_value": 200,
            "reason": "Grant temporary registration capacity for the signed amendment.",
            "case_reference": "SUP-1001",
        },
    )
    assert requested.status_code == 201, requested.text
    override_id = requested.json()["id"]

    self_approval = await client.post(
        f"{base}/override-requests/{override_id}/decision",
        headers={
            **auth_headers(super_admin),
            "If-Match": "1",
            "Idempotency-Key": f"override-self-approval-{uuid.uuid4()}",
        },
        json={"decision": "APPROVED", "reason": "Approve the signed commercial amendment."},
    )
    assert self_approval.status_code == 409

    approved = await client.post(
        f"{base}/override-requests/{override_id}/decision",
        headers={
            **auth_headers(second_admin),
            "If-Match": "1",
            "Idempotency-Key": f"override-approval-{uuid.uuid4()}",
        },
        json={"decision": "APPROVED", "reason": "Independently verified the signed amendment."},
    )
    assert approved.status_code == 200, approved.text

    resolved = await client.get(
        f"{base}/events/{event.id}/entitlements/resolved",
        headers=auth_headers(super_admin),
    )
    assert resolved.status_code == 200, resolved.text
    body = resolved.json()
    assert body["values"]["max_registrations"] == 250
    assert [source["source"] for source in body["sources"]["max_registrations"]] == ["CONTRACT_SNAPSHOT", "EVENT_OVERRIDE", "HARD_PLATFORM_CEILING"]

    revocation_requested = await client.post(
        f"{base}/override-requests/{override_id}/revocation-request",
        headers={
            **auth_headers(super_admin),
            "If-Match": "2",
            "Idempotency-Key": f"override-revocation-request-{uuid.uuid4()}",
        },
        json={
            "reason": "Remove the temporary registration allocation after the event change.",
            "case_reference": "SUP-1001",
        },
    )
    assert revocation_requested.status_code == 202, revocation_requested.text
    self_revocation = await client.post(
        f"{base}/override-requests/{override_id}/revocation-decision",
        headers={
            **auth_headers(super_admin),
            "If-Match": "3",
            "Idempotency-Key": f"override-revocation-self-{uuid.uuid4()}",
        },
        json={"decision": "APPROVED", "reason": "Attempt to approve the revocation request."},
    )
    assert self_revocation.status_code == 409
    revocation_decision_key = f"override-revocation-approval-{uuid.uuid4()}"
    revocation_payload = {
        "decision": "APPROVED",
        "reason": "Independently verified that the temporary allocation is no longer required.",
    }
    revoked = await client.post(
        f"{base}/override-requests/{override_id}/revocation-decision",
        headers={
            **auth_headers(second_admin),
            "If-Match": "3",
            "Idempotency-Key": revocation_decision_key,
        },
        json=revocation_payload,
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["status"] == "REVOKED"
    revoked_replay = await client.post(
        f"{base}/override-requests/{override_id}/revocation-decision",
        headers={
            **auth_headers(second_admin),
            "If-Match": "3",
            "Idempotency-Key": revocation_decision_key,
        },
        json=revocation_payload,
    )
    assert revoked_replay.status_code == 200
    assert revoked_replay.json() == revoked.json()
    resolved_after_revocation = await client.get(
        f"{base}/events/{event.id}/entitlements/resolved",
        headers=auth_headers(super_admin),
    )
    assert resolved_after_revocation.status_code == 200
    assert "EVENT_OVERRIDE" not in {
        source["source"]
        for source in resolved_after_revocation.json()["sources"]["max_registrations"]
    }


@pytest.mark.asyncio
async def test_event_contract_rejects_cross_tenant_event(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    super_admin: User,
):
    from datetime import date
    other = Organization(name="Contract Isolation", slug=f"contract-{uuid.uuid4().hex[:8]}")
    db.add(other)
    await db.flush()
    foreign_event = Event(organization_id=other.id, created_by=super_admin.id, name="Foreign Event", short_code=f"FE{uuid.uuid4().hex[:6].upper()}", start_date=date(2026, 10, 1), end_date=date(2026, 10, 2), timezone="UTC", status="draft")
    db.add(foreign_event)
    await db.flush()
    response = await client.post(
        f"/api/v1/platform/organizations/{organization.id}/console/events/{foreign_event.id}/contract",
        headers={
            **auth_headers(super_admin),
            "If-Match": "0",
            "Idempotency-Key": f"cross-tenant-contract-{uuid.uuid4()}",
        },
        json={"approved_request_id": str(uuid.uuid4()), "plan_key": "basic", "plan_version": "1", "currency": "USD", "entitlements": {}, "effective_at": "2026-07-22T00:00:00Z", "reason": "Attempt a cross-tenant commercial contract."},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_capability_restriction_restore_requires_independent_approval(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    approver = User(
        organization_id=organization.id,
        email=f"restriction-approver-{uuid.uuid4().hex[:8]}@test.com",
        password_hash="not-used",
        first_name="Restriction",
        last_name="Approver",
        role="super_admin",
        is_active=True,
    )
    db.add(approver)
    await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    requested = await client.post(
        f"{base}/restrictions",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"restriction-request-{uuid.uuid4()}",
        },
        json={
            "event_id": str(event.id),
            "capability_key": "speaker_management",
            "restriction_type": "SECURITY",
            "reason_code": "SECURITY_RESTRICTED",
            "reason": "Temporarily contain speaker access while the incident is investigated.",
            "case_reference": "SEC-2001",
        },
    )
    assert requested.status_code == 202, requested.text
    restriction_id = requested.json()["id"]
    approved = await client.post(
        f"{base}/restrictions/{restriction_id}/decision",
        headers={
            **auth_headers(approver),
            "If-Match": "1",
            "Idempotency-Key": f"restriction-approval-{uuid.uuid4()}",
        },
        json={
            "decision": "APPROVED",
            "reason": "Independently verified the incident containment requirement.",
        },
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["version"] == 2

    direct_restore = await client.post(
        f"{base}/restrictions/{restriction_id}/revoke",
        headers=auth_headers(super_admin),
        json={
            "decision": "APPROVED",
            "reason": "Attempt a direct restore without the governed workflow.",
        },
    )
    assert direct_restore.status_code == 409
    assert direct_restore.json()["detail"]["code"] == "GOVERNED_REVOCATION_REQUIRED"

    restore_request = await client.post(
        f"{base}/restrictions/{restriction_id}/revocation-request",
        headers={
            **auth_headers(super_admin),
            "If-Match": "2",
            "Idempotency-Key": f"restriction-restore-request-{uuid.uuid4()}",
        },
        json={
            "reason": "Restore speaker access after security containment is complete.",
            "case_reference": "SEC-2001",
        },
    )
    assert restore_request.status_code == 202, restore_request.text
    assert restore_request.json()["version"] == 3
    self_restore = await client.post(
        f"{base}/restrictions/{restriction_id}/revocation-decision",
        headers={
            **auth_headers(super_admin),
            "If-Match": "3",
            "Idempotency-Key": f"restriction-self-restore-{uuid.uuid4()}",
        },
        json={
            "decision": "APPROVED",
            "reason": "Attempt to approve the restore request that I submitted.",
        },
    )
    assert self_restore.status_code == 409
    restore_key = f"restriction-restore-approval-{uuid.uuid4()}"
    restore_payload = {
        "decision": "APPROVED",
        "reason": "Independently verified the incident closure evidence.",
    }
    restored = await client.post(
        f"{base}/restrictions/{restriction_id}/revocation-decision",
        headers={
            **auth_headers(approver),
            "If-Match": "3",
            "Idempotency-Key": restore_key,
        },
        json=restore_payload,
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["status"] == "REVOKED"
    assert restored.json()["revocation_status"] == "APPROVED"
    replayed = await client.post(
        f"{base}/restrictions/{restriction_id}/revocation-decision",
        headers={
            **auth_headers(approver),
            "If-Match": "3",
            "Idempotency-Key": restore_key,
        },
        json=restore_payload,
    )
    assert replayed.status_code == 200
    assert replayed.json() == restored.json()


@pytest.mark.asyncio
async def test_usage_adjustment_cannot_bypass_or_reuse_dual_approval(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    approver = User(organization_id=organization.id, email=f"usage-approver-{uuid.uuid4().hex[:8]}@test.com", password_hash="not-used", first_name="Usage", last_name="Approver", role="super_admin", is_active=True)
    db.add(approver); await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    missing = await client.post(f"{base}/usage/adjustments", headers={**auth_headers(super_admin), "Idempotency-Key": f"usage-{uuid.uuid4()}"}, json={"approved_request_id": str(uuid.uuid4()), "event_id": str(event.id), "metric_key": "emails", "quantity": 1000, "unit": "count", "reason": "Apply the approved email usage allocation."})
    assert missing.status_code == 409
    requested = await client.post(f"{base}/override-requests", headers={**auth_headers(super_admin), "Idempotency-Key": f"usage-request-{uuid.uuid4()}"}, json={"event_id": str(event.id), "entitlement_key": "usage.emails", "operation": "INCREMENT", "requested_value": {"quantity": 1000, "unit": "count"}, "reason": "Request additional email usage for the event.", "case_reference": "SUP-2002"})
    request_id = requested.json()["id"]
    approved = await client.post(
        f"{base}/override-requests/{request_id}/decision",
        headers={
            **auth_headers(approver),
            "If-Match": "1",
            "Idempotency-Key": f"usage-request-approval-{uuid.uuid4()}",
        },
        json={"decision": "APPROVED", "reason": "Verified the additional email allocation."},
    )
    assert approved.status_code == 200
    payload = {"approved_request_id": request_id, "event_id": str(event.id), "metric_key": "emails", "quantity": 1000, "unit": "count", "reason": "Apply the independently approved email allocation."}
    apply_key = f"usage-apply-{uuid.uuid4()}"
    applied = await client.post(f"{base}/usage/adjustments", headers={**auth_headers(super_admin), "Idempotency-Key": apply_key}, json=payload)
    assert applied.status_code == 201, applied.text
    replayed = await client.post(f"{base}/usage/adjustments", headers={**auth_headers(super_admin), "Idempotency-Key": apply_key}, json=payload)
    assert replayed.status_code == 201
    assert replayed.json() == applied.json()
    reused = await client.post(f"{base}/usage/adjustments", headers={**auth_headers(super_admin), "Idempotency-Key": f"usage-reuse-{uuid.uuid4()}"}, json=payload)
    assert reused.status_code == 409


@pytest.mark.asyncio
async def test_financial_adjustment_requires_independent_approval(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    super_admin: User,
):
    approver = User(organization_id=organization.id, email=f"finance-approver-{uuid.uuid4().hex[:8]}@test.com", password_hash="not-used", first_name="Finance", last_name="Approver", role="super_admin", is_active=True)
    db.add(approver); await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    created = await client.post(f"{base}/financial-adjustments", headers={**auth_headers(super_admin), "Idempotency-Key": f"financial-{uuid.uuid4()}"}, json={"adjustment_type": "CREDIT", "amount": 500, "currency": "INR", "reason": "Customer service credit approved by the account owner.", "case_reference": "SUP-3003", "details": {"source": "CREDIT_WALLET"}})
    assert created.status_code == 201, created.text
    adjustment_id = created.json()["id"]
    self_approval = await client.post(
        f"{base}/financial-adjustments/{adjustment_id}/decision",
        headers={
            **auth_headers(super_admin),
            "If-Match": "1",
            "Idempotency-Key": f"financial-self-approval-{uuid.uuid4()}",
        },
        json={"decision": "APPROVED", "reason": "Attempt to approve the requested credit."},
    )
    assert self_approval.status_code == 409
    financial_decision_key = f"financial-approval-{uuid.uuid4()}"
    financial_decision_payload = {
        "decision": "APPROVED",
        "reason": "Verified the customer service credit evidence.",
    }
    approved = await client.post(
        f"{base}/financial-adjustments/{adjustment_id}/decision",
        headers={
            **auth_headers(approver),
            "If-Match": "1",
            "Idempotency-Key": financial_decision_key,
        },
        json=financial_decision_payload,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"
    approved_replay = await client.post(
        f"{base}/financial-adjustments/{adjustment_id}/decision",
        headers={
            **auth_headers(approver),
            "If-Match": "1",
            "Idempotency-Key": financial_decision_key,
        },
        json=financial_decision_payload,
    )
    assert approved_replay.status_code == 200
    assert approved_replay.json() == approved.json()
    stale_decision = await client.post(
        f"{base}/financial-adjustments/{adjustment_id}/decision",
        headers={
            **auth_headers(approver),
            "If-Match": "1",
            "Idempotency-Key": f"financial-stale-{uuid.uuid4()}",
        },
        json=financial_decision_payload,
    )
    assert stale_decision.status_code == 412
    listed = await client.get(f"{base}/financial-adjustments", headers=auth_headers(super_admin))
    assert listed.status_code == 200
    assert listed.json()["items"][0]["id"] == adjustment_id
    assert listed.json()["items"][0]["effective_at"] is not None


@pytest.mark.asyncio
async def test_registration_workspace_masks_pii_and_requires_scoped_privileged_session(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    registration = ParticipantRegistration(event_id=event.id, registration_status="submitted", registration_data={"name": "Ada Lovelace", "email": "ada@example.com", "phone": "+911234567890", "company": "Analytical Engines", "custom_fields": {"diet": "private"}})
    db.add(registration); await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    workspace = f"{base}/events/{event.id}/workspace/registrations"
    masked = await client.get(workspace, headers=auth_headers(super_admin))
    assert masked.status_code == 200, masked.text
    item = masked.json()["items"][0]
    assert item["registration_data"]["name"] == "A***"
    assert item["registration_data"]["email"] == "a***@example.com"
    assert item["registration_data"]["phone"] == "***7890"
    assert "custom_fields" not in item["registration_data"]
    denied = await client.get(f"{workspace}?include_sensitive=true", headers=auth_headers(super_admin))
    assert denied.status_code == 403
    access = await client.post(f"{base}/privileged-access-sessions", headers=auth_headers(super_admin), json={"reason": "Investigate the registration support case.", "case_reference": "SUP-4004", "field_categories": ["IDENTITY", "CONTACT"], "duration_minutes": 15})
    assert access.status_code == 201, access.text
    unmasked = await client.get(f"{workspace}?include_sensitive=true", headers={**auth_headers(super_admin), "X-Privileged-Access-Session": access.json()["id"]})
    assert unmasked.status_code == 200, unmasked.text
    assert unmasked.json()["items"][0]["registration_data"]["email"] == "ada@example.com"
    revoked = await client.delete(f"{base}/privileged-access-sessions/{access.json()['id']}", headers=auth_headers(super_admin))
    assert revoked.status_code == 200
    denied_after_revoke = await client.get(f"{workspace}?include_sensitive=true", headers={**auth_headers(super_admin), "X-Privileged-Access-Session": access.json()["id"]})
    assert denied_after_revoke.status_code == 403


@pytest.mark.asyncio
async def test_event_domain_workspaces_mask_contacts_and_never_expose_secrets(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    speaker = Speaker(event_id=event.id, first_name="Grace", last_name="Hopper", email="grace@example.com", phone="+15551234567", upload_token=f"token-{uuid.uuid4()}", speaker_code=uuid.uuid4().hex[:10], upload_status="pending")
    webhook = Webhook(event_id=event.id, url="https://example.com/event-hook", description="Event delivery", subscribed_events=["speaker.created"], secret_hash="a" * 64, status="active")
    db.add_all([speaker, webhook]); await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console/events/{event.id}/workspace"
    speakers = await client.get(f"{base}/speakers", headers=auth_headers(super_admin))
    assert speakers.status_code == 200, speakers.text
    item = speakers.json()["data"]["items"][0]
    assert item["first_name"] == "G***"
    assert item["email"] == "g***@example.com"
    assert "upload_token" not in item and "speaker_code" not in item
    integrations = await client.get(f"{base}/integrations", headers=auth_headers(super_admin))
    assert integrations.status_code == 200
    hook = integrations.json()["data"]["webhooks"][0]
    assert hook["secret_configured"] is True
    assert "secret_hash" not in hook
    overview = await client.get(f"{base}/overview", headers=auth_headers(super_admin))
    assert overview.status_code == 200
    assert overview.json()["data"]["counts"]["speakers"] == 1


@pytest.mark.asyncio
async def test_event_workspace_mutation_is_audited_soft_deleted_and_restorable(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    await activate_event_for_test(db, event)
    speaker = Speaker(event_id=event.id, first_name="Katherine", last_name="Johnson", email="katherine@example.com", upload_token=f"token-{uuid.uuid4()}", speaker_code=uuid.uuid4().hex[:10], upload_status="pending")
    db.add(speaker); await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console/events/{event.id}/workspace/speakers/{speaker.id}"
    updated = await client.patch(base, headers=auth_headers(super_admin), json={"data": {"designation": "Lead Mathematician"}, "reason": "Correct the speaker designation from the support case.", "case_reference": "SUP-5005"})
    assert updated.status_code == 200, updated.text
    assert "designation" in updated.json()["updated"]
    archived = await client.request("DELETE", base, headers=auth_headers(super_admin), json={"reason": "Archive the duplicate speaker record safely.", "case_reference": "SUP-5005"})
    assert archived.status_code == 200, archived.text
    assert archived.json() == {"id": str(speaker.id), "outcome": "SOFT_DELETED", "recoverable": True}
    await db.refresh(speaker)
    assert speaker.deleted_at is not None and speaker.deleted_by == super_admin.id
    workspace_url = f"/api/v1/platform/organizations/{organization.id}/console/events/{event.id}/workspace/speakers"
    active_only = await client.get(workspace_url, headers=auth_headers(super_admin))
    assert active_only.status_code == 200
    assert all(item["id"] != str(speaker.id) for item in active_only.json()["data"]["items"])
    with_archived = await client.get(f"{workspace_url}?include_archived=true", headers=auth_headers(super_admin))
    assert with_archived.status_code == 200
    archived_item = next(item for item in with_archived.json()["data"]["items"] if item["id"] == str(speaker.id))
    assert archived_item["lifecycle_state"] == "archived"
    assert archived_item["deleted_at"] is not None
    restored = await client.post(f"{base}/restore", headers={**auth_headers(super_admin), "Idempotency-Key": "restore-speaker-5005"}, json={"reason": "Restore the speaker after duplicate review.", "case_reference": "SUP-5005"})
    assert restored.status_code == 200, restored.text
    await db.refresh(speaker)
    assert speaker.deleted_at is None and speaker.deleted_by is None
    audit = await db.scalar(select(AuditLog).where(AuditLog.resource_id == speaker.id, AuditLog.action_type == "EVENT_SPEAKER_RESTORED"))
    assert audit is not None


@pytest.mark.asyncio
async def test_metering_is_idempotent_reset_preserves_history_and_reconciles(
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    first = Speaker(event_id=event.id, first_name="Meter", last_name="One", email=f"meter-{uuid.uuid4()}@example.com", upload_token=f"token-{uuid.uuid4()}", speaker_code=uuid.uuid4().hex[:10], upload_status="pending")
    db.add(first)
    await db.flush()
    entry, created = await MeteringService.record(db, organization_id=organization.id, event_id=event.id, metric_key="speakers", quantity=1, unit="count", source="test.speaker", idempotency_key="meter-speaker-one", actor_user_id=super_admin.id)
    retried, retry_created = await MeteringService.record(db, organization_id=organization.id, event_id=event.id, metric_key="speakers", quantity=1, unit="count", source="test.speaker", idempotency_key="meter-speaker-one", actor_user_id=super_admin.id)
    assert created is True and retry_created is False and retried.id == entry.id
    value, first_epoch, _ = await MeteringService.current_value(db, organization.id, event.id, "speakers")
    assert value == 1 and first_epoch is not None
    initial_reconciliation = await MeteringService.reconcile_event(db, organization.id, event.id)
    speakers_result = next(row for row in initial_reconciliation if row.metric_key == "speakers")
    assert speakers_result.status == "MATCHED" and speakers_result.drift == 0

    reset_epoch = await MeteringService.reset(db, organization_id=organization.id, event_id=event.id, metric_key="speakers", unit="count", reason="Reset the speaker allowance for the new commercial period.", idempotency_key="meter-speaker-reset", actor_user_id=super_admin.id)
    repeated_reset = await MeteringService.reset(db, organization_id=organization.id, event_id=event.id, metric_key="speakers", unit="count", reason="Reset the speaker allowance for the new commercial period.", idempotency_key="meter-speaker-reset", actor_user_id=super_admin.id)
    assert repeated_reset.id == reset_epoch.id
    value, active_epoch, _ = await MeteringService.current_value(db, organization.id, event.id, "speakers")
    assert value == 0 and active_epoch.id == reset_epoch.id and active_epoch.sequence == first_epoch.sequence + 1
    assert active_epoch.baseline_value == 1
    assert await UsageService.get_effective_event_metric(db, event.id, "max_speakers") == 0

    second = Speaker(event_id=event.id, first_name="Meter", last_name="Two", email=f"meter-{uuid.uuid4()}@example.com", upload_token=f"token-{uuid.uuid4()}", speaker_code=uuid.uuid4().hex[:10], upload_status="pending")
    db.add(second)
    await db.flush()
    assert await UsageService.get_effective_event_metric(db, event.id, "max_speakers") == 1
    await MeteringService.record(db, organization_id=organization.id, event_id=event.id, metric_key="speakers", quantity=1, unit="count", source="test.speaker", idempotency_key="meter-speaker-two", actor_user_id=super_admin.id)
    final_reconciliation = await MeteringService.reconcile_event(db, organization.id, event.id)
    speakers_result = next(row for row in final_reconciliation if row.metric_key == "speakers")
    assert speakers_result.status == "MATCHED"
    assert speakers_result.ledger_value == speakers_result.authoritative_value == 1

    await MeteringService.record(
        db,
        organization_id=organization.id,
        event_id=event.id,
        metric_key="speakers",
        quantity=1,
        unit="count",
        source="test.intentional_drift",
        idempotency_key="meter-speaker-intentional-drift",
        actor_user_id=super_admin.id,
    )
    drifted = await MeteringService.reconcile_event(db, organization.id, event.id)
    drifted_speakers = next(row for row in drifted if row.metric_key == "speakers")
    assert drifted_speakers.status == "DRIFTED" and drifted_speakers.drift == 1
    diagnostic = await db.scalar(
        select(CapabilityDiagnosticEvent).where(
            CapabilityDiagnosticEvent.organization_id == organization.id,
            CapabilityDiagnosticEvent.event_id == event.id,
            CapabilityDiagnosticEvent.event_type == "METERING_DRIFT",
            CapabilityDiagnosticEvent.limit_key == "max_speakers",
        )
    )
    assert diagnostic is not None
    assert diagnostic.metadata_json["drift"] == 1


@pytest.mark.asyncio
async def test_event_communications_and_templates_are_mutable_recoverable_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
    monkeypatch: pytest.MonkeyPatch,
):
    await activate_event_for_test(db, event)
    db.add(Speaker(event_id=event.id, first_name="Recipient", last_name="Speaker", email="recipient@example.com", upload_token=f"token-{uuid.uuid4()}", speaker_code=uuid.uuid4().hex[:10], upload_status="pending"))
    await db.flush()
    dispatched: list[tuple[str, str, str | None]] = []
    monkeypatch.setattr("app.modules.notifications.tasks.email_tasks.process_email_campaign.delay", lambda campaign_id, org_id, reservation_id=None: dispatched.append((campaign_id, org_id, reservation_id)))
    base = f"/api/v1/platform/organizations/{organization.id}/console/events/{event.id}/workspace"
    template = await client.post(f"{base}/templates", headers={**auth_headers(super_admin), "Idempotency-Key": f"workspace-{uuid.uuid4()}"}, json={"data": {"kind": "email", "name": "Operational update", "template_type": "custom", "target_type": "speaker", "subject": "Event update", "body_html": "<p>Hello {{first_name}}</p>"}, "reason": "Create the event communication template for operations.", "case_reference": "OPS-7001"})
    assert template.status_code == 201, template.text
    template_id = template.json()["id"]
    campaign = await client.post(f"{base}/communications", headers={**auth_headers(super_admin), "Idempotency-Key": f"workspace-{uuid.uuid4()}"}, json={"data": {"template_id": template_id, "name": "Operational update", "recipient_filter": "all", "target_type": "speaker"}, "reason": "Create the reviewed operational communication campaign.", "case_reference": "OPS-7001"})
    assert campaign.status_code == 201, campaign.text
    campaign_id = campaign.json()["id"]
    sent = await client.post(f"{base}/communications/{campaign_id}/actions", headers={**auth_headers(super_admin), "Idempotency-Key": f"action-{uuid.uuid4()}"}, json={"action": "SEND", "reason": "Dispatch the reviewed event operational update now.", "case_reference": "OPS-7001", "data": {}})
    assert sent.status_code == 200, sent.text
    assert sent.json()["status"] == "sending"
    assert dispatched and dispatched[0][:2] == (campaign_id, str(organization.id))
    assert dispatched[0][2]

    archived = await client.request("DELETE", f"{base}/templates/{template_id}", headers=auth_headers(super_admin), json={"reason": "Archive the superseded communication template safely.", "case_reference": "OPS-7001"})
    assert archived.status_code == 200 and archived.json()["recoverable"] is True
    visible = await client.get(f"{base}/templates?include_archived=true", headers=auth_headers(super_admin))
    item = next(item for item in visible.json()["data"]["email_templates"] if item["id"] == template_id)
    assert item["lifecycle_state"] == "archived"
    restored = await client.post(f"{base}/templates/{template_id}/restore", headers={**auth_headers(super_admin), "Idempotency-Key": "restore-template-7001"}, json={"reason": "Restore the communication template after review.", "case_reference": "OPS-7001"})
    assert restored.status_code == 200 and restored.json()["outcome"] == "RESTORED"


@pytest.mark.asyncio
async def test_ticket_checkin_and_event_user_actions_share_scoped_domain_rules(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    organizer: User,
    super_admin: User,
):
    await activate_event_for_test(db, event)
    session = Session(event_id=event.id, session_code=f"CHK-{uuid.uuid4().hex[:6]}", name="Check-in session", start_time=event.start_date, end_time=event.end_date)
    participant = Participant(event_id=event.id, first_name="Event", last_name="Attendee", email=f"attendee-{uuid.uuid4().hex[:8]}@example.com")
    db.add_all([session, participant]); await db.flush()
    base = f"/api/v1/platform/organizations/{organization.id}/console/events/{event.id}/workspace"
    reason = "Apply the reviewed event administration change."

    pricing = await client.post(f"{base}/tickets/{event.id}/actions", headers={**auth_headers(super_admin), "Idempotency-Key": f"action-{uuid.uuid4()}"}, json={"action": "SET_PRICING", "reason": reason, "case_reference": "OPS-8001", "data": {"tiers": ["Standard"], "pricing_data": {"Delegate_Standard": 1250}}})
    assert pricing.status_code == 200, pricing.text
    assert pricing.json()["pricing_data"] == {"Delegate_Standard": 1250.0}
    ticket = await db.scalar(select(TicketType).where(TicketType.event_id == event.id))
    assert ticket and ticket.role_name == "Delegate" and ticket.price == 1250

    checked_in = await client.post(f"{base}/checkins/{participant.id}/actions", headers={**auth_headers(super_admin), "Idempotency-Key": f"action-{uuid.uuid4()}"}, json={"action": "CHECK_IN", "reason": reason, "case_reference": "OPS-8001", "data": {"session_id": str(session.id)}})
    assert checked_in.status_code == 200, checked_in.text
    repeated = await client.post(f"{base}/checkins/{participant.id}/actions", headers={**auth_headers(super_admin), "Idempotency-Key": f"action-{uuid.uuid4()}"}, json={"action": "CHECK_IN", "reason": reason, "case_reference": "OPS-8001", "data": {"session_id": str(session.id)}})
    assert repeated.status_code == 200 and repeated.json()["outcome"] == "ALREADY_CHECKED_IN"
    checkin_id = checked_in.json()["id"]
    removed = await client.post(f"{base}/checkins/{checkin_id}/actions", headers={**auth_headers(super_admin), "Idempotency-Key": f"action-{uuid.uuid4()}"}, json={"action": "REMOVE_CHECK_IN", "reason": reason, "case_reference": "OPS-8001", "data": {}})
    assert removed.status_code == 200 and removed.json()["outcome"] == "REMOVED"
    assert await db.get(CheckIn, uuid.UUID(checkin_id)) is None

    assigned = await client.post(f"{base}/users/{organizer.id}/actions", headers={**auth_headers(super_admin), "Idempotency-Key": f"action-{uuid.uuid4()}"}, json={"action": "ASSIGN_USER", "reason": reason, "case_reference": "OPS-8001", "data": {"permissions": {"can_edit_sessions": True}}})
    assert assigned.status_code == 200, assigned.text
    assignment = await db.scalar(select(UserEventAssignment).where(UserEventAssignment.user_id == organizer.id, UserEventAssignment.event_id == event.id))
    assert assignment and assignment.permissions["can_edit_sessions"] is True
    unassigned = await client.post(f"{base}/users/{organizer.id}/actions", headers={**auth_headers(super_admin), "Idempotency-Key": f"action-{uuid.uuid4()}"}, json={"action": "UNASSIGN_USER", "reason": reason, "case_reference": "OPS-8001", "data": {}})
    assert unassigned.status_code == 200 and unassigned.json()["outcome"] == "UNASSIGNED"

    audit = await db.scalar(select(AuditLog).where(AuditLog.organization_id == organization.id, AuditLog.action_type == "EVENT_USERS_UNASSIGN_USER"))
    assert audit is not None


@pytest.mark.asyncio
async def test_cross_domain_search_is_masked_cursor_paginated_and_tenant_scoped(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    from datetime import date
    local = Speaker(event_id=event.id, first_name="Searchable", last_name="Person", email="searchable@tenant-a.test", upload_token=f"token-{uuid.uuid4()}", speaker_code=uuid.uuid4().hex[:10], upload_status="pending")
    other_org = Organization(name="Search Other", slug=f"search-other-{uuid.uuid4().hex[:8]}")
    db.add(other_org); await db.flush()
    other_user = User(organization_id=other_org.id, email=f"owner-{uuid.uuid4().hex[:8]}@other.test", password_hash="not-used", first_name="Other", last_name="Owner", role="organizer", is_active=True)
    db.add(other_user); await db.flush()
    other_event = Event(organization_id=other_org.id, created_by=other_user.id, name="Other Event", short_code=f"OE{uuid.uuid4().hex[:4]}", start_date=date(2026, 10, 1), end_date=date(2026, 10, 2), timezone="UTC", status="draft")
    db.add(other_event); await db.flush()
    leaked = Speaker(event_id=other_event.id, first_name="Searchable", last_name="Leak", email="searchable@tenant-b.test", upload_token=f"token-{uuid.uuid4()}", speaker_code=uuid.uuid4().hex[:10], upload_status="pending")
    db.add_all([local, leaked]); await db.flush()

    base = f"/api/v1/platform/organizations/{organization.id}/console/search"
    response = await client.get(f"{base}?q=Searchable&domains=speakers&limit=1", headers=auth_headers(super_admin))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] == str(local.id)
    assert body["items"][0]["subtitle"] == "s***@tenant-a.test"
    assert "tenant-b" not in response.text
    cross_tenant = await client.get(f"{base}?q=Other&event_id={other_event.id}", headers=auth_headers(super_admin))
    assert cross_tenant.status_code == 404


@pytest.mark.asyncio
async def test_console_export_is_idempotent_tenant_scoped_and_dispatched_as_job(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
    monkeypatch: pytest.MonkeyPatch,
):
    dispatched: list[tuple[str, dict]] = []
    monkeypatch.setattr("app.modules.platform.organization_console_router.celery_app.send_task", lambda name, kwargs: dispatched.append((name, kwargs)))
    base = f"/api/v1/platform/organizations/{organization.id}/console/exports"
    headers = {**auth_headers(super_admin), "Idempotency-Key": f"console-export-{uuid.uuid4()}"}
    payload = {"domains": ["events", "speakers", "audit"], "event_id": str(event.id), "include_sensitive": False, "reason": "Export event administration records for case review.", "case_reference": "OPS-9001"}
    created = await client.post(base, headers=headers, json=payload)
    assert created.status_code == 202, created.text
    assert created.json()["status"] == "QUEUED"
    repeated = await client.post(base, headers=headers, json=payload)
    assert repeated.status_code == 202 and repeated.json()["id"] == created.json()["id"]
    assert len(dispatched) == 1 and dispatched[0][0] == "workers.tasks.report_tasks.generate_organization_console_export"
    row = await db.get(DataExport, uuid.UUID(created.json()["id"]))
    assert row and row.organization_id == organization.id and row.event_id == event.id and row.source_type == "organization_console_export"
    listed = await client.get(base, headers=auth_headers(super_admin))
    assert listed.status_code == 200 and listed.json()[0]["id"] == created.json()["id"]


@pytest.mark.asyncio
async def test_privacy_retention_and_legal_hold_workflow_is_versioned_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    super_admin: User,
):
    base = f"/api/v1/platform/organizations/{organization.id}/console/governance"
    retention = await client.put(f"{base}/retention-policies", headers=auth_headers(super_admin), json={"data_category": "attendee_identity", "retention_days": 365, "disposition_action": "ANONYMIZE", "is_enabled": True, "reason": "Apply the approved attendee retention schedule."})
    assert retention.status_code == 200, retention.text
    stale = await client.put(f"{base}/retention-policies", headers=auth_headers(super_admin), json={"data_category": "attendee_identity", "retention_days": 180, "disposition_action": "ANONYMIZE", "is_enabled": True, "version": 999, "reason": "Attempt a stale retention policy update."})
    assert stale.status_code == 412

    privacy = await client.post(f"{base}/privacy-requests", headers=auth_headers(super_admin), json={"request_type": "ERASURE", "subject_reference": "person@example.test", "due_at": (datetime.now(timezone.utc) + timedelta(days=20)).isoformat(), "reason": "Record the verified privacy erasure request.", "case_reference": "PRIV-1001"})
    assert privacy.status_code == 201, privacy.text
    privacy_id = privacy.json()["id"]
    version = privacy.json()["version"]
    for target in ("IDENTITY_VERIFIED", "IN_PROGRESS"):
        changed = await client.patch(f"{base}/privacy-requests/{privacy_id}", headers=auth_headers(super_admin), json={"status": target, "version": version, "reason": f"Advance the privacy request to {target.lower()} after review.", "case_reference": "PRIV-1001"})
        assert changed.status_code == 200, changed.text
        version = changed.json()["version"]

    hold = await client.post(f"{base}/legal-holds", headers=auth_headers(super_admin), json={"name": "Litigation preservation", "scope": {"data_categories": ["attendee_identity"]}, "reason": "Preserve attendee identity records for active litigation."})
    assert hold.status_code == 201, hold.text
    blocked = await client.patch(f"{base}/privacy-requests/{privacy_id}", headers=auth_headers(super_admin), json={"status": "COMPLETED", "version": version, "result_reference": "privacy/results/1001", "reason": "Attempt completion after the erasure processing run.", "case_reference": "PRIV-1001"})
    assert blocked.status_code == 409
    released = await client.post(f"{base}/legal-holds/{hold.json()['id']}/release", headers=auth_headers(super_admin), json={"reason": "Release the hold after written legal confirmation."})
    assert released.status_code == 200
    completed = await client.patch(f"{base}/privacy-requests/{privacy_id}", headers=auth_headers(super_admin), json={"status": "COMPLETED", "version": version, "result_reference": "privacy/results/1001", "reason": "Complete erasure after legal hold release and review.", "case_reference": "PRIV-1001"})
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "COMPLETED"
    audit = await db.scalar(select(AuditLog).where(AuditLog.organization_id == organization.id, AuditLog.action_type == "LEGAL_HOLD_RELEASED"))
    assert audit is not None


@pytest.mark.asyncio
async def test_organization_api_keys_and_integration_connections_are_governed_and_idempotent(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    await activate_event_for_test(db, event)
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    key_headers = {**auth_headers(super_admin), "Idempotency-Key": f"org-api-key-{uuid.uuid4()}"}
    key_payload = {"name": "Operations automation", "expires_in_days": 30, "reason": "Issue a scoped key for approved operations automation.", "case_reference": "DEV-1001"}
    created = await client.post(f"{base}/api-keys", headers=key_headers, json=key_payload)
    assert created.status_code == 201, created.text
    assert created.json()["plaintext_key"].startswith("evx_live_") and created.json()["secret_available"] is True
    repeated = await client.post(f"{base}/api-keys", headers=key_headers, json=key_payload)
    assert repeated.status_code == 201 and repeated.json()["id"] == created.json()["id"]
    assert repeated.json()["plaintext_key"] is None and repeated.json()["secret_available"] is False
    key_conflict = await client.post(f"{base}/api-keys", headers=key_headers, json={**key_payload, "name": "Different automation"})
    assert key_conflict.status_code == 409 and key_conflict.json()["detail"] == "IDEMPOTENCY_CONFLICT"
    revoked = await client.post(f"{base}/api-keys/{created.json()['id']}/revoke", headers=auth_headers(super_admin), json={"reason": "Revoke the key after the automation handoff ended."})
    assert revoked.status_code == 200 and revoked.json()["is_active"] is False
    key = await db.get(ApiKey, uuid.UUID(created.json()["id"]))
    assert key and key.key_hash != created.json()["plaintext_key"] and key.is_active is False

    provider = IntegrationProvider(name=f"Provider {uuid.uuid4().hex[:8]}", description="Test global provider")
    db.add(provider); await db.flush()
    connection_headers = {**auth_headers(super_admin), "Idempotency-Key": f"org-integration-{uuid.uuid4()}"}
    connection_payload = {"provider_id": str(provider.id), "reason": "Connect the approved organization integration provider.", "case_reference": "DEV-1002"}
    connected = await client.post(f"{base}/integrations/connections", headers=connection_headers, json=connection_payload)
    assert connected.status_code == 201, connected.text
    repeated_connection = await client.post(f"{base}/integrations/connections", headers=connection_headers, json=connection_payload)
    assert repeated_connection.status_code == 201 and repeated_connection.json()["id"] == connected.json()["id"]
    connection_conflict = await client.post(f"{base}/integrations/connections", headers=connection_headers, json={**connection_payload, "case_reference": "DEV-DIFFERENT"})
    assert connection_conflict.status_code == 409 and connection_conflict.json()["detail"] == "IDEMPOTENCY_CONFLICT"
    paused = await client.patch(f"{base}/integrations/connections/{connected.json()['id']}", headers={**auth_headers(super_admin), "If-Match": "1"}, json={"is_active": False, "reason": "Pause the connection during provider incident review.", "case_reference": "DEV-1002"})
    assert paused.status_code == 200 and paused.json()["is_active"] is False and paused.json()["version"] == 2
    stale = await client.patch(f"{base}/integrations/connections/{connected.json()['id']}", headers={**auth_headers(super_admin), "If-Match": "1"}, json={"is_active": True, "reason": "Attempt a stale concurrent integration status update.", "case_reference": "DEV-1002"})
    assert stale.status_code == 409 and stale.json()["detail"] == "VERSION_CONFLICT"
    connection = await db.get(IntegrationConnection, uuid.UUID(connected.json()["id"]))
    assert connection and connection.organization_id == organization.id and connection.is_active is False
