from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
import pytest
from pydantic import ValidationError
from sqlalchemy import select, text

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialAccountWorkspace,
    CommercialAllocation,
    CommercialAllocationTransfer,
    CommercialContract,
    CommercialContractItem,
    CommercialOffer,
    CommercialOfferEntitlement,
    CommercialOfferPrice,
    CommercialOfferVersion,
    CommercialRequest,
    CommercialUsageLedger,
)
from app.modules.commercial.models import CommercialQuote, CommercialQuoteLineItem
from app.modules.events.models.event import Event

from app.modules.billing.schemas.cloud_commercial import (
    AllocationTransferRequest,
    CloudCheckoutRequest,
    CloudPricingPreviewRequest,
    ContractAmendmentRequest,
    CommercialRequestCreateRequest,
    EmcAllocationCreateRequest,
    EmcWorkspaceCreateRequest,
    OfferVersionCreateRequest,
    UsageMutationRequest,
)
from app.modules.billing.services.cloud_commercial_service import CloudCommercialService
from app.modules.billing.services.commercial_contract_service import CommercialContractService
from app.modules.billing.services.commercial_usage_service import CommercialUsageService
from app.modules.billing.services.commercial_tax_service import CommercialTaxService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver


def test_pricing_preview_supports_one_commercial_family_at_a_time() -> None:
    organizer = CloudPricingPreviewRequest(
        account_type="ORGANIZER",
        workspace_offer_code="WORKSPACE_PROFESSIONAL",
        workspace_billing_interval="ANNUAL",
    )
    assert organizer.account_type == "ORGANIZER"
    assert organizer.emc_offer_code is None

    with pytest.raises(ValidationError):
        CloudPricingPreviewRequest(account_type="ORGANIZER")


def test_technician_day_selection_is_bounded_and_organizer_only() -> None:
    event_id = uuid4()
    payload = CloudPricingPreviewRequest(
        account_type="ORGANIZER",
        venue_items=[
            {
                "offer_code": "VENUE_TECHNICIAN_SETUP_DAY",
                "quantity": 6,
                "event_id": event_id,
            }
        ],
    )
    assert payload.venue_items[0].quantity == 6
    assert payload.venue_items[0].event_id == event_id

    with pytest.raises(ValidationError):
        CloudPricingPreviewRequest(
            account_type="ORGANIZER",
            venue_items=[
                {
                    "offer_code": "VENUE_TECHNICIAN_SETUP_DAY",
                    "quantity": 101,
                    "event_id": event_id,
                }
            ],
        )
    with pytest.raises(ValidationError):
        CloudPricingPreviewRequest(
            account_type="EMC",
            venue_items=[
                {
                    "offer_code": "VENUE_TECHNICIAN_SETUP_DAY",
                    "quantity": 1,
                    "event_id": event_id,
                }
            ],
        )


def test_offer_version_requires_prices_and_reason() -> None:
    with pytest.raises(ValidationError):
        OfferVersionCreateRequest(effective_from="2027-01-01T00:00:00Z", change_reason="x", prices=[])

    payload = OfferVersionCreateRequest(
        effective_from="2027-01-01T00:00:00Z",
        change_reason="Annual allocation refresh",
        prices=[{"billing_interval": "ANNUAL", "pricing_unit": "ACCOUNT", "amount": 34999}],
        entitlements=[{"entitlement_key": "team_members", "scope_type": "ORGANIZATION", "quantity": 20}],
    )
    assert payload.prices[0].amount == 34999
    assert payload.entitlements[0].quantity == 20


@pytest.mark.asyncio
async def test_admin_emc_history_returns_account_scoped_immutable_ledger(db, organization) -> None:
    account = CommercialAccount(
        account_type="EMC",
        owner_organization_id=organization.id,
        status="ACTIVE",
        currency="INR",
        country="IN",
    )
    db.add(account)
    await db.flush()
    db.add(CommercialUsageLedger(
        commercial_account_id=account.id,
        organization_id=organization.id,
        entitlement_key="annual_registrations",
        quantity=125,
        operation_type="CONSUME",
        source_record_id="registration:accepted-1",
        idempotency_key=f"admin-emc-history-{uuid4()}",
    ))
    await db.flush()

    history = await CloudCommercialService(db).admin_emc_history(account.id)

    assert len(history["usage"]) == 1
    assert history["usage"][0]["organization_id"] == organization.id
    assert history["usage"][0]["entitlement_key"] == "annual_registrations"
    assert history["usage"][0]["quantity"] == 125.0
    assert history["usage"][0]["operation_type"] == "CONSUME"
    assert history["usage"][0]["source_record_id"] == "registration:accepted-1"
    assert history["contracts"] == []


@pytest.mark.asyncio
async def test_publishing_a_new_offer_version_closes_the_previous_price_window(db, organizer) -> None:
    offer = CommercialOffer(
        code=f"TEST_VERSION_WINDOW_{uuid4().hex[:8].upper()}",
        product_family="WORKSPACE",
        name="Test version window",
        display_name="Test version window",
        scope_type="ORGANIZATION",
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    first = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(days=1),
        version_status="PUBLISHED",
        change_reason="Initial price book",
    )
    db.add(first)
    await db.flush()
    db.add(CommercialOfferPrice(
        offer_version_id=first.id,
        billing_interval="ANNUAL",
        pricing_unit="ACCOUNT",
        amount=1000,
        currency="INR",
    ))
    await db.flush()

    effective_from = datetime.now(timezone.utc) + timedelta(days=30)
    service = CloudCommercialService(db)
    next_version = await service.create_offer_version(
        offer.id,
        OfferVersionCreateRequest(
            effective_from=effective_from,
            change_reason="Scheduled annual price and allocation update",
            prices=[{"billing_interval": "ANNUAL", "pricing_unit": "ACCOUNT", "amount": 1200}],
            entitlements=[{"entitlement_key": "team_members", "scope_type": "ORGANIZATION", "quantity": 20}],
        ),
        organizer.id,
        "1",
        "version-window-v2",
    )
    published = await service.publish_offer_version(next_version.id, organizer.id, "1")
    await db.refresh(first)
    assert published.version_status == "PUBLISHED"
    assert first.effective_until == effective_from

    with pytest.raises(HTTPException) as conflict:
        await service.create_offer_version(
            offer.id,
            OfferVersionCreateRequest(
                effective_from=effective_from,
                change_reason="Conflicting effective date must be rejected",
                prices=[{"billing_interval": "ANNUAL", "pricing_unit": "ACCOUNT", "amount": 1400}],
            ),
            organizer.id,
            "2",
            "version-window-conflict",
        )
    assert conflict.value.status_code == 422


