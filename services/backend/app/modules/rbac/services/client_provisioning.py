"""Separate client tenant provisioning; pending invitations grant no authority."""
import uuid
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.tenant_context import TenantContextGuard
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import ClientRelationship, ClientProvisioning
from app.modules.rbac.services.access_contexts import direct_request_context
from app.modules.rbac.services.invitations import issue_token, admission
from app.modules.rbac.services.client_relationships import administrator, validate_scopes, history, party_locks, flush_revisions
from app.modules.rbac.services.access_foundation import check_version, lock_revision
from app.modules.rbac.services.access_contexts import verify_direct_context
from app.modules.audit.models.audit_log import AuditLog
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.rbac.services.organization_foundation import initialize_new_organization
from app.modules.rbac.services.default_teams import ensure_default_organization_teams


async def provision_client(db, user, emc_id, payload, key):
    try:
        async with direct_request_context(db, user, emc_id, write=True) as context:
            _, emc = await administrator(db, user, emc_id)
            if emc.organization_kind != "EMC" or "clients:provision" not in context.actions:
                raise HTTPException(403, detail={"code": "CLIENT_PROVISIONING_PERMISSION_REQUIRED"})
            reservation = await begin_idempotent(db, organization_id=emc_id, actor_id=user.id,
                operation="client.provision", key=key,
                payload={**payload.model_dump(mode="json"), "actor_id": str(user.id)})
            replay = replay_response(reservation)
            if replay is not None:
                await db.commit()
                return {**replay[1], "invite_token": None, "replayed": True}
            await admission(user.id, emc_id)
            if await db.scalar(select(Organization.id).where(Organization.slug == payload.slug)) is not None:
                raise HTTPException(409, detail={"code": "CLIENT_PROVISIONING_CONFLICT"})
            client_id = uuid.uuid4()
            # No commercial account/subscription conversion or customer membership
            # for the EMC operator is created as a side effect of provisioning.
            client = Organization(id=client_id, name=payload.name, slug=payload.slug,
                organization_kind="CLIENT", is_platform_org=False)
            db.add(client)
            workspace = await initialize_new_organization(db, client, workspace_name="Default workspace")
            async with TenantContextGuard.scoped(db, client_id):
                member = OrganizationMember(organization_id=client_id, org_role="owner", invited_by=user.id,
                    invite_email=str(payload.owner_email).lower(), is_active=True)
                token = issue_token(member)
                db.add(member)
                await db.flush()
                await ensure_default_organization_teams(
                    db, client_id, created_by=user.id,
                )
            scopes = [{"member_id": str(staff.member_id), "workspace_id": str(workspace.id),
                "event_id": None, "actions": staff.actions} for staff in payload.staff]
            await validate_scopes(db, emc_id, client_id, scopes, requester_id=user.id)
            relationship = ClientRelationship(emc_organization_id=emc_id, client_organization_id=client_id,
                requested_by=user.id, scopes=scopes, status="REQUESTED")
            db.add(relationship); await db.flush()
            provision = ClientProvisioning(emc_organization_id=emc_id, client_organization_id=client_id,
                relationship_id=relationship.id, owner_member_id=member.id)
            db.add(provision); await db.flush()
            revision = await lock_revision(db, emc_id, write=True)
            revision.revision += 1
            history(db, user, emc_id, relationship, None, payload.reason, uuid.uuid4())
            result = {"provisioning_id": str(provision.id), "client_organization_id": str(client_id),
                "relationship_id": str(relationship.id), "owner_member_id": str(member.id),
                "owner_version": member.version, "expires_at": member.invite_expires_at.isoformat(), "delivery_mode": "MANUAL"}
            # The one-time raw token is deliberately not stored in the receipt/audit.
            await complete_idempotent(db, reservation, response_status=200, response_body=result, resource_id=provision.id)
            await db.commit()
            return {**result, "invite_token": token, "replayed": False}
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail={"code": "CLIENT_PROVISIONING_CONFLICT"}) from None
    except Exception:
        await db.rollback()
        raise


async def provisioning_status(db, user, emc_id, provisioning_id):
    async with direct_request_context(db, user, emc_id) as context:
        _, emc = await administrator(db, user, emc_id)
        if emc.organization_kind != "EMC" or "clients:provision" not in context.actions:
            raise HTTPException(403, detail={"code": "CLIENT_PROVISIONING_PERMISSION_REQUIRED"})
        row = await db.scalar(select(ClientProvisioning).where(ClientProvisioning.id == provisioning_id,
            ClientProvisioning.emc_organization_id == emc_id))
        if row is None:
            raise HTTPException(404, detail={"code": "PROVISIONING_NOT_FOUND"})
        async with TenantContextGuard.scoped(db, row.client_organization_id):
            m = OrganizationMember.__table__
            member = (await db.execute(select(m.c.version, m.c.accepted_at, m.c.is_active, m.c.invite_expires_at).where(
                m.c.id == row.owner_member_id, m.c.organization_id == row.client_organization_id))).mappings().first()
            if member is None:
                raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"})
            relationship = await db.scalar(select(ClientRelationship).where(ClientRelationship.id == row.relationship_id,
                ClientRelationship.client_organization_id == row.client_organization_id,
                ClientRelationship.emc_organization_id == emc_id))
            # Status only; no client events, people, finances or raw invitation token.
            return {"provisioning_id": str(row.id), "client_organization_id": str(row.client_organization_id),
                "relationship_id": str(row.relationship_id), "owner_member_id": str(row.owner_member_id),
                "owner_version": member["version"], "owner_accepted": member["accepted_at"] is not None,
                "owner_active": member["is_active"], "expires_at": member["invite_expires_at"],
                "relationship_status": relationship.status if relationship else "UNAVAILABLE"}


