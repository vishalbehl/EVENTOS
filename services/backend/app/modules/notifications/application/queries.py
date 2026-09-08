"""Explicit, bounded read projections for organizer notifications."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.integrations.models.webhook import Webhook
from app.modules.notifications.schemas.webhook import WebhookResponse
from app.modules.notifications.schemas.notification import EmailLogResponse
from app.modules.communications.models.email_log import EmailLog
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_template_version import EmailTemplateVersion
from app.modules.notifications.schemas.email_template_studio import TemplateVersionResponse
from app.modules.registration.models.participant import Participant
from app.modules.events.models.speaker import Speaker
from app.modules.communications.models.channel_delivery import CommunicationDeliveryBatch
from app.modules.rbac.models.rbac import UserAccessNode
from app.modules.platform.models.organization_console import OrganizationNotificationChannelConfig
from app.modules.communications.models.email_component import EmailComponent
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


class EmailTemplateVersionQueryService:
    """Bounded scope-owned immutable template-version reads."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_template(self, *, template_id: uuid.UUID, scope_type: str,
                                organization_id: uuid.UUID | None = None,
                                event_id: uuid.UUID | None = None,
                                limit: int = 100) -> list[TemplateVersionResponse]:
        filters = [EmailTemplateVersion.template_id == template_id, EmailTemplate.scope_type == scope_type]
        if scope_type == "PLATFORM":
            filters.extend((EmailTemplate.organization_id.is_(None), EmailTemplate.event_id.is_(None)))
        elif scope_type == "ORGANIZATION":
            filters.append(EmailTemplate.organization_id == organization_id)
        else:
            filters.append(EmailTemplate.event_id == event_id)
        columns = (
            EmailTemplateVersion.id, EmailTemplateVersion.version_number,
            EmailTemplateVersion.lifecycle_state, EmailTemplateVersion.subject,
            EmailTemplateVersion.preheader, EmailTemplateVersion.body_html,
            EmailTemplateVersion.body_text, EmailTemplateVersion.designer_json,
            EmailTemplateVersion.editor_schema_version, EmailTemplateVersion.created_at,
            EmailTemplateVersion.published_at,
        )
        rows = (await self.db.execute(
            select(*columns).join(EmailTemplate, EmailTemplate.id == EmailTemplateVersion.template_id)
            .where(*filters)
            .order_by(EmailTemplateVersion.version_number.desc(), EmailTemplateVersion.id.desc())
            .limit(max(1, min(limit, 100)))
        )).mappings().all()
        return [TemplateVersionResponse.model_validate(row) for row in rows]


