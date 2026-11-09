"""Explicit synthetic commercial fixture, never imported by application paths."""
from datetime import date, datetime, timezone
import uuid

from sqlalchemy import select


async def seed_upload_event(db, *, owner, event_id, workspace_id):
    from app.core.tenant_context import TenantContextGuard
    from app.modules.events.models.event import Event
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.billing.models.cloud_commercial import (
        CommercialAccount, CommercialAccountWorkspace, CommercialContract, CommercialContractItem,
        CommercialOffer, CommercialOfferVersion, CommercialOfferPrice, CommercialOfferEntitlement)
    from app.modules.billing.services.activation_service import ActivationService
    from app.modules.platform.models.organization_console import EventCommercialContract
    from app.modules.rbac.models.organization_member import OrganizationMember
    from app.modules.identity.models.user import User
    from app.modules.registration.schemas.event_form_contracts import form_document

    async with TenantContextGuard.scoped(db, owner):
        actor_id = await db.scalar(select(OrganizationMember.user_id).join(User,
            User.id == OrganizationMember.user_id).where(OrganizationMember.organization_id == owner,
            OrganizationMember.org_role == "owner", OrganizationMember.is_active.is_(True),
            OrganizationMember.accepted_at.is_not(None), User.is_active.is_(True),
            User.deleted_at.is_(None)).order_by(OrganizationMember.id).limit(1))
        if actor_id is None:
            raise RuntimeError("Synthetic cohort requires a persisted accepted active owner")
        event = Event(id=event_id, organization_id=owner, operational_workspace_id=workspace_id,
            created_by=actor_id,
            name=f"Category A isolated public upload proof {event_id}", short_code=f"UP{event_id.hex[:10]}",
            status="draft", start_date=date.today(), end_date=date.today())
        db.add(event)
        await db.flush()
        account = await db.scalar(select(CommercialAccount).where(CommercialAccount.owner_organization_id == owner))
        if account is None:
            account = CommercialAccount(owner_organization_id=owner, account_type="ORGANIZER",
                status="ACTIVE", currency="INR", country="IN")
            db.add(account)
            await db.flush()
            db.add(CommercialAccountWorkspace(commercial_account_id=account.id,
                organization_id=owner, workspace_role="OWNER", status="ACTIVE"))
        offer = CommercialOffer(code=f"LOCAL_UPLOAD_PROOF_{uuid.uuid4().hex[:12]}", product_family="EVENT",
            name="Isolated upload rehearsal - not a production offer", display_name="Isolated upload rehearsal",
            scope_type="EVENT", lifecycle_status="PUBLISHED", is_quote_only=False)
        db.add(offer)
        await db.flush()
        version = CommercialOfferVersion(offer_id=offer.id, version_number=1,
            effective_from=datetime.now(timezone.utc), version_status="PUBLISHED",
            change_reason="Approved synthetic local upload acceptance only")
        db.add(version)
        await db.flush()
        db.add(CommercialOfferPrice(offer_version_id=version.id, billing_interval="PER_EVENT",
            pricing_unit="EVENT", amount=0, currency="INR", tax_mode="EXCLUSIVE"))
        db.add_all([
            CommercialOfferEntitlement(offer_version_id=version.id, entitlement_key="storage_quota_mb",
                scope_type="EVENT", value_type="QUANTITY", quantity=64, unit_type="MB", consumption_model="LIMIT", hard_ceiling=True),
            *[CommercialOfferEntitlement(offer_version_id=version.id, entitlement_key=key,
                scope_type="EVENT", value_type="TIER", metadata_json={"value": value},
                consumption_model="UNLOCK", hard_ceiling=True) for key, value in
                (("FEAT_REGISTRATION_PORTAL", "BASIC"), ("FEAT_REGISTRATION_FORMS", "STANDARD"))]])
        contract = CommercialContract(commercial_account_id=account.id, contract_type="EVENT", status="ACTIVE",
            starts_at=datetime.now(timezone.utc), billing_interval="PER_EVENT", currency="INR",
            price_book_version="isolated-upload-proof", auto_renew=False)
        db.add(contract)
        await db.flush()
        db.add(CommercialContractItem(contract_id=contract.id, offer_id=offer.id,
            offer_version_id=version.id, event_id=event.id, quantity=1, unit_price=0, tax_rate=0, line_total=0,
            allocation_snapshot_json={"storage_quota_mb": 64}))
        await db.flush()
        await ActivationService.activate_event(db, organization_id=owner, event_id=event.id,
            commercial_contract_id=contract.id, activation_policy="SNAPSHOT_LOCKED")
        db.add(EventCommercialContract(organization_id=owner, event_id=event.id, version=1,
            status="ACTIVE", plan_key="LOCAL_UPLOAD_PROOF", plan_version="1", currency="INR",
            entitlements={"FEAT_REGISTRATION_PORTAL": {"type": "TIER", "value": "BASIC"},
                "FEAT_REGISTRATION_FORMS": {"type": "TIER", "value": "STANDARD"},
                "storage_quota_mb": {"type": "LIMIT", "value": 64}},
            hard_ceilings={}, addons=[], created_by=actor_id, source={"local_upload_rehearsal": True,
                "commercial_contract_id": str(contract.id)}))
        document = form_document([{
            "id": "proof_document", "name": "proof_document", "type": "file", "label": "Proof document",
            "validation": {"allowed_file_types": [".pdf", ".xlsx"], "max_file_size_mb": 1}}], {}, event_id=event.id)
        db.add(RegistrationFormConfig(event_id=event.id, is_live=True,
            fields=document["fields"], settings=document["settings"]))
        event.status = "active"
        await db.commit()
        return {"event_id": str(event.id), "contract_id": str(contract.id), "offer_id": str(offer.id)}