async def replace_owner_invitation(db, user, emc_id, provisioning_id, expected, reason, key):
    await verify_direct_context(db, user, emc_id)
    async with TenantContextGuard.scoped(db, emc_id):
        member, emc = await administrator(db, user, emc_id)
        if emc.organization_kind != "EMC" or member.org_role != "owner" or "clients:provision" not in await get_user_permissions(db, user.id, organization_id=emc_id):
            raise HTTPException(403, detail={"code": "CLIENT_PROVISIONING_PERMISSION_REQUIRED"})
        row = await db.scalar(select(ClientProvisioning).where(ClientProvisioning.id == provisioning_id,
            ClientProvisioning.emc_organization_id == emc_id))
        if row is None:
            raise HTTPException(404, detail={"code": "PROVISIONING_NOT_FOUND"})
    async with party_locks(db, (emc_id, row.client_organization_id), write=True) as revisions:
        async with TenantContextGuard.scoped(db, emc_id):
            member, emc = await administrator(db, user, emc_id)
            if emc.organization_kind != "EMC" or member.org_role != "owner" or "clients:provision" not in await get_user_permissions(db, user.id, organization_id=emc_id):
                raise HTTPException(403, detail={"code": "CLIENT_PROVISIONING_PERMISSION_REQUIRED"})
            receipt = await begin_idempotent(db, organization_id=emc_id, actor_id=user.id,
                operation="client.owner.invitation.replace", key=key, payload={"actor_id": str(user.id),
                    "provisioning_id": str(provisioning_id), "version": expected, "reason": reason})
            replay = replay_response(receipt)
            if replay is not None:
                await db.commit()
                return {**replay[1], "invite_token": None, "replayed": True}
            await admission(user.id, emc_id)
        async with TenantContextGuard.scoped(db, row.client_organization_id):
            active_client = await db.scalar(select(Organization.id).where(
                Organization.id == row.client_organization_id, Organization.organization_kind == "CLIENT",
                Organization.is_platform_org.is_(False), Organization.is_active.is_(True),
                Organization.suspended_at.is_(None)))
            if active_client is None:
                raise HTTPException(409, detail={"code": "OWNER_INVITATION_CANNOT_BE_REPLACED"})
            owner = await db.scalar(select(OrganizationMember).where(OrganizationMember.id == row.owner_member_id,
                OrganizationMember.organization_id == row.client_organization_id,
                OrganizationMember.is_active.is_(True), OrganizationMember.accepted_at.is_(None),
                OrganizationMember.user_id.is_(None)).with_for_update().execution_options(populate_existing=True))
            relationship = await db.scalar(select(ClientRelationship.id).where(ClientRelationship.id == row.relationship_id,
                ClientRelationship.client_organization_id == row.client_organization_id,
                ClientRelationship.emc_organization_id == emc_id, ClientRelationship.status == "REQUESTED"))
            if owner is None or relationship is None:
                raise HTTPException(409, detail={"code": "OWNER_INVITATION_CANNOT_BE_REPLACED"})
            check_version(owner.version, expected)
            token = issue_token(owner); owner.version += 1
            await db.flush([owner])
            result = {"provisioning_id": str(row.id), "client_organization_id": str(row.client_organization_id),
                "relationship_id": str(row.relationship_id), "owner_member_id": str(owner.id),
                "owner_version": owner.version, "expires_at": owner.invite_expires_at.isoformat(), "delivery_mode": "MANUAL"}
        for revision in revisions.values():
            revision.revision += 1
        await flush_revisions(db, revisions)
        async with TenantContextGuard.scoped(db, emc_id):
            db.add(AuditLog(organization_id=emc_id, actor_user_id=user.id, actor_role=user.role,
                resource_type="organization_member", resource_id=row.owner_member_id,
                action_type="CLIENT_OWNER_INVITATION_REISSUED", correlation_id=uuid.uuid4(), is_sensitive=True,
                new_state={"acting_organization_id": str(emc_id), "target_organization_id": str(row.client_organization_id),
                    "owner_version": result["owner_version"], "reason": reason}))
            await complete_idempotent(db, receipt, response_status=200, response_body=result, resource_id=row.id)
            await db.commit()
        return {**result, "invite_token": token, "replayed": False}
