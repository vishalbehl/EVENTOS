from __future__ import annotations

import uuid
import json
from typing import Optional
from sqlalchemy import desc, select

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.pricing.infrastructure.repositories import PricingSimulationRepository
from app.modules.pricing.models import PricingRule, RevenueForecast
from app.modules.pricing.template_models import RoomTemplate, RegistrationTemplate, SrrTemplate


class PricingQueryService:
    @staticmethod
    async def list_simulations(db: AsyncSession, *, organization_id: Optional[uuid.UUID], user_id: uuid.UUID, limit: int = 100):
        return await PricingSimulationRepository.list_page(db, organization_id=organization_id, user_id=user_id, limit=limit)

    @staticmethod
    async def list_forecasts(
        db: AsyncSession, *, organization_id: uuid.UUID, limit: int = 100
    ) -> list[RevenueForecast]:
        """Return a bounded, tenant-scoped forecast projection."""
        bounded_limit = max(1, min(int(limit), 100))
        rows = await db.scalars(
            select(RevenueForecast)
            .where(RevenueForecast.organization_id == organization_id)
            .order_by(desc(RevenueForecast.month), desc(RevenueForecast.id))
            .limit(bounded_limit)
        )
        return list(rows.all())


class PricingCatalogQueryService:
    """Bounded, explicitly-projected reads for the super-admin catalog."""

    _RULE_COLUMNS = (
        PricingRule.id, PricingRule.name, PricingRule.code,
        PricingRule.description, PricingRule.status,
        PricingRule.effective_from, PricingRule.effective_to,
    )
    _COMMON_TEMPLATE_COLUMNS = (
        "name", "slug", "description", "status", "is_default", "version",
        "usage_count", "short_description", "total_estimated_cost",
        "consumables_cost", "inclusions", "exclusions", "setup_time",
        "teardown_time", "hardware_allocation", "staff_allocation", "image_url",
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _rule_metadata(rule: PricingRule) -> dict:
        defaults = {
            "is_default": False, "hardware_markup_pct": 15.0,
            "staffing_markup_pct": 20.0, "management_fee_pct": 10.0,
            "contingency_pct": 5.0, "gst_pct": 18.0, "description": "",
        }
        if rule.description and rule.description.strip().startswith("{"):
            try:
                defaults.update(json.loads(rule.description))
            except (TypeError, ValueError):
                defaults["description"] = rule.description
        elif rule.description:
            defaults["description"] = rule.description
        return defaults

    @classmethod
    def _rule_payload(cls, rule: PricingRule, *, include_history: bool = False) -> dict:
        metadata = cls._rule_metadata(rule)
        payload = {
            "id": str(rule.id), "name": rule.name, "rule_code": rule.code,
            "is_default": bool(metadata["is_default"]),
            "hardware_markup_pct": metadata["hardware_markup_pct"],
            "staffing_markup_pct": metadata["staffing_markup_pct"],
            "management_fee_pct": metadata["management_fee_pct"],
            "contingency_pct": metadata["contingency_pct"],
            "gst_pct": metadata["gst_pct"], "is_active": rule.status == "ACTIVE",
            "status": rule.status, "description": metadata["description"],
            "created_at": rule.effective_from.isoformat() if rule.effective_from else None,
            "updated_at": rule.effective_to.isoformat() if rule.effective_to else None,
        }
        if include_history:
            payload["history"] = []
        return payload

    async def list_rules(self, *, limit: int = 100) -> list[dict]:
        bounded_limit = max(1, min(int(limit), 100))
        rows = await self.db.scalars(
            select(PricingRule)
            .options(load_only(*self._RULE_COLUMNS))
            .order_by(PricingRule.name.asc(), PricingRule.id.asc())
            .limit(bounded_limit)
        )
        return [self._rule_payload(rule) for rule in rows.all()]

    async def get_rule(self, *, rule_id: uuid.UUID) -> dict | None:
        rule = await self.db.scalar(
            select(PricingRule)
            .options(load_only(*self._RULE_COLUMNS))
            .where(PricingRule.id == rule_id)
            .limit(1)
        )
        return self._rule_payload(rule, include_history=True) if rule else None

    @classmethod
    def _template_payload(cls, template, template_type: str) -> dict:
        payload = {
            "name": template.name, "slug": template.slug,
            "description": template.description or "", "version": template.version,
            "is_default": template.is_default, "is_active": template.status == "ACTIVE",
            "usage_count": template.usage_count,
            "setup_time": float(template.setup_time or 0),
            "teardown_time": float(template.teardown_time or 0),
            "hardware_allocation": template.hardware_allocation or [],
            "staff_allocation": template.staff_allocation or [],
            "image_url": template.image_url, "template_type": template_type,
            "short_description": template.short_description or "",
            "total_estimated_cost": float(template.total_estimated_cost or 0),
            "consumables_cost": float(template.consumables_cost or 0),
            "inclusions": template.inclusions or [], "exclusions": template.exclusions or [],
        }
        if template_type == "room":
            payload.update({"default_capacity": template.default_capacity, "room_type": template.room_type, "podiums": template.podiums or 0})
        elif template_type == "registration":
            payload.update({
                "registration_type": template.registration_type, "min_attendees": template.min_attendees,
                "max_attendees": template.max_attendees, "recommended_reg_type": template.recommended_reg_type,
                "reg_counters": template.reg_counters, "kiosks": template.kiosks,
                "badge_stations": template.badge_stations, "qr_stations": template.qr_stations,
                "helpdesk_counters": template.helpdesk_counters, "checkins_per_hour": template.checkins_per_hour,
                "badge_per_piece_cost": float(template.badge_per_piece_cost or 0),
                "is_single_kiosk": template.is_single_kiosk,
            })
        else:
            payload.update({
                "srr_type": template.srr_type, "min_speakers": template.min_speakers,
                "max_speakers": template.max_speakers, "recommended_event_size": template.recommended_event_size,
                "preview_stations": template.preview_stations, "checkin_counters": template.checkin_counters,
                "consultation_desks": template.consultation_desks, "printer_stations": template.printer_stations,
                "speakers_per_hour": template.speakers_per_hour, "is_single_station": template.is_single_station,
            })
        return payload

    @staticmethod
    def _template_options(model, template_type: str):
        names = list(PricingCatalogQueryService._COMMON_TEMPLATE_COLUMNS)
        if template_type == "room":
            names.extend(("default_capacity", "room_type", "podiums"))
        elif template_type == "registration":
            names.extend((
                "registration_type", "min_attendees", "max_attendees", "recommended_reg_type",
                "reg_counters", "kiosks", "badge_stations", "qr_stations", "helpdesk_counters",
                "checkins_per_hour", "badge_per_piece_cost", "is_single_kiosk",
            ))
        else:
            names.extend((
                "srr_type", "min_speakers", "max_speakers", "recommended_event_size",
                "preview_stations", "checkin_counters", "consultation_desks", "printer_stations",
                "speakers_per_hour", "is_single_station",
            ))
        return load_only(*(getattr(model, name) for name in names))

    async def get_template(self, *, slug: str) -> dict | None:
        for model, template_type in ((RoomTemplate, "room"), (RegistrationTemplate, "registration"), (SrrTemplate, "srr")):
            template = await self.db.scalar(
                select(model).options(self._template_options(model, template_type))
                .where(model.slug == slug).limit(1)
            )
            if template:
                return self._template_payload(template, template_type)
        return None

    async def list_templates(self, *, limit: int = 100) -> dict[str, list[dict]]:
        bounded_limit = max(1, min(int(limit), 100))
        result = {}
        for model, template_type, key in (
            (RoomTemplate, "room", "room_templates"),
            (RegistrationTemplate, "registration", "registration_templates"),
            (SrrTemplate, "srr", "srr_templates"),
        ):
            rows = await self.db.scalars(
                select(model).options(self._template_options(model, template_type))
                .order_by(model.name.asc(), model.id.asc()).limit(bounded_limit)
            )
            result[key] = [self._template_payload(row, template_type) for row in rows.all()]
        return result