class EmailLogQueryService:
    """Cursor-paginate event email logs without counting or hydrating graphs."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_legacy(
        self, *, event_id: uuid.UUID, target_type: str = "speaker",
        campaign_id: uuid.UUID | None = None, status: str | None = None,
        page: int = 1, limit: int = 50,
    ) -> dict:
        """Serve the offset compatibility contract from the same scoped projection."""
        if page < 1 or limit < 1 or limit > self.MAX_PAGE_SIZE:
            raise ValueError("page must be >= 1 and limit must be between 1 and 100")
        target_type = target_type.lower()
        columns = (
            EmailLog.id, EmailLog.campaign_id, EmailLog.speaker_id,
            EmailLog.participant_id, EmailLog.to_email, EmailLog.subject,
            EmailLog.status, EmailLog.opened_at, EmailLog.sent_at,
        )
        if target_type == "participant":
            statement = select(*columns).join(Participant, EmailLog.participant_id == Participant.id).where(
                EmailLog.event_id == event_id, Participant.event_id == event_id,
                Participant.deleted_at.is_(None),
            )
        else:
            statement = select(*columns).join(Speaker, EmailLog.speaker_id == Speaker.id).where(
                EmailLog.event_id == event_id, Speaker.event_id == event_id,
                Speaker.deleted_at.is_(None),
            )
        if campaign_id:
            statement = statement.where(EmailLog.campaign_id == campaign_id)
        if status:
            statement = statement.where(EmailLog.status == status)
        total = int(await self.db.scalar(select(func.count()).select_from(statement.subquery())) or 0)
        rows = (await self.db.execute(
            statement.order_by(desc(EmailLog.sent_at), desc(EmailLog.id))
            .offset((page - 1) * limit).limit(limit)
        )).mappings().all()
        return {
            "total": total, "page": page, "limit": limit,
            "items": [EmailLogResponse.model_validate(row) for row in rows],
        }

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


class EmailCampaignQueryService:
    """Explicit, bounded campaign list projection with assignment scoping."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(
        self, *, event_id: uuid.UUID, target_type: str, user_id: uuid.UUID,
        unrestricted: bool, limit: int = 100,
    ) -> list[SimpleNamespace]:
        bounded = min(max(limit, 1), self.MAX_PAGE_SIZE)
        columns = (
            EmailCampaign.id, EmailCampaign.event_id, EmailCampaign.template_id,
            EmailCampaign.name, EmailCampaign.recipient_filter,
            EmailCampaign.session_id_filter, EmailCampaign.room_id_filter,
            EmailCampaign.speaker_id_list, EmailCampaign.scheduled_at,
            EmailCampaign.sent_at, EmailCampaign.status,
            EmailCampaign.total_recipients, EmailCampaign.sent_count,
            EmailCampaign.target_type, EmailCampaign.created_at,
            EmailCampaign.version,
        )
        filters = [
            EmailCampaign.event_id == event_id,
            EmailCampaign.target_type == target_type,
            EmailCampaign.deleted_at.is_(None),
        ]
        if not unrestricted:
            assigned_nodes = select(UserAccessNode.node_id).where(UserAccessNode.user_id == user_id)
            filters.append(or_(
                EmailCampaign.created_by == user_id,
                EmailCampaign.session_id_filter.in_(assigned_nodes),
                EmailCampaign.room_id_filter.in_(assigned_nodes),
            ))
        rows = (await self.db.execute(
            select(*columns).where(*filters)
            .order_by(EmailCampaign.created_at.desc(), EmailCampaign.id.desc())
            .limit(bounded)
        )).mappings().all()
        return [SimpleNamespace(**dict(row)) for row in rows]

    async def list_for_event_cursor(
        self, *, event_id: uuid.UUID, target_type: str, user_id: uuid.UUID,
        unrestricted: bool, cursor: str | None = None, limit: int = 50,
    ) -> CursorPage[dict]:
        bounded = min(max(limit, 1), self.MAX_PAGE_SIZE)
        columns = (
            EmailCampaign.id, EmailCampaign.event_id, EmailCampaign.template_id,
            EmailCampaign.name, EmailCampaign.recipient_filter,
            EmailCampaign.session_id_filter, EmailCampaign.room_id_filter,
            EmailCampaign.speaker_id_list, EmailCampaign.scheduled_at,
            EmailCampaign.sent_at, EmailCampaign.status,
            EmailCampaign.total_recipients, EmailCampaign.sent_count,
            EmailCampaign.target_type, EmailCampaign.created_at,
            EmailCampaign.version,
        )
        filters = [EmailCampaign.event_id == event_id, EmailCampaign.target_type == target_type, EmailCampaign.deleted_at.is_(None)]
        if not unrestricted:
            assigned_nodes = select(UserAccessNode.node_id).where(UserAccessNode.user_id == user_id)
            filters.append(or_(EmailCampaign.created_by == user_id, EmailCampaign.session_id_filter.in_(assigned_nodes), EmailCampaign.room_id_filter.in_(assigned_nodes)))
        if cursor:
            position = decode_cursor(cursor)
            filters.append(or_(EmailCampaign.created_at < position.occurred_at, and_(EmailCampaign.created_at == position.occurred_at, EmailCampaign.id < position.record_id)))
        rows = (await self.db.execute(select(*columns).where(*filters).order_by(EmailCampaign.created_at.desc(), EmailCampaign.id.desc()).limit(bounded + 1))).mappings().all()
        has_next = len(rows) > bounded
        rows = rows[:bounded]
        items = [dict(row) for row in rows]
        next_cursor = encode_cursor(items[-1]["created_at"], items[-1]["id"]) if has_next and items else None
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)


