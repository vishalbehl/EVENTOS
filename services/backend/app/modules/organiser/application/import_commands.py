"""Transaction-owning organizer bulk-import commands."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.rbac.schemas.event import EventCreate


class OrganizerImportCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def import_events(self, *, organization, actor, filename: str,
                            raw: bytes, idempotency_key: str) -> dict:
        try:
            if not filename.lower().endswith(".csv"):
                raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_CSV_REQUIRED", "message": "Upload a CSV file."})
            if len(raw) > 1_048_576:
                raise HTTPException(status_code=413, detail={"code": "EVENT_IMPORT_TOO_LARGE", "message": "CSV files are limited to 1 MB."})
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_ENCODING", "message": "CSV must use UTF-8 encoding."}) from exc
            reader = csv.DictReader(io.StringIO(text))
            required = {"name", "short_code", "start_date", "end_date"}
            headers = {str(value).strip().lower() for value in (reader.fieldnames or [])}
            missing = sorted(required - headers)
            if missing:
                raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_COLUMNS", "message": f"Missing required columns: {', '.join(missing)}"})
            rows = list(reader)
            if not rows:
                raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_EMPTY", "message": "CSV contains no event rows."})
            if len(rows) > 100:
                raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_ROW_LIMIT", "message": "Import at most 100 events at a time."})

            payloads: list[EventCreate] = []
            seen_codes: set[str] = set()
            errors: list[dict] = []
            for index, source_row in enumerate(rows, start=2):
                normalized = {str(key).strip().lower(): (value or "").strip() for key, value in source_row.items() if key is not None}
                try:
                    code = normalized["short_code"].upper()
                    if code in seen_codes:
                        raise ValueError(f"Duplicate short_code '{code}' in CSV")
                    seen_codes.add(code)
                    payloads.append(EventCreate(
                        name=normalized["name"], short_code=code, status="draft",
                        start_date=date.fromisoformat(normalized["start_date"]),
                        end_date=date.fromisoformat(normalized["end_date"]),
                        venue_name=normalized.get("venue_name") or None,
                        location=normalized.get("location") or None,
                        country=normalized.get("country") or None,
                        timezone=normalized.get("timezone") or organization.timezone or "Asia/Kolkata",
                        currency=(normalized.get("currency") or (organization.currency or "INR").split()[0]).upper(),
                        tagline=normalized.get("tagline") or None,
                        description=normalized.get("description") or None,
                    ))
                except Exception as exc:
                    errors.append({"row": index, "message": str(exc)})
            if errors:
                raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_INVALID_ROWS", "errors": errors})

            created: list[dict[str, str]] = []
            for index, payload in enumerate(payloads):
                event = await EventMutationService.create(
                    self.db, organization_id=organization.id, actor_user_id=actor.id,
                    payload=payload, idempotency_key=f"{idempotency_key}:{index}",
                    source="organizer_portal_csv_import",
                )
                created.append({"id": str(event.id), "name": event.name,
                                "short_code": event.short_code, "status": event.status})
            self.db.add(AuditLog(
                organization_id=organization.id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="event_import",
                resource_id=uuid.UUID(created[0]["id"]), action_type="EVENTS_IMPORTED",
                new_state={"filename": filename, "count": len(created),
                           "event_ids": [item["id"] for item in created]},
                is_sensitive=False,
            ))
            await self.db.commit()
            return {"items": created, "created": len(created),
                    "source": "organizer_portal_csv_import",
                    "freshness_at": datetime.now(timezone.utc).isoformat()}
        except Exception:
            await self.db.rollback()
            raise
