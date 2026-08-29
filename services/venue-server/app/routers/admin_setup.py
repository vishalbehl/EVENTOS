from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Header, status
import httpx
from pydantic import BaseModel, Field

from app.config import settings
from app.routers.auth import require_admin
from app.database import get_database
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.sync.initial_pull import perform_initial_sync
from app.models.event import Event
from app.models.sync_outbox import SyncOutbox
from app.models.participant import Participant
from app.models.speaker import Speaker
from app.models.presentation_file import PresentationFile
from app.models.session import Session
from app.models.room import Room
from app.models.room_device import RoomDevice
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.operational_control import VenueInstallation

router = APIRouter(prefix="/api/v1/venue/admin", tags=["admin_setup"])

class CloudLoginRequest(BaseModel):
    email: str
    password: str


class FetchSourceRequest(BaseModel):
    source_type: str = Field(default="cloud", pattern="^(cloud)$")
    base_url: str = Field(min_length=8, max_length=500)
    api_key: str = Field(min_length=1, max_length=1000)


def _env_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


def _upsert_env_values(values: dict[str, str]) -> None:
    path = _env_path()
    content = path.read_text(encoding="utf-8") if path.exists() else ""
    for key, value in values.items():
        line = f"{key}={value}"
        if any(char in value for char in "\r\n"):
            raise HTTPException(status_code=422, detail=f"Invalid value for {key}.")
        if __import__("re").search(rf"^{key}=.*$", content, flags=__import__("re").MULTILINE):
            content = __import__("re").sub(rf"^{key}=.*$", line, content, flags=__import__("re").MULTILINE)
        else:
            content = f"{content.rstrip()}\n{line}\n" if content.strip() else f"{line}\n"
    path.write_text(content, encoding="utf-8")


def _masked_key(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "••••"
    return f"{value[:4]}••••{value[-4:]}"


def _strip_source_suffix(base_url: str) -> str:
    url = base_url.rstrip("/")
    for suffix in ("/api/v1/registration-source", "/api/v1/sync"):
        if url.endswith(suffix):
            return url[: -len(suffix)].rstrip("/")
    return url


def _configured_source() -> dict[str, str]:
    return {
        "source_type": "cloud",
        "base_url": _strip_source_suffix(settings.CLOUD_API_URL),
        "api_key": settings.CLOUD_DEVICE_KEY,
    }


def _source_root_url(base_url: str, source_type: str = "cloud") -> str:
    url = _strip_source_suffix(base_url)
    if source_type == "registration_server":
        return f"{url}/api/v1/registration-source"
    return f"{url}/api/v1/sync"


def _source_context_url(source: dict[str, str]) -> str:
    root = _source_root_url(source["base_url"], source.get("source_type", "cloud"))
    if root.endswith("/api/v1/registration-source"):
        return f"{root}/context"
    return f"{root}/device/context"


def _source_headers(api_key: str) -> dict[str, str]:
    return {
        "X-Fetch-Api-Key": api_key,
        "X-Device-Key": api_key,
    }


async def _fetch_source_context(client: httpx.AsyncClient, source: dict[str, str], api_key: str) -> dict:
    headers = _source_headers(api_key)
    context_url = _source_context_url(source)
    resp = await client.get(context_url, headers=headers)
    if resp.status_code == 404 and source.get("source_type") == "cloud":
        legacy_url = f"{_source_root_url(source['base_url'], 'registration_server')}/context"
        resp = await client.get(legacy_url, headers=headers)
        context_url = legacy_url
    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Failed to verify fetch API key at {context_url}.",
        )
    return resp.json()

def _cloud_unavailable_error(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            f"Cloud backend is not reachable at {settings.CLOUD_API_URL}. "
            "Start the cloud backend or update CLOUD_API_URL, then try again."
        ),
    )

@router.post("/cloud-login")
async def cloud_login(payload: CloudLoginRequest, _=Depends(require_admin)):
    """
    Proxies login credentials to the cloud backend and returns a JWT token
    that the admin can use temporarily for the setup wizard.
    """
    url = f"{settings.CLOUD_API_URL}/api/v1/auth/login"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url, 
                json={"email": payload.email, "password": payload.password}
            )
            if resp.status_code != 200:
                detail = "Invalid cloud credentials"
                try:
                    detail = resp.json().get("detail") or resp.json().get("message") or detail
                except Exception:
                    pass
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
            
            data = resp.json()
            access_token = data.get("access_token")
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Cloud login succeeded but did not return an access token.",
                )
            return {"access_token": access_token}
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError) as e:
        raise _cloud_unavailable_error(e) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Cloud login failed: {e}") from e


