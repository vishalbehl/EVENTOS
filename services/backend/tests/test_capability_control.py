import ast
import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.billing.capability_registry import (
    CATALOG_LIMIT_KEYS,
    FEATURE_DEFINITIONS,
    LIMIT_DEFINITIONS,
    LIMIT_ENFORCEMENT_SITES,
    MUTATION_CONTROL_EXEMPTIONS,
    OPERATION_FEATURES,
    OPERATION_ENFORCEMENT_SITES,
    OPERATION_PERMISSIONS,
    PLATFORM_HARD_CEILINGS,
    PORTAL_LIMIT_CONTROL_SITES,
    REGISTRATION_CAPABILITY_KEYS,
    feature_for_operation,
    registry_coverage,
)
from app.modules.billing.models.subscription import (
    Addon,
    AddonFeature,
    OrganizationAddon,
    OrganizationSubscription,
    PlanFeature,
    SubscriptionPlan,
)
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.billing.services.capability_cache_service import CapabilityCacheService
from app.modules.billing.services.event_entitlement_service import EventEntitlementService
from app.modules.billing.services.platform_flag_service import PlatformFlagService
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.events.models.event import Event
from app.modules.files.models.file import DurableUpload
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization_console import (
    CapabilityRestriction,
    EventCommercialContract,
    UsageLedgerEntry,
    UsageReservation,
)
from app.modules.platform.models.platform_domain_tables import FeatureFlag
from app.modules.rbac.models.rbac import UserAccessNode
from app.modules.rbac.routers import events as events_router
from app.modules.registration.routers import registration_portal as registration_portal_router
from tests.conftest import activate_event_for_test, auth_headers


async def enable_canonical_entitlements_for_test(
    db: AsyncSession, organization_id: uuid.UUID
) -> None:
    """Tests that hand-build contracts must opt into canonical enforcement."""
    db.add(
        FeatureFlag(
            organization_id=organization_id,
            flag_key="organizer_console_entitlement_enforce",
            is_enabled=True,
        )
    )
    await db.flush()


