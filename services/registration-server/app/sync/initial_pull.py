import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import select
from loguru import logger
import uuid
import datetime

from app.config import settings
from app.models.event import Event
from app.models.organization import Organization

from app.sync.schedule_pull import pull_event_queue


def _source_root_url(base_url: str, source_type: str) -> str:
    url = base_url.rstrip("/")
    for suffix in ("/api/v1/registration-source", "/api/v1/sync"):
        if url.endswith(suffix):
            return url
    if source_type == "registration_server":
        return f"{url}/api/v1/sync"
    return f"{url}/api/v1/registration-source"

async def perform_initial_sync(
    db: AsyncSession,
    event_id: str,
    organization_id: str,
    authorization: str | None = None,
    *,
    source_url: str | None = None,
    api_key: str | None = None,
    source_type: str | None = None,
):
    """
    Downloads Event, Organization, and Event Staff from Cloud,
    then triggers the standard schedule pull.
    """
    logger.info(f"Starting initial sync for Event {event_id}")

    # 1. Fetch Event and Organization details
    base_url = (source_url or settings.CLOUD_API_URL).rstrip("/")
    effective_source_type = source_type or getattr(settings, "REGISTRATION_FETCH_SOURCE_TYPE", "cloud")
    org_url = f"{base_url}/api/v1/organisations/me"
    evt_url = f"{base_url}/api/v1/events/{event_id}"
    headers = {}
    if api_key:
        headers["X-Fetch-Api-Key"] = api_key
    elif authorization:
        headers["Authorization"] = authorization
    async with httpx.AsyncClient() as client:
        # Fetch organization details
        org_data = {}
        target_event = None
        if api_key:
            source_root = _source_root_url(base_url, effective_source_type)
            if effective_source_type == "registration_server":
                context_resp = await client.get(f"{source_root}/device/context", headers=headers, timeout=30.0)
            else:
                context_resp = await client.get(f"{source_root}/context", headers=headers, timeout=30.0)
                if context_resp.status_code == 404:
                    context_resp = await client.get(f"{_source_root_url(base_url, 'registration_server')}/device/context", headers=headers, timeout=30.0)
            context_resp.raise_for_status()
            context_data = context_resp.json()
            org_data = context_data.get("organization", {})
            events = context_data.get("events", [])
            target_event = next((event for event in events if str(event.get("id")) == event_id), None)
        else:
            try:
                org_resp = await client.get(org_url, headers=headers)
                if org_resp.status_code == 200:
                    org_data = org_resp.json().get("organization", {})
            except Exception:
                pass
        org_name = org_data.get("name", "Unknown Org")

        # Fetch event details
        if target_event is None:
            evt_resp = await client.get(evt_url, headers=headers)
            evt_resp.raise_for_status()
            target_event = evt_resp.json()
        
        if not target_event:
            raise ValueError(f"Event {event_id} not found.")
            
        # Upsert Organization
        org_slug = org_data.get("slug", f"org-{organization_id[:8]}")
        org_stmt = insert(Organization).values(
            id=uuid.UUID(organization_id),
            name=org_name,
            slug=org_slug,
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": org_name,
                "slug": org_slug,
            }
        )
        await db.execute(org_stmt)

        # Helper for ISO parsing
        parse_dt = lambda v: datetime.datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None
        parse_d = lambda v: parse_dt(v).date() if parse_dt(v) else None

        evt_values = {
            "id": uuid.UUID(event_id),
            "organization_id": uuid.UUID(organization_id),
            "name": target_event["name"],
            "short_code": target_event.get("short_code", "SYNC"),
            "status": target_event.get("status", "draft"),
            "timezone": target_event.get("timezone", "UTC"),
            "start_date": parse_d(target_event.get("start_date")),
            "end_date": parse_d(target_event.get("end_date")),
            "location": target_event.get("location"),
            "venue_name": target_event.get("venue_name"),
            "country": target_event.get("country"),
            "state": target_event.get("state"),
            "organizer_name": target_event.get("organizer_name"),
            "organizer_details": target_event.get("organizer_details", {"name": "", "email": "", "phone": "", "website": ""}),
            "license_tier": target_event.get("license_tier", "starter"),
            "feature_toggles": target_event.get("feature_toggles", {}),
            "currency": target_event.get("currency", "INR"),
            "speaker_settings": target_event.get("speaker_settings", {"enabled": True}),
            "registration_settings": target_event.get("registration_settings", {"enabled": True}),
            "branding_settings": target_event.get("branding_settings", {"theme_color": "#1A73E8"}),
            "max_file_size_mb": target_event.get("max_file_size_mb", 500),
            "allowed_formats": target_event.get("allowed_formats", ["pptx", "pdf", "mp4"]),
        }

        # Upsert Event
        evt_stmt = insert(Event).values(**evt_values).on_conflict_do_update(
            index_elements=["id"],
            set_={k: v for k, v in evt_values.items() if k not in ["id", "organization_id"]}
        )
        await db.execute(evt_stmt)
        await db.commit()



    # 3. Pull Queue (Sessions, Speakers, Participants, Badges, etc.)
    await pull_event_queue(event_id, authorization, source_url=base_url, api_key=api_key, source_type=effective_source_type)
    
    logger.info(f"Initial sync completed for Event {event_id}")
