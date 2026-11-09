"""Client-consented form delegation through real commands and PostgreSQL.

Uses the separate operator-owned test database, not runtime-role acceptance.
Commercial fixture data is newly generated; existing contracts are not amended.
"""
from datetime import date, datetime, timezone
from collections import Counter
import json
import re
from types import SimpleNamespace
import uuid

from fastapi import HTTPException
import pytest
import pytest_asyncio
from sqlalchemy import event as sqlalchemy_event, select

from app.core.tenant_context import TenantContextGuard
from app.dependencies import TokenData
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.identity.services.auth_service import persist_refresh_token
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import CapabilityRestriction
from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.schemas.client_relationships import RelationshipRequest, RelationshipTransition
from app.modules.rbac.services.client_relationships import request_relationship, transition_relationship
from app.modules.registration.application.operational_binding_commands import update_operational_binding
from app.modules.registration.application.template_commands import TemplateCommands
from app.modules.registration.application.category_commands import CategoryCommands
from app.modules.registration.schemas.form_builder import FormTemplateCreate, FormCategoryCreate
from app.modules.registration.schemas.operational_binding import OperationalBindingUpdate
from tests.conftest import activate_event_for_test


def retry_key():
    return f"delegated-form-{uuid.uuid4()}"


def assert_registration_form_enforcement_equivalent(full, narrow):
    expected = full["features"]["FEAT_REGISTRATION_FORMS"]
    for field in (
        "key",
        "value",
        "enabled",
        "reason_code",
        "source",
        "sources",
        "flags",
        "backend_mode",
        "operations",
        "operation_permissions",
    ):
        assert narrow[field] == expected[field], field


@pytest_asyncio.fixture
async def delegated_cohort(db, organizer, organization):
    organization.organization_kind = "EMC"
    client = Organization(name="Isolated delegated form client", slug=f"form-client-{uuid.uuid4().hex}",
        organization_kind="CLIENT")
    db.add(client)
    await db.flush()
    owner = User(organization_id=client.id, email=f"form-owner-{uuid.uuid4().hex}@example.test",
        first_name="Client", last_name="Owner", role="organiser", is_active=True)
    workspace = OperationalWorkspace(organization_id=client.id, name="Client event workspace")
    db.add_all([owner, workspace, OrganizationAccessRevision(organization_id=client.id, revision=1)])
    await db.flush()
    db.add(OrganizationMember(organization_id=client.id, user_id=owner.id, org_role="owner",
        accepted_at=datetime.now(timezone.utc), is_active=True))
    event = Event(organization_id=client.id, created_by=owner.id, operational_workspace_id=workspace.id,
        name="Delegated form event", short_code=uuid.uuid4().hex[:8], start_date=date(2026, 10, 20),
        end_date=date(2026, 10, 21), timezone="UTC", status="draft")
    db.add(event)
    await db.flush()
    await activate_event_for_test(db, event)
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id, OrganizationMember.user_id == organizer.id))
    return SimpleNamespace(emc=organization, actor=organizer, member=member, client=client,
        owner=owner, workspace=workspace, event=event)


