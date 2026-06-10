# backend/app/routers/settings.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    get_db, get_current_user, get_current_event, CurrentEvent,
    require_roles, OrganizerOrAbove
)
from app.modules.identity.models.user import User
from app.modules.rbac.schemas.settings import SettingsResponse, SettingsUpdate, LicenseInfo
from app.schemas.common import MessageResponse

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
        license_tier=event.license_tier,
        event_mode=event.event_mode,
        feature_toggles=dict(event.feature_toggles),
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
    """
    Update event settings.
    - license_tier: super_admin ONLY.
    - All other settings: organizer and above.
    """
    if event.event_mode and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event is in live mode - settings locked.",
        )

    # Guard: license/live-mode changes require super_admin
    if (
        (payload.license_tier is not None or payload.event_mode is not None)
        and current_user.role != "super_admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super_admin can change license tier or live event mode.",
        )

    # Apply simple scalar fields
    simple_fields = (
        "max_file_size_mb", "allowed_formats",
        "timezone", "upload_deadline", "license_tier",
        "event_mode",
    )
    for field in simple_fields:
        value = getattr(payload, field, None)
        if value is not None:
            setattr(event, field, value)

    # Merge feature_toggles (partial update — don't wipe existing keys)
    if payload.feature_toggles is not None:
        patch = payload.feature_toggles.to_patch_dict()
        current_toggles = dict(event.feature_toggles)
        current_toggles.update(patch)
        event.feature_toggles = current_toggles

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


@router.get("/license", response_model=LicenseInfo)
async def get_license_info(event: CurrentEvent) -> LicenseInfo:
    """
    Returns the capabilities unlocked by the event's current license tier.
    Used by the Command Center Settings → License tab.
    """
    return LicenseInfo.for_tier(event.license_tier)


@router.post("/reset-toggles", response_model=SettingsResponse)
async def reset_feature_toggles(
    event: CurrentEvent,
    current_user: User = Depends(require_roles("super_admin", "organiser")),
    db: AsyncSession = Depends(get_db),
) -> SettingsResponse:
    """Reset all feature toggles to their defaults for this event."""
    if event.event_mode and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Event is in live mode - settings locked.",
        )
    event.feature_toggles = {
        "enable_whatsapp": False,
        "enable_posters": True,
        "enable_srr": True,
        "enable_signage": True,
        "enable_moderator": True,
        "enable_webhooks": False,
    }
    await db.commit()
    await db.refresh(event)
    return _build_response(event)
