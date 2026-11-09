from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.billing.models.billing_domain_tables import Invoice, InvoiceItem, OrganizationBillingProfile
from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialAccountWorkspace,
    CommercialAllocation,
    CommercialContract,
    CommercialContractAmendment,
    CommercialContractItem,
    CommercialOffer,
    CommercialOfferEntitlement,
    CommercialOfferVersion,
    CommercialRequest,
)
from app.modules.billing.schemas.cloud_commercial import (
    CloudCheckoutRequest,
    CloudPriceLine,
    CommercialRequestCreateRequest,
    CommercialRequestDecisionRequest,
    ContractAmendmentRequest,
)
from app.modules.billing.services.cloud_commercial_service import CloudCommercialService, _money
from app.modules.billing.services.commercial_usage_service import CommercialUsageService
from app.modules.billing.services.commercial_tax_service import CommercialTaxService
from app.modules.audit.models.audit_log import AuditLog
from app.modules.commercial.models import CommercialQuote, CommercialQuoteLineItem
from app.modules.commercial.quote_service import add_revision, new_quote_number, validity_deadline
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization


GST_RATE = CommercialTaxService.GST_RATE


def _json_decimal(value: Decimal | float | int) -> float:
    return float(_money(value))


def _ends_at(starts_at: datetime, interval: str, event_dates: Iterable[Any]) -> datetime | None:
    normalized = (interval or "").upper()
    if normalized == "MONTHLY":
        return starts_at + timedelta(days=30)
    if normalized == "ANNUAL":
        return starts_at + timedelta(days=365)
    dates = [value for value in event_dates if value]
    if not dates:
        return None
    latest = max(dates)
    if isinstance(latest, datetime):
        return latest if latest.tzinfo else latest.replace(tzinfo=timezone.utc)
    if isinstance(latest, date):
        return datetime.combine(latest, datetime.max.time(), tzinfo=timezone.utc)
    return None