@router.get("/fetch-source")
async def get_fetch_source(_=Depends(require_admin)):
    source = _configured_source()
    return {
        "source_type": source["source_type"],
        "base_url": source["base_url"],
        "api_key_set": bool(source["api_key"]),
        "api_key_preview": _masked_key(source["api_key"]),
    }


@router.get("/fetch-source/debug-runtime")
async def get_fetch_source_debug_runtime(_=Depends(require_admin)):
    """Small dev diagnostic endpoint for the desktop setup UI."""
    import os
    source = _configured_source()
    return {
        "pid": os.getpid(),
        "service": "venue-server",
        "source_type": source["source_type"],
        "base_url": source["base_url"],
        "context_url": _source_context_url(source),
        "api_key_set": bool(source["api_key"]),
        "api_key_preview": _masked_key(source["api_key"]),
        "env_path": str(_env_path()),
    }


@router.get("/sync-status")
async def get_sync_status(
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
):
    source = _configured_source()
    source_state = {
        "source_type": source["source_type"],
        "base_url": source["base_url"],
        "context_url": _source_context_url(source),
        "api_key_set": bool(source["api_key"]),
        "reachable": False,
        "status": "unavailable",
        "last_checked_at": None,
        "detail": "No fetch API key is saved.",
    }
    if source["api_key"]:
        from datetime import datetime, timezone
        checked_at = datetime.now(timezone.utc)
        source_state["last_checked_at"] = checked_at.isoformat()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                data = await _fetch_source_context(client, source, source["api_key"])
                source_state.update({
                    "reachable": True,
                    "status": "healthy",
                    "detail": f"{len(data.get('events', []))} event(s) available from source.",
                    "organization": data.get("organization"),
                    "events": data.get("events", []),
                })
        except HTTPException as exc:
            source_state.update({"status": "down", "detail": str(exc.detail)})
        except Exception as exc:
            source_state.update({"status": "down", "detail": str(exc)})

    events = (await db.execute(select(Event).order_by(Event.start_date.desc()))).scalars().all()
    outbox_rows = (
        await db.execute(select(SyncOutbox.status, func.count(SyncOutbox.id)).group_by(SyncOutbox.status))
    ).all()
    last_synced_at = await db.scalar(select(func.max(SyncOutbox.synced_at)))

    # Whole-venue operations metrics (safeguarded against missing schemas/tables on initial boot)
    async def safe_count(model, condition=None):
        try:
            q = select(func.count(model.id))
            if condition is not None:
                q = q.where(condition)
            return (await db.scalar(q)) or 0
        except Exception:
            return 0

    total_participants = await safe_count(Participant)
    total_speakers = await safe_count(Speaker)
    total_presentations = await safe_count(PresentationFile)
    approved_presentations = await safe_count(PresentationFile, PresentationFile.upload_status == "approved")
    total_sessions = await safe_count(Session)
    total_rooms = await safe_count(Room)
    total_devices = await safe_count(RoomDevice)
    total_capacity_rules = await safe_count(VenueCapacityRule)

    return {
        "source": source_state,
        "local": {
            "events": len(events),
            "active_event": {
                "id": str(events[0].id),
                "name": events[0].name,
                "short_code": events[0].short_code,
            } if events else None,
            "outbox": {str(status): count for status, count in outbox_rows},
            "last_push_at": last_synced_at.isoformat() if last_synced_at else None,
            "venue_modules": {
                "participants": total_participants,
                "speakers": total_speakers,
                "presentations_total": total_presentations,
                "presentations_approved": approved_presentations,
                "sessions": total_sessions,
                "rooms": total_rooms,
                "devices": total_devices,
                "capacity_rules": total_capacity_rules,
            },
        },
    }


@router.post("/fetch-source")
async def save_fetch_source(payload: FetchSourceRequest, _=Depends(require_admin)):
    base_url = payload.base_url.rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="Source URL must start with http:// or https://")
    _upsert_env_values(
        {
            "REGISTRATION_FETCH_SOURCE_TYPE": payload.source_type,
            "CLOUD_API_URL": base_url,
            "CLOUD_DEVICE_KEY": payload.api_key,
        }
    )
    settings.REGISTRATION_FETCH_SOURCE_TYPE = payload.source_type
    settings.CLOUD_API_URL = base_url
    settings.CLOUD_DEVICE_KEY = payload.api_key
    return {"status": "saved", "source_type": payload.source_type, "base_url": base_url, "api_key_preview": _masked_key(payload.api_key)}