@pytest.mark.asyncio
async def test_registration_form_narrow_enforcement_matches_full_policy(
    db, delegated_cohort
):
    data = delegated_cohort
    async with TenantContextGuard.scoped(db, data.client.id):
        full = await CapabilityService.resolve_event(
            db,
            data.client.id,
            data.event.id,
            event=data.event,
            user_id=data.owner.id,
            include_usage=False,
        )
        narrow = await CapabilityService.resolve_event_feature_for_enforcement(
            db,
            data.client.id,
            data.event.id,
            "FEAT_REGISTRATION_FORMS",
            event=data.event,
            user_id=data.owner.id,
        )
        assert_registration_form_enforcement_equivalent(full, narrow)

        restriction = CapabilityRestriction(
            organization_id=data.client.id,
            event_id=data.event.id,
            capability_key="FEAT_REGISTRATION_FORMS",
            restriction_type="SECURITY",
            reason_code="SECURITY_RESTRICTED",
            reason="Equivalence test restriction",
            case_reference=f"TEST-{uuid.uuid4()}",
            status="APPROVED",
            requested_by=data.owner.id,
            approved_by=data.owner.id,
            idempotency_key=retry_key(),
        )
        db.add(restriction)
        await db.flush()

        restricted_full = await CapabilityService.resolve_event(
            db,
            data.client.id,
            data.event.id,
            event=data.event,
            user_id=data.owner.id,
            include_usage=False,
        )
        restricted_narrow = (
            await CapabilityService.resolve_event_feature_for_enforcement(
                db,
                data.client.id,
                data.event.id,
                "FEAT_REGISTRATION_FORMS",
                event=data.event,
                user_id=data.owner.id,
            )
        )
        assert_registration_form_enforcement_equivalent(
            restricted_full, restricted_narrow
        )
        assert restricted_narrow["reason_code"] == "SECURITY_RESTRICTED"

        data.event.status = "archived"
        await db.flush()
        suspended_full = await CapabilityService.resolve_event(
            db,
            data.client.id,
            data.event.id,
            event=data.event,
            user_id=data.owner.id,
            include_usage=False,
        )
        suspended_narrow = (
            await CapabilityService.resolve_event_feature_for_enforcement(
                db,
                data.client.id,
                data.event.id,
                "FEAT_REGISTRATION_FORMS",
                event=data.event,
                user_id=data.owner.id,
            )
        )
        assert_registration_form_enforcement_equivalent(
            suspended_full, suspended_narrow
        )
        assert suspended_narrow["reason_code"] == "SUSPENDED"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "feature_key", ["FEAT_REGISTRATION_FORMS", "FEAT_ATTENDEE_CHECKIN"]
)
async def test_capability_resolver_rejects_mismatched_preloaded_event(
    db, delegated_cohort, feature_key
):
    data = delegated_cohort
    foreign_event = SimpleNamespace(
        id=uuid.uuid4(), organization_id=data.client.id
    )
    with pytest.raises(LookupError, match="selected organization"):
        await CapabilityService.resolve_event_feature_for_enforcement(
            db,
            data.client.id,
            data.event.id,
            feature_key,
            event=foreign_event,
            user_id=data.owner.id,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("purpose", ["SURVEY", "SPEAKER_INTAKE"])
@pytest.mark.parametrize("case", ["event_scope", "workspace_scope", "requested", "suspended", "detached",
    "missing_action", "foreign_event", "catalogue_denied"])
async def test_client_approved_form_boundaries(db, delegated_cohort, purpose, case):
    data = delegated_cohort
    async with TenantContextGuard.scoped(db, data.client.id):
        category_key = "survey" if purpose == "SURVEY" else "speaker_intake"
        category = await CategoryCommands.execute(db, operation="create", actor=data.owner,
            payload=FormCategoryCreate(name="Client operational category", slug=category_key),
            idempotency_key=retry_key())
        source = await TemplateCommands.execute(db, operation="create", actor=data.owner,
            payload=FormTemplateCreate(name="Client owned operational source",
                category_id=category.id, category_key=category_key, fields=[], settings={}),
            idempotency_key=retry_key())
    payload = RelationshipRequest(client_organization_id=data.client.id, reason="Client-approved isolated test",
        scopes=[{"member_id": data.member.id, "workspace_id": data.workspace.id,
            "event_id": None if case == "workspace_scope" else data.event.id,
            "actions": ["EVENTS:VIEW"] if case == "missing_action" else ["REG_CONFIG:FORM"]}])
    async with TenantContextGuard.scoped(db, data.emc.id):
        requested = await request_relationship(db, data.actor, data.emc.id, payload, retry_key())
    relationship_id = uuid.UUID(requested["id"])
    if case != "requested":
        async with TenantContextGuard.scoped(db, data.client.id):
            active = await transition_relationship(db, data.owner, data.client.id, relationship_id,
                RelationshipTransition(action="accept", reason="Explicit client owner consent"),
                requested["version"], retry_key())
            if case in {"suspended", "detached"}:
                await transition_relationship(db, data.owner, data.client.id, relationship_id,
                    RelationshipTransition(action="suspend" if case == "suspended" else "detach",
                        reason="Client owner removed delegation"), active["version"], retry_key())
    selected_event = None if case == "workspace_scope" else data.event.id
    async with TenantContextGuard.scoped(db, data.emc.id):
        session = await persist_refresh_token(db, data.actor, uuid.uuid4().hex,
            access_mode="DELEGATED", active_organization_id=data.client.id,
            acting_organization_id=data.emc.id, active_workspace_id=data.workspace.id,
            active_event_id=selected_event, relationship_id=relationship_id)
        await db.commit()
    selector = TokenData(user_id=data.actor.id, role=data.actor.role, organization_id=data.emc.id,
        jti=str(uuid.uuid4()), session_id=session.family_id, access_mode="DELEGATED",
        active_organization_id=data.client.id, acting_organization_id=data.emc.id,
        active_workspace_id=data.workspace.id, active_event_id=selected_event, relationship_id=relationship_id)
    data.actor._request_token_data = selector
    db.info.update(customer_request_identity=data.actor.id, customer_request_selector=selector)
    try:
        async with TenantContextGuard.scoped(db, data.client.id):
            if case == "catalogue_denied":
                with pytest.raises(HTTPException) as denied:
                    await TemplateCommands.execute(db, operation="create", actor=data.actor,
                        payload=FormTemplateCreate(name="Must not create organisation catalogue"),
                        idempotency_key=retry_key())
                assert denied.value.status_code == 403
                assert denied.value.detail["code"] == "DIRECT_MEMBERSHIP_REQUIRED"
                return
            arguments = dict(event=(SimpleNamespace(id=uuid.uuid4(), organization_id=data.client.id)
                if case == "foreign_event" else data.event), purpose=purpose, actor=data.actor,
                if_match="1", idempotency_key=retry_key(),
                payload=OperationalBindingUpdate(source_template_id=source.id, source_version=source.version,
                    fields=[], settings={}))
            if case in {"event_scope", "workspace_scope"}:
                result = await update_operational_binding(db, **arguments)
                assert result.version == 2
                replay = await update_operational_binding(db, **arguments)
                assert replay.model_dump(mode="json") == result.model_dump(mode="json")
                audit = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == result.id,
                    AuditLog.action_type == "EVENT_FORM_BINDING_UPDATED"))).one()
                assert audit.new_state["access_mode"] == "DELEGATED"
                assert audit.new_state["acting_organization_id"] == str(data.emc.id)
                assert audit.new_state["target_organization_id"] == str(data.client.id)
                assert compute_audit_hash(audit) == audit.row_hash
            else:
                with pytest.raises(HTTPException) as denied:
                    await update_operational_binding(db, **arguments)
                assert denied.value.status_code == (403 if case == "missing_action" else 404)
    finally:
        db.info.pop("customer_request_identity", None)
        db.info.pop("customer_request_selector", None)
        data.actor.__dict__.pop("_request_token_data", None)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("purpose", "category_slug"),
    [("SURVEY", "survey"), ("SPEAKER_INTAKE", "speaker_intake")],
)
async def test_client_approved_delegated_binding_http_contract(
    client,
    db,
    delegated_cohort,
    purpose,
    category_slug,
    monkeypatch,
    record_property,
):
    from app.modules.identity.services.auth_service import create_access_token

    data = delegated_cohort
    emc_id = data.emc.id
    client_id = data.client.id
    owner_id = data.owner.id
    event_id = data.event.id
    workspace_id = data.workspace.id
    member_id = data.member.id
    async with TenantContextGuard.scoped(db, data.client.id):
        category = await CategoryCommands.execute(
            db,
            operation="create",
            actor=data.owner,
            payload=FormCategoryCreate(
                name=f"Client {category_slug} category", slug=category_slug
            ),
            idempotency_key=retry_key(),
        )
        source = await TemplateCommands.execute(
            db,
            operation="create",
            actor=data.owner,
            payload=FormTemplateCreate(
                name=f"Client {category_slug} source",
                category_id=category.id,
                category_key=category_slug,
                fields=[],
                settings={},
            ),
            idempotency_key=retry_key(),
        )

    request_payload = RelationshipRequest(
        client_organization_id=client_id,
        reason="Explicit client-approved HTTP form delegation",
        scopes=[{
            "member_id": member_id,
            "workspace_id": workspace_id,
            "event_id": event_id,
            "actions": ["REG_CONFIG:FORM"],
        }],
    )
    async with TenantContextGuard.scoped(db, emc_id):
        requested = await request_relationship(
            db, data.actor, emc_id, request_payload, retry_key()
        )
    relationship_id = uuid.UUID(requested["id"])
    async with TenantContextGuard.scoped(db, client_id):
        active = await transition_relationship(
            db,
            data.owner,
            client_id,
            relationship_id,
            RelationshipTransition(
                action="accept", reason="Client owner approved HTTP form delegation"
            ),
            requested["version"],
            retry_key(),
        )
    async with TenantContextGuard.scoped(db, emc_id):
        session = await persist_refresh_token(
            db,
            data.actor,
            uuid.uuid4().hex,
            access_mode="DELEGATED",
            active_organization_id=client_id,
            acting_organization_id=emc_id,
            active_workspace_id=workspace_id,
            active_event_id=event_id,
            relationship_id=relationship_id,
        )
        await db.commit()

    token = create_access_token(
        data.actor,
        session_id=session.family_id,
        access_mode="DELEGATED",
        active_organization_id=client_id,
        acting_organization_id=emc_id,
        active_workspace_id=workspace_id,
        active_event_id=event_id,
        relationship_id=relationship_id,
    )
    identity = {"Authorization": f"Bearer {token}"}
    request_metrics = []

    def capture_request_metrics(method, path, status, duration_ms, query_count, db_ms):
        request_metrics.append({
            "method": method,
            "path": path,
            "status": status,
            "duration_ms": duration_ms,
            "query_count": query_count,
            "db_ms": db_ms,
        })

    monkeypatch.setattr(
        "app.middleware.request_logging.observe_request",
        capture_request_metrics,
    )
    path = (
        f"/api/v1/forms/templates/events/{event_id}"
        f"/operational-bindings/{purpose}"
    )
    payload = {
        "source_template_id": str(source.id),
        "source_version": source.version,
        "fields": [],
        "settings": {},
    }

    missing = await client.put(path, json=payload, headers=identity)
    assert missing.status_code == 428, missing.text

    retry = f"delegated-http-{uuid.uuid4()}"
    headers = {**identity, "If-Match": "1", "Idempotency-Key": retry}
    binding_statements = []

    def capture_binding_statements(
        _connection, _cursor, statement, _parameters, _context, _executemany
    ):
        binding_statements.append(statement)

    sync_engine = db.get_bind().engine
    sqlalchemy_event.listen(
        sync_engine, "before_cursor_execute", capture_binding_statements
    )
    try:
        saved = await client.put(path, json=payload, headers=headers)
    finally:
        sqlalchemy_event.remove(
            sync_engine, "before_cursor_execute", capture_binding_statements
        )
    assert saved.status_code == 200, saved.text
    assert saved.headers["cache-control"] == "no-store"
    assert saved.json()["version"] == 2

    replay = await client.put(path, json=payload, headers=headers)
    assert replay.status_code == 200 and replay.json() == saved.json()

    changed = await client.put(
        path,
        json={**payload, "settings": {"description": "changed retry"}},
        headers=headers,
    )
    assert changed.status_code == 409

    foreign = await client.put(
        f"/api/v1/forms/templates/events/{uuid.uuid4()}/operational-bindings/{purpose}",
        json=payload,
        headers={
            **identity,
            "If-Match": "1",
            "Idempotency-Key": f"delegated-http-foreign-{uuid.uuid4()}",
        },
    )
    assert foreign.status_code == 404

    catalogue = await client.post(
        "/api/v1/forms/templates",
        json={"name": "Delegation must not grant catalogue administration"},
        headers={**identity, "Idempotency-Key": f"delegated-http-catalogue-{uuid.uuid4()}"},
    )
    assert catalogue.status_code == 403

    registration_path = f"/api/v1/events/{event_id}/registration/form-config"
    registration_payload = {"is_live": False, "fields": [], "settings": {}}
    registration_missing = await client.post(
        registration_path, json=registration_payload, headers=identity
    )
    assert registration_missing.status_code == 428, registration_missing.text

    registration_retry = f"delegated-http-registration-{uuid.uuid4()}"
    registration_headers = {
        **identity,
        "If-Match": "1",
        "Idempotency-Key": registration_retry,
    }
    registration_saved = await client.post(
        registration_path, json=registration_payload, headers=registration_headers
    )
    assert registration_saved.status_code == 200, registration_saved.text
    assert registration_saved.json()["version"] == 2

    registration_replay = await client.post(
        registration_path, json=registration_payload, headers=registration_headers
    )
    assert registration_replay.status_code == 200
    assert registration_replay.json() == registration_saved.json()

    registration_changed = await client.post(
        registration_path,
        json={**registration_payload, "is_live": True},
        headers=registration_headers,
    )
    assert registration_changed.status_code == 409

    registration_stale = await client.post(
        registration_path,
        json=registration_payload,
        headers={
            **identity,
            "If-Match": "1",
            "Idempotency-Key": f"delegated-http-registration-stale-{uuid.uuid4()}",
        },
    )
    assert registration_stale.status_code == 412

    async with TenantContextGuard.scoped(db, client_id):
        owner = await db.get(User, owner_id, populate_existing=True)
        await transition_relationship(
            db,
            owner,
            client_id,
            relationship_id,
            RelationshipTransition(
                action="suspend", reason="Client owner revoked delegated HTTP access"
            ),
            active["version"],
            retry_key(),
        )
        await db.commit()

    revoked = await client.put(
        path,
        json=payload,
        headers={
            **identity,
            "If-Match": "2",
            "Idempotency-Key": f"delegated-http-revoked-{uuid.uuid4()}",
        },
    )
    assert revoked.status_code == 404

    registration_revoked = await client.post(
        registration_path,
        json=registration_payload,
        headers={
            **identity,
            "If-Match": "2",
            "Idempotency-Key": f"delegated-http-registration-revoked-{uuid.uuid4()}",
        },
    )
    assert registration_revoked.status_code == 404

    successful_binding_writes = [
        metric for metric in request_metrics
        if metric["method"] == "PUT"
        and metric["path"] == path
        and metric["status"] == 200
    ]
    assert successful_binding_writes
    maximum_queries = max(metric["query_count"] for metric in successful_binding_writes)
    maximum_duration_ms = max(metric["duration_ms"] for metric in successful_binding_writes)
    record_property("operational_binding_max_queries", maximum_queries)
    record_property("operational_binding_max_duration_ms", maximum_duration_ms)
    relation_counts = Counter(
        match.group(1).lower()
        for statement in binding_statements
        for match in re.finditer(
            r'\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO)\s+([a-zA-Z0-9_."]+)',
            statement,
            re.IGNORECASE,
        )
    )
    record_property(
        "operational_binding_relation_counts",
        json.dumps(dict(relation_counts.most_common()), separators=(",", ":")),
    )
    catalogue_statements = [
        statement.lower()
        for statement in binding_statements
        if "commerce.feature_catalog" in statement.lower()
    ]
    assert len(catalogue_statements) <= 1
    assert all(
        "commerce.feature_catalog.key in" in statement
        for statement in catalogue_statements
    )
    # This includes identity/session validation, route-level scoped container
    # admission, one transaction-scoped mutation admission, capability checks,
    # event copy, binding, audit and receipt. It must not regress to the former
    # repeated full authorization graph (~297 statements).
    assert maximum_queries <= 80