@pytest.mark.asyncio
async def test_organizer_cannot_apply_plan_directly(
    client: AsyncClient,
    event: Event,
    organizer: User,
):
    response = await client.post(
        f"/events/{event.id}/apply-plan",
        headers=auth_headers(organizer),
        json={"plan_name": "Enterprise", "addon_keys": []},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "COMMAND_CENTER_APPROVAL_REQUIRED"


@pytest.mark.asyncio
async def test_legacy_superadmin_boolean_override_cannot_bypass_approval(
    client: AsyncClient,
    organization: Organization,
    super_admin: User,
):
    response = await client.put(
        f"/superadmin/organisations/{organization.id}/feature-overrides",
        headers=auth_headers(super_admin),
        json={"feature_key": "FEAT_API_ACCESS", "override": True},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "COMMAND_CENTER_APPROVAL_REQUIRED"


@pytest.mark.asyncio
async def test_event_delete_is_recoverable_and_bulk_clear_requires_command_center(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    db.add(
        EventCommercialContract(
            organization_id=event.organization_id,
            event_id=event.id,
            version=1,
            status="ACTIVE",
            plan_key="LIFECYCLE_TEST",
            plan_version="1",
            currency="INR",
            entitlements={
                "FEAT_EVENT_PLANNING": {"type": "BOOLEAN", "value": True},
            },
            hard_ceilings={},
            addons=[],
            source={"type": "TEST"},
            created_by=organizer.id,
        )
    )
    await db.flush()
    await enable_canonical_entitlements_for_test(db, event.organization_id)

    clear_response = await client.post(
        f"/events/{event.id}/clear-data",
        headers=auth_headers(organizer),
    )
    assert clear_response.status_code == 409
    assert (
        clear_response.json()["detail"]["code"]
        == "COMMAND_CENTER_LIFECYCLE_JOB_REQUIRED"
    )

    response = await client.delete(
        f"/events/{event.id}",
        headers={
            **auth_headers(organizer),
            "X-Change-Reason": "Archive event while retaining its recovery window.",
            "Idempotency-Key": f"event-soft-delete-{uuid.uuid4()}",
        },
    )
    assert response.status_code == 200, response.text
    await db.refresh(event)
    assert event.deleted_at is not None
    assert event.deleted_by == organizer.id
    assert event.status == "archived"


@pytest.mark.asyncio
async def test_branding_upload_reserves_and_meters_storage_atomically(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
    monkeypatch,
):
    db.add(
        EventCommercialContract(
            organization_id=event.organization_id,
            event_id=event.id,
            version=1,
            status="ACTIVE",
            plan_key="UPLOAD_TEST",
            plan_version="1",
            currency="INR",
            entitlements={
                "FEAT_LOGO_BRANDING": {"type": "TIER", "value": "ADVANCED"},
                "storage_quota_mb": {"type": "LIMIT", "value": 5},
            },
            hard_ceilings={},
            addons=[],
            source={"type": "TEST"},
            created_by=organizer.id,
        )
    )
    await db.flush()
    await enable_canonical_entitlements_for_test(db, event.organization_id)
    monkeypatch.setattr(
        events_router._upload_service,
        "upload_bytes",
        lambda **_: None,
    )

    contents = b"brand-image"
    response = await client.post(
        f"/events/{event.id}/branding/upload",
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"branding-upload-{uuid.uuid4()}",
        },
        data={"field": "logo"},
        files={"file": ("logo.png", contents, "image/png")},
    )
    assert response.status_code == 200, response.text
    reservation = await db.scalar(
        select(UsageReservation).where(
            UsageReservation.event_id == event.id,
            UsageReservation.metric_key == "storage_quota_mb",
        )
    )
    assert reservation is not None
    assert reservation.status == "CONSUMED"
    ledger = await db.get(UsageLedgerEntry, reservation.consumed_entry_id)
    assert ledger is not None
    assert ledger.metric_key == "storage_bytes"
    assert ledger.quantity == len(contents)


@pytest.mark.asyncio
async def test_public_registration_upload_is_gated_metered_and_replay_safe(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
    monkeypatch,
):
    db.add(
        EventCommercialContract(
            organization_id=event.organization_id,
            event_id=event.id,
            version=1,
            status="ACTIVE",
            plan_key="PUBLIC_UPLOAD_TEST",
            plan_version="1",
            currency="INR",
                entitlements={
                    "FEAT_REGISTRATION_PORTAL": {"type": "BOOLEAN", "value": True},
                    "FEAT_REGISTRATION_FORMS": {"type": "TIER", "value": "CUSTOM"},
                    "storage_quota_mb": {"type": "LIMIT", "value": 5},
                },
            hard_ceilings={},
            addons=[],
            source={"type": "TEST"},
            created_by=organizer.id,
        )
    )
    await db.flush()
    await enable_canonical_entitlements_for_test(db, event.organization_id)
    monkeypatch.setattr(
        registration_portal_router.upload_service,
        "upload_bytes",
        lambda **_: None,
    )
    monkeypatch.setattr(
        registration_portal_router.settings,
        "STORAGE_MODE",
        "local",
    )

    contents = b"attendee-document"
    headers = {"Idempotency-Key": f"public-registration-upload-{uuid.uuid4()}"}
    request = {
        "headers": headers,
        "data": {"field_name": "identity_document"},
        "files": {"file": ("identity.pdf", contents, "application/pdf")},
    }
    response = await client.post(
        f"/portal/registration/{event.id}/upload",
        **request,
    )
    assert response.status_code == 200, response.text
    replay = await client.post(
        f"/portal/registration/{event.id}/upload",
        **request,
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["url"] == response.json()["url"]

    reservations = (
        await db.scalars(
            select(UsageReservation).where(
                UsageReservation.event_id == event.id,
                UsageReservation.idempotency_key
                == f"registration-upload:{headers['Idempotency-Key']}",
            )
        )
    ).all()
    assert len(reservations) == 1
    assert reservations[0].status == "CONSUMED"
    ledger = await db.get(UsageLedgerEntry, reservations[0].consumed_entry_id)
    assert ledger is not None
    assert ledger.metric_key == "storage_bytes"
    assert ledger.quantity == len(contents)
    durable_upload = await db.scalar(
        select(DurableUpload).where(
            DurableUpload.organization_id == event.organization_id,
            DurableUpload.event_id == event.id,
            DurableUpload.original_filename == "identity.pdf",
        )
    )
    assert durable_upload is not None
    assert durable_upload.object_key.startswith(
        f"tenant/{event.organization_id}/event/{event.id}/"
    )
    assert durable_upload.checksum
    assert durable_upload.status in {"uploaded", "scanning", "ready", "quarantined"}


def test_every_registered_feature_has_enforcement_destination():
    assert FEATURE_DEFINITIONS
    explicit_modes = {
        "ENFORCED",
        "COMPOSITE",
        "READ_ONLY",
        "PROVIDER_REQUIRED",
        "NOT_IMPLEMENTED",
    }
    for key, definition in FEATURE_DEFINITIONS.items():
        assert key.startswith("FEAT_")
        assert definition["scope"] in {"ORGANIZATION", "EVENT", "BOTH"}
        assert definition["value_type"] in {"BOOLEAN", "TIER", "ENUM", "LIMIT"}
        assert definition["portal_routes"] or definition["operations"], key
        assert definition["backend_mode"] in explicit_modes, key
        assert bool(definition["operations"]) == (
            definition["backend_mode"] == "ENFORCED"
        ), key
        if definition["backend_mode"] != "ENFORCED":
            assert definition["availability_note"], key
        if definition["value_type"] in {"TIER", "ENUM"}:
            assert definition["allowed_values"], key


def test_core_external_capabilities_are_canonical():
    required = {"FEAT_EPOSTER_MGMT", "FEAT_API_ACCESS", "FEAT_WEBHOOK_ACCESS", "FEAT_THIRD_PARTY_INTEGRATIONS", "FEAT_WHATSAPP", "FEAT_SMS", "FEAT_WHITE_LABEL"}
    assert required <= FEATURE_DEFINITIONS.keys()
    assert FEATURE_DEFINITIONS["FEAT_SMS"]["backend_mode"] == "ENFORCED"
    assert FEATURE_DEFINITIONS["FEAT_WHATSAPP"]["backend_mode"] == "ENFORCED"
    assert FEATURE_DEFINITIONS["FEAT_PUSH_NOTIFICATIONS"]["backend_mode"] == "ENFORCED"


def test_limit_registry_has_scope_unit_period_and_metric():
    for key, definition in LIMIT_DEFINITIONS.items():
        assert key.startswith("max_") or key == "storage_quota_mb"
        assert definition["scope"] in {"ORGANIZATION", "EVENT"}
        assert definition["unit"]
        assert definition["period"]
        assert definition["metric_key"]


def test_percentage_subject_hash_is_stable_and_bounded():
    subject = uuid.UUID("12345678-1234-5678-1234-567812345678")
    first = PlatformFlagService._included("registration.v2", str(subject), 37)
    assert first == PlatformFlagService._included("registration.v2", str(subject), 37)
    assert PlatformFlagService._included("registration.v2", str(subject), 100)
    assert not PlatformFlagService._included("registration.v2", str(subject), 0)


@pytest.mark.asyncio
async def test_platform_flag_mutations_are_typed_targeted_and_idempotent(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    super_admin: User,
):
    await CapabilityService.sync_catalogue(db)
    await db.flush()
    flag_key = f"registration.v2.{uuid.uuid4().hex[:8]}"
    create_key = f"flag-create-{uuid.uuid4()}"
    payload = {
        "flag_key": flag_key,
        "name": "Registration version two",
        "description": "Controlled rollout of the canonical registration implementation.",
        "flag_type": "RELEASE",
        "application": "ORGANIZER_PORTAL",
        "environment": "ALL",
        "value_type": "VARIANT",
        "default_value": {"value": "legacy"},
        "target_capabilities": ["FEAT_REGISTRATION_PORTAL"],
        "rollout_percentage": 0,
        "owner_team": "Platform Engineering",
        "risk_level": "MEDIUM",
        "rollback_instructions": "Set the rollout to zero and restore the legacy implementation.",
        "reason": "Create a governed registration implementation rollout.",
    }
    headers = {**auth_headers(super_admin), "Idempotency-Key": create_key}
    created = await client.post(
        "/api/v1/platform/capabilities/flags",
        headers=headers,
        json=payload,
    )
    assert created.status_code == 201, created.text
    assert created.json()["value_type"] == "VARIANT"
    assert created.json()["target_capabilities"] == ["FEAT_REGISTRATION_PORTAL"]

    replay = await client.post(
        "/api/v1/platform/capabilities/flags",
        headers=headers,
        json=payload,
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == created.json()["id"]

    conflict = await client.post(
        "/api/v1/platform/capabilities/flags",
        headers=headers,
        json={**payload, "name": "Conflicting replay"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    unknown = await client.post(
        "/api/v1/platform/capabilities/flags",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"flag-create-{uuid.uuid4()}",
        },
        json={
            **payload,
            "flag_key": f"unknown.target.{uuid.uuid4().hex[:8]}",
            "target_capabilities": ["FEAT_DOES_NOT_EXIST"],
        },
    )
    assert unknown.status_code == 422
    assert unknown.json()["detail"]["code"] == "UNKNOWN_CAPABILITY_KEYS"

    invalid_variant = await client.post(
        f"/api/v1/platform/capabilities/flags/{created.json()['id']}/overrides",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"flag-override-{uuid.uuid4()}",
        },
        json={
            "scope_type": "ORGANIZATION",
            "organization_id": str(organization.id),
            "value": {"value": True},
            "rollout_percentage": 100,
            "reason": "Try an invalid Boolean value for a variant flag.",
            "case_reference": "DEV-401",
        },
    )
    assert invalid_variant.status_code == 422
    assert invalid_variant.json()["detail"]["code"] == "INVALID_FLAG_VALUE"


@pytest.mark.asyncio
async def test_platform_flag_override_requires_independent_approval_and_replays(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    super_admin: User,
):
    await CapabilityService.sync_catalogue(db)
    await db.flush()
    flag_key = f"communications.kill.{uuid.uuid4().hex[:8]}"
    create = await client.post(
        "/api/v1/platform/capabilities/flags",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"flag-create-{uuid.uuid4()}",
        },
        json={
            "flag_key": flag_key,
            "name": "Communications emergency stop",
            "description": "Emergency deny control for outbound communications.",
            "flag_type": "KILL_SWITCH",
            "application": "ORGANIZER_PORTAL",
            "environment": "ALL",
            "value_type": "BOOLEAN",
            "default_value": {"value": False},
            "target_capabilities": ["FEAT_EMAIL_NOTIFICATIONS"],
            "rollout_percentage": 0,
            "owner_team": "Security",
            "risk_level": "CRITICAL",
            "rollback_instructions": "Approve a false override after the incident is contained.",
            "reason": "Create the governed communications emergency stop.",
        },
    )
    assert create.status_code == 201, create.text
    flag_id = create.json()["id"]

    request_key = f"flag-override-{uuid.uuid4()}"
    override_payload = {
        "scope_type": "ORGANIZATION",
        "organization_id": str(organization.id),
        "value": {"value": True},
        "rollout_percentage": 100,
        "reason": "Contain outbound communications during the active incident.",
        "case_reference": "SEC-910",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
    }
    requested = await client.post(
        f"/api/v1/platform/capabilities/flags/{flag_id}/overrides",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": request_key,
        },
        json=override_payload,
    )
    assert requested.status_code == 202, requested.text
    override_id = requested.json()["id"]

    replay = await client.post(
        f"/api/v1/platform/capabilities/flags/{flag_id}/overrides",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": request_key,
        },
        json=override_payload,
    )
    assert replay.status_code == 202
    assert replay.json()["id"] == override_id

    request_conflict = await client.post(
        f"/api/v1/platform/capabilities/flags/{flag_id}/overrides",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": request_key,
        },
        json={**override_payload, "value": {"value": False}},
    )
    assert request_conflict.status_code == 409
    assert request_conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    self_approval = await client.post(
        f"/api/v1/platform/capabilities/flags/overrides/{override_id}/decision",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"flag-decision-{uuid.uuid4()}",
        },
        json={
            "decision": "APPROVED",
            "reason": "Attempt approval by the original requester.",
        },
    )
    assert self_approval.status_code == 409

    approver = User(
        organization_id=organization.id,
        email=f"flag-approver-{uuid.uuid4().hex[:8]}@test.com",
        password_hash="not-used",
        first_name="Flag",
        last_name="Approver",
        role="super_admin",
        is_active=True,
    )
    db.add(approver)
    await db.flush()
    decision_key = f"flag-decision-{uuid.uuid4()}"
    decision_headers = {
        **auth_headers(approver),
        "Idempotency-Key": decision_key,
    }
    decision_payload = {
        "decision": "APPROVED",
        "reason": "Independently verified the incident containment request.",
    }
    approved = await client.post(
        f"/api/v1/platform/capabilities/flags/overrides/{override_id}/decision",
        headers=decision_headers,
        json=decision_payload,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"

    decision_replay = await client.post(
        f"/api/v1/platform/capabilities/flags/overrides/{override_id}/decision",
        headers=decision_headers,
        json=decision_payload,
    )
    assert decision_replay.status_code == 200
    assert decision_replay.json() == approved.json()

    evaluation = await client.get(
        "/api/v1/platform/capabilities/flags/evaluate",
        headers=auth_headers(approver),
        params={
            "organization_id": str(organization.id),
            "application": "ORGANIZER_PORTAL",
            "environment": "ALL",
        },
    )
    assert evaluation.status_code == 200
    assert evaluation.json()[flag_key]["value"] is True
    assert evaluation.json()[flag_key]["flag_type"] == "KILL_SWITCH"

    report = await client.get(
        "/api/v1/platform/capabilities/flags/report?stale_days=90",
        headers=auth_headers(approver),
    )
    assert report.status_code == 200
    assert report.json()["total_flags"] >= 1


@pytest.mark.asyncio
async def test_organizer_cannot_self_assign_legacy_commercial_access(
    client: AsyncClient,
    organization: Organization,
    organizer: User,
):
    attempted_plan_change = await client.put(
        "/api/v1/organisations/me",
        headers=auth_headers(organizer),
        json={"plan": "enterprise"},
    )
    assert attempted_plan_change.status_code == 422

    context = await client.get(
        "/api/v1/organisations/me",
        headers=auth_headers(organizer),
    )
    assert context.status_code == 200, context.text
    organization_payload = context.json()["organization"]
    assert "plan" not in organization_payload
    assert "max_events" not in organization_payload
    assert "max_users" not in organization_payload
    assert "max_storage_gb" not in organization_payload
    assert context.json()["commercial"]["availability"] == "UNAVAILABLE"
    assert context.json()["plan_limits"] == {
        "events": None,
        "users": None,
        "storage_gb": None,
    }

    invite = await client.post(
        "/api/v1/organisations/me/members/invite",
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"member-invite-{uuid.uuid4()}",
        },
        json={"email": f"blocked-{uuid.uuid4().hex[:8]}@test.com", "org_role": "member"},
    )
    assert invite.status_code == 409
    assert invite.json()["detail"]["code"] == "CONTRACT_REQUIRED"


