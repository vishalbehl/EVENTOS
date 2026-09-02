"""Explicit, bounded read projections for organizer notifications."""
from __future__ import annotations

import uuid
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.integrations.models.webhook import Webhook
from app.modules.notifications.schemas.webhook import WebhookResponse
from app.modules.notifications.schemas.notification import EmailLogResponse
from app.modules.communications.models.email_log import EmailLog
from app.modules.registration.models.participant import Participant
from app.modules.events.models.speaker import Speaker
from app.schemas.cursor_pagination import CursorPage, decode_cursor, encode_cursor


class WebhookQueryService:
    """Read webhook configuration without lazy loading or transaction ownership."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def _limit(cls, value: int) -> int:
        if value < 1 or value > cls.MAX_PAGE_SIZE:
            raise ValueError(f"limit must be between 1 and {cls.MAX_PAGE_SIZE}")
        return value

    @staticmethod
    def _columns():
        return (
            Webhook.id,
            Webhook.event_id,
            Webhook.url,
            Webhook.description,
            Webhook.subscribed_events,
            Webhook.status,
            Webhook.consecutive_failures,
            Webhook.last_triggered_at,
            Webhook.last_success_at,
            Webhook.last_failure_reason,
            Webhook.total_deliveries,
            Webhook.total_failures,
            Webhook.created_at,
            Webhook.version,
        )

    async def list_for_event(
        self, event_id: uuid.UUID, *, limit: int = MAX_PAGE_SIZE
    ) -> list[WebhookResponse]:
        statement = (
            select(*self._columns())
            .where(Webhook.event_id == event_id, Webhook.status != "paused")
            .order_by(Webhook.created_at.desc(), Webhook.id.desc())
            .limit(self._limit(limit))
        )
        return [
            WebhookResponse.model_validate(row)
            for row in (await self.db.execute(statement)).mappings().all()
        ]

    async def get_for_event(
        self, event_id: uuid.UUID, webhook_id: uuid.UUID
    ) -> WebhookResponse | None:
        statement = select(*self._columns()).where(
            Webhook.id == webhook_id,
            Webhook.event_id == event_id,
            Webhook.status != "paused",
        )
        row = (await self.db.execute(statement)).mappings().one_or_none()
        return WebhookResponse.model_validate(row) if row else None


class EmailLogQueryService:
    """Cursor-paginate event email logs without counting or hydrating graphs."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(
        self,
        *,
        event_id: uuid.UUID,
        target_type: str = "speaker",
        campaign_id: uuid.UUID | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> CursorPage[EmailLogResponse]:
        if limit < 1 or limit > self.MAX_PAGE_SIZE:
            raise ValueError(f"limit must be between 1 and {self.MAX_PAGE_SIZE}")
        target_type = target_type.lower()
        if target_type == "participant":
            statement = select(
                EmailLog.id,
                EmailLog.campaign_id,
                EmailLog.speaker_id,
                EmailLog.participant_id,
                EmailLog.to_email,
                EmailLog.subject,
                EmailLog.status,
                EmailLog.opened_at,
                EmailLog.sent_at,
            ).join(
                Participant, EmailLog.participant_id == Participant.id
            ).where(
                EmailLog.event_id == event_id,
                Participant.event_id == event_id,
                Participant.deleted_at.is_(None),
            )
        else:
            statement = select(
                EmailLog.id,
                EmailLog.campaign_id,
                EmailLog.speaker_id,
                EmailLog.participant_id,
                EmailLog.to_email,
                EmailLog.subject,
                EmailLog.status,
                EmailLog.opened_at,
                EmailLog.sent_at,
            ).join(
                Speaker, EmailLog.speaker_id == Speaker.id
            ).where(
                EmailLog.event_id == event_id,
                Speaker.event_id == event_id,
                Speaker.deleted_at.is_(None),
            )
        if campaign_id:
            statement = statement.where(EmailLog.campaign_id == campaign_id)
        if status:
            statement = statement.where(EmailLog.status == status)
        if cursor:
            position = decode_cursor(cursor)
            statement = statement.where(
                or_(
                    EmailLog.sent_at < position.occurred_at,
                    and_(
                        EmailLog.sent_at == position.occurred_at,
                        EmailLog.id < position.record_id,
                    ),
                )
            )
        rows = (
            await self.db.execute(
                statement.order_by(desc(EmailLog.sent_at), desc(EmailLog.id)).limit(limit + 1)
            )
        ).mappings().all()
        has_more = len(rows) > limit
        page_rows = rows[:limit]
        items = [EmailLogResponse.model_validate(row) for row in page_rows]
        next_cursor = None
        if has_more and page_rows:
            last = page_rows[-1]
            next_cursor = encode_cursor(last["sent_at"], last["id"])
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_more)
