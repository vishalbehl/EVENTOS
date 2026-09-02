from __future__ import annotations

import uuid
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.pricing.infrastructure.repositories import PricingSimulationRepository
from app.modules.pricing.models import PricingRule
from app.modules.pricing.schemas import PricingSimulationCreate, PricingSimulationOut
from app.modules.pricing.services import SimulationService


class PricingCommandService:
    @staticmethod
    def _metadata(rule: PricingRule) -> dict:
        defaults = {
            "is_default": False,
            "hardware_markup_pct": 15.0,
            "staffing_markup_pct": 20.0,
            "management_fee_pct": 10.0,
            "contingency_pct": 5.0,
            "gst_pct": 18.0,
            "description": "",
        }
        if rule.description and rule.description.strip().startswith("{"):
            try:
                defaults.update(json.loads(rule.description))
            except (TypeError, ValueError):
                defaults["description"] = rule.description
        elif rule.description:
            defaults["description"] = rule.description
        return defaults

    @staticmethod
    async def _clear_default_rules(
        db: AsyncSession,
        *,
        organization_id,
        excluding: uuid.UUID | None = None,
    ) -> None:
        rules = await db.scalars(
            select(PricingRule).where(PricingRule.organization_id == organization_id)
        )
        for rule in rules:
            if excluding is not None and rule.id == excluding:
                continue
            metadata = PricingCommandService._metadata(rule)
            if metadata.get("is_default"):
                metadata["is_default"] = False
                rule.description = json.dumps(metadata)

    @staticmethod
    async def create_rule(db: AsyncSession, *, organization_id, payload: dict) -> PricingRule:
        if payload.get("is_default"):
            await PricingCommandService._clear_default_rules(
                db,
                organization_id=organization_id,
            )
        metadata = {
            "is_default": bool(payload.get("is_default", False)),
            "hardware_markup_pct": payload["hardware_markup_pct"],
            "staffing_markup_pct": payload["staffing_markup_pct"],
            "management_fee_pct": payload["management_fee_pct"],
            "contingency_pct": payload["contingency_pct"],
            "gst_pct": payload["gst_pct"],
            "description": payload.get("description") or "",
        }
        rule = PricingRule(
            id=uuid.uuid4(),
            organization_id=organization_id,
            name=payload["name"],
            code="PR_" + payload["name"].upper().replace(" ", "_"),
            description=json.dumps(metadata),
            status="ACTIVE",
            effective_from=datetime.now(timezone.utc),
            effective_to=datetime.now(timezone.utc) + timedelta(days=365 * 10),
            priority=0,
        )
        db.add(rule)
        await db.commit()
        await db.refresh(rule)
        return rule

    @staticmethod
    async def update_rule(
        db: AsyncSession,
        *,
        rule_id: uuid.UUID,
        organization_id,
        payload: dict,
    ) -> PricingRule:
        rule = await db.scalar(
            select(PricingRule)
            .where(
                PricingRule.id == rule_id,
                PricingRule.organization_id == organization_id,
            )
            .with_for_update()
        )
        if rule is None:
            raise HTTPException(status_code=404, detail="Pricing rule not found")
        if payload.get("is_default"):
            await PricingCommandService._clear_default_rules(
                db,
                organization_id=organization_id,
                excluding=rule_id,
            )

        metadata = PricingCommandService._metadata(rule)
        for key in (
            "is_default",
            "hardware_markup_pct",
            "staffing_markup_pct",
            "management_fee_pct",
            "contingency_pct",
            "gst_pct",
            "description",
        ):
            if key in payload and payload[key] is not None:
                metadata[key] = payload[key]
        if "name" in payload and payload["name"] is not None:
            rule.name = payload["name"]
        if "is_active" in payload and payload["is_active"] is not None:
            rule.status = "ACTIVE" if payload["is_active"] else "INACTIVE"
        rule.description = json.dumps(metadata)
        await db.commit()
        await db.refresh(rule)
        return rule

    @staticmethod
    async def simulate(
        db: AsyncSession,
        *,
        organization_id: Optional[uuid.UUID],
        user_id: uuid.UUID,
        payload: PricingSimulationCreate,
        idempotency_key: Optional[str] = None,
    ):
        operation = None
        try:
            if idempotency_key and organization_id is not None:
                operation = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=user_id,
                    operation="pricing.simulate",
                    key=idempotency_key,
                    payload=payload.model_dump(mode="json"),
                )
                replay = replay_response(operation)
                if replay:
                    await db.rollback()
                    return replay[1]

            simulation = await SimulationService.simulate_pricing(
                db=db,
                organization_id=organization_id,
                user_id=user_id,
                name=payload.name,
                input_data=payload.input_data,
            )
            await db.commit()
            current = await PricingSimulationRepository.get_by_id(
                db, simulation.id, organization_id=organization_id, user_id=user_id
            )
            if current is None:
                raise RuntimeError("Pricing simulation disappeared after commit")
            response = PricingSimulationOut.model_validate(current).model_dump(mode="json")
            if operation is not None:
                await complete_idempotent(db, operation, response_status=200, response_body=response, resource_id=current.id)
                await db.commit()
            return response
        except Exception:
            if db.in_transaction():
                await db.rollback()
            raise

    @staticmethod
    async def delete(
        db: AsyncSession,
        *,
        organization_id: Optional[uuid.UUID],
        user_id: uuid.UUID,
        simulation_id: uuid.UUID,
    ) -> bool:
        try:
            simulation = await PricingSimulationRepository.get_by_id(
                db, simulation_id, organization_id=organization_id, user_id=user_id
            )
            if simulation is None:
                return False
            await PricingSimulationRepository.delete(db, simulation)
            await db.commit()
            return True
        except Exception:
            if db.in_transaction():
                await db.rollback()
            raise