class NotificationConfigurationQueryService:
    """Explicit organization-scoped provider configuration projection."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_channels(self, *, organization_id: uuid.UUID) -> list[SimpleNamespace]:
        columns = (
            OrganizationNotificationChannelConfig.channel,
            OrganizationNotificationChannelConfig.provider,
            OrganizationNotificationChannelConfig.state,
            OrganizationNotificationChannelConfig.last_verified_at,
        )
        statement = (
            select(*columns)
            .where(
                OrganizationNotificationChannelConfig.organization_id == organization_id,
                OrganizationNotificationChannelConfig.channel.in_(["SMS", "WHATSAPP", "PUSH"]),
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            )
            .order_by(OrganizationNotificationChannelConfig.channel.asc())
        )
        return [SimpleNamespace(**dict(row)) for row in (await self.db.execute(statement)).mappings().all()]


class EmailComponentQueryService:
    """Bounded event/global component projection without ORM graph hydration."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(self, *, event_id: uuid.UUID, limit: int = 100) -> list[SimpleNamespace]:
        columns = (
            EmailComponent.id, EmailComponent.event_id, EmailComponent.name,
            EmailComponent.component_type, EmailComponent.default_config,
            EmailComponent.is_global, EmailComponent.stable_key,
            EmailComponent.category, EmailComponent.document_fragment,
            EmailComponent.created_at, EmailComponent.updated_at,
        )
        statement = (
            select(*columns)
            .where(
                EmailComponent.deleted_at.is_(None),
                or_(EmailComponent.event_id == event_id, EmailComponent.event_id.is_(None)),
            )
            .order_by(EmailComponent.is_global.desc(), EmailComponent.name.asc(), EmailComponent.id.asc())
            .limit(min(max(limit, 1), self.MAX_PAGE_SIZE))
        )
        return [SimpleNamespace(**dict(row)) for row in (await self.db.execute(statement)).mappings().all()]


class CommunicationDeliveryQueryService:
    """Tenant/event-scoped provider batch history for operational polling."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_batches(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        channel: str,
        cursor: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[CommunicationDeliveryBatch], bool, bool]:
        bounded_limit = min(max(limit, 1), self.MAX_PAGE_SIZE)
        statement = select(CommunicationDeliveryBatch).where(
            CommunicationDeliveryBatch.organization_id == organization_id,
            CommunicationDeliveryBatch.event_id == event_id,
            CommunicationDeliveryBatch.channel == channel,
        )
        if cursor:
            cursor_position = await self.db.execute(
                select(
                    CommunicationDeliveryBatch.created_at,
                    CommunicationDeliveryBatch.id,
                ).where(
                    CommunicationDeliveryBatch.id == cursor,
                    CommunicationDeliveryBatch.organization_id == organization_id,
                    CommunicationDeliveryBatch.event_id == event_id,
                    CommunicationDeliveryBatch.channel == channel,
                )
            )
            position = cursor_position.one_or_none()
            if position is None:
                return [], False, False
            statement = statement.where(
                or_(
                    CommunicationDeliveryBatch.created_at < position.created_at,
                    and_(
                        CommunicationDeliveryBatch.created_at == position.created_at,
                        CommunicationDeliveryBatch.id < position.id,
                    ),
                )
            )
        rows = list((await self.db.scalars(
            statement.order_by(
                CommunicationDeliveryBatch.created_at.desc(),
                CommunicationDeliveryBatch.id.desc(),
            ).limit(bounded_limit + 1)
        )).all())
        return rows[:bounded_limit], len(rows) > bounded_limit, True