class CommercialContractService:
    """Builds immutable contract/invoice snapshots and activates only after settlement."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.commercial = CloudCommercialService(db)

    def _audit(
        self,
        *,
        actor_id: uuid.UUID | None,
        organization_id: uuid.UUID | None,
        resource_type: str,
        resource_id: uuid.UUID,
        action_type: str,
        old_state: dict[str, Any] | None = None,
        new_state: dict[str, Any] | None = None,
        change_diff: dict[str, Any] | None = None,
    ) -> None:
        self.db.add(AuditLog(
            organization_id=organization_id,
            actor_user_id=actor_id,
            resource_type=resource_type,
            resource_id=resource_id,
            action_type=action_type,
            old_state=old_state,
            new_state=new_state,
            change_diff=change_diff,
            is_sensitive=True,
        ))

    async def _organization_events(self, organization_id: uuid.UUID, event_ids: set[uuid.UUID]) -> list[Event]:
        if not event_ids:
            return []
        rows = list((await self.db.scalars(select(Event).where(
            Event.id.in_(event_ids), Event.organization_id == organization_id,
        ))).all())
        if len(rows) != len(event_ids):
            raise HTTPException(status_code=404, detail={"code": "COMMERCIAL_EVENT_NOT_FOUND"})
        return rows

    async def _account_and_workspaces(self, organization_id: uuid.UUID, account_type: str) -> CommercialAccount:
        return await self.commercial.get_or_create_account(organization_id, account_type=account_type)

    async def _validate_scope(
        self,
        account: CommercialAccount,
        organization_id: uuid.UUID,
        lines: list[CloudPriceLine],
    ) -> list[Event]:
        event_ids = {line.event_id for line in lines if line.event_id}
        events = await self._organization_events(organization_id, event_ids)  # type: ignore[arg-type]
        workspace_ids = {line.client_workspace_id for line in lines if line.client_workspace_id}
        if workspace_ids:
            if account.account_type != "EMC":
                raise HTTPException(status_code=422, detail="Client workspaces are available only to EMC accounts")
            workspaces = list((await self.db.scalars(select(CommercialAccountWorkspace).where(
                CommercialAccountWorkspace.id.in_(workspace_ids),
                CommercialAccountWorkspace.commercial_account_id == account.id,
                CommercialAccountWorkspace.workspace_role == "CLIENT",
                CommercialAccountWorkspace.status == "ACTIVE",
            ))).all())
            if len(workspaces) != len(workspace_ids):
                raise HTTPException(status_code=404, detail={"code": "EMC_CLIENT_WORKSPACE_NOT_FOUND"})
        return events

    @staticmethod
    def _contract_type(lines: list[CloudPriceLine]) -> str:
        families = {line.product_family for line in lines if line.product_family != "CAPACITY_ADDON"}
        if "EMC" in families:
            return "EMC"
        if families == {"WORKSPACE"}:
            return "WORKSPACE"
        if families == {"EVENT"}:
            return "EVENT"
        if families and families.issubset({"VENUE", "VENUE_ADDON"}):
            return "VENUE"
        if not families and any(line.event_id for line in lines):
            return "EVENT"
        return "CUSTOM"

    @staticmethod
    def _billing_interval(payload: CloudCheckoutRequest, lines: list[CloudPriceLine]) -> str:
        if payload.workspace_billing_interval:
            return payload.workspace_billing_interval
        workspace_line = next((line for line in lines if line.product_family == "WORKSPACE"), None)
        if workspace_line:
            return workspace_line.billing_interval
        if any(line.product_family == "EMC" for line in lines):
            return "ANNUAL"
        if lines and all(line.billing_interval in {"ONE_TIME", "PER_EVENT"} for line in lines) and any(line.event_id for line in lines):
            return "PER_EVENT"
        if all(line.billing_interval == "PER_EVENT" for line in lines):
            return "PER_EVENT"
        intervals = {line.billing_interval for line in lines}
        if len(intervals) == 1:
            return next(iter(intervals))
        return "ANNUAL"

    async def _billing_profile(self, organization_id: uuid.UUID, supplied: dict[str, Any]) -> dict[str, Any]:
        organization = await self.db.get(Organization, organization_id)
        saved = await self.db.scalar(select(OrganizationBillingProfile).where(
            OrganizationBillingProfile.organization_id == organization_id,
        ))
        profile = {
            "billing_name": supplied.get("billing_name") or (saved.billing_name if saved else None) or getattr(organization, "name", None) or "EventOS customer",
            "billing_email": supplied.get("billing_email") or (saved.billing_email if saved else None) or getattr(organization, "billing_email", None),
            "billing_phone": supplied.get("billing_phone") or (saved.billing_phone if saved else None),
            "gst_number": supplied.get("gst_number") or (saved.gst_number if saved else None),
        }
        if not profile["billing_email"]:
            raise HTTPException(status_code=422, detail="billing_profile.billing_email is required")
        return profile

    async def _persist_billing_profile(
        self,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        profile: dict[str, Any],
    ) -> None:
        """Keep renewal billing identity durable after a self-service checkout."""
        saved = await self.db.scalar(select(OrganizationBillingProfile).where(
            OrganizationBillingProfile.organization_id == organization_id,
        ).with_for_update())
        values = {
            "billing_name": profile["billing_name"],
            "billing_email": profile["billing_email"],
            "billing_phone": profile.get("billing_phone"),
            "gst_number": profile.get("gst_number"),
        }
        if saved is None:
            saved = OrganizationBillingProfile(
                organization_id=organization_id,
                updated_by=actor_id,
                **values,
            )
            self.db.add(saved)
            await self.db.flush()
            self._audit(
                actor_id=actor_id,
                organization_id=organization_id,
                resource_type="organization_billing_profile",
                resource_id=saved.id,
                action_type="ORGANIZATION_BILLING_PROFILE_CAPTURED_AT_CHECKOUT",
                new_state=values,
            )
            return
        if any(getattr(saved, key) != value for key, value in values.items()):
            old_state = {key: getattr(saved, key) for key in values}
            for key, value in values.items():
                setattr(saved, key, value)
            saved.updated_by = actor_id
            saved.version += 1
            await self.db.flush()
            self._audit(
                actor_id=actor_id,
                organization_id=organization_id,
                resource_type="organization_billing_profile",
                resource_id=saved.id,
                action_type="ORGANIZATION_BILLING_PROFILE_CAPTURED_AT_CHECKOUT",
                old_state=old_state,
                new_state=values,
            )

    async def _create_invoice_and_contract(
        self,
        *,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        account: CommercialAccount,
        lines: list[CloudPriceLine],
        billing_interval: str,
        auto_renew: bool,
        billing_profile: dict[str, Any],
        idempotency_key: str,
        source_request_id: uuid.UUID | None = None,
        renewed_from_contract_id: uuid.UUID | None = None,
        source_quote_id: uuid.UUID | None = None,
        starts_at: datetime | None = None,
        approved_quote_totals: dict[str, Decimal] | None = None,
    ) -> tuple[CommercialContract, Invoice]:
        existing = await self.db.scalar(select(CommercialContract).where(
            CommercialContract.commercial_account_id == account.id,
            CommercialContract.checkout_idempotency_key == idempotency_key,
        ))
        if existing:
            invoice = await self.db.scalar(select(Invoice).where(Invoice.commercial_contract_id == existing.id))
            if not invoice:
                raise HTTPException(status_code=409, detail="Contract exists without its invoice")
            return existing, invoice

        starts = starts_at or datetime.now(timezone.utc)
        event_dates = []
        for line in lines:
            if line.event_id:
                event = await self.db.get(Event, line.event_id)
                if event:
                    event_dates.append(getattr(event, "end_date", None))
        ends = _ends_at(starts, billing_interval, event_dates)
        contract = CommercialContract(
            commercial_account_id=account.id,
            contract_type=self._contract_type(lines),
            status="PENDING_PAYMENT",
            starts_at=starts,
            ends_at=ends,
            billing_interval=billing_interval,
            currency="INR",
            price_book_version=datetime.now(timezone.utc).strftime("%Y.%m"),
            source_request_id=source_request_id,
            source_quote_id=source_quote_id,
            renewed_from_contract_id=renewed_from_contract_id,
            auto_renew=auto_renew,
            checkout_idempotency_key=idempotency_key,
        )
        self.db.add(contract)
        await self.db.flush()

        line_subtotal = _money(sum((line.line_total for line in lines), Decimal("0")))
        if approved_quote_totals:
            subtotal = _money(approved_quote_totals["taxable_amount"])
            gst = _money(approved_quote_totals["tax_amount"])
            total = _money(approved_quote_totals["total_amount"])
            tax_rate = _money(approved_quote_totals["tax_rate"])
            discount_amount = _money(approved_quote_totals.get("discount_amount", Decimal("0")))
        else:
            subtotal = line_subtotal
            tax_rate, gst, total = CommercialTaxService.calculate(subtotal)
            discount_amount = Decimal("0")
        invoice = Invoice(
            organization_id=organization_id,
            amount=subtotal,
            currency="INR",
            status="UNPAID",
            due_date=starts + timedelta(days=7),
            invoice_number=f"CLOUD-{uuid.uuid4().hex[:16].upper()}",
            gst_amount=gst,
            total_amount_inr=total,
            commercial_contract_id=contract.id,
        )
        self.db.add(invoice)
        await self.db.flush()
        contract.invoice_id = invoice.id

        line_tax_total = Decimal("0")
        for line in lines:
            snapshot = {
                "entitlements": line.entitlement_snapshot,
                "event_id": str(line.event_id) if line.event_id else None,
                "client_workspace_id": str(line.client_workspace_id) if line.client_workspace_id else None,
                "offer_code": line.code,
                "offer_version_id": str(line.offer_version_id),
            }
            item = CommercialContractItem(
                contract_id=contract.id,
                offer_id=(await self.db.scalar(select(CommercialOffer).where(CommercialOffer.code == line.code))).id,
                offer_version_id=line.offer_version_id,
                event_id=line.event_id,
                client_workspace_id=line.client_workspace_id,
                quantity=line.quantity,
                unit_price=line.unit_price,
                tax_rate=tax_rate,
                line_total=line.line_total,
                allocation_snapshot_json=snapshot,
            )
            self.db.add(item)
            await self.db.flush()
            tax_amount = _money(line.line_total * tax_rate / Decimal("100"))
            line_tax_total += tax_amount
            self.db.add(InvoiceItem(
                invoice_id=invoice.id,
                description=line.display_name,
                amount=line.line_total,
                quantity=line.quantity,
                commercial_offer_code=line.code,
                commercial_offer_version_id=line.offer_version_id,
                commercial_contract_item_id=item.id,
                tax_rate=tax_rate,
                tax_amount=tax_amount,
            ))
        if discount_amount > 0:
            # Preserve the approved quote total exactly while keeping every
            # product line tied to its immutable commercial version.
            self.db.add(InvoiceItem(
                invoice_id=invoice.id,
                description="Approved quote discount",
                amount=-discount_amount,
                quantity=1,
                tax_rate=tax_rate,
                tax_amount=_money(gst - line_tax_total),
            ))
        await self.db.flush()
        self._audit(
            actor_id=actor_id,
            organization_id=organization_id,
            resource_type="commercial_contract",
            resource_id=contract.id,
            action_type="COMMERCIAL_CONTRACT_CREATED",
            new_state={
                "contract_type": contract.contract_type,
                "status": contract.status,
                "billing_interval": contract.billing_interval,
                "source_request_id": str(source_request_id) if source_request_id else None,
                "source_quote_id": str(source_quote_id) if source_quote_id else None,
                "invoice_id": str(invoice.id),
                "line_count": len(lines),
            },
        )
        await self.db.flush()
        return contract, invoice

    async def create_checkout(
        self,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        payload: CloudCheckoutRequest,
        idempotency_key: str,
        *,
        workspace_dependency_satisfied: bool = False,
    ) -> tuple[CommercialContract, Invoice]:
        account = await self._account_and_workspaces(organization_id, payload.account_type)
        preview = await self.commercial.pricing_preview(payload)
        if preview.quote_required:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "QUOTE_REQUIRED", "message": "This selection must be approved through a quotation before checkout."})
        requires_workspace = any(
            line.product_family in {"EVENT", "CAPACITY_ADDON"}
            for line in preview.line_items
        )
        if requires_workspace and not workspace_dependency_satisfied:
            active_workspace_contract = await self.db.scalar(
                select(CommercialContract.id)
                .where(
                    CommercialContract.commercial_account_id == account.id,
                    CommercialContract.contract_type == "WORKSPACE",
                    CommercialContract.status == "ACTIVE",
                )
                .limit(1)
            )
            if not active_workspace_contract:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "WORKSPACE_PLAN_REQUIRED",
                        "message": "Purchase and activate a Workspace plan before buying Event plans or Event add-ons.",
                    },
                )
        await self._validate_scope(account, organization_id, preview.line_items)
        event_plan_ids = {
            line.event_id
            for line in preview.line_items
            if line.product_family == "EVENT" and line.event_id is not None
        }
        addon_event_ids = {
            line.event_id
            for line in preview.line_items
            if line.product_family == "CAPACITY_ADDON" and line.event_id is not None
        }
        event_ids_to_check = event_plan_ids | addon_event_ids
        active_event_plan_ids: set[uuid.UUID] = set()
        if event_ids_to_check:
            active_event_plan_ids = set(
                (
                    await self.db.scalars(
                        select(CommercialContractItem.event_id)
                        .join(
                            CommercialContract,
                            CommercialContract.id == CommercialContractItem.contract_id,
                        )
                        .join(
                            CommercialOffer,
                            CommercialOffer.id == CommercialContractItem.offer_id,
                        )
                        .where(
                            CommercialContract.commercial_account_id == account.id,
                            CommercialContract.status == "ACTIVE",
                            CommercialOffer.product_family == "EVENT",
                            CommercialContractItem.event_id.in_(event_ids_to_check),
                        )
                    )
                ).all()
            )
        duplicate_event_plans = event_plan_ids & active_event_plan_ids
        if duplicate_event_plans:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "EVENT_PLAN_ALREADY_ACTIVE",
                    "message": "The event already has an active Event plan. Purchase compatible Event add-ons instead.",
                },
            )
        missing_base_plans = (addon_event_ids - event_plan_ids) - active_event_plan_ids
        if missing_base_plans:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "EVENT_PLAN_REQUIRED",
                    "message": "Purchase and activate an Event plan before adding Event capacity.",
                },
            )
        profile = await self._billing_profile(organization_id, payload.billing_profile)
        await self._persist_billing_profile(organization_id, actor_id, profile)
        return await self._create_invoice_and_contract(
            organization_id=organization_id,
            actor_id=actor_id,
            account=account,
            lines=preview.line_items,
            billing_interval=self._billing_interval(payload, preview.line_items),
            # Event contracts are per-event and finite capacity bundles are
            # one-time purchases; neither should silently create a renewal.
            # Workspace and EMC contracts retain the customer-selected
            # renewal preference.
            auto_renew=payload.auto_renew and not any(
                line.product_family in {"EVENT", "CAPACITY_ADDON"}
                or line.billing_interval in {"ONE_TIME", "PER_EVENT"}
                for line in preview.line_items
            ),
            billing_profile=profile,
            idempotency_key=idempotency_key,
            source_request_id=payload.source_request_id,
        )

    async def create_request(
        self,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        payload: CommercialRequestCreateRequest,
        idempotency_key: str,
    ) -> CommercialRequest:
        account = await self._account_and_workspaces(organization_id, payload.account_type)
        existing = await self.db.scalar(select(CommercialRequest).where(
            CommercialRequest.commercial_account_id == account.id,
            CommercialRequest.idempotency_key == idempotency_key,
        ))
        if existing:
            return existing
        preview = await self.commercial.pricing_preview(payload)
        await self._validate_scope(account, organization_id, preview.line_items)
        if payload.requested_capacity:
            # Custom quantities are commercial-request data, never direct
            # self-service checkout input. They become part of the immutable
            # quote line snapshot reviewed by Command Center.
            target_line = next((line for line in preview.line_items if line.product_family != "CAPACITY_ADDON"), preview.line_items[0])
            target_line.entitlement_snapshot = {
                **target_line.entitlement_snapshot,
                **payload.requested_capacity,
            }
        families = {line.product_family for line in preview.line_items if line.product_family != "CAPACITY_ADDON"}
        family = "EMC" if "EMC" in families else "WORKSPACE" if "WORKSPACE" in families else "VENUE" if families & {"VENUE", "VENUE_ADDON"} else "EVENT"
        request = CommercialRequest(
            commercial_account_id=account.id,
            organization_id=organization_id,
            request_type=payload.request_type,
            product_family=family,
            event_id=next((line.event_id for line in preview.line_items if line.event_id), None),
            requested_offer_codes=[line.code for line in preview.line_items],
            requested_capacity={line.code: line.entitlement_snapshot for line in preview.line_items},
            requirements_json=payload.requirements,
            preview_snapshot_json=preview.model_dump(mode="json"),
            billing_profile=await self._billing_profile(organization_id, payload.billing_profile),
            status="PENDING",
            reason=payload.reason,
            created_by=actor_id,
            idempotency_key=idempotency_key,
        )
        self.db.add(request)
        await self.db.flush()
        return request

    async def create_cloud_quote_from_request(
        self,
        request: CommercialRequest,
        actor_id: uuid.UUID,
        idempotency_key: str,
    ) -> CommercialQuote:
        """Persist a quote snapshot from the approved commercial preview.

        The quote is deliberately copied from the request preview rather than
        recalculated in the UI, so offer and allocation versions remain tied to
        the issued commercial document.
        """
        if request.quote_id:
            existing = await self.db.get(CommercialQuote, request.quote_id)
            if existing:
                return existing
        existing = await self.db.scalar(select(CommercialQuote).where(
            CommercialQuote.organization_id == request.organization_id,
            CommercialQuote.idempotency_key == idempotency_key,
        ))
        if existing:
            request.quote_id = existing.id
            request.quote_reference = existing.quote_number
            return existing

        snapshot = request.preview_snapshot_json or {}
        raw_lines = snapshot.get("line_items") or []
        if not raw_lines:
            raise HTTPException(status_code=409, detail="Commercial request has no pricing snapshot")
        subtotal = _money(snapshot.get("subtotal", 0))
        gst = _money(snapshot.get("gst", 0))
        total = _money(snapshot.get("total", subtotal + gst))
        tax_rate = _money(snapshot.get("gst_rate", GST_RATE))
        quote = CommercialQuote(
            organization_id=request.organization_id,
            event_id=request.event_id,
            commercial_request_id=request.id,
            product_family=request.product_family,
            price_book_version=snapshot.get("price_book_version"),
            quote_number=new_quote_number(),
            title=f"EventOS {request.product_family.title()} commercial quote",
            status="DRAFT",
            currency="INR",
            validity_days=30,
            valid_until=validity_deadline(30),
            discount_type="NONE",
            discount_value=Decimal("0"),
            tax_rate=tax_rate,
            subtotal=subtotal,
            discount_amount=Decimal("0"),
            taxable_amount=subtotal,
            tax_amount=gst,
            total_amount=total,
            idempotency_key=idempotency_key,
            request_hash=request.id.hex,
            created_by=actor_id,
        )
        quote.line_items = []
        for index, raw in enumerate(raw_lines):
            offer_version_id = raw.get("offer_version_id")
            offer_version_uuid = uuid.UUID(str(offer_version_id)) if offer_version_id else None
            event_id = raw.get("event_id")
            client_workspace_id = raw.get("client_workspace_id")
            quote.line_items.append(CommercialQuoteLineItem(
                category=raw.get("product_family") or request.product_family,
                name=raw.get("display_name") or raw.get("code") or "Commercial item",
                description=f"{raw.get('code', 'Commercial item')} · {raw.get('billing_interval', 'ONE_TIME')}",
                quantity=raw.get("quantity", 1),
                duration_days=1,
                unit_rate=raw.get("unit_price", 0),
                line_subtotal=raw.get("line_total", 0),
                sort_order=index,
                product_family=raw.get("product_family"),
                offer_code=raw.get("code"),
                offer_version_id=offer_version_uuid,
                allocation_version_id=offer_version_uuid,
                event_id=uuid.UUID(str(event_id)) if event_id else None,
                client_workspace_id=uuid.UUID(str(client_workspace_id)) if client_workspace_id else None,
                commercial_request_id=request.id,
                tax_rate=tax_rate,
                source_snapshot_json=raw,
            ))
        self.db.add(quote)
        await self.db.flush()
        add_revision(self.db, quote, actor_id, "Cloud commercial quote issued from approved request")
        request.quote_id = quote.id
        request.quote_reference = quote.quote_number
        await self.db.flush()
        return quote

    async def accept_quoted_request(
        self,
        organization_id: uuid.UUID,
        request_id: uuid.UUID,
        actor_id: uuid.UUID,
        expected_version: int,
        idempotency_key: str,
    ) -> CommercialRequest:
        """Record an organiser's acceptance of an issued Cloud quote.

        Cloud quotes are not Venue Ops quotes: their accepted price and
        allocation snapshots become the authority for contract activation.
        Keeping the request in ``QUOTE_ISSUED`` makes the hand-off to the
        platform activation workflow explicit while the quote status records
        the customer's approval.
        """
        request = await self.db.scalar(select(CommercialRequest).where(
            CommercialRequest.id == request_id,
            CommercialRequest.organization_id == organization_id,
        ).with_for_update())
        if not request:
            raise HTTPException(status_code=404, detail="Commercial request not found")
        if request.quote_acceptance_idempotency_key == idempotency_key:
            return request
        if request.status != "QUOTE_ISSUED" or not request.quote_id:
            raise HTTPException(status_code=409, detail={"code": "QUOTE_NOT_READY_FOR_ACCEPTANCE", "status": request.status})
        quote = await self.db.scalar(select(CommercialQuote).options(
            selectinload(CommercialQuote.line_items)
        ).where(
            CommercialQuote.id == request.quote_id,
            CommercialQuote.organization_id == organization_id,
        ).with_for_update())
        if not quote:
            raise HTTPException(status_code=409, detail="Commercial request quote is unavailable")
        if quote.status == "APPROVED":
            return request
        if request.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": request.version})
        if quote.status not in {"DRAFT", "SENT"}:
            raise HTTPException(status_code=409, detail={"code": "QUOTE_NOT_ACCEPTABLE", "status": quote.status})
        now = datetime.now(timezone.utc)
        if quote.valid_until and quote.valid_until <= now:
            raise HTTPException(status_code=409, detail={"code": "QUOTE_EXPIRED"})
        quote.status = "APPROVED"
        quote.version += 1
        add_revision(self.db, quote, actor_id, "Cloud commercial quote accepted by organiser")
        request.quote_acceptance_idempotency_key = idempotency_key
        request.version += 1
        self._audit(
            actor_id=actor_id,
            organization_id=organization_id,
            resource_type="commercial_request",
            resource_id=request.id,
            action_type="COMMERCIAL_QUOTE_ACCEPTED",
            old_state={"quote_status": "DRAFT", "version": expected_version},
            new_state={"quote_status": quote.status, "quote_id": str(quote.id), "version": request.version},
        )
        await self.db.flush()
        return request

    async def activate_quoted_request(
        self,
        request_id: uuid.UUID,
        actor_id: uuid.UUID,
        idempotency_key: str,
        expected_version: int | None = None,
    ) -> tuple[CommercialContract, Invoice]:
        request = await self.db.scalar(select(CommercialRequest).where(
            CommercialRequest.id == request_id,
        ).with_for_update())
        if not request:
            raise HTTPException(status_code=404, detail="Commercial request not found")
        existing_contract = await self.db.scalar(select(CommercialContract).where(
            CommercialContract.source_request_id == request.id,
            CommercialContract.checkout_idempotency_key == idempotency_key,
        ))
        if existing_contract:
            existing_invoice = await self.db.scalar(select(Invoice).where(
                Invoice.commercial_contract_id == existing_contract.id,
            ))
            if existing_invoice:
                return existing_contract, existing_invoice
        if request.status != "QUOTE_ISSUED":
            raise HTTPException(status_code=409, detail={"code": "REQUEST_NOT_READY_FOR_ACTIVATION", "status": request.status})
        if expected_version is not None and request.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": request.version})
        if not request.quote_id:
            raise HTTPException(status_code=409, detail="Commercial request has no issued quote")
        quote = await self.db.scalar(
            select(CommercialQuote)
            .options(selectinload(CommercialQuote.line_items))
            .where(CommercialQuote.id == request.quote_id)
        )
        if not quote or quote.organization_id != request.organization_id:
            raise HTTPException(status_code=409, detail="Commercial quote is missing")
        if quote.status != "APPROVED":
            raise HTTPException(status_code=409, detail={"code": "QUOTE_NOT_APPROVED", "status": quote.status})
        if quote.valid_until and quote.valid_until <= datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail={"code": "QUOTE_EXPIRED"})
        account = await self._account_and_workspaces(request.organization_id, "EMC" if request.product_family == "EMC" else "ORGANIZER")
        lines: list[CloudPriceLine] = []
        for quote_line in quote.line_items:
            raw = quote_line.source_snapshot_json or {}
            code = quote_line.offer_code or raw.get("code")
            offer_version_id = quote_line.offer_version_id or raw.get("offer_version_id")
            if not code or not offer_version_id:
                raise HTTPException(status_code=409, detail={"code": "QUOTE_COMMERCIAL_IDENTITY_MISSING"})
            offer = await self.db.scalar(select(CommercialOffer).where(CommercialOffer.code == code))
            version = await self.db.get(CommercialOfferVersion, uuid.UUID(str(offer_version_id)))
            if not offer or not version or version.offer_id != offer.id:
                raise HTTPException(status_code=409, detail={"code": "QUOTE_COMMERCIAL_VERSION_INVALID", "offer_code": code})
            quantity_decimal = Decimal(str(quote_line.quantity))
            if quantity_decimal != quantity_decimal.to_integral_value():
                raise HTTPException(status_code=409, detail={"code": "QUOTE_COMMERCIAL_QUANTITY_INVALID", "offer_code": code})
            quantity = int(quantity_decimal)
            event_id = quote_line.event_id or raw.get("event_id")
            client_workspace_id = quote_line.client_workspace_id or raw.get("client_workspace_id")
            lines.append(CloudPriceLine(
                code=code,
                display_name=quote_line.name or raw.get("display_name") or code,
                product_family=quote_line.product_family or raw.get("product_family") or offer.product_family,
                quantity=quantity,
                unit_price=_money(quote_line.unit_rate * Decimal(quote_line.duration_days)),
                line_total=_money(quote_line.line_subtotal),
                billing_interval=raw.get("billing_interval", "ANNUAL"),
                offer_version_id=version.id,
                event_id=uuid.UUID(str(event_id)) if event_id else None,
                client_workspace_id=uuid.UUID(str(client_workspace_id)) if client_workspace_id else None,
                entitlement_snapshot=raw.get("entitlement_snapshot") or raw.get("entitlements") or {},
            ))
        if not lines:
            raise HTTPException(status_code=409, detail="Commercial request has no quote lines")
        await self._validate_scope(account, request.organization_id, lines)
        interval = "ANNUAL" if any(line.product_family == "EMC" for line in lines) else ("PER_EVENT" if all(line.billing_interval in {"ONE_TIME", "PER_EVENT"} for line in lines) else "ANNUAL")
        contract, invoice = await self._create_invoice_and_contract(
            organization_id=request.organization_id,
            actor_id=actor_id,
            account=account,
            lines=lines,
            billing_interval=interval,
            auto_renew=not any(
                line.product_family in {"EVENT", "CAPACITY_ADDON"}
                for line in lines
            ),
            billing_profile=request.billing_profile or {},
            idempotency_key=idempotency_key,
            source_request_id=request.id,
            source_quote_id=quote.id,
            approved_quote_totals={
                "taxable_amount": _money(quote.taxable_amount),
                "tax_amount": _money(quote.tax_amount),
                "total_amount": _money(quote.total_amount),
                "tax_rate": _money(quote.tax_rate),
                "discount_amount": _money(quote.discount_amount),
            },
        )
        request.status = "APPROVED"
        request.version += 1
        self._audit(
            actor_id=actor_id,
            organization_id=request.organization_id,
            resource_type="commercial_request",
            resource_id=request.id,
            action_type="COMMERCIAL_QUOTE_ACTIVATED",
            old_state={"status": "QUOTE_ISSUED", "version": expected_version},
            new_state={"status": request.status, "version": request.version, "contract_id": str(contract.id), "invoice_id": str(invoice.id)},
        )
        await self.db.flush()
        return contract, invoice

    async def requests(self, organization_id: uuid.UUID, *, limit: int = 100) -> list[CommercialRequest]:
        account, owner = await self.commercial._account_for_read(organization_id)
        stmt = select(CommercialRequest).where(CommercialRequest.commercial_account_id == account.id)
        if not owner:
            stmt = stmt.where(CommercialRequest.organization_id == organization_id)
        return list((await self.db.scalars(stmt.order_by(CommercialRequest.created_at.desc()).limit(max(1, min(limit, 100))))).all())

    async def request_detail(self, organization_id: uuid.UUID, request_id: uuid.UUID) -> CommercialRequest:
        account, owner = await self.commercial._account_for_read(organization_id)
        stmt = select(CommercialRequest).where(
            CommercialRequest.id == request_id,
            CommercialRequest.commercial_account_id == account.id,
        )
        if not owner:
            stmt = stmt.where(CommercialRequest.organization_id == organization_id)
        request = await self.db.scalar(stmt)
        if not request:
            raise HTTPException(status_code=404, detail="Commercial request not found")
        return request

    async def admin_requests(self, organization_id: uuid.UUID | None = None) -> list[CommercialRequest]:
        # Invoked only by the platform-commercial administration router after
        # its super-admin check.  This is a deliberate global directory read;
        # every subsequent request detail is re-scoped to its owner tenant.
        statement = select(CommercialRequest).execution_options(skip_tenant_filter=True)
        if organization_id is not None:
            statement = statement.where(CommercialRequest.organization_id == organization_id)
        return list((await self.db.scalars(statement.order_by(CommercialRequest.created_at.desc()))).all())

    async def request_state(self, request: CommercialRequest) -> dict[str, Any]:
        states = await self.request_states([request])
        return states[0]

    async def request_states(self, requests: list[CommercialRequest]) -> list[dict[str, Any]]:
        """Resolve request, quote, contract and invoice state in bounded queries."""
        if not requests:
            return []
        request_ids = [row.id for row in requests]
        quote_ids = [row.quote_id for row in requests if row.quote_id]
        quotes = list((await self.db.scalars(select(CommercialQuote).where(
            CommercialQuote.id.in_(quote_ids),
        ))).all()) if quote_ids else []
        quote_by_id = {row.id: row for row in quotes}
        contract_rows = list((await self.db.scalars(select(CommercialContract).where(
            CommercialContract.source_request_id.in_(request_ids),
        ).order_by(CommercialContract.source_request_id, CommercialContract.created_at.desc()))).all())
        contract_by_request: dict[uuid.UUID, CommercialContract] = {}
        for contract in contract_rows:
            contract_by_request.setdefault(contract.source_request_id, contract)
        invoice_ids = [row.invoice_id for row in contract_by_request.values() if row.invoice_id]
        invoices = list((await self.db.scalars(select(Invoice).where(Invoice.id.in_(invoice_ids)))).all()) if invoice_ids else []
        invoice_by_id = {row.id: row for row in invoices}
        now = datetime.now(timezone.utc)
        result: list[dict[str, Any]] = []
        for request in requests:
            quote = quote_by_id.get(request.quote_id)
            contract = contract_by_request.get(request.id)
            invoice = invoice_by_id.get(contract.invoice_id) if contract and contract.invoice_id else None
            quote_expired = bool(quote and quote.valid_until and quote.valid_until <= now)
            if request.status == "REJECTED": next_action = "REVIEW_DECISION"
            elif contract and contract.status == "ACTIVE": next_action = "COMPLETE"
            elif invoice and invoice.status != "PAID": next_action = "PAY_INVOICE"
            elif quote_expired: next_action = "REQUEST_NEW_QUOTE"
            elif quote and quote.status == "APPROVED" and not contract: next_action = "AWAIT_CONTRACT_ACTIVATION"
            elif quote: next_action = "AWAIT_QUOTE_APPROVAL"
            else: next_action = "AWAIT_REVIEW"
            result.append({
                "id": request.id, "commercial_account_id": request.commercial_account_id,
                "organization_id": request.organization_id, "product_family": request.product_family,
                "request_type": request.request_type, "status": request.status,
                "event_id": request.event_id, "client_workspace_id": request.client_workspace_id,
                "requested_offer_codes": request.requested_offer_codes,
                "requested_capacity": request.requested_capacity, "requirements": request.requirements_json,
                "quote_id": request.quote_id, "quote_reference": request.quote_reference,
                "quote_status": "EXPIRED" if quote_expired else (quote.status if quote else None),
                "quote_valid_until": quote.valid_until if quote else None,
                "contract_id": contract.id if contract else None,
                "contract_status": contract.status if contract else None,
                "invoice_id": invoice.id if invoice else None,
                "payment_state": invoice.status if invoice else None,
                "last_response": request.decision_reason, "last_response_at": request.decided_at,
                "next_action": next_action, "version": request.version,
                "created_at": request.created_at, "updated_at": request.updated_at,
            })
        return result

    async def decide_request(
        self,
        request_id: uuid.UUID,
        payload: CommercialRequestDecisionRequest,
        actor_id: uuid.UUID,
        expected_version: int,
        idempotency_key: str,
    ) -> CommercialRequest:
        request = await self.db.scalar(select(CommercialRequest).where(CommercialRequest.id == request_id).with_for_update())
        if not request:
            raise HTTPException(status_code=404, detail="Commercial request not found")
        if request.decision_idempotency_key == idempotency_key:
            return request
        if request.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": request.version})
        if request.status not in {"PENDING", "IN_REVIEW"}:
            raise HTTPException(status_code=409, detail={"code": "REQUEST_ALREADY_DECIDED", "status": request.status})
        request.status = payload.decision
        request.decided_by = actor_id
        request.decided_at = datetime.now(timezone.utc)
        request.decision_reason = payload.reason
        request.decision_idempotency_key = idempotency_key
        request.version += 1
        if payload.decision == "QUOTE_ISSUED":
            quote = await self.create_cloud_quote_from_request(
                request,
                actor_id,
                idempotency_key=f"cloud-request-quote-{request.id}",
            )
            request.quote_reference = quote.quote_number
        else:
            request.quote_reference = payload.quote_reference or request.quote_reference
        self._audit(
            actor_id=actor_id,
            organization_id=request.organization_id,
            resource_type="commercial_request",
            resource_id=request.id,
            action_type="COMMERCIAL_REQUEST_DECIDED",
            old_state={"status": "PENDING", "version": expected_version},
            new_state={"status": request.status, "version": request.version, "quote_id": str(request.quote_id) if request.quote_id else None},
            change_diff={"reason": payload.reason},
        )
        await self.db.flush()
        return request

    async def amend_contract(
        self,
        contract_id: uuid.UUID,
        payload: ContractAmendmentRequest,
        actor_id: uuid.UUID,
        idempotency_key: str,
        expected_version: int,
    ) -> CommercialContractAmendment:
        if not payload.target_offer_code:
            raise HTTPException(status_code=422, detail="target_offer_code is required for an approved amendment")
        contract = await self.db.scalar(select(CommercialContract).where(
            CommercialContract.id == contract_id,
        ).with_for_update())
        if not contract:
            raise HTTPException(status_code=404, detail="Commercial contract not found")
        account = await self.db.get(CommercialAccount, contract.commercial_account_id)
        if not account:
            raise HTTPException(status_code=409, detail="Commercial account is missing")
        existing = await self.db.scalar(select(CommercialContractAmendment).where(
            CommercialContractAmendment.commercial_account_id == account.id,
            CommercialContractAmendment.idempotency_key == idempotency_key,
        ))
        if existing:
            return existing
        if contract.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": contract.version})
        if contract.status != "ACTIVE":
            raise HTTPException(status_code=409, detail={"code": "CONTRACT_NOT_AMENDABLE", "status": contract.status})
        items = list((await self.db.scalars(select(CommercialContractItem).where(
            CommercialContractItem.contract_id == contract.id,
        ).with_for_update())).all())
        target_offer, target_version = await self.commercial._offer_with_current_version(payload.target_offer_code)
        target_entitlements = list((await self.db.scalars(select(CommercialOfferEntitlement).where(
            CommercialOfferEntitlement.offer_version_id == target_version.id,
        ))).all())
        source_item = next((item for item in items if item.event_id is not None and target_offer.product_family == "EVENT"), None)
        if source_item is None:
            source_item = next((item for item in items if item.event_id is None and target_offer.product_family in {"WORKSPACE", "EMC"}), None)
        if source_item is None:
            raise HTTPException(status_code=422, detail="The amendment offer does not match an existing contract scope")
        source_offer = await self.db.get(CommercialOffer, source_item.offer_id)
        if not source_offer or source_offer.product_family != target_offer.product_family:
            raise HTTPException(status_code=422, detail="The amendment offer must remain in the same product family")
        interval = "PER_EVENT" if target_offer.product_family == "EVENT" else ("ANNUAL" if target_offer.product_family == "EMC" else contract.billing_interval)
        prices, _ = await self.commercial._version_data(target_version.id)
        price = next((row for row in prices if row.billing_interval == interval), None)
        if price is None:
            raise HTTPException(status_code=422, detail={"code": "AMENDMENT_PRICE_UNAVAILABLE", "offer_code": target_offer.code})
        quantity = int(source_item.quantity or 1)
        old_snapshot = {
            "offer_code": source_offer.code,
            "offer_version_id": str(source_item.offer_version_id),
            "unit_price": _json_decimal(source_item.unit_price),
            "line_total": _json_decimal(source_item.line_total),
            "allocation_snapshot": source_item.allocation_snapshot_json,
        }
        new_line_total = _money(price.amount) * quantity
        old_line_total = _money(source_item.line_total)
        price_delta = _money(new_line_total - old_line_total)
        _tax_rate, gst_delta, total_delta = CommercialTaxService.calculate(price_delta)
        new_snapshot = {
            "offer_code": target_offer.code,
            "offer_version_id": str(target_version.id),
            "unit_price": _json_decimal(price.amount),
            "line_total": _json_decimal(new_line_total),
            "entitlements": {entitlement.entitlement_key: entitlement.quantity for entitlement in target_entitlements},
        }
        now = datetime.now(timezone.utc)
        amendment = CommercialContractAmendment(
            contract_id=contract.id,
            commercial_account_id=account.id,
            status="APPLIED",
            target_offer_code=target_offer.code,
            source_offer_version_id=source_item.offer_version_id,
            target_offer_version_id=target_version.id,
            reason=payload.reason,
            old_snapshot_json=old_snapshot,
            new_snapshot_json=new_snapshot,
            price_delta=price_delta,
            gst_delta=gst_delta,
            total_delta=total_delta,
            requested_by=actor_id,
            approved_by=actor_id,
            approved_at=now,
            idempotency_key=idempotency_key,
        )
        self.db.add(amendment)
        await self.db.flush()
        source_item.offer_id = target_offer.id
        source_item.offer_version_id = target_version.id
        source_item.unit_price = price.amount
        source_item.line_total = new_line_total
        source_item.allocation_snapshot_json = {
            "entitlements": new_snapshot["entitlements"],
            "event_id": str(source_item.event_id) if source_item.event_id else None,
            "client_workspace_id": str(source_item.client_workspace_id) if source_item.client_workspace_id else None,
            "offer_code": target_offer.code,
            "offer_version_id": str(target_version.id),
        }
        allocations = list((await self.db.scalars(select(CommercialAllocation).where(
            CommercialAllocation.contract_item_id == source_item.id,
            CommercialAllocation.status == "ACTIVE",
        ).with_for_update())).all())
        for allocation in allocations:
            allocation.status = "AMENDED"
            allocation.valid_until = now
        target_org = account.owner_organization_id
        if source_item.client_workspace_id:
            workspace = await self.db.get(CommercialAccountWorkspace, source_item.client_workspace_id)
            if not workspace:
                raise HTTPException(status_code=409, detail="Contract client workspace is invalid")
            target_org = workspace.organization_id
        unit_by_key = {entitlement.entitlement_key: entitlement.unit_type for entitlement in target_entitlements}
        for key, raw_quantity in new_snapshot["entitlements"].items():
            if raw_quantity is None:
                continue
            allocation_quantity = int(raw_quantity) * quantity
            if unit_by_key.get(key) == "gb":
                allocation_quantity *= CommercialUsageService.unit_scale(key)
            self.db.add(CommercialAllocation(
                contract_item_id=source_item.id,
                commercial_account_id=account.id,
                organization_id=target_org,
                event_id=source_item.event_id,
                client_workspace_id=source_item.client_workspace_id,
                entitlement_key=key,
                quantity_total=allocation_quantity,
                valid_from=now,
                valid_until=contract.ends_at,
                status="ACTIVE",
            ))
        if price_delta > 0:
            invoice = Invoice(
                organization_id=account.owner_organization_id,
                amount=price_delta,
                currency="INR",
                status="UNPAID",
                due_date=now + timedelta(days=7),
                invoice_number=f"AMEND-{uuid.uuid4().hex[:16].upper()}",
                gst_amount=gst_delta,
                total_amount_inr=total_delta,
                commercial_contract_id=contract.id,
            )
            self.db.add(invoice)
            await self.db.flush()
            amendment.invoice_id = invoice.id
            self.db.add(InvoiceItem(
                invoice_id=invoice.id,
                description=f"Approved amendment: {target_offer.display_name}",
                amount=price_delta,
                quantity=1,
                commercial_offer_code=target_offer.code,
                commercial_offer_version_id=target_version.id,
                commercial_contract_item_id=source_item.id,
                tax_rate=GST_RATE,
                tax_amount=gst_delta,
            ))
        contract.version += 1
        self._audit(
            actor_id=actor_id,
            organization_id=account.owner_organization_id,
            resource_type="commercial_contract_amendment",
            resource_id=amendment.id,
            action_type="COMMERCIAL_CONTRACT_AMENDED",
            old_state=old_snapshot,
            new_state=new_snapshot,
            change_diff={"price_delta": _json_decimal(price_delta), "reason": payload.reason},
        )
        await self.db.flush()
        return amendment

    async def activate_paid_contract(self, invoice_id: uuid.UUID, expected_version: int | None = None) -> CommercialContract | None:
        invoice = await self.db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
        if not invoice or not invoice.commercial_contract_id:
            return None
        contract = await self.db.scalar(select(CommercialContract).where(
            CommercialContract.id == invoice.commercial_contract_id,
        ).with_for_update())
        if not contract or invoice.status != "PAID":
            return None
        if contract.status == "ACTIVE":
            from app.modules.billing.services.activation_service import ActivationService

            active_account = await self.db.get(
                CommercialAccount, contract.commercial_account_id
            )
            if not active_account:
                raise HTTPException(
                    status_code=409,
                    detail="Commercial account is missing",
                )
            existing_event_ids = set(
                (
                    await self.db.scalars(
                        select(CommercialContractItem.event_id)
                        .join(
                            CommercialOffer,
                            CommercialOffer.id == CommercialContractItem.offer_id,
                        )
                        .where(
                            CommercialContractItem.contract_id == contract.id,
                            CommercialContractItem.event_id.is_not(None),
                            CommercialOffer.product_family == "EVENT",
                        )
                    )
                ).all()
            )
            for event_id in sorted(existing_event_ids, key=str):
                await ActivationService.activate_event(
                    self.db,
                    organization_id=active_account.owner_organization_id,
                    event_id=event_id,
                    commercial_contract_id=contract.id,
                    idempotency_key=f"contract-activation:{contract.id}:{event_id}",
                    actor_id=invoice.status_changed_by,
                )
            return contract
        if expected_version is not None and contract.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": contract.version})
        if contract.status != "PENDING_PAYMENT":
            raise HTTPException(status_code=409, detail={"code": "CONTRACT_NOT_ACTIVATABLE", "status": contract.status})
        account = await self.db.get(CommercialAccount, contract.commercial_account_id)
        if not account:
            raise HTTPException(status_code=409, detail="Commercial account is missing")
        items = list((await self.db.scalars(select(CommercialContractItem).where(
            CommercialContractItem.contract_id == contract.id,
        ))).all())
        offers_by_id = {
            offer.id: offer
            for offer in (
                await self.db.scalars(
                    select(CommercialOffer).where(
                        CommercialOffer.id.in_({item.offer_id for item in items})
                    )
                )
            ).all()
        }
        event_plan_ids: set[uuid.UUID] = set()
        for item in items:
            offer = offers_by_id.get(item.offer_id)
            if item.event_id and offer and offer.product_family == "EVENT":
                event_plan_ids.add(item.event_id)
            snapshot = item.allocation_snapshot_json or {}
            target_org = account.owner_organization_id
            if item.client_workspace_id:
                workspace = await self.db.get(CommercialAccountWorkspace, item.client_workspace_id)
                if not workspace or workspace.commercial_account_id != account.id:
                    raise HTTPException(status_code=409, detail="Contract client workspace is invalid")
                target_org = workspace.organization_id
            entitlement_rows = list((await self.db.scalars(select(CommercialOfferEntitlement).where(
                CommercialOfferEntitlement.offer_version_id == item.offer_version_id,
            ))).all())
            unit_by_key = {row.entitlement_key: row.unit_type for row in entitlement_rows}
            for key, raw_quantity in (snapshot.get("entitlements") or {}).items():
                # Typed feature grants are part of the immutable contract
                # snapshot, but only numeric quotas become consumable
                # allocation rows.
                if (
                    raw_quantity is None
                    or isinstance(raw_quantity, (dict, str, bool))
                    or not isinstance(raw_quantity, (int, float))
                ):
                    continue
                quantity = int(raw_quantity) * int(item.quantity or 1)
                if unit_by_key.get(key) == "gb":
                    quantity *= CommercialUsageService.unit_scale(key)
                existing = await self.db.scalar(select(CommercialAllocation).where(
                    CommercialAllocation.contract_item_id == item.id,
                    CommercialAllocation.entitlement_key == key,
                ))
                if existing:
                    if (
                        existing.commercial_account_id != account.id
                        or existing.organization_id != target_org
                        or existing.event_id != item.event_id
                        or existing.client_workspace_id != item.client_workspace_id
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail={"code": "ALLOCATION_SCOPE_CONFLICT", "entitlement_key": key},
                        )
                    existing.quantity_total = quantity
                    existing.valid_from = contract.starts_at
                    existing.valid_until = contract.ends_at
                    existing.status = "ACTIVE"
                    existing.version = int(existing.version or 1) + 1
                    continue
                self.db.add(CommercialAllocation(
                    contract_item_id=item.id,
                    commercial_account_id=account.id,
                    organization_id=target_org,
                    event_id=item.event_id,
                    client_workspace_id=item.client_workspace_id,
                    entitlement_key=key,
                    quantity_total=quantity,
                    valid_from=contract.starts_at,
                    valid_until=contract.ends_at,
                    status="ACTIVE",
                ))
        contract.status = "ACTIVE"
        contract.activated_at = datetime.now(timezone.utc)
        contract.version += 1
        if event_plan_ids:
            from app.modules.billing.services.activation_service import ActivationService

            # AsyncSessionLocal intentionally disables autoflush. Event
            # activation re-reads this contract with an ACTIVE predicate, so
            # publish the state transition inside the current transaction
            # before that authoritative check. The surrounding payment
            # transaction still rolls everything back if activation fails.
            await self.db.flush()
            for event_id in sorted(event_plan_ids, key=str):
                await ActivationService.activate_event(
                    self.db,
                    organization_id=account.owner_organization_id,
                    event_id=event_id,
                    commercial_contract_id=contract.id,
                    idempotency_key=f"contract-activation:{contract.id}:{event_id}",
                    actor_id=invoice.status_changed_by,
                )
        self._audit(
            actor_id=None,
            organization_id=account.owner_organization_id,
            resource_type="commercial_contract",
            resource_id=contract.id,
            action_type="COMMERCIAL_CONTRACT_ACTIVATED",
            old_state={"status": "PENDING_PAYMENT"},
            new_state={"status": contract.status, "invoice_id": str(invoice.id)},
        )
        await self.db.flush()
        return contract

    async def renew_contract(
        self,
        contract_id: uuid.UUID,
        actor_id: uuid.UUID,
        idempotency_key: str,
        allow_early: bool = False,
        expected_version: int | None = None,
    ) -> tuple[CommercialContract, Invoice]:
        current = await self.db.scalar(select(CommercialContract).where(
            CommercialContract.id == contract_id,
        ).with_for_update())
        if not current:
            raise HTTPException(status_code=404, detail="Commercial contract not found")
        if expected_version is not None and current.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": current.version})
        if current.cancel_at_period_end:
            raise HTTPException(status_code=409, detail={"code": "CONTRACT_CANCELLED_AT_PERIOD_END"})
        now = datetime.now(timezone.utc)
        if not allow_early and current.ends_at and current.ends_at > now:
            raise HTTPException(status_code=409, detail={"code": "CONTRACT_NOT_DUE_FOR_RENEWAL", "ends_at": current.ends_at})
        account = await self.db.get(CommercialAccount, current.commercial_account_id)
        if not account:
            raise HTTPException(status_code=409, detail="Commercial account is missing")
        old_items = list((await self.db.scalars(select(CommercialContractItem).where(
            CommercialContractItem.contract_id == current.id,
        ))).all())
        if not old_items:
            raise HTTPException(status_code=409, detail="Contract has no renewable items")
        lines: list[CloudPriceLine] = []
        for item in old_items:
            offer = await self.db.get(CommercialOffer, item.offer_id)
            if not offer:
                raise HTTPException(status_code=409, detail="Contract offer is missing")
            # Capacity bundles are finite purchases. They expire with the owning
            # event/EMC entitlement and must never be silently rolled into a
            # renewal invoice.
            if offer.product_family == "CAPACITY_ADDON":
                continue
            _, version = await self.commercial._offer_with_current_version(offer.code)
            prices, entitlements = await self.commercial._version_data(version.id)
            interval = "ONE_TIME" if offer.product_family == "CAPACITY_ADDON" else ("PER_EVENT" if offer.product_family == "EVENT" else current.billing_interval)
            price = next((row for row in prices if row.billing_interval == interval), None)
            if price is None:
                raise HTTPException(status_code=409, detail={"code": "RENEWAL_PRICE_UNAVAILABLE", "offer_code": offer.code})
            snapshot = {ent.entitlement_key: ent.quantity for ent in entitlements}
            metadata = item.allocation_snapshot_json or {}
            lines.append(CloudPriceLine(
                code=offer.code,
                display_name=offer.display_name,
                product_family=offer.product_family,
                quantity=item.quantity,
                unit_price=_money(price.amount),
                line_total=_money(price.amount) * int(item.quantity or 1),
                billing_interval=interval,
                offer_version_id=version.id,
                event_id=item.event_id,
                client_workspace_id=item.client_workspace_id,
                entitlement_snapshot=snapshot,
            ))
        if not lines:
            raise HTTPException(status_code=409, detail={"code": "NO_RENEWABLE_ITEMS", "message": "This contract contains only finite capacity purchases and cannot be renewed."})
        events = await self._validate_scope(account, account.owner_organization_id, lines)
        profile = await self._billing_profile(account.owner_organization_id, {})
        renewed = await self._create_invoice_and_contract(
            organization_id=account.owner_organization_id,
            actor_id=actor_id,
            account=account,
            lines=lines,
            billing_interval=current.billing_interval,
            auto_renew=current.auto_renew,
            billing_profile=profile,
            idempotency_key=idempotency_key,
            renewed_from_contract_id=current.id,
            starts_at=current.ends_at or now,
        )
        return renewed