def test_coverage_counts_match_registry():
    coverage = registry_coverage()
    assert coverage["feature_count"] == len(FEATURE_DEFINITIONS)
    assert coverage["limit_count"] == len(LIMIT_DEFINITIONS)
    assert coverage["platform_hard_ceilings"] == PLATFORM_HARD_CEILINGS
    assert coverage["operation_features"] == OPERATION_FEATURES
    assert coverage["limit_enforcement_sites"] == LIMIT_ENFORCEMENT_SITES
    assert coverage["portal_limit_control_sites"] == PORTAL_LIMIT_CONTROL_SITES


@pytest.mark.asyncio
async def test_business_feature_matrix_is_dynamic_typed_catalogue(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
):
    await CapabilityService.sync_catalogue(db)
    await db.flush()

    response = await client.get(
        "/api/v1/platform/features/matrix",
        headers=auth_headers(super_admin),
    )

    assert response.status_code == 200, response.text
    rows = [
        item
        for category in response.json()
        for item in category["features"]
    ]
    assert {item["key"] for item in rows} == (
        set(FEATURE_DEFINITIONS) | set(CATALOG_LIMIT_KEYS)
    )
    assert all(item["value_type"] in {"BOOLEAN", "LIMIT", "TIER", "ENUM"} for item in rows)
    assert all("display_basic" not in item for item in rows)
    assert all("display_professional" not in item for item in rows)
    assert all("display_enterprise" not in item for item in rows)


def test_backend_operations_have_one_canonical_feature():
    declared = [
        operation
        for definition in FEATURE_DEFINITIONS.values()
        for operation in definition["operations"]
    ]
    assert len(declared) == len(set(declared))
    assert set(declared) == set(OPERATION_FEATURES)
    assert feature_for_operation("sessions.manage") == "FEAT_SESSION_MANAGEMENT"
    assert feature_for_operation("exports.create") == "FEAT_DATA_EXPORTS"
    with pytest.raises(ValueError):
        feature_for_operation("unknown.operation")


def test_every_operation_manifest_site_exists_and_is_called_in_source():
    app_root = Path(__file__).resolve().parents[1] / "app"
    assert set(OPERATION_ENFORCEMENT_SITES) == set(OPERATION_FEATURES)
    assert set(OPERATION_PERMISSIONS) == set(OPERATION_FEATURES)
    used_operations: set[str] = set()
    operation_call_names = {
        "require_event_operation",
        "enforce_event_operation",
        "require_org_operation",
        "enforce_org_operation",
        "resolve_org_operation",
    }
    for path in app_root.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            call_name = getattr(node.func, "id", None)
            if call_name not in operation_call_names:
                continue
            for argument in node.args:
                if (
                    isinstance(argument, ast.Constant)
                    and isinstance(argument.value, str)
                    and argument.value in OPERATION_FEATURES
                ):
                    used_operations.add(argument.value)
    assert used_operations == set(OPERATION_FEATURES)
    for operation, sites in OPERATION_ENFORCEMENT_SITES.items():
        assert sites, operation
        for site in sites:
            relative_path = site["site"].split(":", 1)[0]
            assert (app_root / relative_path).is_file(), site
            assert site["mode"] in {"ENFORCE", "POLICY"}


