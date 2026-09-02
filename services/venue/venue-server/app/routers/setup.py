from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.operational_control import VenueInstallation
from app.models.venue_user import VenueUser
from app.routers.auth import hash_password


router = APIRouter(prefix="/api/v1/setup", tags=["venue_setup"])


class BootstrapRequest(BaseModel):
    installation_name: str = Field(min_length=2, max_length=160)
    admin_name: str = Field(min_length=2, max_length=200)
    admin_email: str = Field(min_length=1, max_length=320)
    admin_username: str = Field(min_length=1, max_length=80)
    admin_password: str = Field(min_length=6, max_length=512)
    storage_path: str = Field(min_length=2, max_length=1000)
    backup_path: str = Field(min_length=2, max_length=1000)


def require_local_request(request: Request) -> None:
    host = request.client.host if request.client else ""
    if host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Initial setup is available only from this Venue Server.")


@router.get("/status")
async def setup_status(db: AsyncSession = Depends(get_database)) -> dict:
    user_count = int(await db.scalar(select(func.count(VenueUser.id))) or 0)
    install = await db.scalar(select(VenueInstallation).order_by(VenueInstallation.created_at.asc()).limit(1))
    return {
        "setup_required": user_count == 0,
        "administrator_created": user_count > 0,
        "installation": {
            "id": str(install.id), "name": install.installation_name, "status": install.setup_status,
            "storage_path": install.storage_path, "backup_path": install.backup_path,
        } if install else None,
        "security_ready": len(settings.VENUE_AUTH_SECRET) >= 32 and len(settings.VENUE_AUTH_KEY) >= 24,
        "database_ready": True,
    }


@router.post("/bootstrap", status_code=status.HTTP_201_CREATED)
async def bootstrap(
    payload: BootstrapRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
) -> dict:
    require_local_request(request)
    if int(await db.scalar(select(func.count(VenueUser.id))) or 0) > 0:
        raise HTTPException(status_code=409, detail="Venue Server has already been initialized.")
    if len(settings.VENUE_AUTH_SECRET) < 32 or len(settings.VENUE_AUTH_KEY) < 24:
        raise HTTPException(status_code=503, detail="Installer secrets are missing. Set VENUE_AUTH_SECRET and VENUE_AUTH_KEY before setup.")
    storage = Path(payload.storage_path).expanduser()
    backup = Path(payload.backup_path).expanduser()
    for target, label in ((storage, "storage"), (backup, "backup")):
        try:
            target.mkdir(parents=True, exist_ok=True)
            probe = target / ".eventos-write-test"
            probe.write_text("ok", encoding="ascii")
            probe.unlink()
        except OSError as exc:
            raise HTTPException(status_code=422, detail=f"Cannot write to {label} path: {exc}") from exc
    names = payload.admin_name.strip().split(maxsplit=1)
    user = VenueUser(
        email=str(payload.admin_email).lower(), username=payload.admin_username.lower(),
        first_name=names[0], last_name=names[1] if len(names) > 1 else "",
        password_hash=hash_password(payload.admin_password), role="admin",
        allowed_modes=["admin"], mode_preferences={}, notification_preferences={}, is_active=True,
    )
    install = VenueInstallation(
        installation_name=payload.installation_name.strip(), setup_status="complete",
        storage_path=str(storage.resolve()), backup_path=str(backup.resolve()),
        configuration={"platform": "windows", "single_event": True},
    )
    db.add_all([user, install])
    await db.commit()
    return {"status": "complete", "installation_id": str(install.id), "administrator_id": str(user.id)}
