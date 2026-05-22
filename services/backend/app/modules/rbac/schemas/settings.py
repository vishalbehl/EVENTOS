# backend/app/schemas/settings.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, field_validator


# Valid feature toggle keys — prevents arbitrary keys being stored
VALID_TOGGLES = {
    "enable_whatsapp",
    "enable_posters",
    "enable_srr",
    "enable_signage",
    "enable_moderator",
    "enable_webhooks",
}

# License tier hierarchy
LICENSE_TIERS = ("starter", "pro", "enterprise")


class FeatureToggles(BaseModel):
    enable_whatsapp: Optional[bool] = None
    enable_posters: Optional[bool] = None
    enable_srr: Optional[bool] = None
    enable_signage: Optional[bool] = None
    enable_moderator: Optional[bool] = None
    enable_webhooks: Optional[bool] = None

    def to_patch_dict(self) -> Dict[str, bool]:
        """Returns only the fields that were explicitly set."""
        return {k: v for k, v in self.model_dump().items() if v is not None}


class SettingsUpdate(BaseModel):
    max_file_size_mb: Optional[int] = None
    allowed_formats: Optional[List[str]] = None
    theme_color: Optional[str] = None
    logo_url: Optional[str] = None
    timezone: Optional[str] = None
    upload_deadline: Optional[datetime] = None
    feature_toggles: Optional[FeatureToggles] = None
    license_tier: Optional[str] = None  # Only super_admin can change this
    event_mode: Optional[bool] = None  # Only super_admin can change this

    @field_validator("max_file_size_mb")
    @classmethod
    def validate_file_size(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 2048):
            raise ValueError("max_file_size_mb must be between 1 and 2048 MB.")
        return v

    @field_validator("allowed_formats")
    @classmethod
    def validate_formats(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            cleaned = []
            for item in v:
                fmt = item.strip().lower().lstrip(".")
                if not fmt:
                    continue
                cleaned.append(fmt)
            if not cleaned:
                raise ValueError("allowed_formats must contain at least one format or folder rule.")
            return list(dict.fromkeys(cleaned))
        return v

    @field_validator("theme_color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            import re
            if not re.match(r"^#[0-9A-Fa-f]{6}$", v):
                raise ValueError("theme_color must be a valid 6-digit hex color (e.g. #1A73E8).")
        return v

    @field_validator("license_tier")
    @classmethod
    def validate_license(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LICENSE_TIERS:
            raise ValueError(f"license_tier must be one of: {LICENSE_TIERS}")
        return v


class SettingsResponse(BaseModel):
    event_id: uuid.UUID
    max_file_size_mb: int
    allowed_formats: List[str]
    theme_color: str
    logo_url: Optional[str] = None
    timezone: str
    upload_deadline: Optional[datetime] = None
    license_tier: str
    event_mode: bool
    feature_toggles: Dict[str, bool]

    model_config = {"from_attributes": True}


class LicenseInfo(BaseModel):
    """Summary of what the current license tier unlocks."""
    tier: str
    max_events: int
    max_speakers_per_event: int
    max_storage_gb: int
    whatsapp_enabled: bool
    posters_enabled: bool
    webhooks_enabled: bool
    dedicated_support: bool

    @classmethod
    def for_tier(cls, tier: str) -> "LicenseInfo":
        tiers = {
            "starter": cls(
                tier="starter", max_events=3, max_speakers_per_event=100,
                max_storage_gb=50, whatsapp_enabled=False, posters_enabled=False,
                webhooks_enabled=False, dedicated_support=False,
            ),
            "pro": cls(
                tier="pro", max_events=20, max_speakers_per_event=500,
                max_storage_gb=500, whatsapp_enabled=True, posters_enabled=True,
                webhooks_enabled=True, dedicated_support=False,
            ),
            "enterprise": cls(
                tier="enterprise", max_events=999, max_speakers_per_event=99999,
                max_storage_gb=5000, whatsapp_enabled=True, posters_enabled=True,
                webhooks_enabled=True, dedicated_support=True,
            ),
        }
        return tiers.get(tier, tiers["starter"])