def test_customer_domain_mutations_have_canonical_control_or_explicit_exemption():
    app_root = Path(__file__).resolve().parents[1] / "app"
    customer_modules = {
        "analytics",
        "branding",
        "communications",
        "developer",
        "events",
        "integrations",
        "notifications",
        "presentations",
        "rbac",
        "registration",
        "speakers",
        "venue",
    }
    gate_markers = {
        "enforce_event_feature",
        "enforce_event_operation",
        "enforce_org_feature",
        "enforce_org_operation",
        "require_event_feature",
        "require_event_operation",
        "require_org_feature",
        "require_org_operation",
        "UsageReservationService",
        "EventMutationService",
        "EventCommandService",
    }
    mutation_decorators = (".post(", ".put(", ".patch(", ".delete(")
    uncontrolled: set[str] = set()

    for path in sorted((app_root / "modules").glob("*/routers/*.py")):
        if path.parts[-3] not in customer_modules:
            continue
        # The registration router delegates selected mutations to the shared
        # participant/template services.  Those services are the canonical
        # enforcement sites.  Keep this classification local to registration
        # so unrelated notification routes retain their own coverage rules.
        shared_service_markers = (
            {
                "EventParticipantMutationService",
                "EventTemplateMutationService",
                "ParticipantCommandService",
                "FormCategoryCommandService",
                "FormTemplateCommandService",
            "PaymentCommandService",
            "PromoCodeCommandService",
            "RegistrationCommandService",
        }
            if path.parts[-3] == "registration"
            else {
                # This router delegates its template mutations to these
                # service functions, which include the canonical event gate.
                "SuperAdminOnly", "_require_org_admin",
                "designer_enabled_for_event", "designer_enabled_for_organization",
                "create_family", "save_draft", "publish_draft", "rollback_to_version",
            }
            if path.name == "email_template_studio.py"
            else set()
        )
        path_gate_markers = gate_markers | shared_service_markers
        source = path.read_text(encoding="utf-8-sig")
        tree = ast.parse(source, filename=str(path))
        functions = {
            node.name: node
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        controlled = {
            name
            for name, node in functions.items()
            if any(
                marker in (ast.get_source_segment(source, node) or "")
                for marker in path_gate_markers
            )
        }
        changed = True
        while changed:
            changed = False
            for name, node in functions.items():
                if name in controlled:
                    continue
                references = {
                    reference.id
                    for reference in ast.walk(node)
                    if isinstance(reference, ast.Name)
                }
                if references & controlled:
                    controlled.add(name)
                    changed = True

        router_controlled = any(
            "APIRouter" in (ast.get_source_segment(source, node) or "")
            and any(
                marker in (ast.get_source_segment(source, node) or "")
                    for marker in path_gate_markers
            )
            for node in tree.body
            if isinstance(node, (ast.Assign, ast.AnnAssign))
        )
        for name, node in functions.items():
            decorators = [
                ast.get_source_segment(source, decorator) or ""
                for decorator in node.decorator_list
            ]
            if not any(
                mutation in decorator
                for decorator in decorators
                for mutation in mutation_decorators
            ):
                continue
            decorator_controlled = any(
                marker in decorator
                for decorator in decorators
                for marker in path_gate_markers
            )
            if router_controlled or decorator_controlled or name in controlled:
                continue
            relative = path.relative_to(app_root).as_posix()
            uncontrolled.add(f"{relative}:{name}")

    assert uncontrolled == set(MUTATION_CONTROL_EXEMPTIONS), {
        "missing_classification": sorted(
            uncontrolled - set(MUTATION_CONTROL_EXEMPTIONS)
        ),
        "stale_classification": sorted(
            set(MUTATION_CONTROL_EXEMPTIONS) - uncontrolled
        ),
    }
    allowed_modes = {
        "AUTH_LIFECYCLE",
        "COMMAND_CENTER_POLICY",
        "CORE_GOVERNANCE",
        "GOVERNED_DENIAL",
        "NON_GRANTING_COMMERCIAL_WORKFLOW",
        "SERVICE_ENFORCED",
        "SIGNED_TRANSPORT",
    }
    for control in MUTATION_CONTROL_EXEMPTIONS.values():
        assert control["mode"] in allowed_modes
        assert len(control["reason"]) >= 20


def test_every_limit_has_an_explicit_enforcement_or_provider_state():
    app_root = Path(__file__).resolve().parents[1] / "app"
    assert set(LIMIT_ENFORCEMENT_SITES) == set(LIMIT_DEFINITIONS)
    reserved_limit_keys: set[str] = set()
    for path in app_root.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if getattr(node.func, "attr", None) != "reserve":
                continue
            owner = getattr(getattr(node.func, "value", None), "id", None)
            if owner != "UsageReservationService":
                continue
            for keyword in node.keywords:
                if keyword.arg != "limit_key":
                    continue
                for value_node in ast.walk(keyword.value):
                    if (
                        isinstance(value_node, ast.Constant)
                        and isinstance(value_node.value, str)
                        and value_node.value in LIMIT_DEFINITIONS
                    ):
                        reserved_limit_keys.add(value_node.value)
    for limit_key, enforcement in LIMIT_ENFORCEMENT_SITES.items():
        assert enforcement["status"] in {"ENFORCED", "PROVIDER_REQUIRED"}, limit_key
        if enforcement["status"] == "PROVIDER_REQUIRED":
            assert enforcement["sites"] == []
            continue
        assert limit_key in reserved_limit_keys, limit_key
        assert enforcement["sites"], limit_key
        for site in enforcement["sites"]:
            relative_path = site["site"].split(":", 1)[0]
            assert (app_root / relative_path).is_file(), site
            assert site["mode"] == "RESERVE_CONSUME"


@pytest.mark.asyncio
async def test_entitled_provider_features_fail_closed_without_verified_provider(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    await activate_event_for_test(db, event)

    response = await client.get(
        f"/api/v1/events/{event.id}/capabilities",
        headers=auth_headers(organizer),
    )
    assert response.status_code == 200, response.text
    features = response.json()["features"]

    for key in {"FEAT_SMS", "FEAT_WHATSAPP", "FEAT_PUSH_NOTIFICATIONS"}:
        assert features[key]["value"]
        assert features[key]["enabled"] is False
        assert features[key]["reason_code"] == "PROVIDER_UNAVAILABLE"
        assert features[key]["backend_mode"] == "ENFORCED"
        assert features[key]["availability_note"]

    for key in {
        "FEAT_WHITE_LABEL",
        "FEAT_CUSTOM_LOGIN_PAGE",
        "FEAT_SPEAKER_PROFILES",
        "FEAT_SPEAKER_COMMS",
        "FEAT_MULTI_PRESENTATION_VERSIONS",
        "FEAT_CUSTOM_BADGE_DESIGN",
        "FEAT_CUSTOM_CERT_DESIGN",
        "FEAT_QR_BADGE",
        "FEAT_REMINDER_EMAILS",
    }:
        assert features[key]["enabled"] is True
        assert features[key]["backend_mode"] == "ENFORCED"
        assert features[key]["operations"]


@pytest.mark.asyncio
async def test_white_label_and_custom_login_publish_through_command_center(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    super_admin: User,
):
    await activate_event_for_test(db, event)
    base = f"/api/v1/platform/organizations/{organization.id}/console"
    payload = {
        "assets": {
            "logo_url": f"{organization.id}/branding/logo.png",
        },
        "tokens": {"primary_color": "#112233"},
        "templates": {},
        "white_label": {
            "enabled": True,
            "product_name": "Acme Events",
            "hide_eventos_branding": True,
            "footer_text": "Acme Events",
            "support_url": "https://support.example.com",
        },
        "login_page": {
            "enabled": True,
            "headline": "Welcome to Acme Events",
            "subheading": "Sign in to manage your events.",
            "logo_asset_ref": f"{organization.id}/branding/login-logo.png",
            "background_asset_ref": f"{organization.id}/branding/login-bg.png",
            "support_url": "https://support.example.com",
            "terms_url": "https://example.com/terms",
            "privacy_url": "https://example.com/privacy",
        },
        "version": 1,
        "reason": "Publish the approved tenant login and white-label identity.",
    }
    draft = await client.put(
        f"{base}/branding",
        headers={**auth_headers(super_admin), "If-Match": "1"},
        json=payload,
    )
    assert draft.status_code == 200, draft.text
    assert draft.json()["status"] == "DRAFT"

    published = await client.post(
        f"{base}/branding/publish",
        headers={**auth_headers(super_admin), "If-Match": "1"},
        json={},
    )
    assert published.status_code == 200, published.text

    public = await client.get(
        "/api/v1/platform/public/branding",
        params={"slug": organization.slug},
    )
    assert public.status_code == 200, public.text
    body = public.json()
    assert body["published"] is True
    assert body["white_label"]["enabled"] is True
    assert body["white_label"]["product_name"] == "Acme Events"
    assert body["login_page"]["enabled"] is True
    assert body["login_page"]["headline"] == "Welcome to Acme Events"
    assert "logo_asset_ref" not in body["login_page"]
    assert body["login_page"]["logo_asset_url"].startswith("http")


@pytest.mark.asyncio
async def test_event_creation_atomically_reserves_and_consumes_max_events(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event: Event,
    organizer: User,
):
    # Keep scalar identifiers before the route commits through the shared
    # session; assertions must not trigger an implicit async refresh.
    organization_id = organization.id
    await CapabilityService.sync_catalogue(db)
    limit_feature = await db.scalar(
        select(FeatureCatalog).where(FeatureCatalog.key == "LIMIT_EVENTS")
    )
    assert limit_feature is not None
    plan = SubscriptionPlan(
        name=f"Two event plan {uuid.uuid4().hex[:8]}",
        max_events=2,
        lifecycle_status="PUBLISHED",
        is_active=True,
    )
    db.add(plan)
    await db.flush()
    db.add_all([
        PlanFeature(
            plan_id=plan.id,
            feature_id=limit_feature.id,
            enabled=True,
            value_type="LIMIT",
            entitlement_value={"value": 2},
            scope_type="ORGANIZATION",
            enforcement_mode="HARD",
        ),
        OrganizationSubscription(
            organization_id=organization_id,
            plan_id=plan.id,
            status="ACTIVE",
        ),
    ])
    await db.commit()

    request_key = f"event-create-{uuid.uuid4()}"
    payload = {
        "name": "Second governed event",
        "short_code": f"EV{uuid.uuid4().hex[:8].upper()}",
        "start_date": "2027-01-01",
        "end_date": "2027-01-02",
        "timezone": "UTC",
    }
    created = await client.post(
        "/api/v1/events",
        headers={**auth_headers(organizer), "Idempotency-Key": request_key},
        json=payload,
    )
    assert created.status_code == 201, created.text

    reservation = await db.scalar(
            select(UsageReservation).where(
                UsageReservation.organization_id == organization_id,
            UsageReservation.idempotency_key == f"event-create:{request_key}",
        )
    )
    assert reservation is not None
    assert reservation.status == "CONSUMED"
    usage = await db.get(UsageLedgerEntry, reservation.consumed_entry_id)
    assert usage is not None
    assert usage.metric_key == "active_events"
    assert usage.quantity == 1

    exhausted = await client.post(
        "/api/v1/events",
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"event-create-{uuid.uuid4()}",
        },
        json={
            **payload,
            "name": "Third event must be denied",
            "short_code": f"EV{uuid.uuid4().hex[:8].upper()}",
        },
    )
    assert exhausted.status_code == 402
    assert exhausted.json()["detail"]["code"] == "QUOTA_EXHAUSTED"
    assert exhausted.json()["detail"]["limit_key"] == "max_events"
    assert await db.scalar(
        select(Event.id).where(
            Event.organization_id == organization_id,
            Event.name == "Third event must be denied",
        )
    ) is None


@pytest.mark.asyncio
async def test_capability_cache_revision_changes_in_the_metering_transaction(
    db: AsyncSession,
    organization: Organization,
    event,
):
    before = await CapabilityCacheService.revision_token(db, organization.id, event.id)
    db.add(UsageLedgerEntry(
        organization_id=organization.id,
        event_id=event.id,
        metric_key="registrations",
        quantity=1,
        unit="registration",
        source="test.capability_revision",
        idempotency_key=f"revision-{uuid.uuid4()}",
    ))
    await db.flush()
    after = await CapabilityCacheService.revision_token(db, organization.id, event.id)
    assert after != before


@pytest.mark.asyncio
async def test_permission_and_entitlement_are_independent_for_event_operations(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    event,
    organizer: User,
):
    await activate_event_for_test(db, event)
    viewer = User(
        organization_id=organization.id,
        email=f"capability-viewer-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=organizer.password_hash,
        first_name="Capability",
        last_name="Viewer",
        role="viewer",
        is_active=True,
    )
    db.add(viewer)
    await db.flush()
    db.add(UserAccessNode(user_id=viewer.id, node_id=event.id, node_type="EVENT"))
    await db.commit()

    denied = await client.post(
        f"/events/{event.id}/payments/config",
        headers=auth_headers(viewer),
        json={"payment_enabled": True, "active_gateway": "simulated"},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] == {
        "code": "PERMISSION_DENIED",
        "permission": "PAYMENTS:PRICING",
    }

    allowed = await client.post(
        f"/events/{event.id}/payments/config",
        headers=auth_headers(organizer),
        json={"payment_enabled": True, "active_gateway": "simulated"},
    )
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_consumed_reservation_cannot_authorize_a_duplicate_domain_write(
    db: AsyncSession,
    organization: Organization,
):
    key = f"consumed-replay-{uuid.uuid4()}"
    row = UsageReservation(
        organization_id=organization.id,
        event_id=None,
        metric_key="max_users",
        quantity=1,
        unit="user",
        status="CONSUMED",
        idempotency_key=key,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        metadata_json={},
    )
    db.add(row)
    await db.flush()

    with pytest.raises(HTTPException) as exc:
        await UsageReservationService.reserve(
            db,
            organization_id=organization.id,
            event_id=None,
            limit_key="max_users",
            quantity=1,
            unit="user",
            idempotency_key=key,
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "IDEMPOTENCY_ALREADY_CONSUMED"


@pytest.mark.asyncio
async def test_usage_reservation_honors_soft_warning_metered_overage_and_hard_ceiling(
    db: AsyncSession,
    organization: Organization,
    event: Event,
):
    await activate_event_for_test(db, event)
    contract = await db.scalar(
        select(EventCommercialContract).where(
            EventCommercialContract.event_id == event.id,
            EventCommercialContract.status == "ACTIVE",
        )
    )
    assert contract is not None

    entitlements = dict(contract.entitlements)
    entitlements["max_rooms"] = {
        "type": "LIMIT",
        "value": 0,
        "enforcement_mode": "SOFT_WARNING",
        "overage_policy": {"action": "WARN"},
    }
    contract.entitlements = entitlements
    ceilings = dict(contract.hard_ceilings)
    ceilings["max_rooms"] = 10
    contract.hard_ceilings = ceilings
    await db.commit()

    warning = await UsageReservationService.reserve(
        db,
        organization_id=organization.id,
        event_id=event.id,
        limit_key="max_rooms",
        quantity=1,
        unit="room",
        idempotency_key=f"soft-warning-{uuid.uuid4()}",
    )
    assert warning.metadata_json["quota_state"] == "SOFT_WARNING"
    assert warning.metadata_json["overage_quantity"] == 1
    await UsageReservationService.release(db, warning.id)

    entitlements = dict(contract.entitlements)
    entitlements["max_rooms"] = {
        "type": "LIMIT",
        "value": 0,
        "enforcement_mode": "METERED_OVERAGE",
        "overage_policy": {"action": "BILL", "unit_price": "2.50"},
    }
    contract.entitlements = entitlements
    await db.commit()
    metered = await UsageReservationService.reserve(
        db,
        organization_id=organization.id,
        event_id=event.id,
        limit_key="max_rooms",
        quantity=2,
        unit="room",
        idempotency_key=f"metered-overage-{uuid.uuid4()}",
    )
    assert metered.metadata_json["quota_state"] == "METERED_OVERAGE"
    assert metered.metadata_json["overage_policy"]["action"] == "BILL"
    await UsageReservationService.release(db, metered.id)

    ceilings = dict(contract.hard_ceilings)
    ceilings["max_rooms"] = 0
    contract.hard_ceilings = ceilings
    await db.commit()
    with pytest.raises(HTTPException) as exc:
        await UsageReservationService.reserve(
            db,
            organization_id=organization.id,
            event_id=event.id,
            limit_key="max_rooms",
            quantity=1,
            unit="room",
            idempotency_key=f"hard-ceiling-{uuid.uuid4()}",
        )
    assert exc.value.status_code == 402
    assert exc.value.detail["code"] == "HARD_CEILING_EXCEEDED"


@pytest.mark.asyncio
async def test_resolver_fails_closed_for_dependency_and_conflict_drift(
    db: AsyncSession,
    organization: Organization,
    event: Event,
):
    await activate_event_for_test(db, event)
    contract = await db.scalar(
        select(EventCommercialContract).where(
            EventCommercialContract.event_id == event.id,
            EventCommercialContract.status == "ACTIVE",
        )
    )
    session_feature = await db.scalar(
        select(FeatureCatalog).where(
            FeatureCatalog.key == "FEAT_SESSION_MANAGEMENT"
        )
    )
    speaker_feature = await db.scalar(
        select(FeatureCatalog).where(
            FeatureCatalog.key == "FEAT_SPEAKER_PROFILES"
        )
    )
    assert contract and session_feature and speaker_feature

    session_feature.dependencies = ["FEAT_SPEAKER_PROFILES"]
    entitlements = dict(contract.entitlements)
    entitlements["FEAT_SESSION_MANAGEMENT"] = {
        "type": "BOOLEAN",
        "value": True,
    }
    entitlements["FEAT_SPEAKER_PROFILES"] = {
        "type": "BOOLEAN",
        "value": False,
    }
    contract.entitlements = entitlements
    await db.commit()

    dependency_result = await CapabilityService.resolve_event(
        db, organization.id, event.id
    )
    assert dependency_result["features"]["FEAT_SESSION_MANAGEMENT"]["enabled"] is False
    assert (
        dependency_result["features"]["FEAT_SESSION_MANAGEMENT"]["reason_code"]
        == "DEPENDENCY_REQUIRED"
    )

    session_feature.dependencies = []
    session_feature.conflicts = ["FEAT_SPEAKER_PROFILES"]
    entitlements = dict(contract.entitlements)
    entitlements["FEAT_SPEAKER_PROFILES"] = {
        "type": "BOOLEAN",
        "value": True,
    }
    contract.entitlements = entitlements
    await db.commit()

    conflict_result = await CapabilityService.resolve_event(
        db, organization.id, event.id
    )
    assert conflict_result["features"]["FEAT_SESSION_MANAGEMENT"]["enabled"] is False
    assert conflict_result["features"]["FEAT_SPEAKER_PROFILES"]["enabled"] is False
    assert {
        conflict_result["features"]["FEAT_SESSION_MANAGEMENT"]["reason_code"],
        conflict_result["features"]["FEAT_SPEAKER_PROFILES"]["reason_code"],
    } == {"FEATURE_CONFLICT"}


@pytest.mark.asyncio
async def test_eventos_is_unrestricted_for_every_feature_and_limit(
    db: AsyncSession,
    client: AsyncClient,
    organization: Organization,
    organizer: User,
    event: Event,
):
    organization.name = "Eventos"
    organization.slug = "Eventos"
    organization.is_platform_org = True
    organization.is_internal_unrestricted = True
    organization.is_active = False
    organization.suspended_at = datetime.now(timezone.utc)
    event.status = "archived"
    db.add(
        CapabilityRestriction(
            organization_id=organization.id,
            event_id=event.id,
            capability_key="FEAT_REGISTRATION_PORTAL",
            restriction_type="SECURITY",
            reason_code="SECURITY_RESTRICTED",
            reason="The main tenant must ignore tenant feature restrictions.",
            case_reference="TEST-INTERNAL-UNRESTRICTED",
            status="APPROVED",
            effective_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            requested_by=organizer.id,
            approved_by=organizer.id,
            idempotency_key=f"internal-unrestricted-{uuid.uuid4()}",
        )
    )
    await db.flush()

    entitlement = await EventEntitlementService.resolve(
        db, organization.id, event.id, explain=True
    )
    assert entitlement["contract_id"] is None
    assert entitlement["availability"]["available"] is True
    assert entitlement["hard_ceilings"] == {}
    assert set(FEATURE_DEFINITIONS) <= set(entitlement["features"])
    assert all(row["enabled"] for row in entitlement["features"].values())
    assert all(
        row["source_type"] == "INTERNAL_UNRESTRICTED_BASELINE"
        for row in entitlement["features"].values()
    )
    assert set(LIMIT_DEFINITIONS) <= set(entitlement["limits"])
    assert all(row["limit_value"] is None for row in entitlement["limits"].values())

    event_capabilities = await CapabilityService.resolve_event(
        db, organization.id, event.id
    )
    assert all(row["enabled"] for row in event_capabilities["features"].values())
    assert all(row["allowed"] is None for row in event_capabilities["limits"].values())
    assert all(row["remaining"] is None for row in event_capabilities["limits"].values())

    organization_capabilities = await CapabilityService.resolve_organization(
        db, organization.id
    )
    assert all(row["enabled"] for row in organization_capabilities["features"].values())
    assert all(row["allowed"] is None for row in organization_capabilities["limits"].values())

    public_response = await client.get(
        f"/portal/registration/{event.id}/capabilities"
    )
    assert public_response.status_code == 200, public_response.text
    public_payload = public_response.json()
    assert public_payload["availability"]["available"] is True
    assert all(row["enabled"] for row in public_payload["features"].values())
    assert all("sources" not in row and "flags" not in row for row in public_payload["features"].values())

    etag = public_response.headers["etag"]
    not_modified = await client.get(
        f"/portal/registration/{event.id}/capabilities",
        headers={"If-None-Match": etag},
    )
    assert not_modified.status_code == 304
    assert not_modified.headers["etag"] == etag

    # Public registration operations are deliberately permissionless and the
    # main tenant also ignores its tenant suspension/archive/maintenance state.
    event.is_maintenance = True
    event.is_read_only = True
    await db.flush()
    operation_result = await enforce_event_operation(
        db,
        organization.id,
        event.id,
        "registration.submit",
    )
    assert operation_result["enabled"] is True

    # Prove that the internal baseline removes the commercial and hard-ceiling
    # quota paths rather than merely displaying an unlimited value.
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=organization.id,
        event_id=event.id,
        limit_key="max_registrations",
        quantity=PLATFORM_HARD_CEILINGS["max_registrations"] + 1,
        unit="registrations",
        idempotency_key=f"internal-unlimited-registration-{uuid.uuid4()}",
    )
    assert reservation.status == "RESERVED"
    await UsageReservationService.release(db, reservation.id)


@pytest.mark.asyncio
async def test_platform_org_without_eventos_marker_remains_plan_enforced(
    db: AsyncSession,
    client: AsyncClient,
    organization: Organization,
    event: Event,
):
    organization.is_platform_org = True
    organization.is_internal_unrestricted = False
    await db.flush()

    result = await CapabilityService.resolve_event(db, organization.id, event.id)
    assert result["availability"]["available"] is False
    for key in REGISTRATION_CAPABILITY_KEYS:
        assert result["features"][key]["enabled"] is False
        assert result["features"][key]["reason_code"] == "CONTRACT_REQUIRED"

    public_response = await client.get(
        f"/portal/registration/{event.id}/capabilities"
    )
    assert public_response.status_code == 200, public_response.text
    public_payload = public_response.json()
    assert public_payload["availability"]["available"] is False
    assert all(not row["enabled"] for row in public_payload["features"].values())

    form_response = await client.get(f"/portal/registration/{event.id}/form")
    assert form_response.status_code == 403
    error_payload = form_response.json()
    error_detail = error_payload.get("detail", error_payload)
    assert error_detail["code"] == "CONTRACT_REQUIRED"


@pytest.mark.asyncio
async def test_concurrent_reservations_cannot_overshoot_event_allowance(
    committed_session_factory,
):
    """The event row lock must serialize capacity decisions across sessions."""

    async with committed_session_factory() as setup_session:
        organization = Organization(
            name="Reservation Concurrency Test",
            slug=f"reservation-concurrency-{uuid.uuid4().hex[:10]}",
            plan="pro",
        )
        setup_session.add(organization)
        await setup_session.flush()
        organizer = User(
            organization_id=organization.id,
            email=f"reservation-concurrency-{uuid.uuid4().hex[:8]}@test.com",
            password_hash="not-used-by-this-test",
            first_name="Reservation",
            last_name="Tester",
            role="organiser",
            is_active=True,
        )
        setup_session.add(organizer)
        await setup_session.flush()
        event = Event(
            organization_id=organization.id,
            created_by=organizer.id,
            name="Reservation Concurrency Event",
            short_code=f"RC{uuid.uuid4().hex[:6].upper()}",
            location="Test City",
            venue_name="Test Hall",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 2),
            timezone="UTC",
            status="draft",
            max_file_size_mb=500,
            allowed_formats=["pptx", "pdf"],
        )
        setup_session.add(event)
        await setup_session.flush()
        organization_id = organization.id
        event_id = event.id
        setup_session.add(EventCommercialContract(
            organization_id=organization_id,
            event_id=event_id,
            version=1,
            status="ACTIVE",
            plan_key="CONCURRENCY_TEST",
            plan_version="1",
            currency="INR",
            entitlements={
                "max_rooms": {"type": "LIMIT", "value": 3},
            },
            hard_ceilings={},
            addons=[],
            source={"type": "TEST"},
            created_by=organizer.id,
        ))
        setup_session.add(
            FeatureFlag(
                organization_id=organization_id,
                flag_key="organizer_console_entitlement_enforce",
                is_enabled=True,
            )
        )
        await setup_session.commit()

    async def attempt_reservation(key: str) -> str:
        async with committed_session_factory() as session:
            try:
                await UsageReservationService.reserve(
                    session,
                    organization_id=organization_id,
                    event_id=event_id,
                    limit_key="max_rooms",
                    quantity=1,
                    unit="room",
                    idempotency_key=key,
                )
                await session.commit()
                return "RESERVED"
            except HTTPException as exc:
                await session.rollback()
                assert exc.status_code == 402
                assert exc.detail["code"] == "QUOTA_EXHAUSTED"
                return "QUOTA_EXHAUSTED"

    outcomes = await asyncio.gather(
        *(
            attempt_reservation(f"concurrent-room-{index}-{uuid.uuid4()}")
            for index in range(12)
        )
    )
    assert outcomes.count("RESERVED") == 3
    assert outcomes.count("QUOTA_EXHAUSTED") == 9


