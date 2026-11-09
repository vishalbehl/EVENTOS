"""Invitation acceptance uses real PostgreSQL and Redis, never platform data."""
import asyncio
from datetime import datetime, timedelta, timezone
import json
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import delete, func, select, text

from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
from app.modules.rbac.services import invitations
from app.modules.rbac.services.access_foundation import accepted_member
from app.modules.organiser.application.member_commands import OrganizationMemberCommandService


async def setup_invite(db, recipient):
    org = Organization(name="Invitation test tenant", slug=f"invitation-test-{uuid.uuid4().hex}")
    db.add(org)
    await db.flush()
    member = OrganizationMember(organization_id=org.id, org_role="member", invite_email=recipient.email)
    token = invitations.issue_token(member)
    db.add_all([member, OrganizationAccessRevision(organization_id=org.id)])
    await db.flush()
    return org, member, token


@pytest.mark.asyncio
async def test_creation_uses_real_contract_capacity_and_secret_free_replay(db, organizer, organization):
    from app.modules.billing.models.cloud_commercial import CommercialOffer, CommercialOfferVersion, CommercialOfferPrice, CommercialOfferEntitlement
    from app.modules.billing.services.commercial_contract_service import CommercialContractService
    from app.modules.billing.schemas.cloud_commercial import CloudCheckoutRequest

    operator = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id))
    operator.org_role = "owner"; operator.accepted_at = datetime.now(timezone.utc)
    assert await db.get(OrganizationAccessRevision, organization.id) is not None
    offer = CommercialOffer(code=f"INVITE_{uuid.uuid4().hex}", product_family="WORKSPACE", name="Invitation capacity test",
                            display_name="Invitation capacity test", scope_type="ORGANIZATION", lifecycle_status="PUBLISHED")
    db.add(offer); await db.flush()
    version = CommercialOfferVersion(offer_id=offer.id, version_number=1, effective_from=datetime.now(timezone.utc)-timedelta(minutes=1), version_status="PUBLISHED")
    db.add(version); await db.flush()
    db.add_all([CommercialOfferPrice(offer_version_id=version.id, billing_interval="ANNUAL", pricing_unit="ACCOUNT", amount=1000, currency="INR"),
                CommercialOfferEntitlement(offer_version_id=version.id, entitlement_key="max_users", scope_type="ORGANIZATION", quantity=2, unit_type="users", consumption_model="LIMIT", hard_ceiling=True)])
    await db.flush()
    contracts = CommercialContractService(db)
    contract, invoice = await contracts.create_checkout(organization.id, organizer.id,
        CloudCheckoutRequest(account_type="ORGANIZER", workspace_offer_code=offer.code, workspace_billing_interval="ANNUAL", billing_profile={"billing_email": organizer.email}), uuid.uuid4().hex)
    invoice.status = "PAID"  # Dedicated test data; no payment provider call.
    await db.flush()
    await contracts.activate_paid_contract(invoice.id, expected_version=contract.version)
    key = uuid.uuid4().hex
    command = OrganizationMemberCommandService(db)
    result = await command.create_invitation(organization_id=organization.id, actor=organizer,
        email="intended@example.test", org_role="member", idempotency_key=key)
    assert result["invite_token"] and result["delivery_mode"] == "MANUAL"
    replay = await command.create_invitation(organization_id=organization.id, actor=organizer,
        email="intended@example.test", org_role="member", idempotency_key=key)
    assert replay["replayed"] and replay["invite_token"] is None
    stored = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key))
    assert result["invite_token"] not in json.dumps(stored.response_body)
    with pytest.raises(HTTPException) as exhausted:
        await command.create_invitation(organization_id=organization.id, actor=organizer,
            email="second@example.test", org_role="member", idempotency_key=uuid.uuid4().hex)
    assert exhausted.value.status_code == 402 and exhausted.value.detail["code"] == "QUOTA_EXHAUSTED"


