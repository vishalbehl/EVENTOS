from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.models.room import AgendaRoom
from app.modules.agenda.models.session import AgendaSession
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.registration.models.participant import Participant
from app.modules.technology_services.models import VenueOpsServiceDefinition, VenueOpsRecommendationRule


DEFAULT_RULES: dict[str, dict[str, Any]] = {
    "registration": {"metric": "registrations", "threshold": 100, "quantity": {"type": "ceil_divide", "metric": "registrations", "divisor": 150}, "priority": "RECOMMENDED", "explanation": "Registration desks are recommended to keep attendee queues moving."},
    "self_check_in": {"metric": "registrations", "threshold": 250, "quantity": {"type": "ceil_divide", "metric": "registrations", "divisor": 150}, "priority": "OPTIONAL", "explanation": "Self check-in helps larger registration cohorts arrive faster."},
    "srr": {"metric": "speakers", "threshold": 20, "quantity": {"type": "ceil_divide", "metric": "speakers", "divisor": 60}, "priority": "RECOMMENDED", "explanation": "A Speaker Ready Room is recommended for presentation intake and speaker support."},
    "room_management": {"metric": "rooms", "threshold": 2, "quantity": {"type": "metric", "metric": "rooms"}, "priority": "RECOMMENDED", "explanation": "Room coordination is recommended when sessions run across multiple rooms."},
    "moderators": {"metric": "sessions", "threshold": 4, "quantity": {"type": "ceil_divide", "metric": "sessions", "divisor": 6}, "priority": "OPTIONAL", "explanation": "Moderation support helps keep a larger programme on time."},
    "live_stream": {"metric": "is_hybrid", "threshold": 1, "quantity": {"type": "constant", "value": 1}, "priority": "RECOMMENDED", "explanation": "Live streaming is recommended because this event is marked as hybrid."},
    "recording": {"metric": "is_hybrid", "threshold": 1, "quantity": {"type": "constant", "value": 1}, "priority": "OPTIONAL", "explanation": "Recording preserves sessions for audiences who cannot attend live."},
}


async def event_facts(db: AsyncSession, event: Event) -> dict[str, Any]:
    registrations = await db.scalar(select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.deleted_at.is_(None))) or 0
    speakers = await db.scalar(select(func.count(Speaker.id)).where(Speaker.event_id == event.id, Speaker.deleted_at.is_(None))) or 0
    rooms = await db.scalar(select(func.count(AgendaRoom.id)).where(AgendaRoom.event_id == event.id, AgendaRoom.is_active.is_(True))) or 0
    sessions = await db.scalar(select(func.count(AgendaSession.id)).where(AgendaSession.event_id == event.id, AgendaSession.deleted_at.is_(None))) or 0
    
    start_date = getattr(event, "start_date", None)
    end_date = getattr(event, "end_date", None)
    days = 1
    if start_date and end_date:
        try:
            days = max(1, (end_date - start_date).days + 1)
        except Exception:
            days = 1

    event_mode = getattr(event, "event_mode", None)
    feature_toggles = getattr(event, "feature_toggles", None) or {}
    is_hybrid = 1 if bool(event_mode == "HYBRID" or (feature_toggles.get("enable_hybrid") if isinstance(feature_toggles, dict) else False)) else 0

    return {
        "registrations": int(registrations),
        "speakers": int(speakers),
        "rooms": int(rooms),
        "sessions": int(sessions),
        "concurrent_sessions": int(rooms),
        "event_days": days,
        "is_hybrid": is_hybrid,
        "event_mode": event_mode,
        "start_date": start_date.isoformat() if start_date else "",
        "end_date": end_date.isoformat() if end_date else "",
    }


def _rule_matches(value: Any, operator: str, threshold: float) -> bool:
    if operator == ">": return value > threshold
    if operator == "=": return value == threshold
    if operator == "<": return value < threshold
    if operator == "<=": return value <= threshold
    return value >= threshold


def _quantity(formula: dict[str, Any], facts: dict[str, Any]) -> int:
    kind = formula.get("type")
    if kind == "metric": return max(1, int(facts.get(formula.get("metric"), 1)))
    if kind == "ceil_divide":
        divisor = max(1, int(formula.get("divisor", 1)))
        value = max(0, int(facts.get(formula.get("metric"), 0)))
        return max(1, (value + divisor - 1) // divisor)
    return max(1, int(formula.get("value", 1)))


async def recommendations(db: AsyncSession, event: Event, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    facts = await event_facts(db, event)
    overrides = overrides or {}
    declined_services = {str(value) for value in (overrides.get("declined_services") or [])}
    service_quantities = {str(key): max(1, int(value)) for key, value in (overrides.get("service_quantities") or {}).items()}
    facts.update({key: value for key, value in overrides.items() if key in facts})
    definitions = list((await db.scalars(select(VenueOpsServiceDefinition).where(VenueOpsServiceDefinition.is_published.is_(True)).order_by(VenueOpsServiceDefinition.category, VenueOpsServiceDefinition.name))).all())
    rules = list((await db.scalars(select(VenueOpsRecommendationRule).where(VenueOpsRecommendationRule.is_active.is_(True)))).all())
    rules_by_service: dict[uuid.UUID, list[VenueOpsRecommendationRule]] = {}
    for rule in rules: rules_by_service.setdefault(rule.service_definition_id, []).append(rule)
    rows = []
    for definition in definitions:
        if definition.code in declined_services:
            continue
        definition_rules = rules_by_service.get(definition.id) or []
        if not definition_rules and definition.code in DEFAULT_RULES:
            fallback = DEFAULT_RULES[definition.code]
            if _rule_matches(facts.get(fallback["metric"], 0), ">=", fallback["threshold"]):
                rows.append({"service_code": definition.code, "service_name": definition.name, "category": definition.category, "description": definition.description, "priority": fallback["priority"], "suggested_quantity": service_quantities.get(definition.code, _quantity(fallback["quantity"], facts)), "reason": fallback["explanation"], "template_refs": definition.template_refs or [], "template_version": str(definition.version), "included_resources": [], "dependencies": definition.dependencies or [], "requires_confirmation": False, "overridden": definition.code in service_quantities, "source_rule_version": definition.version})
            continue
        for rule in definition_rules:
            if _rule_matches(facts.get(rule.metric, 0), rule.operator, float(rule.threshold)):
                rows.append({"service_code": definition.code, "service_name": definition.name, "category": definition.category, "description": definition.description, "priority": rule.priority, "suggested_quantity": service_quantities.get(definition.code, _quantity(rule.quantity_formula or {}, facts)), "reason": rule.explanation, "template_refs": definition.template_refs or [], "template_version": str(definition.version), "included_resources": [], "dependencies": definition.dependencies or [], "requires_confirmation": rule.requires_confirmation, "overridden": definition.code in service_quantities, "source_rule_version": rule.version})
    return {"facts": facts, "overrides": overrides, "recommendations": rows}