@pytest.mark.asyncio
async def test_catalogue_sync_preserves_operations_for_limit_features(db: AsyncSession):
    await CapabilityService.sync_catalogue(db)
    badge_feature = await db.scalar(
        select(FeatureCatalog).where(FeatureCatalog.key == "FEAT_BADGE_TEMPLATES")
    )
    assert badge_feature is not None
    assert badge_feature.value_type == "LIMIT"
    assert badge_feature.backend_operations == [
        "badges.templates.read",
        "badges.templates.manage",
    ]
    assert "/events/:eventId/design-studio/badges" in badge_feature.portal_routes


@pytest.mark.asyncio
async def test_plan_templates_are_versioned_and_published_only_after_assignments(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
):
    await CapabilityService.sync_catalogue(db)
    await db.flush()
    create_key = f"plan-create-{uuid.uuid4()}"
    create_response = await client.post(
        "/api/v1/platform/subscription-plans",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": create_key,
            "X-Admin-Reason": "Creating a governed plan template draft",
        },
        json={"name": f"Governed {uuid.uuid4().hex[:8]}", "lifecycle_status": "DRAFT", "is_active": False},
    )
    assert create_response.status_code == 201, create_response.text
    plan_id = create_response.json()["id"]

    publish_without_assignments = await client.patch(
        f"/api/v1/platform/subscription-plans/{plan_id}",
        headers={
            **auth_headers(super_admin), "If-Match": "1",
            "Idempotency-Key": f"plan-publish-empty-{uuid.uuid4()}",
            "X-Admin-Reason": "Attempting publication without assignments",
        },
        json={"name": create_response.json()["name"], "lifecycle_status": "PUBLISHED", "is_active": True},
    )
    assert publish_without_assignments.status_code == 422
    assert publish_without_assignments.json()["detail"]["code"] == "PLAN_ASSIGNMENTS_REQUIRED"

    event_planning = await db.scalar(
        select(FeatureCatalog).where(FeatureCatalog.key == "FEAT_EVENT_PLANNING")
    )
    assert event_planning is not None
    event_planning.dependencies = ["FEAT_SPEAKER_PROFILES"]
    await db.commit()
    assignment_missing_dependency = await client.put(
        f"/api/v1/platform/subscription-plans/{plan_id}/features",
        headers={
            **auth_headers(super_admin), "If-Match": "1",
            "Idempotency-Key": f"plan-feature-dependency-{uuid.uuid4()}",
            "X-Admin-Reason": "Verify dependent capabilities cannot be published alone",
        },
        json={"assignments": [{
            "feature_key": "FEAT_EVENT_PLANNING", "value_type": "BOOLEAN",
            "value": True, "scope_type": "EVENT", "enforcement_mode": "HARD",
        }]},
    )
    assert assignment_missing_dependency.status_code == 422
    assert (
        assignment_missing_dependency.json()["detail"]["code"]
        == "FEATURE_DEPENDENCIES_REQUIRED"
    )
    event_planning.dependencies = []
    await db.commit()

    assignment_response = await client.put(
        f"/api/v1/platform/subscription-plans/{plan_id}/features",
        headers={
            **auth_headers(super_admin), "If-Match": "1",
            "Idempotency-Key": f"plan-feature-{uuid.uuid4()}",
            "X-Admin-Reason": "Adding the reviewed event planning capability",
        },
        json={"assignments": [{
            "feature_key": "FEAT_EVENT_PLANNING", "value_type": "BOOLEAN",
            "value": True, "scope_type": "EVENT", "enforcement_mode": "HARD",
        }]},
    )
    assert assignment_response.status_code == 200, assignment_response.text
    assert assignment_response.json()["version"] == 2

    publish_response = await client.patch(
        f"/api/v1/platform/subscription-plans/{plan_id}",
        headers={
            **auth_headers(super_admin), "If-Match": "2",
            "Idempotency-Key": f"plan-publish-{uuid.uuid4()}",
            "X-Admin-Reason": "Publishing the reviewed commercial plan template",
        },
        json={"name": create_response.json()["name"], "lifecycle_status": "PUBLISHED", "is_active": True},
    )
    assert publish_response.status_code == 200, publish_response.text
    assert publish_response.json()["version"] == 3

    versions = await client.get(
        f"/api/v1/platform/subscription-plans/{plan_id}/versions",
        headers=auth_headers(super_admin),
    )
    assert versions.status_code == 200, versions.text
    assert [item["version"] for item in versions.json()["items"]][:3] == [3, 2, 1]


