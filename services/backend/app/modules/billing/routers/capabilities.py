from __future__ import annotations

import uuid
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import ActiveUser, StepUpAuth, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.capability_registry import registry_coverage
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.billing.services.platform_flag_service import PlatformFlagService
from app.modules.billing.application.commands import PlatformFlagCommandService
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.platform_domain_tables import PlatformFlagDefinition, PlatformFlagMutation, PlatformFlagOverride
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.billing.models.subscription import PlanFeature, AddonFeature
from app.modules.superadmin.dependencies import require_super_admin


router = APIRouter(tags=["capabilities"])
admin_router = APIRouter(prefix="/platform/capabilities", tags=["capability-administration"], dependencies=[Depends(require_super_admin)])


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FlagDefinitionWrite(StrictModel):
    flag_key: str = Field(pattern=r"^[a-z][a-z0-9_.-]{2,119}$")
    name: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=2000)
    flag_type: Literal["RELEASE", "EXPERIMENT", "OPERATIONAL", "MIGRATION", "KILL_SWITCH"]
    application: str = Field(min_length=2, max_length=60)
    environment: str = Field(default="ALL", min_length=2, max_length=30)
    value_type: Literal["BOOLEAN", "VARIANT"] = "BOOLEAN"
    default_value: dict[str, Any]
    target_capabilities: list[str] = Field(min_length=1)
    rollout_percentage: int = Field(default=100, ge=0, le=100)
    owner_team: str = Field(min_length=2, max_length=100)
    risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    rollback_instructions: str = Field(min_length=12, max_length=4000)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    reason: str = Field(min_length=12, max_length=2000)

    @model_validator(mode="after")
    def validate_definition(self):
        value = self.default_value.get("value")
        if set(self.default_value) != {"value"}:
            raise ValueError("default_value must contain only the value field")
        if self.value_type == "BOOLEAN" and type(value) is not bool:
            raise ValueError("BOOLEAN flags require a Boolean default value")
        if self.value_type == "VARIANT" and (
            not isinstance(value, str) or not value.strip() or len(value) > 200
        ):
            raise ValueError("VARIANT flags require a non-empty string default value")
        if self.flag_type == "KILL_SWITCH":
            if self.value_type != "BOOLEAN" or value is not False or self.rollout_percentage != 0:
                raise ValueError("KILL_SWITCH flags must be Boolean, disabled, and have zero initial rollout")
        if self.risk_level in {"HIGH", "CRITICAL"} and self.rollout_percentage != 0:
            raise ValueError("High-risk flags must be created at zero rollout and activated through approval")
        if self.expires_at and self.starts_at and self.expires_at <= self.starts_at:
            raise ValueError("expires_at must follow starts_at")
        return self


class FlagOverrideWrite(StrictModel):
    scope_type: Literal["GLOBAL", "ORGANIZATION", "EVENT", "USER"]
    organization_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    value: dict[str, Any]
    rollout_percentage: int | None = Field(default=None, ge=0, le=100)
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    starts_at: datetime | None = None
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def validate_scope(self):
        identifiers = {
            "organization_id": self.organization_id,
            "event_id": self.event_id,
            "user_id": self.user_id,
        }
        expected = {
            "GLOBAL": set(),
            "ORGANIZATION": {"organization_id"},
            "EVENT": {"organization_id", "event_id"},
            "USER": {"user_id"},
        }[self.scope_type]
        supplied = {key for key, value in identifiers.items() if value is not None}
        if supplied != expected:
            raise ValueError(
                f"{self.scope_type} scope requires exactly "
                f"{', '.join(sorted(expected)) if expected else 'no target identifiers'}"
            )
        if self.expires_at and self.starts_at and self.expires_at <= self.starts_at:
            raise ValueError("expires_at must follow starts_at")
        return self


class FlagDecision(StrictModel):
    decision: Literal["APPROVED", "REJECTED"]
    reason: str = Field(min_length=12, max_length=2000)


class FlagDefinitionUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=2000)
    rollout_percentage: int | None = Field(default=None, ge=0, le=100)
    owner_team: str | None = Field(default=None, min_length=2, max_length=100)
    rollback_instructions: str | None = Field(default=None, min_length=12, max_length=4000)
    target_capabilities: list[str] | None = Field(default=None, min_length=1)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool | None = None
    reason: str = Field(min_length=12, max_length=2000)


def _audit(actor: User, action: str, resource_type: str, resource_id: uuid.UUID, state: dict[str, Any], organization_id: uuid.UUID | None = None) -> AuditLog:
    return AuditLog(organization_id=organization_id, actor_user_id=actor.id, resource_type=resource_type, resource_id=resource_id, action_type=action, actor_role=actor.role, new_state=jsonable_encoder(state), is_sensitive=True, occurred_at=datetime.now(timezone.utc))


def _flag_row(row: PlatformFlagDefinition) -> dict[str, Any]:
    return jsonable_encoder({column.name: getattr(row, column.name) for column in row.__table__.columns})


