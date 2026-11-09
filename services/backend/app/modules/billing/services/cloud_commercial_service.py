from __future__ import annotations

from collections import defaultdict
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    CommercialPricingConfiguration,
    CommercialUsageLedger,
)
from app.modules.billing.schemas.cloud_commercial import (
    AllocationTransferRequest,
    CloudPricingPreviewRequest,
    CloudPricingPreviewResponse,
    CloudPriceLine,
    CommercialOfferCreateRequest,
    CommercialPricingConfigurationCreateRequest,
    EmcWorkspaceCreateRequest,
    OfferVersionCreateRequest,
)
from app.modules.billing.services.commercial_usage_service import CommercialUsageService
from app.modules.billing.services.commercial_tax_service import CommercialTaxService
from app.modules.audit.models.audit_log import AuditLog


GST_RATE = CommercialTaxService.GST_RATE


def _money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class CloudCommercialService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _requires_quotation(offer: CommercialOffer) -> bool:
        """Keep the published Venue catalogue self-service by default.

        Historical Venue rows were seeded as quote-only before direct cart
        purchase was introduced. Only explicitly named Enterprise products
        remain quotation-based; the forward migration persists the same rule.
        """
        if offer.product_family in {"VENUE", "VENUE_ADDON"}:
            return "ENTERPRISE" in offer.code.upper()
        return offer.is_quote_only

    def _audit(
        self,
        *,
        actor_id: uuid.UUID | None,
        resource_type: str,
        resource_id: uuid.UUID,
        action_type: str,
        organization_id: uuid.UUID | None = None,
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

    async def get_or_create_account(self, organization_id: uuid.UUID, account_type: str = "ORGANIZER") -> CommercialAccount:
        account = await self.db.scalar(
            select(CommercialAccount).where(CommercialAccount.owner_organization_id == organization_id)
        )
        if account:
            if account.account_type != account_type:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "COMMERCIAL_ACCOUNT_TYPE_CONFLICT", "account_type": account.account_type},
                )
            return account

        # A client workspace is attached to its EMC owner's account and must
        # never create a second commercial account by calling checkout or
        # request APIs with its own organization id.
        client_mapping = await self.db.scalar(select(CommercialAccountWorkspace).join(
            CommercialAccount, CommercialAccountWorkspace.commercial_account_id == CommercialAccount.id,
        ).where(
            CommercialAccountWorkspace.organization_id == organization_id,
            CommercialAccountWorkspace.workspace_role == "CLIENT",
            CommercialAccountWorkspace.status == "ACTIVE",
            CommercialAccount.account_type == "EMC",
        ))
        if client_mapping:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "EMC_CLIENT_CANNOT_CREATE_COMMERCIAL_ACCOUNT", "message": "EMC client workspaces use their owner's contract and allocation."},
            )

        account = CommercialAccount(
            owner_organization_id=organization_id,
            account_type=account_type,
            currency="INR",
            country="IN",
        )
        self.db.add(account)
        await self.db.flush()
        self.db.add(CommercialAccountWorkspace(
            commercial_account_id=account.id,
            organization_id=organization_id,
            workspace_role="OWNER",
        ))
        await self.db.flush()
        return account

    async def _offer_with_current_version(self, code: str) -> tuple[CommercialOffer, CommercialOfferVersion]:
        now = datetime.now(timezone.utc)
        offer = await self.db.scalar(
            select(CommercialOffer).where(
                CommercialOffer.code == code,
                CommercialOffer.lifecycle_status == "PUBLISHED",
            )
        )
        if not offer:
            raise HTTPException(status_code=404, detail={"code": "COMMERCIAL_OFFER_NOT_FOUND", "offer_code": code})
        version = await self.db.scalar(
            select(CommercialOfferVersion)
            .where(
                CommercialOfferVersion.offer_id == offer.id,
                CommercialOfferVersion.version_status == "PUBLISHED",
                CommercialOfferVersion.effective_from <= now,
                (CommercialOfferVersion.effective_until.is_(None) | (CommercialOfferVersion.effective_until > now)),
            )
            .order_by(CommercialOfferVersion.effective_from.desc(), CommercialOfferVersion.version_number.desc())
        )
        if not version:
            raise HTTPException(status_code=409, detail={"code": "COMMERCIAL_OFFER_VERSION_UNAVAILABLE", "offer_code": code})
        return offer, version

    async def _version_data(self, version_id: uuid.UUID) -> tuple[list[CommercialOfferPrice], list[CommercialOfferEntitlement]]:
        prices = list((await self.db.scalars(select(CommercialOfferPrice).where(CommercialOfferPrice.offer_version_id == version_id))).all())
        entitlements = list((await self.db.scalars(select(CommercialOfferEntitlement).where(CommercialOfferEntitlement.offer_version_id == version_id))).all())
        return prices, entitlements

    async def _account_for_access(self, organization_id: uuid.UUID) -> tuple[CommercialAccount, bool]:
        """Resolve an owner or an EMC client without exposing the pooled account as a tenant."""
        owner = await self.db.scalar(select(CommercialAccount).where(
            CommercialAccount.owner_organization_id == organization_id,
        ).with_for_update())
        if owner:
            return owner, True
        mapped = await self.db.execute(
            select(CommercialAccount, CommercialAccountWorkspace)
            .join(CommercialAccountWorkspace, CommercialAccountWorkspace.commercial_account_id == CommercialAccount.id)
            .where(
                CommercialAccountWorkspace.organization_id == organization_id,
                CommercialAccountWorkspace.workspace_role == "CLIENT",
                CommercialAccountWorkspace.status == "ACTIVE",
                CommercialAccount.account_type == "EMC",
            )
            # A client workspace belongs to a different tenant from the EMC
            # account owner. The mapping itself is the access boundary, so use
            # an explicit global lookup only for this validated relationship.
            .execution_options(skip_tenant_filter=True)
        )
        row = mapped.first()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "COMMERCIAL_ACCOUNT_NOT_FOUND"})
        return row[0], False

    async def _validated_offer(self, code: str, expected_family: str) -> tuple[CommercialOffer, CommercialOfferVersion]:
        offer, version = await self._offer_with_current_version(code)
        if offer.product_family != expected_family:
            raise HTTPException(status_code=422, detail={"code": "COMMERCIAL_OFFER_FAMILY_MISMATCH", "offer_code": code, "expected_family": expected_family})
        return offer, version

    async def _account_for_read(self, organization_id: uuid.UUID) -> tuple[CommercialAccount, bool]:
        try:
            return await self._account_for_access(organization_id)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            return await self.get_or_create_account(organization_id, account_type="ORGANIZER"), True

    async def _emc_owner_account(self, organization_id: uuid.UUID, *, create: bool = True) -> CommercialAccount:
        """Resolve an EMC owner account and reject client workspaces from mutations."""
        owner = await self.db.scalar(select(CommercialAccount).where(
            CommercialAccount.owner_organization_id == organization_id,
        ))
        if owner:
            if owner.account_type != "EMC":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "COMMERCIAL_ACCOUNT_TYPE_CONFLICT", "account_type": owner.account_type},
                )
            return owner
        mapped = await self.db.scalar(select(CommercialAccountWorkspace).join(
            CommercialAccount, CommercialAccountWorkspace.commercial_account_id == CommercialAccount.id,
        ).where(
            CommercialAccountWorkspace.organization_id == organization_id,
            CommercialAccountWorkspace.workspace_role == "CLIENT",
            CommercialAccountWorkspace.status == "ACTIVE",
            CommercialAccount.account_type == "EMC",
        ).execution_options(skip_tenant_filter=True))
        if mapped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="EMC client workspaces cannot manage pooled capacity")
        if not create:
            raise HTTPException(status_code=404, detail={"code": "COMMERCIAL_ACCOUNT_NOT_FOUND"})
        return await self.get_or_create_account(organization_id, account_type="EMC")

    async def _emc_account_for_read(self, organization_id: uuid.UUID) -> tuple[CommercialAccount, bool]:
        account, owner = await self._account_for_access(organization_id)
        if account.account_type != "EMC":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="EMC access requires an EMC commercial account")
        return account, owner

    async def catalog(self, family: Optional[str] = None, *, include_drafts: bool = False) -> list[dict[str, Any]]:
        offer_table = CommercialOffer.__table__
        version_table = CommercialOfferVersion.__table__
        price_table = CommercialOfferPrice.__table__
        entitlement_table = CommercialOfferEntitlement.__table__

        # The catalogue is global immutable configuration, not tenant-owned
        # operational data. Use bounded Core projections so loading dozens of
        # offers cannot trigger ORM loader work or grow the query count per row.
        stmt = select(
            offer_table.c.id,
            offer_table.c.code,
            offer_table.c.product_family,
            offer_table.c.name,
            offer_table.c.display_name,
            offer_table.c.description,
            offer_table.c.scope_type,
            offer_table.c.is_quote_only,
            offer_table.c.lifecycle_status,
            offer_table.c.display_order,
            offer_table.c.created_at,
        )
        if not include_drafts:
            stmt = stmt.where(offer_table.c.lifecycle_status == "PUBLISHED")
        if family:
            stmt = stmt.where(offer_table.c.product_family == family.upper())
        offers = list(
            (
                await self.db.execute(
                    stmt.order_by(offer_table.c.display_order, offer_table.c.code)
                )
            ).mappings()
        )
        if not offers:
            return []

        offer_ids = [offer["id"] for offer in offers]
        now = datetime.now(timezone.utc)

        # Batch all versions, prices and entitlements. The statement count is
        # fixed at four regardless of catalogue size.
        version_stmt = (
            select(
                version_table.c.id,
                version_table.c.offer_id,
                version_table.c.version_number,
                version_table.c.effective_from,
                version_table.c.effective_until,
                version_table.c.version_status,
                version_table.c.eligible_addon_codes,
            )
            .where(version_table.c.offer_id.in_(offer_ids))
            .order_by(
                version_table.c.effective_from.desc(),
                version_table.c.version_number.desc(),
            )
        )
        all_versions = list((await self.db.execute(version_stmt)).mappings())

        versions_by_offer: dict[uuid.UUID, list[Any]] = defaultdict(list)
        for v in all_versions:
            versions_by_offer[v["offer_id"]].append(v)

        selected_version_by_offer: dict[uuid.UUID, Optional[Any]] = {}
        for offer in offers:
            cand_versions = versions_by_offer.get(offer["id"], [])
            cur_published = next(
                (
                    v
                    for v in cand_versions
                    if v["version_status"] == "PUBLISHED"
                    and v["effective_from"] <= now
                    and (
                        v["effective_until"] is None
                        or v["effective_until"] > now
                    )
                ),
                None,
            )
            if cur_published is not None:
                selected_version_by_offer[offer["id"]] = cur_published
            elif include_drafts and offer["lifecycle_status"] == "DRAFT":
                cur_draft = cand_versions[0] if cand_versions else None
                selected_version_by_offer[offer["id"]] = cur_draft
            else:
                selected_version_by_offer[offer["id"]] = None

        chosen_version_ids = [
            v["id"] for v in selected_version_by_offer.values() if v is not None
        ]

        prices_by_version: dict[uuid.UUID, list[Any]] = defaultdict(list)
        entitlements_by_version: dict[uuid.UUID, list[Any]] = defaultdict(list)

        if chosen_version_ids:
            prices = list(
                (
                    await self.db.execute(
                        select(
                            price_table.c.offer_version_id,
                            price_table.c.billing_interval,
                            price_table.c.pricing_unit,
                            price_table.c.amount,
                            price_table.c.currency,
                            price_table.c.tax_mode,
                        ).where(price_table.c.offer_version_id.in_(chosen_version_ids))
                    )
                ).mappings()
            )
            for p in prices:
                prices_by_version[p["offer_version_id"]].append(p)

            entitlements = list(
                (
                    await self.db.execute(
                        select(
                            entitlement_table.c.offer_version_id,
                            entitlement_table.c.entitlement_key,
                            entitlement_table.c.scope_type,
                            entitlement_table.c.quantity,
                            entitlement_table.c.unit_type,
                            entitlement_table.c.value_type,
                            entitlement_table.c.consumption_model,
                            entitlement_table.c.hard_ceiling,
                        ).where(
                            entitlement_table.c.offer_version_id.in_(chosen_version_ids)
                        )
                    )
                ).mappings()
            )
            for e in entitlements:
                entitlements_by_version[e["offer_version_id"]].append(e)

        result: list[dict[str, Any]] = []
        for offer in offers:
            version = selected_version_by_offer.get(offer["id"])
            if version is None:
                if include_drafts and offer["lifecycle_status"] == "DRAFT":
                    result.append({
                        "id": offer["id"],
                        "code": offer["code"],
                        "product_family": offer["product_family"],
                        "name": offer["name"],
                        "display_name": offer["display_name"],
                        "description": offer["description"],
                        "scope_type": offer["scope_type"],
                        "is_quote_only": (
                            "ENTERPRISE" in offer["code"].upper()
                            if offer["product_family"] in {"VENUE", "VENUE_ADDON"}
                            else bool(offer["is_quote_only"])
                        ),
                        "lifecycle_status": offer["lifecycle_status"],
                        "version_id": None,
                        "version_number": 0,
                        "effective_from": offer["created_at"],
                        "eligible_addon_codes": [],
                        "prices": [],
                        "entitlements": [],
                    })
                continue

            prices = prices_by_version.get(version["id"], [])
            entitlements = entitlements_by_version.get(version["id"], [])

            result.append({
                "id": offer["id"],
                "code": offer["code"],
                "product_family": offer["product_family"],
                "name": offer["name"],
                "display_name": offer["display_name"],
                "description": offer["description"],
                "scope_type": offer["scope_type"],
                "is_quote_only": (
                    "ENTERPRISE" in offer["code"].upper()
                    if offer["product_family"] in {"VENUE", "VENUE_ADDON"}
                    else bool(offer["is_quote_only"])
                ),
                "lifecycle_status": offer["lifecycle_status"],
                "version_id": version["id"],
                "version_number": version["version_number"],
                "effective_from": version["effective_from"],
                "eligible_addon_codes": version["eligible_addon_codes"] or [],
                "prices": [
                    {"billing_interval": p["billing_interval"], "pricing_unit": p["pricing_unit"],
                     "amount": float(p["amount"]), "currency": p["currency"], "tax_mode": p["tax_mode"]}
                    for p in prices
                ],
                "entitlements": [
                    {"key": e["entitlement_key"], "scope_type": e["scope_type"], "quantity": e["quantity"],
                     "unit_type": e["unit_type"], "value_type": e["value_type"],
                     "consumption_model": e["consumption_model"], "hard_ceiling": e["hard_ceiling"]}
                    for e in entitlements
                ],
            })
        return result

    async def create_offer(
        self,
        payload: CommercialOfferCreateRequest,
        actor_id: uuid.UUID,
    ) -> CommercialOffer:
        """Create a stable offer identity.

        A new identity starts as DRAFT and has no price/allocation authority
        until an offer version is created and published. Repeating the same
        code with the same metadata is a safe replay; changing an existing
        identity is rejected so published commercial meaning cannot be
        silently replaced.
        """
        existing = await self.db.scalar(select(CommercialOffer).where(CommercialOffer.code == payload.code))
        if existing:
            same_identity = (
                existing.product_family == payload.product_family
                and existing.name == payload.name
                and existing.display_name == payload.display_name
                and existing.description == payload.description
                and existing.scope_type == payload.scope_type
                and existing.is_quote_only == payload.is_quote_only
                and existing.display_order == payload.display_order
            )
            if same_identity:
                return existing
            raise HTTPException(status_code=409, detail={"code": "COMMERCIAL_OFFER_CODE_EXISTS", "offer_code": payload.code})

        offer = CommercialOffer(
            code=payload.code,
            product_family=payload.product_family,
            name=payload.name,
            display_name=payload.display_name,
            description=payload.description,
            scope_type=payload.scope_type,
            is_quote_only=payload.is_quote_only,
            lifecycle_status="DRAFT",
            display_order=payload.display_order,
        )
        self.db.add(offer)
        await self.db.flush()
        self._audit(
            actor_id=actor_id,
            resource_type="commercial_offer",
            resource_id=offer.id,
            action_type="COMMERCIAL_OFFER_CREATED",
            new_state={
                "code": offer.code,
                "product_family": offer.product_family,
                "lifecycle_status": offer.lifecycle_status,
            },
            change_diff={"reason": payload.change_reason},
        )
        return offer

    async def save_pricing_configuration(
        self,
        payload: CommercialPricingConfigurationCreateRequest,
        actor_id: uuid.UUID,
        idempotency_key: str,
    ) -> CommercialPricingConfiguration:
        existing = await self.db.scalar(select(CommercialPricingConfiguration).where(
            CommercialPricingConfiguration.created_by == actor_id,
            CommercialPricingConfiguration.idempotency_key == idempotency_key,
        ))
        if existing:
            return existing
        configuration = CommercialPricingConfiguration(
            name=payload.name,
            account_type=payload.payload.account_type,
            payload_json=payload.payload.model_dump(mode="json"),
            preview_snapshot_json=payload.preview_snapshot.model_dump(mode="json"),
            created_by=actor_id,
            idempotency_key=idempotency_key,
        )
        self.db.add(configuration)
        await self.db.flush()
        self._audit(
            actor_id=actor_id,
            resource_type="commercial_pricing_configuration",
            resource_id=configuration.id,
            action_type="COMMERCIAL_PRICING_CONFIGURATION_SAVED",
            new_state={"name": configuration.name, "account_type": configuration.account_type},
        )
        return configuration

    async def pricing_configurations(self, actor_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = list((await self.db.scalars(select(CommercialPricingConfiguration).where(
            CommercialPricingConfiguration.created_by == actor_id,
        ).order_by(CommercialPricingConfiguration.created_at.desc()))).all())
        return [
            {
                "id": row.id,
                "name": row.name,
                "account_type": row.account_type,
                "payload": row.payload_json,
                "preview": row.preview_snapshot_json,
                "version": row.version,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
            for row in rows
        ]

    async def pricing_preview(self, payload: CloudPricingPreviewRequest) -> CloudPricingPreviewResponse:
        has_event_or_capacity_selection = bool(
            payload.capacity_addon_codes
            or payload.venue_offer_codes
            or payload.venue_items
            or any(event.offer_code or event.capacity_addon_codes for event in payload.events)
        )
        if payload.account_type == "ORGANIZER" and not payload.workspace_offer_code and not has_event_or_capacity_selection:
            raise HTTPException(status_code=422, detail="workspace_offer_code is required for ORGANIZER pricing")
        if payload.account_type == "EMC" and not payload.emc_offer_code and not has_event_or_capacity_selection:
            raise HTTPException(status_code=422, detail="emc_offer_code is required for an EMC plan preview")
        if payload.account_type == "ORGANIZER" and payload.emc_offer_code:
            raise HTTPException(status_code=409, detail="Workspace and EMC offers cannot be selected together")
        if payload.account_type == "EMC" and payload.workspace_offer_code:
            raise HTTPException(status_code=409, detail="Workspace and EMC offers cannot be selected together")

        selections: list[tuple[str, Optional[str], int, Optional[uuid.UUID], Optional[uuid.UUID], str]] = []
        emc_version: CommercialOfferVersion | None = None
        if payload.workspace_offer_code:
            await self._validated_offer(payload.workspace_offer_code, "WORKSPACE")
            selections.append((payload.workspace_offer_code, payload.workspace_billing_interval or "ANNUAL", 1, None, None, "WORKSPACE"))
        if payload.emc_offer_code:
            _emc_offer, emc_version = await self._validated_offer(payload.emc_offer_code, "EMC")
            selections.append((payload.emc_offer_code, "ANNUAL", 1, None, None, "EMC"))
        venue_selections = [
            (code, 1, payload.venue_event_id)
            for code in payload.venue_offer_codes
        ] + [
            (item.offer_code, item.quantity, item.event_id or payload.venue_event_id)
            for item in payload.venue_items
        ]
        seen_venue_codes: set[str] = set()
        for code, quantity, requested_event_id in venue_selections:
            if code in seen_venue_codes:
                raise HTTPException(
                    status_code=422,
                    detail={"code": "DUPLICATE_VENUE_OFFER", "offer_code": code},
                )
            seen_venue_codes.add(code)
            venue_offer, venue_version = await self._offer_with_current_version(code)
            if venue_offer.product_family not in {"VENUE", "VENUE_ADDON"}:
                raise HTTPException(status_code=422, detail={"code": "VENUE_OFFER_REQUIRED", "offer_code": code})
            venue_prices, _ = await self._version_data(venue_version.id)
            if len(venue_prices) != 1:
                raise HTTPException(status_code=422, detail={"code": "VENUE_PRICE_AMBIGUOUS", "offer_code": code})
            venue_price = venue_prices[0]
            venue_interval = venue_price.billing_interval
            event_id = requested_event_id if venue_interval in {"PER_EVENT", "ONE_TIME"} else None
            if venue_interval in {"PER_EVENT", "ONE_TIME"} and event_id is None:
                raise HTTPException(status_code=422, detail={
                    "code": "EVENT_ID_REQUIRED",
                    "message": "Per-event venue plans and applications must identify an event.",
                })
            minimum_quantity = int(venue_price.minimum_quantity or 1)
            maximum_quantity = int(
                venue_price.maximum_quantity
                or (100 if code == "VENUE_TECHNICIAN_SETUP_DAY" else 1)
            )
            if not minimum_quantity <= quantity <= maximum_quantity:
                raise HTTPException(status_code=422, detail={
                    "code": "VENUE_QUANTITY_OUT_OF_RANGE",
                    "offer_code": code,
                    "minimum_quantity": minimum_quantity,
                    "maximum_quantity": maximum_quantity,
                })
            selections.append((code, venue_interval, quantity, event_id, None, venue_offer.product_family))
        free_draft_lines: list[CloudPriceLine] = []
        for event in payload.events:
            # Event plans and add-ons can be previewed without an existing event_id
            if event.offer_code in {"EVENT_FREE", "free-draft-tier"}:
                free_draft_lines.append(CloudPriceLine(
                    code="EVENT_FREE",
                    display_name="Free Tier (Draft)",
                    product_family="EVENT",
                    quantity=event.quantity,
                    unit_price=Decimal("0"),
                    line_total=Decimal("0"),
                    billing_interval="PER_EVENT",
                    offer_version_id=uuid.uuid4(),
                    event_id=event.event_id,
                    client_workspace_id=event.client_workspace_id,
                    entitlement_snapshot={
                        "registrations": 25,
                        "speakers": 5,
                        "abstracts": 5,
                        "storage_gb": 1,
                        "event_email_credits": 100,
                    },
                ))
            elif event.offer_code:
                _event_offer, event_version = await self._validated_offer(event.offer_code, "EVENT")
                if event_version.eligible_addon_codes and any(code not in event_version.eligible_addon_codes for code in event.capacity_addon_codes):
                    raise HTTPException(status_code=422, detail={"code": "CAPACITY_ADDON_NOT_ELIGIBLE", "offer_code": event.offer_code})
                selections.append((event.offer_code, "PER_EVENT", event.quantity, event.event_id, event.client_workspace_id, "EVENT"))
            elif not event.capacity_addon_codes:
                raise HTTPException(status_code=422, detail="An event plan or capacity add-on is required for each event selection")
            for code in event.capacity_addon_codes:
                addon, _ = await self._validated_offer(code, "CAPACITY_ADDON")
                if addon.scope_type != "EVENT":
                    raise HTTPException(status_code=422, detail={"code": "CAPACITY_SCOPE_MISMATCH", "offer_code": code})
                selections.append((code, "ONE_TIME", event.quantity, event.event_id, event.client_workspace_id, "CAPACITY_ADDON"))
        for code in payload.capacity_addon_codes:
            addon, _ = await self._validated_offer(code, "CAPACITY_ADDON")
            # Top-level add-ons have no event context. Event-scoped bundles
            # must be nested under `events[]` so the resulting allocation can
            # never be created without an event owner.
            if addon.scope_type == "EVENT":
                raise HTTPException(status_code=422, detail={"code": "EVENT_ID_REQUIRED", "message": "Event capacity add-ons must identify an event."})
            if payload.account_type == "ORGANIZER" and addon.scope_type != "EVENT":
                raise HTTPException(status_code=422, detail={"code": "CAPACITY_SCOPE_MISMATCH", "offer_code": code})
            if payload.account_type == "EMC" and addon.scope_type != "EMC":
                raise HTTPException(status_code=422, detail={"code": "CAPACITY_SCOPE_MISMATCH", "offer_code": code})
            if emc_version and emc_version.eligible_addon_codes and code not in emc_version.eligible_addon_codes:
                raise HTTPException(status_code=422, detail={"code": "CAPACITY_ADDON_NOT_ELIGIBLE", "offer_code": code})
            selections.append((code, "ONE_TIME", 1, None, None, "CAPACITY_ADDON"))

        lines: list[CloudPriceLine] = []
        quote_required = False
        warnings: list[str] = []
        workspace_interval_requested = payload.workspace_billing_interval
        for code, interval, quantity, event_id, client_workspace_id, _family in selections:
            offer, version = await self._offer_with_current_version(code)
            quote_required = quote_required or self._requires_quotation(offer)
            prices, entitlements = await self._version_data(version.id)
            price = next((p for p in prices if p.billing_interval == interval), None)
            # Free Workspace is monthly-only in the initial catalogue. When
            # the caller omits a term, resolve the only published price rather
            # than manufacturing an invalid annual selection.
            if (
                price is None
                and code == payload.workspace_offer_code
                and workspace_interval_requested is None
                and len(prices) == 1
            ):
                price = prices[0]
                interval = price.billing_interval
            if price is None:
                raise HTTPException(status_code=422, detail=f"No {interval} price configured for {code}")
            line_total = _money(price.amount) * quantity
            lines.append(CloudPriceLine(
                code=offer.code,
                display_name=offer.display_name,
                product_family=offer.product_family,
                quantity=quantity,
                unit_price=_money(price.amount),
                line_total=_money(line_total),
                billing_interval=interval,
                offer_version_id=version.id,
                event_id=event_id,
                client_workspace_id=client_workspace_id,
                entitlement_snapshot={
                    e.entitlement_key: (
                        e.quantity
                        if e.quantity is not None
                        else {
                            "type": e.value_type,
                            "value": (e.metadata_json or {}).get("value"),
                        }
                    )
                    for e in entitlements
                },
            ))
        lines.extend(free_draft_lines)
        subtotal = _money(sum((line.line_total for line in lines), Decimal("0")))
        _tax_rate, gst, total = CommercialTaxService.calculate(subtotal)
        if quote_required:
            warnings.append("One or more selected offers require a Command Center quotation.")
        return CloudPricingPreviewResponse(
            price_book_version=datetime.now(timezone.utc).strftime("%Y.%m"),
            quote_required=quote_required,
            line_items=lines,
            subtotal=subtotal,
            gst=gst,
            total=total,
            warnings=warnings,
        )

    async def account_snapshot(self, organization_id: uuid.UUID) -> dict[str, Any]:
        account, _owner = await self._account_for_read(organization_id)
        return {
            "id": account.id,
            "account_type": account.account_type,
            "owner_organization_id": account.owner_organization_id,
            "status": account.status,
            "currency": account.currency,
            "country": account.country,
            "version": account.version,
        }

    async def contracts(self, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        account, owner = await self._account_for_read(organization_id)
        rows = list((await self.db.scalars(
            select(CommercialContract).where(CommercialContract.commercial_account_id == account.id).order_by(CommercialContract.created_at.desc())
        )).all())
        contract_ids = [contract.id for contract in rows]
        item_rows_by_contract: dict[
            uuid.UUID, list[tuple[CommercialContractItem, CommercialOffer]]
        ] = defaultdict(list)
        if contract_ids:
            item_stmt = (
                select(CommercialContractItem, CommercialOffer)
                .join(CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id)
                .where(CommercialContractItem.contract_id.in_(contract_ids))
                .order_by(CommercialContractItem.contract_id, CommercialContractItem.id)
            )
            if not owner:
                item_stmt = item_stmt.where(
                    CommercialContractItem.client_workspace_id.in_(
                        select(CommercialAccountWorkspace.id).where(
                            CommercialAccountWorkspace.commercial_account_id == account.id,
                            CommercialAccountWorkspace.organization_id == organization_id,
                            CommercialAccountWorkspace.status == "ACTIVE",
                        )
                    )
                )
            for item, offer in (await self.db.execute(item_stmt)).all():
                item_rows_by_contract[item.contract_id].append((item, offer))

        result = []
        for contract in rows:
            item_payloads = []
            for item, offer in item_rows_by_contract.get(contract.id, []):
                item_payloads.append({
                    "id": item.id,
                    "offer_id": item.offer_id,
                    "offer_code": offer.code,
                    "display_name": offer.display_name or offer.name,
                    "product_family": offer.product_family,
                    "offer_version_id": item.offer_version_id,
                    "event_id": item.event_id,
                    "client_workspace_id": item.client_workspace_id,
                    "quantity": item.quantity,
                    "unit_price": float(item.unit_price),
                    "tax_rate": float(item.tax_rate),
                    "line_total": float(item.line_total),
                    "allocation_snapshot": item.allocation_snapshot_json,
                })
            if not owner and not item_payloads:
                continue
            result.append({
                "id": contract.id,
                "contract_type": contract.contract_type,
                "status": contract.status,
                "starts_at": contract.starts_at,
                "ends_at": contract.ends_at,
                "billing_interval": contract.billing_interval,
                "currency": contract.currency,
                "auto_renew": contract.auto_renew,
                "cancel_at_period_end": contract.cancel_at_period_end,
                "invoice_id": contract.invoice_id,
                "activated_at": contract.activated_at,
                "version": contract.version,
                "price_book_version": contract.price_book_version,
                "source_quote_id": contract.source_quote_id,
                "items": item_payloads,
            })
        return result

    async def contract_detail(self, organization_id: uuid.UUID, contract_id: uuid.UUID) -> dict[str, Any]:
        contracts = await self.contracts(organization_id)
        for contract in contracts:
            if contract["id"] == contract_id:
                return contract
        raise HTTPException(status_code=404, detail="Commercial contract not found")

    async def entitlements(self, organization_id: uuid.UUID, event_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        """Return the contract snapshots that produced the usable allocations."""
        account, owner = await self._account_for_read(organization_id)
        stmt = select(CommercialContractItem, CommercialContract, CommercialOffer).join(
            CommercialContract, CommercialContract.id == CommercialContractItem.contract_id
        ).join(CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id).where(
            CommercialContract.commercial_account_id == account.id,
            CommercialContract.status.in_(("ACTIVE", "PENDING_RENEWAL")),
        )
        if event_id:
            stmt = stmt.where(CommercialContractItem.event_id == event_id)
        if not owner:
            stmt = stmt.where(CommercialContractItem.client_workspace_id.in_(select(
                CommercialAccountWorkspace.id
            ).where(
                CommercialAccountWorkspace.commercial_account_id == account.id,
                CommercialAccountWorkspace.organization_id == organization_id,
                CommercialAccountWorkspace.workspace_role == "CLIENT",
                CommercialAccountWorkspace.status == "ACTIVE",
            )))
        rows = (await self.db.execute(stmt.order_by(CommercialContract.created_at.desc()))).all()
        return {
            "account_type": account.account_type,
            "event_id": event_id,
            "items": [
                {
                    "contract_id": contract.id,
                    "contract_status": contract.status,
                    "offer_code": offer.code,
                    "offer_version_id": item.offer_version_id,
                    "event_id": item.event_id,
                    "client_workspace_id": item.client_workspace_id,
                    "quantity": item.quantity,
                    "allocation_snapshot": item.allocation_snapshot_json,
                    "valid_from": contract.starts_at,
                    "valid_until": contract.ends_at,
                }
                for item, contract, offer in rows
            ],
        }

    async def usage(self, organization_id: uuid.UUID, event_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        account, owner = await self._account_for_read(organization_id)
        stmt = select(CommercialAllocation).where(CommercialAllocation.commercial_account_id == account.id)
        if not owner:
            stmt = stmt.where(CommercialAllocation.organization_id == organization_id)
        if event_id:
            stmt = stmt.where(CommercialAllocation.event_id == event_id)
        allocations = list((await self.db.scalars(stmt.order_by(CommercialAllocation.entitlement_key))).all())
        if event_id and not allocations:
            from app.modules.events.models.speaker import Speaker
            from app.modules.registration.models.participant import Participant
            speaker_count = await self.db.scalar(
                select(func.count(Speaker.id)).where(
                    Speaker.event_id == event_id, Speaker.deleted_at.is_(None)
                )
            ) or 0
            participant_count = await self.db.scalar(
                select(func.count(Participant.id)).where(
                    Participant.event_id == event_id, Participant.deleted_at.is_(None)
                )
            ) or 0
            return {
                "account_type": account.account_type,
                "event_id": event_id,
                "is_free_tier": True,
                "plan_name": "Free Tier (Draft)",
                "items": [
                    {
                        "id": f"free-reg-{event_id}",
                        "event_id": event_id,
                        "client_workspace_id": None,
                        "entitlement_key": "registrations",
                        "total": 25,
                        "reserved": 0,
                        "consumed": participant_count,
                        "remaining": max(0, 25 - participant_count),
                        "unit_type": "records",
                        "status": "FREE_TIER",
                    },
                    {
                        "id": f"free-spk-{event_id}",
                        "event_id": event_id,
                        "client_workspace_id": None,
                        "entitlement_key": "speakers",
                        "total": 5,
                        "reserved": 0,
                        "consumed": speaker_count,
                        "remaining": max(0, 5 - speaker_count),
                        "unit_type": "profiles",
                        "status": "FREE_TIER",
                    },
                    {
                        "id": f"free-abs-{event_id}",
                        "event_id": event_id,
                        "client_workspace_id": None,
                        "entitlement_key": "abstracts",
                        "total": 5,
                        "reserved": 0,
                        "consumed": 0,
                        "remaining": 5,
                        "unit_type": "records",
                        "status": "FREE_TIER",
                    },
                    {
                        "id": f"free-sto-{event_id}",
                        "event_id": event_id,
                        "client_workspace_id": None,
                        "entitlement_key": "storage_gb",
                        "total": 1,
                        "reserved": 0,
                        "consumed": 0,
                        "remaining": 1,
                        "unit_type": "GB",
                        "status": "FREE_TIER",
                    },
                    {
                        "id": f"free-eml-{event_id}",
                        "event_id": event_id,
                        "client_workspace_id": None,
                        "entitlement_key": "event_email_credits",
                        "total": 100,
                        "reserved": 0,
                        "consumed": 0,
                        "remaining": 100,
                        "unit_type": "recipients",
                        "status": "FREE_TIER",
                    },
                ],
            }
        # Keep allocation rows immutable per purchased contract item for audit,
        # but expose one effective entitlement per scope. A capacity add-on must
        # increase the event plan's available credit instead of appearing as a
        # second usage line for the same entitlement.
        grouped: dict[tuple[uuid.UUID, uuid.UUID | None, uuid.UUID | None, str], dict[str, Any]] = {}
        for row in allocations:
            group_key = (
                row.organization_id,
                row.event_id,
                row.client_workspace_id,
                row.entitlement_key,
            )
            bucket = grouped.get(group_key)
            if bucket is None:
                bucket = {
                    "id": row.id,
                    "allocation_ids": [],
                    "event_id": row.event_id,
                    "client_workspace_id": row.client_workspace_id,
                    "entitlement_key": row.entitlement_key,
                    "quantity_total": 0,
                    "quantity_reserved": 0,
                    "quantity_consumed": 0,
                    "valid_from": row.valid_from,
                    "valid_until": row.valid_until,
                    "status": "ACTIVE",
                }
                grouped[group_key] = bucket
            bucket["allocation_ids"].append(row.id)
            bucket["quantity_total"] += int(row.quantity_total or 0)
            bucket["quantity_reserved"] += int(row.quantity_reserved or 0)
            bucket["quantity_consumed"] += int(row.quantity_consumed or 0)
            if row.valid_from and row.valid_from < bucket["valid_from"]:
                bucket["valid_from"] = row.valid_from
            if row.valid_until and (
                bucket["valid_until"] is None or row.valid_until < bucket["valid_until"]
            ):
                bucket["valid_until"] = row.valid_until

        effective_items = []
        for bucket in grouped.values():
            key = bucket["entitlement_key"]
            scale = CommercialUsageService.unit_scale(key)
            total = bucket["quantity_total"]
            reserved = bucket["quantity_reserved"]
            consumed = bucket["quantity_consumed"]
            effective_items.append({
                "id": bucket["id"],
                "allocation_ids": bucket["allocation_ids"],
                "source_count": len(bucket["allocation_ids"]),
                "event_id": bucket["event_id"],
                "client_workspace_id": bucket["client_workspace_id"],
                "entitlement_key": key,
                "total": round(total / scale, 2),
                "reserved": round(reserved / scale, 2),
                "consumed": round(consumed / scale, 2),
                "remaining": round(max(0, total - reserved - consumed) / scale, 2),
                "unit_type": "GB" if key.endswith("storage_gb") else None,
                "valid_from": bucket["valid_from"],
                "valid_until": bucket["valid_until"],
                "status": bucket["status"],
            })

        effective_items.sort(
            key=lambda item: (
                str(item["event_id"] or ""),
                str(item["client_workspace_id"] or ""),
                item["entitlement_key"],
            )
        )
        return {
            "account_type": account.account_type,
            "event_id": event_id,
            "items": effective_items,
        }

    async def capacity_purchases(self, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        account, owner = await self._account_for_read(organization_id)
        stmt = select(CommercialContractItem, CommercialContract, CommercialOffer).join(
            CommercialContract, CommercialContract.id == CommercialContractItem.contract_id
        ).join(CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id).where(
            CommercialContract.commercial_account_id == account.id,
            CommercialOffer.product_family == "CAPACITY_ADDON",
        )
        if not owner:
            stmt = stmt.where(CommercialContractItem.client_workspace_id.in_(select(
                CommercialAccountWorkspace.id
            ).where(
                CommercialAccountWorkspace.commercial_account_id == account.id,
                CommercialAccountWorkspace.organization_id == organization_id,
                CommercialAccountWorkspace.status == "ACTIVE",
            )))
        rows = (await self.db.execute(stmt.order_by(CommercialContract.created_at.desc()))).all()
        return [{
            "contract_id": contract.id,
            "contract_status": contract.status,
            "starts_at": contract.starts_at,
            "ends_at": contract.ends_at,
            "item_id": item.id,
            "offer_code": offer.code,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
            "line_total": float(item.line_total),
            "event_id": item.event_id,
            "client_workspace_id": item.client_workspace_id,
            "offer_version_id": item.offer_version_id,
        } for item, contract, offer in rows]

    async def emc_workspaces(self, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        account, owner = await self._emc_account_for_read(organization_id)
        stmt = select(CommercialAccountWorkspace).where(CommercialAccountWorkspace.commercial_account_id == account.id)
        if not owner:
            stmt = stmt.where(CommercialAccountWorkspace.organization_id == organization_id)
        rows = list((await self.db.scalars(
            stmt.order_by(CommercialAccountWorkspace.workspace_role, CommercialAccountWorkspace.created_at)
        )).all())
        return [{
            "id": row.id,
            "organization_id": row.organization_id,
            "workspace_role": row.workspace_role,
            "status": row.status,
            "created_at": row.created_at,
        } for row in rows]

    async def add_emc_workspace(
        self,
        organization_id: uuid.UUID,
        payload: EmcWorkspaceCreateRequest,
        actor_id: uuid.UUID | None = None,
        expected_version: int | None = None,
        *, actor_auth_revision: int | None = None, idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        from app.modules.billing.services.relationship_attachment import approved_attachment
        from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
        from app.core.tenant_context import TenantContextGuard
        if type(expected_version) is not int or expected_version < 1:
            raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
        if not isinstance(idempotency_key, str) or not 16 <= len(idempotency_key) <= 120:
            raise HTTPException(422, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        async with approved_attachment(self.db, organization_id, payload.organization_id, actor_id, actor_auth_revision):
            account = await self._emc_owner_account(organization_id)
            account = await self.db.scalar(select(CommercialAccount).where(CommercialAccount.id == account.id,
                CommercialAccount.owner_organization_id == organization_id).with_for_update().execution_options(populate_existing=True))
            receipt = await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor_id,
                operation="commercial.client.attach", key=idempotency_key,
                payload={**payload.model_dump(mode="json"), "version": expected_version})
            replay = replay_response(receipt)
            if replay is not None:
                return replay[1]
            if account.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "COMMERCIAL_ACCOUNT_VERSION_CONFLICT", "current_version": account.version})
            async with TenantContextGuard.scoped(self.db, payload.organization_id):
                owner_account = await self.db.scalar(select(CommercialAccount).where(
                    CommercialAccount.owner_organization_id == payload.organization_id,
                ))
                if owner_account:
                    raise HTTPException(status_code=409, detail={"code": "COMMERCIAL_ACCOUNT_TYPE_CONFLICT", "message": "An organization that owns a commercial account cannot be attached as an EMC client workspace."})
                mapped_elsewhere = await self.db.scalar(select(CommercialAccountWorkspace).where(
                    CommercialAccountWorkspace.organization_id == payload.organization_id,
                    CommercialAccountWorkspace.workspace_role == "CLIENT",
                    CommercialAccountWorkspace.status == "ACTIVE",
                    CommercialAccountWorkspace.commercial_account_id != account.id,
                ))
                if mapped_elsewhere:
                    raise HTTPException(status_code=409, detail={"code": "EMC_CLIENT_ALREADY_ATTACHED"})
                existing = await self.db.scalar(select(CommercialAccountWorkspace).where(
                    CommercialAccountWorkspace.commercial_account_id == account.id,
                    CommercialAccountWorkspace.organization_id == payload.organization_id,
                ))
            if existing:
                result = {"id": str(existing.id), "organization_id": str(existing.organization_id), "workspace_role": existing.workspace_role, "status": existing.status}
                await complete_idempotent(self.db, receipt, response_status=200, response_body=result, resource_id=existing.id)
                return result
            workspace = CommercialAccountWorkspace(
                commercial_account_id=account.id,
                organization_id=payload.organization_id,
                workspace_role="CLIENT",
                status="ACTIVE",
            )
            self.db.add(workspace)
            account.version += 1
            async with TenantContextGuard.scoped(self.db, payload.organization_id):
                await self.db.flush([workspace])
            await self.db.flush()
            self._audit(
                actor_id=actor_id,
                resource_type="commercial_account_workspace",
                resource_id=workspace.id,
                organization_id=account.owner_organization_id,
                action_type="EMC_CLIENT_WORKSPACE_ADDED",
                new_state={"commercial_account_id": str(account.id), "organization_id": str(workspace.organization_id), "workspace_role": workspace.workspace_role, "reason": payload.reason},
            )
            result = {"id": str(workspace.id), "organization_id": str(workspace.organization_id), "workspace_role": workspace.workspace_role, "status": workspace.status}
            await complete_idempotent(self.db, receipt, response_status=200, response_body=result, resource_id=workspace.id)
            return result

    async def emc_allocations(self, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        account, owner = await self._emc_account_for_read(organization_id)
        stmt = select(CommercialAllocation).where(CommercialAllocation.commercial_account_id == account.id)
        if not owner:
            stmt = stmt.where(CommercialAllocation.organization_id == organization_id)
        rows = list((await self.db.scalars(
            stmt.order_by(CommercialAllocation.client_workspace_id, CommercialAllocation.entitlement_key)
        )).all())
        return [{
            "id": row.id,
            "organization_id": row.organization_id,
            "event_id": row.event_id,
            "client_workspace_id": row.client_workspace_id,
            "entitlement_key": row.entitlement_key,
            "total": round(row.quantity_total / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "reserved": round(row.quantity_reserved / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "consumed": round(row.quantity_consumed / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "remaining": round(max(0, row.quantity_total - row.quantity_reserved - row.quantity_consumed) / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "unit_type": "GB" if row.entitlement_key.endswith("storage_gb") else None,
            "valid_from": row.valid_from,
            "valid_until": row.valid_until,
            "status": row.status,
        } for row in rows]

    async def admin_emc_accounts(self) -> list[dict[str, Any]]:
        accounts = list((await self.db.scalars(select(CommercialAccount).where(
            CommercialAccount.account_type == "EMC",
        ).execution_options(skip_tenant_filter=True).order_by(CommercialAccount.created_at.desc()))).all())
        return [{
            "id": account.id,
            "owner_organization_id": account.owner_organization_id,
            "status": account.status,
            "currency": account.currency,
            "country": account.country,
            "version": account.version,
            "created_at": account.created_at,
        } for account in accounts]

    async def admin_emc_workspaces(self, account_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = list((await self.db.scalars(select(CommercialAccountWorkspace).where(
            CommercialAccountWorkspace.commercial_account_id == account_id,
        ).execution_options(skip_tenant_filter=True).order_by(CommercialAccountWorkspace.workspace_role, CommercialAccountWorkspace.created_at))).all())
        return [{
            "id": row.id,
            "organization_id": row.organization_id,
            "workspace_role": row.workspace_role,
            "status": row.status,
            "created_at": row.created_at,
        } for row in rows]

    async def admin_emc_allocations(self, account_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = list((await self.db.scalars(select(CommercialAllocation).where(
            CommercialAllocation.commercial_account_id == account_id,
        ).execution_options(skip_tenant_filter=True).order_by(CommercialAllocation.client_workspace_id, CommercialAllocation.entitlement_key))).all())
        return [{
            "id": row.id,
            "organization_id": row.organization_id,
            "event_id": row.event_id,
            "client_workspace_id": row.client_workspace_id,
            "entitlement_key": row.entitlement_key,
            "total": round(row.quantity_total / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "reserved": round(row.quantity_reserved / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "consumed": round(row.quantity_consumed / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "remaining": round(max(0, row.quantity_total - row.quantity_reserved - row.quantity_consumed) / CommercialUsageService.unit_scale(row.entitlement_key), 2),
            "unit_type": "GB" if row.entitlement_key.endswith("storage_gb") else None,
            "valid_from": row.valid_from,
            "valid_until": row.valid_until,
            "status": row.status,
        } for row in rows]

    async def admin_emc_history(self, account_id: uuid.UUID, *, limit: int = 100) -> dict[str, list[dict[str, Any]]]:
        """Return account-scoped EMC usage and contract references for staff review.

        This deliberately returns ledger transactions rather than recalculating a
        client total. The ledger is the commercial audit source and preserves
        transfers, releases, and adjustments alongside consumption.
        """
        account = await self.db.get(CommercialAccount, account_id)
        if not account or account.account_type != "EMC":
            raise HTTPException(status_code=404, detail="EMC account not found")

        usage_rows = list((await self.db.scalars(
            select(CommercialUsageLedger)
            .where(CommercialUsageLedger.commercial_account_id == account_id)
            .execution_options(skip_tenant_filter=True)
            .order_by(CommercialUsageLedger.created_at.desc())
            .limit(limit)
        )).all())
        contract_rows = list((await self.db.scalars(
            select(CommercialContract)
            .where(CommercialContract.commercial_account_id == account_id)
            .execution_options(skip_tenant_filter=True)
            .order_by(CommercialContract.created_at.desc())
        )).all())
        return {
            "usage": [{
                "id": row.id,
                "organization_id": row.organization_id,
                "event_id": row.event_id,
                "allocation_id": row.allocation_id,
                "entitlement_key": row.entitlement_key,
                "quantity": round(row.quantity / CommercialUsageService.unit_scale(row.entitlement_key), 2),
                "operation_type": row.operation_type,
                "source_record_id": row.source_record_id,
                "created_at": row.created_at,
            } for row in usage_rows],
            "contracts": [{
                "id": row.id,
                "contract_type": row.contract_type,
                "status": row.status,
                "starts_at": row.starts_at,
                "ends_at": row.ends_at,
                "invoice_id": row.invoice_id,
                "source_quote_id": row.source_quote_id,
                "price_book_version": row.price_book_version,
            } for row in contract_rows],
        }

    async def admin_offer_versions(self, offer_id: uuid.UUID) -> list[dict[str, Any]]:
        versions = list((await self.db.scalars(
            select(CommercialOfferVersion)
            .where(CommercialOfferVersion.offer_id == offer_id)
            .order_by(CommercialOfferVersion.version_number.desc())
        )).all())
        result = []
        for version in versions:
            prices, entitlements = await self._version_data(version.id)
            result.append({
                "id": version.id,
                "offer_id": version.offer_id,
                "version_number": version.version_number,
                "effective_from": version.effective_from,
                "effective_until": version.effective_until,
                "version_status": version.version_status,
                "change_reason": version.change_reason,
                "published_at": version.published_at,
                "eligible_addon_codes": version.eligible_addon_codes or [],
                "prices": [{"billing_interval": price.billing_interval, "pricing_unit": price.pricing_unit, "amount": float(price.amount), "currency": price.currency} for price in prices],
                "entitlements": [{"key": item.entitlement_key, "quantity": item.quantity, "unit_type": item.unit_type, "scope_type": item.scope_type} for item in entitlements],
            })
        return result

    async def admin_offer_impact_preview(self, offer_id: uuid.UUID, version_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        offer = await self.db.get(CommercialOffer, offer_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Commercial offer not found")
        target_version = await self.db.get(CommercialOfferVersion, version_id) if version_id else await self._offer_with_current_version(offer.code)
        if isinstance(target_version, tuple):
            target_version = target_version[1]
        if not target_version or target_version.offer_id != offer_id:
            raise HTTPException(status_code=404, detail="Commercial offer version not found")
        active_contracts = await self.db.scalar(select(func.count(CommercialContract.id)).join(
            CommercialContractItem, CommercialContractItem.contract_id == CommercialContract.id
        ).where(
            CommercialContract.status.in_(("ACTIVE", "PENDING_RENEWAL")),
            CommercialContractItem.offer_id == offer_id,
        ))
        active_allocations = await self.db.scalar(select(func.count(CommercialAllocation.id)).where(
            CommercialAllocation.contract_item_id.in_(select(CommercialContractItem.id).where(CommercialContractItem.offer_id == offer_id)),
            CommercialAllocation.status == "ACTIVE",
        ))
        return {
            "offer_id": offer_id,
            "offer_code": offer.code,
            "target_version_id": target_version.id,
            "target_version_number": target_version.version_number,
            "effective_from": target_version.effective_from,
            "active_contracts_unchanged": int(active_contracts or 0),
            "active_allocations_unchanged": int(active_allocations or 0),
            "new_purchases_use_after_effective_date": True,
            "renewals_use_target_version": True,
            "amendments_require_approval": True,
        }

    async def create_offer_version(
        self,
        offer_id: uuid.UUID,
        payload: OfferVersionCreateRequest,
        actor_id: uuid.UUID,
        if_match: Optional[str],
        idempotency_key: Optional[str] = None,
    ) -> CommercialOfferVersion:
        offer = await self.db.get(CommercialOffer, offer_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Commercial offer not found")
        if idempotency_key:
            existing = await self.db.scalar(select(CommercialOfferVersion).where(
                CommercialOfferVersion.offer_id == offer_id,
                CommercialOfferVersion.idempotency_key == idempotency_key,
            ))
            if existing:
                return existing
        latest = await self.db.scalar(
            select(CommercialOfferVersion).where(CommercialOfferVersion.offer_id == offer.id).order_by(CommercialOfferVersion.version_number.desc())
        )
        expected = latest.version_number if latest else 0
        if if_match is not None and if_match != str(expected):
            raise HTTPException(status_code=412, detail={"code": "OFFER_VERSION_CONFLICT", "expected": expected})
        if latest and payload.effective_from <= latest.effective_from:
            raise HTTPException(status_code=422, detail="effective_from must be after the latest offer version")
        if payload.eligible_addon_codes:
            addon_rows = list((await self.db.scalars(select(CommercialOffer).where(
                CommercialOffer.code.in_(payload.eligible_addon_codes),
                CommercialOffer.product_family == "CAPACITY_ADDON",
            ))).all())
            if len(addon_rows) != len(set(payload.eligible_addon_codes)):
                raise HTTPException(status_code=422, detail={"code": "ADDON_ELIGIBILITY_INVALID"})
            expected_scope = "EVENT" if offer.product_family == "EVENT" else "EMC" if offer.product_family == "EMC" else offer.scope_type
            if any(addon.scope_type != expected_scope for addon in addon_rows):
                raise HTTPException(status_code=422, detail={"code": "ADDON_ELIGIBILITY_SCOPE_MISMATCH"})
        version = CommercialOfferVersion(
            offer_id=offer.id,
            version_number=expected + 1,
            effective_from=payload.effective_from,
            version_status="DRAFT",
            change_reason=payload.change_reason,
            created_by=actor_id,
            idempotency_key=idempotency_key,
            eligible_addon_codes=list(dict.fromkeys(payload.eligible_addon_codes)),
        )
        self.db.add(version)
        await self.db.flush()
        self.db.add_all([
            CommercialOfferPrice(
                offer_version_id=version.id, billing_interval=price.billing_interval,
                pricing_unit=price.pricing_unit, amount=price.amount,
                currency=price.currency, tax_mode=price.tax_mode,
            ) for price in payload.prices
        ])
        self.db.add_all([
            CommercialOfferEntitlement(
                offer_version_id=version.id, entitlement_key=ent.entitlement_key,
                scope_type=ent.scope_type, value_type=ent.value_type, quantity=ent.quantity,
                unit_type=ent.unit_type, consumption_model=ent.consumption_model,
                hard_ceiling=ent.hard_ceiling, metadata_json=ent.metadata_json,
            ) for ent in payload.entitlements
        ])
        await self.db.flush()
        self._audit(
            actor_id=actor_id,
            resource_type="commercial_offer_version",
            resource_id=version.id,
            action_type="COMMERCIAL_OFFER_VERSION_CREATED",
            new_state={
                "offer_id": str(offer.id),
                "version_number": version.version_number,
                "effective_from": version.effective_from.isoformat(),
                "change_reason": version.change_reason,
                "price_count": len(payload.prices),
                "entitlement_count": len(payload.entitlements),
                "eligible_addon_codes": version.eligible_addon_codes,
            },
        )
        await self.db.flush()
        return version

    async def publish_offer_version(
        self,
        version_id: uuid.UUID,
        actor_id: uuid.UUID,
        if_match: str,
    ) -> CommercialOfferVersion:
        version = await self.db.get(CommercialOfferVersion, version_id)
        if not version:
            raise HTTPException(status_code=404, detail="Commercial offer version not found")
        if version.version_status == "PUBLISHED":
            return version
        offer = await self.db.get(CommercialOffer, version.offer_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Commercial offer not found")
        published_latest = await self.db.scalar(
            select(CommercialOfferVersion).where(
                CommercialOfferVersion.offer_id == version.offer_id,
                CommercialOfferVersion.version_status == "PUBLISHED",
            ).order_by(CommercialOfferVersion.version_number.desc())
        )
        expected = str(published_latest.version_number if published_latest else 0)
        if if_match != expected:
            raise HTTPException(status_code=412, detail={"code": "OFFER_VERSION_CONFLICT", "expected": expected})
        old_state = {
            "version_status": version.version_status,
            "effective_until": version.effective_until.isoformat() if version.effective_until else None,
        }
        previous = await self.db.scalar(
            select(CommercialOfferVersion).where(
                CommercialOfferVersion.offer_id == version.offer_id,
                CommercialOfferVersion.version_status == "PUBLISHED",
                CommercialOfferVersion.id != version.id,
            ).order_by(CommercialOfferVersion.effective_from.desc())
        )
        if previous and previous.effective_from >= version.effective_from:
            raise HTTPException(status_code=422, detail="Published version must be later than the current version")
        if previous:
            previous.effective_until = version.effective_from
        version.version_status = "PUBLISHED"
        version.published_at = datetime.now(timezone.utc)
        if offer.lifecycle_status == "DRAFT":
            offer.lifecycle_status = "PUBLISHED"
        await self.db.flush()
        self._audit(
            actor_id=actor_id,
            resource_type="commercial_offer_version",
            resource_id=version.id,
            action_type="COMMERCIAL_OFFER_VERSION_PUBLISHED",
            old_state=old_state,
            new_state={
                "version_status": version.version_status,
                "published_at": version.published_at.isoformat(),
                "effective_from": version.effective_from.isoformat(),
            },
        )
        await self.db.flush()
        return version

    async def transfer_allocation(
        self, organization_id: uuid.UUID, payload: AllocationTransferRequest, actor_id: uuid.UUID, idempotency_key: str,
        expected_version: int | None = None,
    ) -> CommercialAllocationTransfer:
        account = await self._emc_owner_account(organization_id)
        if expected_version is not None and account.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "COMMERCIAL_ACCOUNT_VERSION_CONFLICT", "current_version": account.version})
        existing = await self.db.scalar(select(CommercialAllocationTransfer).where(
            CommercialAllocationTransfer.commercial_account_id == account.id,
            CommercialAllocationTransfer.idempotency_key == idempotency_key,
        ).execution_options(skip_tenant_filter=True))
        if existing:
            return existing
        if payload.source_allocation_id == payload.target_allocation_id:
            raise HTTPException(status_code=422, detail="Source and target allocations must differ")
        source = await self.db.scalar(select(CommercialAllocation).where(
            CommercialAllocation.id == payload.source_allocation_id,
            CommercialAllocation.commercial_account_id == account.id,
            CommercialAllocation.entitlement_key == payload.entitlement_key,
        ).execution_options(skip_tenant_filter=True).with_for_update())
        target = await self.db.scalar(select(CommercialAllocation).where(
            CommercialAllocation.id == payload.target_allocation_id,
            CommercialAllocation.commercial_account_id == account.id,
            CommercialAllocation.entitlement_key == payload.entitlement_key,
        ).execution_options(skip_tenant_filter=True).with_for_update())
        if not source or not target:
            raise HTTPException(status_code=404, detail="Allocation not found")
        now = datetime.now(timezone.utc)
        if source.status != "ACTIVE" or target.status != "ACTIVE":
            raise HTTPException(status_code=409, detail="Only active allocations can be transferred")
        if source.valid_from > now or (source.valid_until and source.valid_until <= now) or target.valid_from > now or (target.valid_until and target.valid_until <= now):
            raise HTTPException(status_code=409, detail={"code": "ALLOCATION_EXPIRED"})
        unit_scale = CommercialUsageService.unit_scale(payload.entitlement_key)
        internal_quantity = payload.quantity * unit_scale
        available = source.quantity_total - source.quantity_reserved - source.quantity_consumed
        if available < internal_quantity:
            raise HTTPException(status_code=409, detail={"code": "INSUFFICIENT_ALLOCATABLE_CAPACITY", "available": available / unit_scale})
        source.quantity_total -= internal_quantity
        target.quantity_total += internal_quantity
        account.version += 1
        transfer = CommercialAllocationTransfer(
            commercial_account_id=account.id, source_allocation_id=source.id,
            target_allocation_id=target.id, entitlement_key=payload.entitlement_key,
            quantity=internal_quantity, reason=payload.reason, idempotency_key=idempotency_key,
            created_by=actor_id,
        )
        self.db.add(transfer)
        await self.db.flush()
        self.db.add_all([
            CommercialUsageLedger(
                commercial_account_id=account.id,
                organization_id=source.organization_id,
                event_id=source.event_id,
                allocation_id=source.id,
                entitlement_key=payload.entitlement_key,
                quantity=internal_quantity,
                operation_type="TRANSFER_OUT",
                source_record_id=f"allocation-transfer:{transfer.id}",
                idempotency_key=f"{idempotency_key}:out",
            ),
            CommercialUsageLedger(
                commercial_account_id=account.id,
                organization_id=target.organization_id,
                event_id=target.event_id,
                allocation_id=target.id,
                entitlement_key=payload.entitlement_key,
                quantity=internal_quantity,
                operation_type="TRANSFER_IN",
                source_record_id=f"allocation-transfer:{transfer.id}",
                idempotency_key=f"{idempotency_key}:in",
            ),
        ])
        await self.db.flush()
        self._audit(
            actor_id=actor_id,
            resource_type="commercial_allocation_transfer",
            resource_id=transfer.id,
            organization_id=account.owner_organization_id,
            action_type="EMC_ALLOCATION_TRANSFERRED",
            new_state={
                "source_allocation_id": str(source.id),
                "target_allocation_id": str(target.id),
                "entitlement_key": payload.entitlement_key,
                "quantity": payload.quantity,
                "reason": payload.reason,
            },
        )
        await self.db.flush()
        return transfer

    async def allocate_emc_capacity(
        self,
        organization_id: uuid.UUID,
        payload,
        actor_id: uuid.UUID,
        idempotency_key: str,
        expected_version: int | None = None,
    ) -> dict[str, Any]:
        """Allocate pooled EMC capacity to a client workspace as an immutable transfer."""
        account = await self._emc_owner_account(organization_id)
        if expected_version is not None and account.version != expected_version:
            raise HTTPException(status_code=412, detail={"code": "COMMERCIAL_ACCOUNT_VERSION_CONFLICT", "current_version": account.version})
        existing = await self.db.scalar(select(CommercialAllocationTransfer).where(
            CommercialAllocationTransfer.commercial_account_id == account.id,
            CommercialAllocationTransfer.idempotency_key == idempotency_key,
        ))
        if existing:
            return {"allocation_id": existing.target_allocation_id, "transfer_id": existing.id, "status": "ALLOCATED"}
        workspace = await self.db.scalar(select(CommercialAccountWorkspace).where(
            CommercialAccountWorkspace.id == payload.client_workspace_id,
            CommercialAccountWorkspace.commercial_account_id == account.id,
            CommercialAccountWorkspace.workspace_role == "CLIENT",
            CommercialAccountWorkspace.status == "ACTIVE",
        ).execution_options(skip_tenant_filter=True))
        if not workspace:
            raise HTTPException(status_code=404, detail="EMC client workspace not found")
        if payload.event_id:
            from app.modules.events.models.event import Event
            event = await self.db.scalar(select(Event).where(
                Event.id == payload.event_id,
                Event.organization_id == workspace.organization_id,
            ).execution_options(skip_tenant_filter=True))
            if not event:
                raise HTTPException(
                    status_code=404,
                    detail={"code": "EMC_CLIENT_EVENT_NOT_FOUND", "client_workspace_id": str(workspace.id)},
                )
        source = await self.db.scalar(select(CommercialAllocation).where(
            CommercialAllocation.commercial_account_id == account.id,
            CommercialAllocation.organization_id == account.owner_organization_id,
            CommercialAllocation.client_workspace_id.is_(None),
            CommercialAllocation.event_id.is_(None),
            CommercialAllocation.entitlement_key == payload.entitlement_key,
            CommercialAllocation.status == "ACTIVE",
        ).order_by(CommercialAllocation.valid_until).with_for_update())
        if not source:
            raise HTTPException(status_code=404, detail="No pooled EMC capacity is available for this entitlement")
        unit_scale = CommercialUsageService.unit_scale(payload.entitlement_key)
        internal_quantity = payload.quantity * unit_scale
        available = int(source.quantity_total) - int(source.quantity_reserved) - int(source.quantity_consumed)
        if available < internal_quantity:
            raise HTTPException(status_code=409, detail={"code": "INSUFFICIENT_POOLED_CAPACITY", "available": available / unit_scale})
        now = datetime.now(timezone.utc)
        target = CommercialAllocation(
            contract_item_id=source.contract_item_id,
            commercial_account_id=account.id,
            organization_id=workspace.organization_id,
            event_id=payload.event_id,
            client_workspace_id=workspace.id,
            entitlement_key=payload.entitlement_key,
            quantity_total=internal_quantity,
            valid_from=max(source.valid_from, now),
            valid_until=source.valid_until,
            status="ACTIVE",
        )
        source.quantity_total -= internal_quantity
        account.version += 1
        self.db.add(target)
        await self.db.flush()
        transfer = CommercialAllocationTransfer(
            commercial_account_id=account.id,
            source_allocation_id=source.id,
            target_allocation_id=target.id,
            entitlement_key=payload.entitlement_key,
            quantity=internal_quantity,
            reason=payload.reason,
            idempotency_key=idempotency_key,
            created_by=actor_id,
        )
        self.db.add(transfer)
        await self.db.flush()
        self.db.add_all([
            CommercialUsageLedger(
                commercial_account_id=account.id,
                organization_id=source.organization_id,
                event_id=source.event_id,
                allocation_id=source.id,
                entitlement_key=payload.entitlement_key,
                quantity=internal_quantity,
                operation_type="TRANSFER_OUT",
                source_record_id=f"allocation-transfer:{transfer.id}",
                idempotency_key=f"{idempotency_key}:out",
            ),
            CommercialUsageLedger(
                commercial_account_id=account.id,
                organization_id=target.organization_id,
                event_id=target.event_id,
                allocation_id=target.id,
                entitlement_key=payload.entitlement_key,
                quantity=internal_quantity,
                operation_type="TRANSFER_IN",
                source_record_id=f"allocation-transfer:{transfer.id}",
                idempotency_key=f"{idempotency_key}:in",
            ),
        ])
        await self.db.flush()
        self._audit(
            actor_id=actor_id,
            resource_type="commercial_allocation_transfer",
            resource_id=transfer.id,
            organization_id=account.owner_organization_id,
            action_type="EMC_CAPACITY_ALLOCATED",
            new_state={
                "source_allocation_id": str(source.id),
                "target_allocation_id": str(target.id),
                "client_workspace_id": str(workspace.id),
                "entitlement_key": payload.entitlement_key,
                "quantity": payload.quantity,
                "reason": payload.reason,
            },
        )
        await self.db.flush()
        return {"allocation_id": target.id, "transfer_id": transfer.id, "status": "ALLOCATED"}