@pytest.mark.asyncio
async def test_invitation_rls_with_non_owner_runtime_role(db, organizer):
    from pathlib import Path
    import ast
    from types import SimpleNamespace

    org, member, token = await setup_invite(db, organizer)
    actor = SimpleNamespace(email=organizer.email)
    target = member.id
    role = "invitation_rls_" + uuid.uuid4().hex
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA organizer_access TO "{role}"'))
    await db.execute(text(f'GRANT SELECT ON organizer_access.organization_members TO "{role}"'))
    # Execute the exact RLS DDL under review in the dedicated test database.
    tree = ast.parse((Path(__file__).parents[1] / "alembic/versions/20261006_3210_invitation_integrity.py").read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "execute" and node.args:
            statement = node.args[0]
            if isinstance(statement, ast.Constant) and isinstance(statement.value, str):
                await db.execute(text(statement.value))
    await db.execute(text("SELECT set_config('app.current_organization_id', '', true)"))
    await db.execute(text(f'SET LOCAL ROLE "{role}"'))
    try:
        privileges = (await db.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
        assert privileges == (False, False)
        table = OrganizationMember.__table__
        assert await db.scalar(select(func.count()).select_from(table)) == 0
        row, _ = await invitations.locate(db, actor, token)
        assert row.id == target
        assert await db.scalar(select(func.count()).select_from(table)) == 0  # Narrow context was reset.
        with pytest.raises(HTTPException) as denied:
            await invitations.locate(db, SimpleNamespace(email="foreign@example.test"), token)
        assert denied.value.status_code == 404
    finally:
        await db.execute(text("RESET ROLE"))
    # Role, privileges and policies are rolled back with the test fixture.


@pytest.mark.asyncio
async def test_acceptance_matches_identity_and_consumes_once(db, organizer):
    org, member, token = await setup_invite(db, organizer)
    org_id, member_id, actor_id = org.id, member.id, organizer.id
    with pytest.raises(HTTPException) as denied:
        await accepted_member(db, actor_id, org_id)
    assert denied.value.status_code == 404
    assert member.invite_token is None and member.invite_token_digest == invitations.token_digest(token)
    key = uuid.uuid4().hex
    receipt = await invitations.accept(db, organizer, token, 1, key)
    assert receipt["state"] == "ACCEPTED"
    assert (await accepted_member(db, actor_id, org_id)).id == member_id
    assert member.accepted_at == member.invite_consumed_at
    replay = await invitations.accept(db, organizer, token, 1, key)
    assert replay == receipt
    assert (await db.get(OrganizationAccessRevision, org_id)).revision == 2
    assert await db.scalar(select(func.count(AuditLog.id)).where(AuditLog.organization_id == org_id)) == 1
    stored = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.organization_id == org_id))
    assert bool(token not in json.dumps(stored.response_body))
    with pytest.raises(HTTPException) as replayed:
        await invitations.accept(db, organizer, token, 1, uuid.uuid4().hex)
    assert replayed.value.status_code == 404


@pytest.mark.asyncio
async def test_wrong_identity_expiry_revocation_and_stale_version(db, organizer, super_admin):
    org, member, token = await setup_invite(db, organizer)
    with pytest.raises(HTTPException) as denied:
        await invitations.preview(db, super_admin, token)
    assert denied.value.status_code == 404  # No global/platform role bypass.
    member.invite_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db.flush()
    with pytest.raises(HTTPException) as expired:
        await invitations.preview(db, organizer, token)
    assert expired.value.status_code == 404
    member.invite_expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    member.version = 2
    await db.flush()
    with pytest.raises(HTTPException) as stale:
        await invitations.accept(db, organizer, token, 1, uuid.uuid4().hex)
    assert stale.value.status_code == 412


@pytest.mark.asyncio
async def test_resend_invalidates_old_token_and_does_not_store_new_token(db, organizer, organization):
    operator = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id))
    operator.org_role = "owner"; operator.accepted_at = datetime.now(timezone.utc)
    assert await db.get(OrganizationAccessRevision, organization.id) is not None
    member = OrganizationMember(organization_id=organization.id, org_role="member", invite_email=organizer.email)
    old_token = invitations.issue_token(member)
    db.add(member)
    await db.flush()
    key = uuid.uuid4().hex
    member, new_token = await OrganizationMemberCommandService(db).resend_invitation(
        organization_id=organization.id, member_id=member.id, actor=organizer, if_match=1, idempotency_key=key)
    assert bool(new_token != old_token)
    assert member.invite_token is None and member.invite_token_digest == invitations.token_digest(new_token)
    with pytest.raises(HTTPException) as old:
        await invitations.preview(db, organizer, old_token)
    assert old.value.status_code == 404
    _, replay_token = await OrganizationMemberCommandService(db).resend_invitation(
        organization_id=organization.id, member_id=member.id, actor=organizer, if_match=1, idempotency_key=key)
    assert replay_token is None
    await OrganizationMemberCommandService(db).revoke_invitation(
        organization_id=organization.id, member_id=member.id, actor=organizer, if_match=2)
    with pytest.raises(HTTPException) as revoked:
        await invitations.preview(db, organizer, new_token)
    assert revoked.value.status_code == 404