@pytest.mark.asyncio
async def test_addon_templates_are_versioned_publishable_and_retired_without_deletion(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
):
    await CapabilityService.sync_catalogue(db)
    await db.flush()
    addon_key = f"GOVERNED_{uuid.uuid4().hex[:10].upper()}"
    create_response = await client.post(
        "/api/v1/platform/addons",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"addon-create-{uuid.uuid4()}",
            "X-Admin-Reason": "Creating a governed add-on catalogue draft",
        },
        json={
            "name": "Governed event planning extension",
            "key": addon_key,
            "billing_unit": "PER_EVENT",
            "addon_type": "PLAN",
            "scope_type": "EVENT",
            "consumption_model": "NON_CONSUMABLE",
            "lifecycle_status": "DRAFT",
        },
    )
    assert create_response.status_code == 201, create_response.text
    addon_id = create_response.json()["addon_id"]

    publish_without_assignments = await client.patch(
        f"/api/v1/platform/addons/{addon_id}",
        headers={
            **auth_headers(super_admin), "If-Match": "1",
            "Idempotency-Key": f"addon-publish-empty-{uuid.uuid4()}",
            "X-Admin-Reason": "Attempting publication without assignments",
        },
        json={"lifecycle_status": "PUBLISHED", "is_active": True},
    )
    assert publish_without_assignments.status_code == 422
    assert publish_without_assignments.json()["detail"]["code"] == "ADDON_ASSIGNMENTS_REQUIRED"

    assignment_response = await client.patch(
        f"/api/v1/platform/addons/{addon_id}",
        headers={
            **auth_headers(super_admin), "If-Match": "1",
            "Idempotency-Key": f"addon-feature-{uuid.uuid4()}",
            "X-Admin-Reason": "Adding the reviewed event planning capability",
        },
        json={"feature_assignments": [{
            "feature_key": "FEAT_EVENT_PLANNING", "value_type": "BOOLEAN",
            "value": True, "scope_type": "EVENT", "operation": "UNLOCK",
        }]},
    )
    assert assignment_response.status_code == 200, assignment_response.text
    assert assignment_response.json()["version"] == 2

    publish_response = await client.patch(
        f"/api/v1/platform/addons/{addon_id}",
        headers={
            **auth_headers(super_admin), "If-Match": "2",
            "Idempotency-Key": f"addon-publish-{uuid.uuid4()}",
            "X-Admin-Reason": "Publishing the reviewed commercial add-on template",
        },
        json={"lifecycle_status": "PUBLISHED", "is_active": True},
    )
    assert publish_response.status_code == 200, publish_response.text
    assert publish_response.json()["version"] == 3

    retire_response = await client.delete(
        f"/api/v1/platform/addons/{addon_id}",
        headers={
            **auth_headers(super_admin), "If-Match": "3",
            "Idempotency-Key": f"addon-retire-{uuid.uuid4()}",
            "X-Admin-Reason": "Retiring the add-on while preserving contract lineage",
        },
    )
    assert retire_response.status_code == 200, retire_response.text
    assert retire_response.json()["version"] == 4
    persisted = await db.get(Addon, uuid.UUID(addon_id))
    await db.refresh(persisted)
    assert persisted.lifecycle_status == "RETIRED"
    assert persisted.is_active is False

    versions = await client.get(
        f"/api/v1/platform/addons/{addon_id}/versions",
        headers=auth_headers(super_admin),
    )
    assert versions.status_code == 200, versions.text
    assert [item["version"] for item in versions.json()["items"]][:4] == [4, 3, 2, 1]