def _request_hash(operation: str, payload: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps({"operation": operation, **payload}, sort_keys=True, default=str, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


async def _mutation_replay(
    db: AsyncSession,
    *,
    idempotency_key: str,
    request_hash: str,
) -> PlatformFlagMutation | None:
    existing = await db.scalar(select(PlatformFlagMutation).where(
        PlatformFlagMutation.idempotency_key == idempotency_key,
    ))
    if existing and existing.request_hash != request_hash:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
    return existing


async def _validate_target_capabilities(db: AsyncSession, keys: list[str]) -> None:
    if not keys:
        return
    known = set((await db.scalars(select(FeatureCatalog.key).where(FeatureCatalog.is_active.is_(True)))).all())
    unknown = sorted(set(keys) - known)
    if unknown:
        raise HTTPException(status_code=422, detail={"code": "UNKNOWN_CAPABILITY_KEYS", "keys": unknown})


def _validate_flag_value(definition: PlatformFlagDefinition, value: dict[str, Any]) -> None:
    if set(value) != {"value"}:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_FLAG_VALUE", "message": "Flag value must contain only the value field."},
        )
    raw = value.get("value")
    if definition.value_type == "BOOLEAN" and type(raw) is not bool:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_FLAG_VALUE", "message": "This flag requires a Boolean value."},
        )
    if definition.value_type == "VARIANT" and (
        not isinstance(raw, str) or not raw.strip() or len(raw) > 200
    ):
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_FLAG_VALUE", "message": "This flag requires a non-empty string variant."},
        )


async def _validate_flag_scope(
    db: AsyncSession,
    payload: FlagOverrideWrite,
) -> None:
    if payload.organization_id:
        if not await db.get(Organization, payload.organization_id):
            raise HTTPException(status_code=404, detail={"code": "ORGANIZATION_NOT_FOUND"})
    if payload.event_id:
        event = await db.get(Event, payload.event_id)
        if not event or event.organization_id != payload.organization_id:
            raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
    if payload.user_id and not await db.get(User, payload.user_id):
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND"})


@router.get("/events/{event_id}/capabilities")
async def event_capabilities(event_id: uuid.UUID, response: Response, user: ActiveUser, db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    platform_actor = bool(user.role == "super_admin" or user.platform_role == "SUPER_ADMIN" or user.is_platform_admin)
    if not platform_actor and event.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Event not found")
    try:
        result = await CapabilityService.resolve_event(db, event.organization_id, event.id, user_id=user.id, environment=settings.environment.upper())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    response.headers["ETag"] = f'"{result["resolution_version"]}"'
    response.headers["Cache-Control"] = "private, max-age=30, must-revalidate"
    return result


@router.get("/organizations/current/capabilities")
async def current_organization_capabilities(user: ActiveUser, db: AsyncSession = Depends(get_db)):
    if not user.organization_id:
        raise HTTPException(status_code=409, detail={"code": "ORGANIZATION_CONTEXT_REQUIRED"})
    return await CapabilityService.resolve_organization(db, user.organization_id, user_id=user.id, environment=settings.environment.upper())


@admin_router.get("/coverage")
async def capability_coverage(db: AsyncSession = Depends(get_db)):
    registry = registry_coverage()
    catalogue = {row.key: row for row in (await db.scalars(select(FeatureCatalog))).all()}
    flag_keys = set((await db.scalars(select(PlatformFlagDefinition.flag_key))).all())
    registered = set(registry["features"]) | set(registry["catalog_limit_keys"])
    plan_counts = dict((await db.execute(select(FeatureCatalog.key, func.count(PlanFeature.id)).outerjoin(PlanFeature, PlanFeature.feature_id == FeatureCatalog.id).group_by(FeatureCatalog.key))).all())
    addon_counts = dict((await db.execute(select(FeatureCatalog.key, func.count(AddonFeature.id)).outerjoin(AddonFeature, AddonFeature.feature_id == FeatureCatalog.id).group_by(FeatureCatalog.key))).all())
    registry["items"] = [
        {
            "key": key,
            **definition,
            "catalogued": key in catalogue,
            "catalogue_active": catalogue[key].is_active if key in catalogue else False,
            "plan_source_count": int(plan_counts.get(key, 0)),
            "addon_source_count": int(addon_counts.get(key, 0)),
            "has_backend_gate": definition["backend_mode"] == "ENFORCED" and all(
                registry["operation_enforcement_sites"].get(operation)
                for operation in definition["operations"]
            ),
            "backend_status": definition["backend_mode"],
            "backend_gate_sites": {
                operation: registry["operation_enforcement_sites"].get(operation, [])
                for operation in definition["operations"]
            },
            "has_portal_gate": bool(definition["portal_routes"]),
            "portal_gate_mode": "DYNAMIC_REGISTRY" if definition["portal_routes"] else None,
        }
        for key, definition in sorted(registry["features"].items())
    ]
    registry["limit_items"] = [
        {
            "key": key,
            **definition,
            **registry["limit_enforcement_sites"][key],
            "portal_control": registry["portal_limit_control_sites"][key],
            "catalogue_key": next(
                catalogue_key
                for catalogue_key, mapped_limit in registry["catalog_limit_keys"].items()
                if mapped_limit == key
            ),
        }
        for key, definition in sorted(registry["limits"].items())
    ]
    registry["missing_catalogue_keys"] = sorted(registered - set(catalogue))
    registry["unregistered_catalogue_keys"] = sorted(set(catalogue) - registered)
    registry["flag_count"] = len(flag_keys)
    registry["publishable"] = not registry["missing_catalogue_keys"]
    return registry


@admin_router.post("/catalogue/sync")
async def sync_capability_catalogue(request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await PlatformFlagCommandService.sync_catalogue(db, actor)


@admin_router.get("/flags")
async def list_flags(db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(PlatformFlagDefinition).order_by(PlatformFlagDefinition.flag_type, PlatformFlagDefinition.flag_key))).all()
    return {"items": [_flag_row(row) for row in rows]}


@admin_router.get("/flags/report")
async def flag_hygiene_report(stale_days: int = 90, db: AsyncSession = Depends(get_db)):
    if not 7 <= stale_days <= 730:
        raise HTTPException(status_code=422, detail="stale_days must be between 7 and 730")
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=stale_days)
    rows = (await db.scalars(select(PlatformFlagDefinition).order_by(PlatformFlagDefinition.updated_at))).all()
    override_counts = dict((await db.execute(
        select(PlatformFlagOverride.flag_id, func.count(PlatformFlagOverride.id)).group_by(PlatformFlagOverride.flag_id)
    )).all())
    items = []
    for row in rows:
        reasons: list[str] = []
        if row.expires_at and row.expires_at <= now:
            reasons.append("EXPIRED")
        if not row.is_active:
            reasons.append("INACTIVE")
        if row.updated_at <= cutoff:
            reasons.append("STALE")
        if int(override_counts.get(row.id, 0)) == 0 and row.rollout_percentage == 0:
            reasons.append("UNUSED")
        if reasons:
            items.append({
                "id": row.id,
                "flag_key": row.flag_key,
                "owner_team": row.owner_team,
                "updated_at": row.updated_at,
                "expires_at": row.expires_at,
                "override_count": int(override_counts.get(row.id, 0)),
                "reasons": reasons,
            })
    return {
        "generated_at": now,
        "stale_cutoff": cutoff,
        "total_flags": len(rows),
        "attention_count": len(items),
        "items": items,
    }