@router.get("/cloud-organizations")
async def get_cloud_organizations(
    authorization: str | None = Header(default=None),
    x_cloud_authorization: str | None = Header(default=None),
    x_fetch_api_key: str | None = Header(default=None),
    _=Depends(require_admin)
):
    """
    Fetches the organizations the cloud user has access to.
    Supports both Super Admins (lists all orgs) and Org Admins (my org).
    """
    try:
        source = _configured_source()
        api_key = x_fetch_api_key or source["api_key"]
        if api_key:
            async with httpx.AsyncClient(timeout=15.0) as client:
                data = await _fetch_source_context(client, source, api_key)
                organization = data.get("organization")
                return [organization] if organization else []

        cloud_authorization = x_cloud_authorization or authorization
        if not cloud_authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cloud authorization or fetch API key is required.",
            )
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Try superadmin organisations list first
            sa_resp = await client.get(
                f"{settings.CLOUD_API_URL}/api/v1/superadmin/organisations?page_size=100",
                headers={"Authorization": cloud_authorization}
            )
            if sa_resp.status_code == 200:
                sa_data = sa_resp.json()
                items = sa_data.get("items", [])
                if items:
                    return items

            # 2. Fallback to /organisations/me
            resp = await client.get(
                f"{settings.CLOUD_API_URL}/api/v1/organisations/me",
                headers={"Authorization": cloud_authorization}
            )
            if resp.status_code == 200:
                data = resp.json()
                if "organization" in data and data["organization"]:
                    return [data["organization"]]
            return []
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError) as e:
        raise _cloud_unavailable_error(e) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch cloud organizations: {e}") from e

@router.get("/cloud-events")
async def get_cloud_events(
    organization_id: str,
    authorization: str | None = Header(default=None),
    x_cloud_authorization: str | None = Header(default=None),
    x_fetch_api_key: str | None = Header(default=None),
    _=Depends(require_admin)
):
    """
    Fetches events for the selected organization.
    """
    try:
        source = _configured_source()
        api_key = x_fetch_api_key or source["api_key"]
        if api_key:
            async with httpx.AsyncClient(timeout=15.0) as client:
                data = await _fetch_source_context(client, source, api_key)
                return [event for event in data.get("events", []) if str(event.get("organization_id")) == organization_id]

        cloud_authorization = x_cloud_authorization or authorization
        if not cloud_authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cloud authorization or fetch API key is required.",
            )
        url = f"{source['base_url']}/api/v1/events?organization_id={organization_id}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"Authorization": cloud_authorization})
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch events")
            return resp.json()
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError) as e:
        raise _cloud_unavailable_error(e) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch cloud events: {e}") from e

class SyncEventRequest(BaseModel):
    event_id: str
    organization_id: str
    source_type: str | None = Field(default="cloud", pattern="^(cloud)$")
    source_url: str | None = None

@router.post("/sync-event")
async def sync_event(
    payload: SyncEventRequest,
    authorization: str = Header(...),
    x_cloud_authorization: str | None = Header(default=None),
    x_fetch_api_key: str | None = Header(default=None),
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin)
):
    """
    Triggers the initial pull of the event into the local database.
    """
    try:
        existing_event_ids = list((await db.execute(select(Event.id))).scalars().all())
        if existing_event_ids and any(str(existing_id) != payload.event_id for existing_id in existing_event_ids):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This Venue Server is already bound to another event. Archive and reprovision it before fetching a different event.",
            )
        source = _configured_source()
        api_key = x_fetch_api_key or source["api_key"] or None
        cloud_authorization = None if api_key else (x_cloud_authorization or authorization)
        await perform_initial_sync(
            db,
            payload.event_id,
            payload.organization_id,
            cloud_authorization,
            source_url=(payload.source_url or source["base_url"]),
            api_key=api_key,
            source_type=(payload.source_type or source["source_type"]),
        )
        install = await db.scalar(select(VenueInstallation).order_by(VenueInstallation.created_at.asc()).limit(1))
        if install:
            install.provisioned_event_id = __import__("uuid").UUID(payload.event_id)
            install.source_type = payload.source_type or source["source_type"]
            install.source_url = payload.source_url or source["base_url"]
            await db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to sync event: {repr(e)}")
