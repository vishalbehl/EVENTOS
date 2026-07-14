import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_roles
from app.modules.identity.models.user import User
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.system_setting import SystemSetting
from app.modules.rbac.schemas.settings import GlobalSettingsResponse, GlobalSettingsUpdate
from app.services.timezone_service import set_cached_timezone, get_cached_timezone

router = APIRouter(prefix="/global-settings", tags=["global-settings"])

GLOBAL_SETTINGS_RESOURCE_ID = uuid.UUID(int=0)


async def _read_global_settings(db: AsyncSession) -> GlobalSettingsResponse:
    result = await db.execute(select(SystemSetting))
    settings_dict = {s.key: s.value for s in result.scalars().all()}

    def get_bool(key: str, default: bool = False) -> bool:
        val = settings_dict.get(key)
        if val is None:
            return default
        return val.lower() == "true"

    def get_int(key: str, default: int = 0) -> int:
        val = settings_dict.get(key)
        if val is None:
            return default
        try:
            return int(val)
        except ValueError:
            return default

    return GlobalSettingsResponse(
        timezone=settings_dict.get("timezone", get_cached_timezone()),
        maintenance_mode=get_bool("maintenance_mode", False),
        broadcast_enabled=get_bool("broadcast_enabled", False),
        broadcast_message=settings_dict.get("broadcast_message", ""),
        currency=settings_dict.get("currency", "USD"),
        smtp_host=settings_dict.get("smtp_host", ""),
        smtp_port=get_int("smtp_port", 587),
        smtp_user=settings_dict.get("smtp_user", ""),
        smtp_password_configured=bool(settings_dict.get("smtp_password")),
        support_email=settings_dict.get("support_email", "support@eventos.com"),
        slack_webhook_configured=bool(settings_dict.get("slack_webhook_url")),
        security_max_lockout_attempts=get_int("security_max_lockout_attempts", 5),
        security_idle_timeout_min=get_int("security_idle_timeout_min", 30),
        security_enforce_2fa_super_admin=get_bool("security_enforce_2fa_super_admin", False),
        security_enforce_2fa_org_admin=get_bool("security_enforce_2fa_org_admin", False),
        security_enforce_2fa_speaker=get_bool("security_enforce_2fa_speaker", False),
        security_enforce_2fa_attendee=get_bool("security_enforce_2fa_attendee", False),
        security_ip_allowlist=settings_dict.get("security_ip_allowlist", ""),
    )


@router.get("", response_model=GlobalSettingsResponse)
async def get_global_settings(
    _: User = Depends(require_roles("super_admin")),
    db: AsyncSession = Depends(get_db)
) -> GlobalSettingsResponse:
    """Return sanitized platform configuration to Super Admins only."""
    return await _read_global_settings(db)


@router.patch("", response_model=GlobalSettingsResponse)
async def update_global_settings(
    payload: GlobalSettingsUpdate,
    current_user: User = Depends(require_roles("super_admin")),
    db: AsyncSession = Depends(get_db)
) -> GlobalSettingsResponse:
    """Update global system configurations. Only accessible to Super Admin."""
    dump = payload.model_dump(exclude_unset=True)
    reason = dump.pop("reason")
    blocked_secret_keys = {"smtp_password", "slack_webhook_url"}.intersection(dump)
    if blocked_secret_keys:
        raise HTTPException(
            status_code=501,
            detail="Secret settings must be managed through the platform secret-management workflow",
        )
    if not dump:
        raise HTTPException(status_code=422, detail="At least one setting must be supplied")

    existing_result = await db.execute(
        select(SystemSetting).where(SystemSetting.key.in_(dump.keys()))
    )
    old_state = {setting.key: setting.value for setting in existing_result.scalars().all()}
    new_state = {}

    for key, val in dump.items():
        # Query setting
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        setting = result.scalar_one_or_none()

        # Format string value
        if isinstance(val, bool):
            str_val = "true" if val else "false"
        elif val is None:
            str_val = ""
        else:
            str_val = str(val)
        new_state[key] = str_val

        if not setting:
            setting = SystemSetting(key=key, value=str_val)
            db.add(setting)
        else:
            setting.value = str_val

        if key == "timezone":
            set_cached_timezone(str_val)

    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=None,
        resource_type="global_settings",
        resource_id=GLOBAL_SETTINGS_RESOURCE_ID,
        action_type="GLOBAL_SETTINGS_UPDATED",
        actor_role="super_admin",
        old_state=old_state,
        new_state=new_state,
        change_diff={"changed_keys": sorted(dump.keys()), "reason": reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()

    # Re-fetch all and return
    return await _read_global_settings(db)