@admin_router.post("/flags", status_code=201)
async def create_flag(payload: FlagDefinitionWrite, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await PlatformFlagCommandService.create_flag(
        db, payload=payload, actor=actor, idempotency_key=idempotency_key
    )


@admin_router.patch("/flags/{flag_id}")
async def update_flag(flag_id: uuid.UUID, payload: FlagDefinitionUpdate, request: Request, step_up: StepUpAuth, expected_version: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await PlatformFlagCommandService.update_flag(
        db,
        flag_id=flag_id,
        payload=payload,
        expected_version=expected_version,
        actor=actor,
        idempotency_key=idempotency_key,
    )


@admin_router.get("/flags/{flag_id}/overrides")
async def list_flag_overrides(flag_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await db.get(PlatformFlagDefinition, flag_id):
        raise HTTPException(status_code=404, detail="Flag not found")
    rows = (await db.scalars(select(PlatformFlagOverride).where(PlatformFlagOverride.flag_id == flag_id).order_by(PlatformFlagOverride.created_at.desc()).limit(100))).all()
    return {"items": [{column.name: getattr(row, column.name) for column in row.__table__.columns} for row in rows]}


@admin_router.post("/flags/{flag_id}/overrides", status_code=202)
async def request_flag_override(flag_id: uuid.UUID, payload: FlagOverrideWrite, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await PlatformFlagCommandService.request_override(
        db,
        flag_id=flag_id,
        payload=payload,
        actor=actor,
        idempotency_key=idempotency_key,
    )


@admin_router.post("/flags/overrides/{override_id}/decision")
async def decide_flag_override(override_id: uuid.UUID, payload: FlagDecision, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await PlatformFlagCommandService.decide_override(
        db,
        override_id=override_id,
        payload=payload,
        actor=actor,
        idempotency_key=idempotency_key,
    )


@admin_router.get("/flags/evaluate")
async def evaluate_flags(organization_id: uuid.UUID | None = None, event_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None, application: str = "ORGANIZER_PORTAL", environment: str = "ALL", db: AsyncSession = Depends(get_db)):
    return await PlatformFlagService.evaluate(db, organization_id=organization_id, event_id=event_id, user_id=user_id, application=application, environment=environment)
