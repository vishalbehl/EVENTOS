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

router = APIRouter(prefix="/api/v1/venue/admin", tags=["admin_setup"])

class CloudLoginRequest(BaseModel):
    email: str
    password: str


class FetchSourceRequest(BaseModel):
    source_type: str = Field(pattern="^(cloud|registration_server|venue_server)$")
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


def _configured_source() -> dict[str, str]:
    return {
        "source_type": getattr(settings, "REGISTRATION_FETCH_SOURCE_TYPE", "cloud"),
        "base_url": settings.CLOUD_API_URL.rstrip("/"),
        "api_key": settings.CLOUD_DEVICE_KEY,
    }


def _source_root_url(base_url: str, source_type: str) -> str:
    """Return the root URL for the configured source API.

    Admins may paste either a host URL, such as http://127.0.0.1:8000, or the
    exact source URL shown by Command Center, such as
    http://127.0.0.1:8000/api/v1/registration-source. Normalize both forms so
    we do not accidentally append duplicate paths and produce false 404s.
    """
    url = base_url.rstrip("/")
    for suffix in ("/api/v1/registration-source", "/api/v1/sync"):
        if url.endswith(suffix):
            return url
    if source_type == "registration_server":
        return f"{url}/api/v1/sync"
    return f"{url}/api/v1/registration-source"


def _source_context_url(source: dict[str, str]) -> str:
    return f"{_source_root_url(source['base_url'], source['source_type'])}/context" if _source_root_url(source['base_url'], source['source_type']).endswith("/registration-source") else f"{_source_root_url(source['base_url'], source['source_type'])}/device/context"


async def _fetch_source_context(client: httpx.AsyncClient, source: dict[str, str], api_key: str) -> dict:
    headers = {"X-Fetch-Api-Key": api_key}
    resp = await client.get(_source_context_url(source), headers=headers)
    if resp.status_code == 404 and source["source_type"] != "registration_server":
        resp = await client.get(
            f"{_source_root_url(source['base_url'], 'registration_server')}/device/context",
            headers=headers,
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Failed to verify fetch API key at {_source_context_url(source)}.",
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
    """Small dev diagnostic endpoint for the desktop setup UI.

    This intentionally returns no raw API key. It helps detect stale reload
    children or wrong-service processes by showing which Registration Server
    runtime is actually answering requests.
    """
    import os
    source = _configured_source()
    return {
        "pid": os.getpid(),
        "service": "registration-server",
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
    source_type: str | None = Field(default=None, pattern="^(cloud|registration_server|venue_server)$")
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
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to sync event: {repr(e)}")


@router.post("/reset-database")
async def reset_database(
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin)
):
    """
    Clears local database event state and resets sync queues for the registration software.
    """
    try:
        from sqlalchemy import text
        # Truncate or clean tables in dependency order
        for table in [
            "venue.sync_outbox",
            "venue.srr_activity_logs",
            "venue.srr_checkins",
            "venue.srr_stations",
            "venue.room_devices",
            "venue.venue_capacity_rules",
            "venue.badge_print_jobs",
            "participants.badge_prints",
            "participants.participant_registrations",
            "participants.companions",
            "participants.participants",
            "presentations.presentation_files",
            "presentations.session_speakers",
            "presentations.speakers",
            "events.sessions",
            "events.rooms",
            "events.events",
            "organizations.organisations",
        ]:
            try:
                await db.execute(text(f"TRUNCATE TABLE {table} CASCADE;"))
            except Exception:
                pass
        await db.commit()
        return {"status": "success", "message": "Database state reset successfully."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset database: {e}")