@pytest.mark.asyncio
async def test_typed_plan_limit_addon_quantity_and_hard_ceiling_are_canonical(
    db: AsyncSession,
    organization: Organization,
):
    organization_id = organization.id
    feature = FeatureCatalog(
        key="LIMIT_API_CALLS_MONTHLY",
        name="Monthly API calls",
        category="LIMITS",
        scope_type="ORGANIZATION",
        value_type="LIMIT",
        default_value={"value": 0},
        unit="requests",
        period="BILLING_PERIOD",
        metric_key="api_calls",
    )
    plan = SubscriptionPlan(
        name=f"Typed limits {uuid.uuid4().hex[:8]}",
        lifecycle_status="PUBLISHED",
        is_active=True,
    )
    addon = Addon(
        name="API request top-up",
        key=f"API_TOPUP_{uuid.uuid4().hex[:8]}",
        addon_type="PLAN",
        lifecycle_status="PUBLISHED",
        is_active=True,
    )
    db.add_all([feature, plan, addon])
    await db.flush()
    db.add_all([
        PlanFeature(
            plan_id=plan.id,
            feature_id=feature.id,
            enabled=True,
            value_type="LIMIT",
            entitlement_value={"value": 123},
            hard_ceiling={"value": 200},
            scope_type="ORGANIZATION",
        ),
        AddonFeature(
            addon_id=addon.id,
            feature_id=feature.id,
            value_type="LIMIT",
            entitlement_value={"value": 50},
            operation="INCREMENT",
            scope_type="ORGANIZATION",
            stackable=True,
            max_quantity=2,
        ),
        OrganizationSubscription(
            organization_id=organization_id,
            plan_id=plan.id,
            status="ACTIVE",
        ),
        OrganizationAddon(
            organization_id=organization.id,
            addon_id=addon.id,
            quantity=3,
            status="ACTIVE",
        ),
    ])
    await db.flush()

    # 123 + (50 * min(purchased 3, max 2)) is capped by plan policy at 200.
    assert await EntitlementResolver.get_org_limit(
        db, organization.id, "max_api_calls_per_month"
    ) == 200


