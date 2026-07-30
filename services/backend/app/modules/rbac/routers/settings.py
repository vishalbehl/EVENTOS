# backend/app/routers/settings.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    get_db, CurrentEvent, OrganizerOrAbove
)
from app.modules.rbac.schemas.settings import SettingsResponse, SettingsUpdate
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.billing.services.capability_service import CapabilityService

router = APIRouter(prefix="/events/{event_id}/settings", tags=["settings"])


def _build_response(event) -> SettingsResponse:
    branding = dict(event.branding_settings or {})
    return SettingsResponse(
        event_id=event.id,
        max_file_size_mb=event.max_file_size_mb,
        allowed_formats=list(event.allowed_formats),
        theme_color=branding.get("theme_color", "#1A73E8"),
        logo_url=branding.get("logo_url"),
        banner_url=branding.get("banner_url"),
        branding_settings=branding,
        timezone=event.timezone,
        upload_deadline=event.upload_deadline,
        license_tier=None,
        event_mode=event.event_mode,
        feature_toggles={},
        capabilities_url=f"/events/{event.id}/capabilities",
    )


@router.get("", response_model=SettingsResponse)
async def get_settings(event: CurrentEvent) -> SettingsResponse:
    """Get all configurable settings for this event."""
    return _build_response(event)


@router.patch("", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> SettingsResponse:
    """Update organizer-configurable event settings."""
    if event.event_mode and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event is in live mode - settings locked.",
        )

    controlled_fields = {
        field
        for field in ("license_tier", "feature_toggles", "event_mode")
        if getattr(payload, field, None) is not None
    }
    if controlled_fields:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "COMMAND_CENTER_CONTROL_REQUIRED",
                "fields": sorted(controlled_fields),
                "message": (
                    "Commercial capabilities and operational mode cannot be "
                    "granted through Organizer Portal event settings."
                ),
                "capabilities_url": f"/events/{event.id}/capabilities",
            },
        )

    if payload.timezone is not None or payload.upload_deadline is not None:
        await enforce_event_operation(
            db, event.organization_id, event.id, "events.planning.manage",
            user_id=current_user.id,
        )
    if payload.max_file_size_mb is not None or payload.allowed_formats is not None:
        await enforce_event_operation(
            db, event.organization_id, event.id, "presentations.upload",
            user_id=current_user.id,
        )
    if payload.theme_color is not None or (
        payload.branding_settings is not None
        and payload.branding_settings.theme_color is not None
    ):
        await enforce_event_operation(
            db, event.organization_id, event.id, "branding.colors.manage",
            user_id=current_user.id,
        )
    if payload.logo_url is not None or (
        payload.branding_settings is not None
        and (
            payload.branding_settings.logo_url is not None
            or payload.branding_settings.banner_url is not None
        )
    ):
        await enforce_event_operation(
            db, event.organization_id, event.id, "branding.logo.manage",
            user_id=current_user.id,
        )

    # Apply simple scalar fields
    simple_fields = (
        "max_file_size_mb", "allowed_formats",
        "timezone", "upload_deadline",
    )
    for field in simple_fields:
        value = getattr(payload, field, None)
        if value is not None:
            setattr(event, field, value)

    # Merge feature_toggles (partial update — don't wipe existing keys)
    # Merge branding into branding_settings JSONB
    # Support both legacy flat fields (theme_color, logo_url) and new branding_settings object
    branding_patch: dict = {}
    if payload.theme_color is not None:
        branding_patch["theme_color"] = payload.theme_color
    if payload.logo_url is not None:
        branding_patch["logo_url"] = payload.logo_url
    if payload.branding_settings is not None:
        patch_dict = {k: v for k, v in payload.branding_settings.model_dump().items() if v is not None}
        branding_patch.update(patch_dict)
    if branding_patch:
        current_branding = dict(event.branding_settings or {})
        current_branding.update(branding_patch)
        event.branding_settings = current_branding

    await db.commit()
    await db.refresh(event)
    return _build_response(event)


@router.get("/license")
async def get_license_info(
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Returns the capabilities unlocked by the event's current license tier.
    Used by the Command Center Settings → License tab.
    """
    result = await CapabilityService.resolve_event(
        db,
        event.organization_id,
        event.id,
        user_id=current_user.id,
    )
    return {
        **result,
        "source": "CANONICAL_CAPABILITY_RESOLVER",
        "deprecated_route": True,
        "canonical_url": f"/events/{event.id}/capabilities",
    }


@router.post("/reset-toggles")
async def reset_feature_toggles(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reset all feature toggles to their defaults for this event."""
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "COMMAND_CENTER_CONTROL_REQUIRED",
            "message": (
                "Event-local feature toggles are retired. Use plan, add-on, "
                "grant, restriction, or flag controls in Command Center."
            ),
            "capabilities_url": f"/events/{event.id}/capabilities",
        },
    )