@pytest.mark.asyncio
async def test_authenticated_preview_and_accept_api(client, db, organizer, monkeypatch):
    from app.modules.identity.services.auth_service import create_access_token
    peer = uuid.uuid4().hex[:24]
    # Real ingress limits remain enabled. Give this isolated test a unique
    # direct peer instead of inheriting exhausted buckets from earlier runs.
    monkeypatch.setattr(client._transport, "client", ("2001:db8:" + ":".join(peer[i:i+4] for i in range(0, 24, 4)), 1234))
    _, member, token = await setup_invite(db, organizer)
    member_id = member.id
    headers = {"Authorization": f"Bearer {create_access_token(organizer)}", "Idempotency-Key": uuid.uuid4().hex}
    unauthenticated = await client.post("/api/v1/auth/accept-invite", json={"token": token}, headers={"Idempotency-Key": uuid.uuid4().hex})
    assert unauthenticated.status_code in {401, 403}
    preview = await client.post("/api/v1/auth/invitation", json={"token": token}, headers=headers)
    assert preview.status_code == 200
    assert preview.headers["cache-control"] == "no-store"
    missing = await client.post("/api/v1/auth/accept-invite", json={"token": token}, headers=headers)
    assert missing.status_code == 428
    invalid = await client.post("/api/v1/auth/accept-invite", json={"token": token, "org_role": "owner"}, headers={**headers, "If-Match": "1"})
    assert invalid.status_code == 422
    accepted = await client.post("/api/v1/auth/accept-invite", json={"token": token}, headers={**headers, "If-Match": "1"})
    assert accepted.status_code == 200
    assert accepted.headers["cache-control"] == "no-store"
    assert "access_token" not in accepted.json()
    assert (await db.get(OrganizationMember, member_id)).accepted_at is not None


@pytest.mark.asyncio
async def test_concurrent_acceptance_is_single_use(committed_session_factory):
    async with committed_session_factory() as db:
        home = Organization(name="Invitation identity test", slug=f"invitation-home-{uuid.uuid4().hex}")
        db.add(home); await db.flush()
        actor = User(organization_id=home.id, email=f"{uuid.uuid4().hex}@example.test", first_name="Test", last_name="Invitee", role="organiser", is_active=True)
        db.add(actor); await db.flush()
        org, member, token = await setup_invite(db, actor)
        home_id, org_id, actor_id = home.id, org.id, actor.id
        await db.commit()
    ready = [asyncio.Event(), asyncio.Event()]
    async def attempt(index):
        async with committed_session_factory() as db:
            actor = await db.get(User, actor_id)
            ready[index].set(); await ready[1 - index].wait()
            try:
                await invitations.accept(db, actor, token, 1, uuid.uuid4().hex)
                return 200
            except HTTPException as failure:
                return failure.status_code
    try:
        outcomes = await asyncio.wait_for(asyncio.gather(attempt(0), attempt(1)), 15)
        assert sorted(outcomes) == [200, 404]
        async with committed_session_factory() as db:
            assert await db.scalar(select(func.count(AuditLog.id)).where(AuditLog.organization_id == org_id)) == 1
    finally:
        async with committed_session_factory() as db:
            for model in (AuditLog, IdempotencyRecord, OrganizationMember, OrganizationAccessRevision):
                await db.execute(delete(model).where(model.organization_id == org_id))
            await db.execute(delete(User).where(User.id == actor_id))
            await db.execute(delete(Organization).where(Organization.id.in_([home_id, org_id])))
            await db.commit()