def test_usage_mutation_is_idempotency_ready_and_limited_to_metering_operations() -> None:
    payload = UsageMutationRequest(
        allocation_id="00000000-0000-0000-0000-000000000001",
        entitlement_key="registrations",
        quantity=1,
        operation_type="CONSUME",
        source_record_id="registration:123",
    )
    assert payload.operation_type == "CONSUME"

    with pytest.raises(ValidationError):
        UsageMutationRequest(
            allocation_id=payload.allocation_id,
            entitlement_key="registrations",
            quantity=0,
            operation_type="CONSUME",
        )


def test_phase_one_migration_seeds_the_catalogue_and_allocations() -> None:
    migration = Path(__file__).parents[1] / "alembic" / "versions" / "20260917_2400_versioned_cloud_commercial.py"
    source = migration.read_text(encoding="utf-8")
    for code in ("WORKSPACE_PROFESSIONAL", "EVENT_REGISTRATIONS_250", "EMC_PROFESSIONAL"):
        assert code in source
    assert "commercial_offer_versions" in source
    assert "commercial_offer_entitlements" in source
    assert "Initial Phase 1 cloud catalogue" in source


@pytest.mark.asyncio
async def test_retired_cloud_pricing_tables_are_not_present(db) -> None:
    """Plans and venue applications must use the canonical versioned catalogue."""
    rows = await db.execute(text("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'commerce'
          AND table_name = ANY(:table_names)
    """), {"table_names": [
        "subscription_plans",
        "organization_subscriptions",
        "subscription_transactions",
        "organization_addons",
        "plan_features",
        "addons",
        "addon_features",
        "venue_addons",
        "venue_addon_features",
    ]})
    assert rows.scalars().all() == []


def test_storage_metering_uses_bytes_against_gigabyte_allocations() -> None:
    assert CommercialUsageService.unit_scale("storage_gb") == 1024 ** 3
    assert CommercialUsageService.unit_scale("annual_storage_gb") == 1024 ** 3
    assert CommercialUsageService.unit_scale("registrations") == 1


def test_india_gst_is_calculated_once_and_rounded_at_currency_precision() -> None:
    rate, gst, total = CommercialTaxService.calculate(750)
    assert rate == 18
    assert gst == 135
    assert total == 885


@pytest.mark.asyncio
async def test_pricing_preview_composes_multiple_events_independently(db) -> None:
    offer = CommercialOffer(
        code=f"TEST_MULTI_EVENT_{uuid4().hex[:8].upper()}",
        product_family="EVENT",
        name="Test multi-event plan",
        display_name="Test multi-event plan",
        scope_type="EVENT",
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    db.add(CommercialOfferPrice(
        offer_version_id=version.id,
        billing_interval="PER_EVENT",
        pricing_unit="EVENT",
        amount=100,
        currency="INR",
    ))
    await db.flush()

    first_event_id = uuid4()
    second_event_id = uuid4()
    preview = await CloudCommercialService(db).pricing_preview(CloudPricingPreviewRequest(
        account_type="ORGANIZER",
        events=[
            {"event_id": first_event_id, "offer_code": offer.code},
            {"event_id": second_event_id, "offer_code": offer.code},
        ],
    ))

    assert [line.event_id for line in preview.line_items] == [first_event_id, second_event_id]
    assert preview.subtotal == Decimal("200.00")
    assert preview.gst == Decimal("36.00")
    assert preview.total == Decimal("236.00")


@pytest.mark.asyncio
async def test_technician_day_preview_multiplies_days_and_technicians(db) -> None:
    offer = CommercialOffer(
        code=f"TEST_VENUE_TECHNICIAN_{uuid4().hex[:8].upper()}",
        product_family="VENUE_ADDON",
        name="Test onsite technician",
        display_name="Test onsite technician",
        scope_type="EVENT",
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    db.add_all(
        [
            CommercialOfferPrice(
                offer_version_id=version.id,
                billing_interval="ONE_TIME",
                pricing_unit="TECHNICIAN_DAY",
                amount=10_000,
                currency="INR",
                minimum_quantity=1,
                maximum_quantity=100,
            ),
            CommercialOfferEntitlement(
                offer_version_id=version.id,
                entitlement_key="venue_technician_days",
                scope_type="EVENT",
                quantity=1,
                unit_type="technician_days",
            ),
        ]
    )
    await db.flush()

    preview = await CloudCommercialService(db).pricing_preview(
        CloudPricingPreviewRequest(
            account_type="ORGANIZER",
            venue_items=[
                {
                    "offer_code": offer.code,
                    "quantity": 6,
                    "event_id": uuid4(),
                }
            ],
        )
    )

    assert preview.line_items[0].quantity == 6
    assert preview.line_items[0].unit_price == Decimal("10000.00")
    assert preview.line_items[0].line_total == Decimal("60000.00")


@pytest.mark.asyncio
async def test_self_service_checkout_activates_only_after_payment_and_is_idempotent(db, organization, organizer) -> None:
    offer = CommercialOffer(
        code=f"TEST_WORKSPACE_ACTIVATE_{uuid4().hex[:8].upper()}",
        product_family="WORKSPACE",
        name="Test workspace activation",
        display_name="Test workspace activation",
        scope_type="ORGANIZATION",
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    db.add_all([
        CommercialOfferPrice(
            offer_version_id=version.id,
            billing_interval="ANNUAL",
            pricing_unit="ACCOUNT",
            amount=1000,
            currency="INR",
        ),
        CommercialOfferEntitlement(
            offer_version_id=version.id,
            entitlement_key="team_members",
            scope_type="ORGANIZATION",
            quantity=5,
            unit_type="users",
            consumption_model="LIMIT",
            hard_ceiling=True,
        ),
    ])
    await db.flush()

    service = CommercialContractService(db)
    contract, invoice = await service.create_checkout(
        organization.id,
        organizer.id,
        CloudCheckoutRequest(
            account_type="ORGANIZER",
            workspace_offer_code=offer.code,
            workspace_billing_interval="ANNUAL",
            billing_profile={"billing_email": organizer.email},
        ),
        "workspace-activation-checkout",
    )
    assert contract.status == "PENDING_PAYMENT"
    assert invoice.status != "PAID"
    assert "team_members" not in await EntitlementResolver.resolve_entitlements(db, organization.id)

    invoice.status = "PAID"
    await db.flush()
    activated = await service.activate_paid_contract(invoice.id, expected_version=contract.version)
    assert activated is not None
    assert activated.status == "ACTIVE"
    assert "team_members" in await EntitlementResolver.resolve_entitlements(db, organization.id)

    replay = await service.activate_paid_contract(invoice.id)
    assert replay is not None and replay.id == activated.id
    allocations = list((await db.scalars(select(CommercialAllocation).where(
        CommercialAllocation.contract_item_id.in_(
            select(CommercialContractItem.id).where(CommercialContractItem.contract_id == contract.id)
        )
    ))).all())
    assert len(allocations) == 1


@pytest.mark.asyncio
async def test_event_capacity_exhaustion_and_recovery_after_addon_purchase(db, organization, organizer) -> None:
    event = Event(
        organization_id=organization.id,
        created_by=organizer.id,
        name="Commercial capacity event",
        short_code=f"CAP{uuid4().hex[:6].upper()}",
        start_date=date(2027, 6, 1),
        end_date=date(2027, 6, 2),
        timezone="UTC",
        status="draft",
    )
    event_offer = CommercialOffer(
        code=f"TEST_EVENT_CAPACITY_{uuid4().hex[:8].upper()}",
        product_family="EVENT",
        name="Test event capacity plan",
        display_name="Test event capacity plan",
        scope_type="EVENT",
        lifecycle_status="PUBLISHED",
    )
    addon_offer = CommercialOffer(
        code=f"TEST_EVENT_ADDON_{uuid4().hex[:8].upper()}",
        product_family="CAPACITY_ADDON",
        name="Test registration capacity bundle",
        display_name="Test registration capacity bundle",
        scope_type="EVENT",
        lifecycle_status="PUBLISHED",
    )
    db.add_all([event, event_offer, addon_offer])
    await db.flush()
    event_version = CommercialOfferVersion(
        offer_id=event_offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
        eligible_addon_codes=[addon_offer.code],
    )
    addon_version = CommercialOfferVersion(
        offer_id=addon_offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
    )
    db.add_all([event_version, addon_version])
    await db.flush()
    db.add_all([
        CommercialOfferPrice(offer_version_id=event_version.id, billing_interval="PER_EVENT", pricing_unit="EVENT", amount=100, currency="INR"),
        CommercialOfferEntitlement(offer_version_id=event_version.id, entitlement_key="registrations", scope_type="EVENT", quantity=2, unit_type="registrations", consumption_model="LIMIT", hard_ceiling=True),
        CommercialOfferPrice(offer_version_id=addon_version.id, billing_interval="ONE_TIME", pricing_unit="BUNDLE", amount=50, currency="INR"),
        CommercialOfferEntitlement(offer_version_id=addon_version.id, entitlement_key="registrations", scope_type="EVENT", quantity=3, unit_type="registrations", consumption_model="LIMIT", hard_ceiling=True),
    ])
    await db.flush()

    service = CommercialContractService(db)
    initial, initial_invoice = await service.create_checkout(
        organization.id,
        organizer.id,
        CloudCheckoutRequest(
            account_type="ORGANIZER",
            events=[{"event_id": event.id, "offer_code": event_offer.code, "capacity_addon_codes": [addon_offer.code]}],
            billing_profile={"billing_email": organizer.email},
            auto_renew=False,
        ),
        "event-capacity-initial",
    )
    initial_invoice.status = "PAID"
    await db.flush()
    assert await service.activate_paid_contract(initial_invoice.id, expected_version=initial.version)
    assert await EntitlementResolver.get_limit(
        db, organization.id, "max_registrations", event_id=event.id
    ) == 5

    metering = CommercialUsageService(db)
    assert await metering.consume_if_allocated(
        organization_id=organization.id,
        event_id=event.id,
        entitlement_key="registrations",
        quantity=5,
        actor_id=organizer.id,
        idempotency_key="event-capacity-consume-five",
        source_record_id="registration-batch-five",
    )
    with pytest.raises(HTTPException) as exhausted:
        await metering.consume_if_allocated(
            organization_id=organization.id,
            event_id=event.id,
            entitlement_key="registrations",
            quantity=1,
            actor_id=organizer.id,
            idempotency_key="event-capacity-over-limit",
            source_record_id="registration-over-limit",
        )
    assert exhausted.value.status_code == 409
    assert exhausted.value.detail["code"] == "CAPACITY_EXHAUSTED"

    recovery, recovery_invoice = await service.create_checkout(
        organization.id,
        organizer.id,
        CloudCheckoutRequest(
            account_type="ORGANIZER",
            events=[{"event_id": event.id, "capacity_addon_codes": [addon_offer.code]}],
            billing_profile={"billing_email": organizer.email},
            auto_renew=False,
        ),
        "event-capacity-recovery",
    )
    recovery_invoice.status = "PAID"
    await db.flush()
    assert await service.activate_paid_contract(recovery_invoice.id, expected_version=recovery.version)
    assert await EntitlementResolver.get_limit(
        db, organization.id, "max_registrations", event_id=event.id
    ) == 8
    assert await metering.consume_if_allocated(
        organization_id=organization.id,
        event_id=event.id,
        entitlement_key="registrations",
        quantity=1,
        actor_id=organizer.id,
        idempotency_key="event-capacity-recovered",
        source_record_id="registration-after-addon",
    )
    purchases = await CloudCommercialService(db).capacity_purchases(organization.id)
    assert len([row for row in purchases if row["offer_code"] == addon_offer.code]) == 2


@pytest.mark.asyncio
async def test_renewal_uses_new_effective_offer_version(db, organization, organizer) -> None:
    offer = CommercialOffer(
        code=f"TEST_WORKSPACE_RENEW_{uuid4().hex[:8].upper()}",
        product_family="WORKSPACE",
        name="Test workspace renewal",
        display_name="Test workspace renewal",
        scope_type="ORGANIZATION",
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    first_version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(days=2),
        version_status="PUBLISHED",
        change_reason="Initial published workspace price",
    )
    db.add(first_version)
    await db.flush()
    db.add(CommercialOfferPrice(
        offer_version_id=first_version.id,
        billing_interval="ANNUAL",
        pricing_unit="ACCOUNT",
        amount=1000,
        currency="INR",
    ))
    await db.flush()

    service = CommercialContractService(db)
    original, original_invoice = await service.create_checkout(
        organization.id,
        organizer.id,
        CloudCheckoutRequest(
            account_type="ORGANIZER",
            workspace_offer_code=offer.code,
            workspace_billing_interval="ANNUAL",
            billing_profile={"billing_email": organizer.email},
        ),
        "workspace-renewal-original",
    )
    original_invoice.status = "PAID"
    await db.flush()
    assert await service.activate_paid_contract(original_invoice.id, expected_version=original.version)

    second_version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=2,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
        change_reason="Annual price and allocation refresh",
    )
    db.add(second_version)
    await db.flush()
    db.add(CommercialOfferPrice(
        offer_version_id=second_version.id,
        billing_interval="ANNUAL",
        pricing_unit="ACCOUNT",
        amount=1200,
        currency="INR",
    ))
    original.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db.flush()

    renewed, renewal_invoice = await service.renew_contract(
        original.id,
        organizer.id,
        "workspace-renewal-v2",
    )
    renewed_item = await db.scalar(select(CommercialContractItem).where(
        CommercialContractItem.contract_id == renewed.id,
    ))
    assert renewed.status == "PENDING_PAYMENT"
    assert renewal_invoice.total_amount_inr == Decimal("1416.00")
    assert renewed_item is not None
    assert renewed_item.offer_version_id == second_version.id
    assert renewed_item.unit_price == Decimal("1200.00")


@pytest.mark.asyncio
async def test_approved_workspace_amendment_preserves_history_and_creates_delta_invoice(db, organization, organizer) -> None:
    starter = CommercialOffer(
        code=f"TEST_WORKSPACE_STARTER_{uuid4().hex[:8].upper()}",
        product_family="WORKSPACE",
        name="Test workspace starter",
        display_name="Test workspace starter",
        scope_type="ORGANIZATION",
        lifecycle_status="PUBLISHED",
    )
    upgraded = CommercialOffer(
        code=f"TEST_WORKSPACE_UPGRADED_{uuid4().hex[:8].upper()}",
        product_family="WORKSPACE",
        name="Test workspace upgraded",
        display_name="Test workspace upgraded",
        scope_type="ORGANIZATION",
        lifecycle_status="PUBLISHED",
    )
    db.add_all([starter, upgraded])
    await db.flush()
    starter_version = CommercialOfferVersion(
        offer_id=starter.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(days=1),
        version_status="PUBLISHED",
        change_reason="Starter launch",
    )
    upgraded_version = CommercialOfferVersion(
        offer_id=upgraded.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(days=1),
        version_status="PUBLISHED",
        change_reason="Approved upgrade offer",
    )
    db.add_all([starter_version, upgraded_version])
    await db.flush()
    db.add_all([
        CommercialOfferPrice(
            offer_version_id=starter_version.id,
            billing_interval="ANNUAL",
            pricing_unit="ACCOUNT",
            amount=1000,
            currency="INR",
        ),
        CommercialOfferPrice(
            offer_version_id=upgraded_version.id,
            billing_interval="ANNUAL",
            pricing_unit="ACCOUNT",
            amount=2000,
            currency="INR",
        ),
        CommercialOfferEntitlement(
            offer_version_id=starter_version.id,
            entitlement_key="team_members",
            scope_type="ORGANIZATION",
            value_type="LIMIT",
            quantity=5,
            unit_type="count",
        ),
        CommercialOfferEntitlement(
            offer_version_id=upgraded_version.id,
            entitlement_key="team_members",
            scope_type="ORGANIZATION",
            value_type="LIMIT",
            quantity=20,
            unit_type="count",
        ),
    ])
    await db.flush()

    service = CommercialContractService(db)
    contract, invoice = await service.create_checkout(
        organization.id,
        organizer.id,
        CloudCheckoutRequest(
            account_type="ORGANIZER",
            workspace_offer_code=starter.code,
            workspace_billing_interval="ANNUAL",
            billing_profile={"billing_email": organizer.email},
        ),
        "workspace-amendment-original",
    )
    invoice.status = "PAID"
    await db.flush()
    assert await service.activate_paid_contract(invoice.id, expected_version=contract.version)

    amendment = await service.amend_contract(
        contract.id,
        ContractAmendmentRequest(
            target_offer_code=upgraded.code,
            reason="Approved customer workspace upgrade",
        ),
        organizer.id,
        "workspace-amendment-upgrade",
        contract.version,
    )
    amended_item = await db.scalar(select(CommercialContractItem).where(
        CommercialContractItem.contract_id == contract.id,
    ))
    allocations = list((await db.scalars(select(CommercialAllocation).where(
        CommercialAllocation.contract_item_id == amended_item.id,
        CommercialAllocation.entitlement_key == "team_members",
    ))).all())
    assert amendment.status == "APPLIED"
    assert amendment.invoice_id is not None
    assert amendment.price_delta == Decimal("1000.00")
    assert amendment.total_delta == Decimal("1180.00")
    assert amended_item.offer_id == upgraded.id
    assert amended_item.offer_version_id == upgraded_version.id
    assert {(allocation.status, allocation.quantity_total) for allocation in allocations} == {
        ("AMENDED", 5),
        ("ACTIVE", 20),
    }


@pytest.mark.asyncio
async def test_emc_capacity_preview_does_not_duplicate_the_base_plan(db) -> None:
    offer = CommercialOffer(
        code=f"TEST_EMC_CAPACITY_{uuid4().hex[:8].upper()}",
        product_family="CAPACITY_ADDON",
        name="Test EMC capacity",
        display_name="Test EMC capacity",
        scope_type="EMC",
        is_quote_only=True,
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    db.add(CommercialOfferPrice(
        offer_version_id=version.id,
        billing_interval="ONE_TIME",
        pricing_unit="BUNDLE",
        amount=0,
        currency="INR",
    ))
    await db.flush()

    preview = await CloudCommercialService(db).pricing_preview(CloudPricingPreviewRequest(
        account_type="EMC",
        capacity_addon_codes=[offer.code],
    ))

    assert preview.quote_required is True
    assert [line.code for line in preview.line_items] == [offer.code]
    assert all(line.product_family == "CAPACITY_ADDON" for line in preview.line_items)


@pytest.mark.asyncio
async def test_enterprise_request_locks_requested_capacity_into_quote_snapshot(db, organization, organizer) -> None:
    offer = CommercialOffer(
        code=f"TEST_EVENT_ENTERPRISE_{uuid4().hex[:8].upper()}",
        product_family="EVENT",
        name="Enterprise",
        display_name="Event Enterprise",
        scope_type="EVENT",
        is_quote_only=True,
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    db.add(CommercialOfferPrice(
        offer_version_id=version.id,
        billing_interval="PER_EVENT",
        pricing_unit="EVENT",
        amount=0,
        currency="INR",
    ))
    await db.flush()
    from app.modules.events.models.event import Event
    event = Event(
        organization_id=organization.id,
        created_by=organizer.id,
        name="Enterprise capacity event",
        short_code=f"CE{uuid4().hex[:4].upper()}",
        start_date=date(2027, 1, 10),
        end_date=date(2027, 1, 12),
        timezone="UTC",
        status="draft",
    )
    db.add(event)
    await db.flush()

    request = await CommercialContractService(db).create_request(
        organization.id,
        organizer.id,
        CommercialRequestCreateRequest(
            account_type="ORGANIZER",
            events=[{"event_id": event.id, "offer_code": offer.code}],
            request_type="ENTERPRISE",
            requested_capacity={"registrations": 5000, "storage_gb": 200},
            requirements={"notes": "Dedicated onboarding"},
            billing_profile={"billing_email": organizer.email},
            reason="Custom enterprise event capacity",
        ),
        idempotency_key=f"enterprise-request-{uuid4()}",
    )

    line = request.preview_snapshot_json["line_items"][0]
    assert line["entitlement_snapshot"] == {"registrations": 5000, "storage_gb": 200}
    assert request.requested_capacity[offer.code] == {"registrations": 5000, "storage_gb": 200}


@pytest.mark.asyncio
async def test_approved_cloud_quote_is_the_contract_and_invoice_authority(db, organization, organizer) -> None:
    commercial = CloudCommercialService(db)
    account = await commercial.get_or_create_account(organization.id, account_type="ORGANIZER")
    offer = CommercialOffer(
        code=f"TEST_WORKSPACE_ENTERPRISE_{uuid4().hex[:8].upper()}",
        product_family="WORKSPACE",
        name="Enterprise",
        display_name="Workspace Enterprise",
        scope_type="ORGANIZATION",
        is_quote_only=True,
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc) - timedelta(minutes=1),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    request = CommercialRequest(
        commercial_account_id=account.id,
        organization_id=organization.id,
        request_type="ENTERPRISE",
        product_family="WORKSPACE",
        requested_offer_codes=[offer.code],
        requested_capacity={offer.code: {"team_members": 50}},
        requirements_json={},
        preview_snapshot_json={"line_items": []},
        billing_profile={"billing_email": organizer.email, "billing_name": organization.name},
        status="QUOTE_ISSUED",
        reason="Enterprise workspace request",
        created_by=organizer.id,
        idempotency_key=f"request-{uuid4()}",
    )
    db.add(request)
    await db.flush()
    quote = CommercialQuote(
        organization_id=organization.id,
        event_id=None,
        commercial_request_id=request.id,
        product_family="WORKSPACE",
        price_book_version="2026.9",
        quote_number=f"QTE-TEST-{uuid4().hex[:8].upper()}",
        title="Approved Workspace Enterprise quote",
        status="APPROVED",
        currency="INR",
        validity_days=30,
        valid_until=datetime.now(timezone.utc) + timedelta(days=30),
        discount_type="FIXED",
        discount_value=Decimal("10000"),
        tax_rate=Decimal("18"),
        subtotal=Decimal("100000"),
        discount_amount=Decimal("10000"),
        taxable_amount=Decimal("90000"),
        tax_amount=Decimal("16200"),
        total_amount=Decimal("106200"),
        created_by=organizer.id,
    )
    quote.line_items = [CommercialQuoteLineItem(
        category="WORKSPACE",
        name="Workspace Enterprise",
        quantity=1,
        duration_days=1,
        unit_rate=Decimal("100000"),
        line_subtotal=Decimal("100000"),
        sort_order=0,
        product_family="WORKSPACE",
        offer_code=offer.code,
        offer_version_id=version.id,
        allocation_version_id=version.id,
        commercial_request_id=request.id,
        tax_rate=Decimal("18"),
        source_snapshot_json={
            "code": offer.code,
            "product_family": "WORKSPACE",
            "billing_interval": "ANNUAL",
            "offer_version_id": str(version.id),
            "entitlement_snapshot": {"team_members": 50},
        },
    )]
    db.add(quote)
    await db.flush()
    request.quote_id = quote.id
    request.quote_reference = quote.quote_number
    await db.flush()

    contract_service = CommercialContractService(db)
    pre_activation = await contract_service.request_state(request)
    assert pre_activation["quote_status"] == "APPROVED"
    assert pre_activation["next_action"] == "AWAIT_CONTRACT_ACTIVATION"

    contract, invoice = await contract_service.activate_quoted_request(
        request.id,
        organizer.id,
        idempotency_key=f"activate-{uuid4()}",
        expected_version=request.version,
    )

    assert contract.source_quote_id == quote.id
    assert invoice.amount == Decimal("90000.00")
    assert invoice.gst_amount == Decimal("16200.00")
    assert invoice.total_amount_inr == Decimal("106200.00")
    item = await db.scalar(select(CommercialContractItem).where(CommercialContractItem.contract_id == contract.id))
    assert item is not None
    assert item.offer_version_id == version.id
    assert item.line_total == Decimal("100000.00")
    assert item.allocation_snapshot_json["entitlements"]["team_members"] == 50
    payment_pending = await contract_service.request_state(request)
    assert payment_pending["payment_state"] == "UNPAID"
    assert payment_pending["next_action"] == "PAY_INVOICE"


@pytest.mark.asyncio
async def test_organizer_quote_acceptance_is_idempotent_and_unlocks_activation(db, organization, organizer) -> None:
    commercial = CloudCommercialService(db)
    account = await commercial.get_or_create_account(organization.id, account_type="ORGANIZER")
    request = CommercialRequest(
        commercial_account_id=account.id,
        organization_id=organization.id,
        request_type="ENTERPRISE",
        product_family="WORKSPACE",
        requested_offer_codes=["WORKSPACE_ENTERPRISE"],
        requested_capacity={},
        requirements_json={},
        preview_snapshot_json={"line_items": []},
        billing_profile={"billing_email": organizer.email},
        status="QUOTE_ISSUED",
        reason="Approved custom workspace quote",
        created_by=organizer.id,
        idempotency_key=f"quote-accept-request-{uuid4()}",
    )
    db.add(request)
    await db.flush()
    quote = CommercialQuote(
        organization_id=organization.id,
        commercial_request_id=request.id,
        product_family="WORKSPACE",
        price_book_version="2026.9",
        quote_number=f"QTE-ACCEPT-{uuid4().hex[:8].upper()}",
        title="Acceptable Workspace quote",
        status="DRAFT",
        currency="INR",
        validity_days=30,
        valid_until=datetime.now(timezone.utc) + timedelta(days=30),
        subtotal=Decimal("1000.00"),
        taxable_amount=Decimal("1000.00"),
        tax_amount=Decimal("180.00"),
        total_amount=Decimal("1180.00"),
        created_by=organizer.id,
    )
    db.add(quote)
    await db.flush()
    request.quote_id = quote.id
    request.quote_reference = quote.quote_number
    await db.flush()

    service = CommercialContractService(db)
    accepted = await service.accept_quoted_request(
        organization.id, request.id, organizer.id, request.version, "quote-acceptance-key"
    )
    replay = await service.accept_quoted_request(
        organization.id, request.id, organizer.id, 1, "quote-acceptance-key"
    )
    await db.refresh(quote)
    assert accepted.id == request.id
    assert replay.id == request.id
    assert quote.status == "APPROVED"
    assert request.quote_acceptance_idempotency_key == "quote-acceptance-key"


@pytest.mark.asyncio
async def test_pending_payment_contract_does_not_grant_entitlements(db, organization) -> None:
    account = CommercialAccount(
        account_type="ORGANIZER",
        owner_organization_id=organization.id,
        currency="INR",
        country="IN",
    )
    offer = CommercialOffer(
        code="TEST_PENDING_ACCESS",
        product_family="WORKSPACE",
        name="Pending access",
        display_name="Pending access",
        scope_type="ORGANIZATION",
        lifecycle_status="PUBLISHED",
    )
    db.add_all([account, offer])
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    db.add(CommercialOfferEntitlement(
        offer_version_id=version.id,
        entitlement_key="team_members",
        scope_type="ORGANIZATION",
        quantity=5,
        unit_type="users",
    ))
    contract = CommercialContract(
        commercial_account_id=account.id,
        contract_type="WORKSPACE",
        status="PENDING_PAYMENT",
        starts_at=datetime.now(timezone.utc),
        billing_interval="ANNUAL",
        currency="INR",
    )
    db.add_all([contract, CommercialAccountWorkspace(
        commercial_account_id=account.id,
        organization_id=organization.id,
        workspace_role="OWNER",
        status="ACTIVE",
    )])
    await db.flush()
    db.add(CommercialContractItem(
        contract_id=contract.id,
        offer_id=offer.id,
        offer_version_id=version.id,
        quantity=1,
        unit_price=1,
        line_total=1,
        allocation_snapshot_json={"entitlements": {"team_members": 5}},
    ))
    await db.flush()

    assert await EntitlementResolver._contract_rows(db, organization.id) == []



@pytest.mark.asyncio
async def test_emc_pooled_capacity_is_used_for_client_events(db, organization) -> None:
    """A client event can consume an event-independent EMC annual pool."""
    client_org = Organization(
        name="EMC Client",
        slug=f"emc-client-{uuid4().hex[:8]}",
    )
    db.add(client_org)
    await db.flush()

    account = CommercialAccount(
        account_type="EMC",
        owner_organization_id=organization.id,
        currency="INR",
        country="IN",
    )
    db.add(account)
    await db.flush()
    db.add_all([
        CommercialAccountWorkspace(
            commercial_account_id=account.id,
            organization_id=organization.id,
            workspace_role="OWNER",
            status="ACTIVE",
        ),
        CommercialAccountWorkspace(
            commercial_account_id=account.id,
            organization_id=client_org.id,
            workspace_role="CLIENT",
            status="ACTIVE",
        ),
    ])

    offer = CommercialOffer(
        code="TEST_EMC_POOL",
        product_family="EMC",
        name="Test EMC",
        display_name="Test EMC",
        scope_type="EMC",
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    contract = CommercialContract(
        commercial_account_id=account.id,
        contract_type="EMC",
        status="ACTIVE",
        starts_at=datetime.now(timezone.utc),
        billing_interval="ANNUAL",
        currency="INR",
    )
    db.add(contract)
    await db.flush()
    item = CommercialContractItem(
        contract_id=contract.id,
        offer_id=offer.id,
        offer_version_id=version.id,
        quantity=1,
        unit_price=1,
        line_total=1,
        allocation_snapshot_json={"entitlements": {"annual_registrations": 2}},
    )
    db.add(item)
    await db.flush()
    client_workspace = await db.scalar(select(CommercialAccountWorkspace).where(
        CommercialAccountWorkspace.organization_id == client_org.id,
        CommercialAccountWorkspace.workspace_role == "CLIENT",
    ))
    allocation = CommercialAllocation(
        contract_item_id=item.id,
        commercial_account_id=account.id,
        organization_id=client_org.id,
        event_id=None,
        client_workspace_id=client_workspace.id,
        entitlement_key="annual_registrations",
        quantity_total=2,
        valid_from=datetime.now(timezone.utc),
        status="ACTIVE",
    )
    db.add(allocation)
    await db.flush()

    result = await CommercialUsageService(db).consume_if_allocated(
        organization_id=client_org.id,
        event_id=uuid4(),
        entitlement_key="registrations",
        quantity=1,
        actor_id=None,
        idempotency_key="test-emc-registration-1",
        source_record_id="registration:test-1",
    )

    assert result is True
    await db.refresh(allocation)
    assert allocation.quantity_consumed == 1
    ledger = await db.scalar(select(CommercialUsageLedger).where(
        CommercialUsageLedger.allocation_id == allocation.id,
    ))
    assert ledger is not None
    assert ledger.operation_type == "CONSUME"


@pytest.mark.asyncio
async def test_emc_owner_client_isolation_and_allocation_transfers(db, organization, organizer) -> None:
    """EMC owners manage the pool while clients see only their own allocation."""
    client_one = Organization(
        name="EMC Client One",
        slug=f"emc-client-one-{uuid4().hex[:8]}",
    )
    client_two = Organization(
        name="EMC Client Two",
        slug=f"emc-client-two-{uuid4().hex[:8]}",
    )
    db.add_all([client_one, client_two])
    await db.flush()

    commercial = CloudCommercialService(db)
    account = await commercial.get_or_create_account(organization.id, account_type="EMC")
    workspace_one = await commercial.add_emc_workspace(
        organization.id,
        EmcWorkspaceCreateRequest(organization_id=client_one.id, reason="Attach first EMC client workspace"),
        actor_id=organizer.id,
    )
    workspace_two = await commercial.add_emc_workspace(
        organization.id,
        EmcWorkspaceCreateRequest(organization_id=client_two.id, reason="Attach second EMC client workspace"),
        actor_id=organizer.id,
    )

    offer = CommercialOffer(
        code="TEST_EMC_ISOLATION",
        product_family="EMC",
        name="Test EMC Isolation",
        display_name="Test EMC Isolation",
        scope_type="EMC",
        lifecycle_status="PUBLISHED",
    )
    db.add(offer)
    await db.flush()
    version = CommercialOfferVersion(
        offer_id=offer.id,
        version_number=1,
        effective_from=datetime.now(timezone.utc),
        version_status="PUBLISHED",
    )
    db.add(version)
    await db.flush()
    db.add(CommercialOfferPrice(
        offer_version_id=version.id,
        billing_interval="ANNUAL",
        pricing_unit="ACCOUNT",
        amount=1,
        currency="INR",
    ))
    contract = CommercialContract(
        commercial_account_id=account.id,
        contract_type="EMC",
        status="ACTIVE",
        starts_at=datetime.now(timezone.utc),
        billing_interval="ANNUAL",
        currency="INR",
    )
    db.add(contract)
    await db.flush()
    item = CommercialContractItem(
        contract_id=contract.id,
        offer_id=offer.id,
        offer_version_id=version.id,
        quantity=1,
        unit_price=1,
        line_total=1,
        allocation_snapshot_json={"entitlements": {"annual_registrations": 10}},
    )
    db.add(item)
    await db.flush()
    pool = CommercialAllocation(
        contract_item_id=item.id,
        commercial_account_id=account.id,
        organization_id=organization.id,
        event_id=None,
        client_workspace_id=None,
        entitlement_key="annual_registrations",
        quantity_total=10,
        valid_from=datetime.now(timezone.utc),
        status="ACTIVE",
    )
    db.add(pool)
    await db.flush()

    from app.modules.events.models.event import Event
    client_one_event = Event(
        organization_id=client_one.id,
        created_by=organizer.id,
        name="Client one private event",
        short_code=f"C1{uuid4().hex[:4].upper()}",
        start_date=date(2027, 2, 1),
        end_date=date(2027, 2, 2),
        timezone="UTC",
        status="draft",
    )
    db.add(client_one_event)
    await db.flush()

    with pytest.raises(HTTPException) as cross_workspace_event:
        await commercial.allocate_emc_capacity(
            organization.id,
            EmcAllocationCreateRequest(
                client_workspace_id=workspace_two["id"],
                event_id=client_one_event.id,
                entitlement_key="annual_registrations",
                quantity=1,
                reason="Attempt cross-workspace event allocation",
            ),
            actor_id=organizer.id,
            idempotency_key="emc-cross-workspace-event-denied",
        )
    assert cross_workspace_event.value.status_code == 404
    assert cross_workspace_event.value.detail["code"] == "EMC_CLIENT_EVENT_NOT_FOUND"

    allocation_one = await commercial.allocate_emc_capacity(
        organization.id,
        EmcAllocationCreateRequest(
            client_workspace_id=workspace_one["id"],
            entitlement_key="annual_registrations",
            quantity=3,
            reason="Allocate client one annual pool",
        ),
        actor_id=organizer.id,
        idempotency_key="emc-allocate-client-one",
    )
    allocation_two = await commercial.allocate_emc_capacity(
        organization.id,
        EmcAllocationCreateRequest(
            client_workspace_id=workspace_two["id"],
            entitlement_key="annual_registrations",
            quantity=2,
            reason="Allocate client two annual pool",
        ),
        actor_id=organizer.id,
        idempotency_key="emc-allocate-client-two",
    )

    owner_view = await commercial.emc_allocations(organization.id)
    # The owner account lives in a different tenant. Client reads must resolve
    # that account only through their active EMC workspace mapping, then return
    # no pooled or sibling-workspace capacity.
    async with TenantContextGuard.scoped(db, client_one.id):
        client_one_view = await commercial.emc_allocations(client_one.id)
        client_one_workspaces = await commercial.emc_workspaces(client_one.id)
    async with TenantContextGuard.scoped(db, client_two.id):
        client_two_view = await commercial.emc_allocations(client_two.id)
    assert {row["client_workspace_id"] for row in owner_view} == {
        None,
        workspace_one["id"],
        workspace_two["id"],
    }
    assert [row["total"] for row in client_one_view] == [3]
    assert [row["total"] for row in client_two_view] == [2]
    assert {row["organization_id"] for row in client_one_workspaces} == {client_one.id}

    with pytest.raises(HTTPException) as client_mutation:
        await commercial.allocate_emc_capacity(
            client_one.id,
            EmcAllocationCreateRequest(
                client_workspace_id=workspace_two["id"],
                entitlement_key="annual_registrations",
                quantity=1,
                reason="Unauthorised client allocation",
            ),
            actor_id=None,
            idempotency_key="emc-client-mutation-denied",
        )
    assert client_mutation.value.status_code == 403

    # An EMC owner is in a different tenant from both client allocations.
    # The transfer must still be atomic, idempotent, and fully account-scoped.
    async with TenantContextGuard.scoped(db, organization.id):
        transfer = await commercial.transfer_allocation(
            organization.id,
            AllocationTransferRequest(
                source_allocation_id=allocation_one["allocation_id"],
                target_allocation_id=allocation_two["allocation_id"],
                entitlement_key="annual_registrations",
                quantity=1,
                reason="Rebalance annual capacity",
            ),
            actor_id=organizer.id,
            idempotency_key="emc-rebalance-1",
        )
        replay = await commercial.transfer_allocation(
            organization.id,
            AllocationTransferRequest(
                source_allocation_id=allocation_one["allocation_id"],
                target_allocation_id=allocation_two["allocation_id"],
                entitlement_key="annual_registrations",
                quantity=1,
                reason="Rebalance annual capacity",
            ),
            actor_id=organizer.id,
            idempotency_key="emc-rebalance-1",
        )
    assert replay.id == transfer.id
    refreshed_one = await db.get(CommercialAllocation, allocation_one["allocation_id"])
    refreshed_two = await db.get(CommercialAllocation, allocation_two["allocation_id"])
    assert refreshed_one.quantity_total == 2
    assert refreshed_two.quantity_total == 3
    ledger_operations = list((await db.scalars(select(CommercialUsageLedger).where(
        CommercialUsageLedger.commercial_account_id == account.id,
        CommercialUsageLedger.source_record_id == f"allocation-transfer:{transfer.id}",
    ))).all())
    assert {row.operation_type for row in ledger_operations} == {"TRANSFER_IN", "TRANSFER_OUT"}
    assert await db.scalar(select(CommercialAllocationTransfer).where(
        CommercialAllocationTransfer.id == transfer.id,
    )) is not None