@pytest.mark.asyncio
async def test_platform_ceiling_and_legacy_slug_cannot_bypass_limits(
    db: AsyncSession,
    organization: Organization,
):
    organization.slug = "Eventos"
    assert await EntitlementResolver.get_org_limit(
        db, organization.id, "max_api_calls_per_month"
    ) is None

    feature = FeatureCatalog(
        key="LIMIT_INTEGRATIONS",
        name="Integration connections",
        category="LIMITS",
        scope_type="ORGANIZATION",
        value_type="LIMIT",
        default_value={"value": 0},
        unit="integrations",
        period="CONTRACT",
        metric_key="active_integrations",
    )
    plan = SubscriptionPlan(
        name=f"Safety ceiling {uuid.uuid4().hex[:8]}",
        lifecycle_status="PUBLISHED",
        is_active=True,
    )
    db.add_all([feature, plan])
    await db.flush()
    db.add_all([
        PlanFeature(
            plan_id=plan.id,
            feature_id=feature.id,
            enabled=True,
            value_type="LIMIT",
            entitlement_value={"value": PLATFORM_HARD_CEILINGS["max_integrations"] + 5_000},
            scope_type="ORGANIZATION",
        ),
        OrganizationSubscription(
            organization_id=organization.id,
            plan_id=plan.id,
            status="ACTIVE",
        ),
    ])
    await db.flush()

    assert await EntitlementResolver.get_org_limit(
        db, organization.id, "max_integrations"
    ) == PLATFORM_HARD_CEILINGS["max_integrations"]


@pytest.mark.asyncio
async def test_organizer_commercial_request_requires_command_center_approval(
    client: AsyncClient,
    db: AsyncSession,
    organization: Organization,
    organizer: User,
    super_admin: User,
):
    plan = SubscriptionPlan(
        name=f"Governed {uuid.uuid4().hex[:8]}",
        max_events=3,
        max_users=10,
        storage_quota_mb=1024,
        price_per_event=12500,
        currency="INR",
        lifecycle_status="PUBLISHED",
        is_active=True,
    )
    db.add(plan)
    await db.flush()

    organizer_headers = {**auth_headers(organizer), "Idempotency-Key": f"commercial-request-{uuid.uuid4()}"}
    payload = {
        "plan_name": plan.name,
        "addon_keys": [],
        "billing_name": organization.name,
        "billing_email": organizer.email,
        "billing_phone": "+91-9999999999",
        "reason": "Request a governed plan for the next approved event.",
    }
    requested = await client.post(
        "/api/v1/organisations/me/commercial-access-requests",
        headers=organizer_headers,
        json=payload,
    )
    assert requested.status_code == 202, requested.text
    request_body = requested.json()
    assert request_body["status"] == "PENDING"
    assert await db.scalar(select(OrganizationSubscription.id).where(OrganizationSubscription.organization_id == organization.id)) is None

    unsafe = await client.post(
        "/api/v1/organisations/me/subscribe",
        headers=auth_headers(organizer),
        json={**payload, "is_custom": False},
    )
    assert unsafe.status_code == 409
    assert unsafe.json()["detail"]["code"] == "COMMAND_CENTER_APPROVAL_REQUIRED"

    decision = await client.post(
        f"/api/v1/platform/organizations/{organization.id}/console/commercial/access-requests/{request_body['id']}/decision",
        headers={
            **auth_headers(super_admin),
            "If-Match": str(request_body["version"]),
            "Idempotency-Key": f"commercial-decision-{uuid.uuid4()}",
        },
        json={
            "decision": "APPROVED",
            "reason": "Approve the contracted plan after commercial review.",
            "case_reference": "SALE-2026-001",
        },
    )
    assert decision.status_code == 200, decision.text
    assert decision.json()["status"] == "APPLIED"
    subscription = await db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization.id))
    assert subscription is not None and subscription.plan_id == plan.id and subscription.status == "ACTIVE"
