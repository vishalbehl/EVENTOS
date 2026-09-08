from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.files.models.file import Asset
from app.modules.identity.models.user import User
from app.modules.support.models.ticket import SupportTicket, TicketComment
from app.modules.support.models.support_domain_tables import TicketAttachment


class SupportTicketQueryService:
    """Bounded organization-scoped support-ticket projections."""

    MAX_TICKETS = 500

    def __init__(self, db: AsyncSession):
        self.db = db

    def admin_list_statement(
        self,
        *,
        organization_id: uuid.UUID,
        ticket_status: str | None = None,
        priority: str | None = None,
        assigned_to: uuid.UUID | None = None,
    ):
        """Build the audited admin cursor projection without router-owned reads."""
        statement = select(SupportTicket).options(
            load_only(
                SupportTicket.id,
                SupportTicket.organization_id,
                SupportTicket.creator_id,
                SupportTicket.assigned_to,
                SupportTicket.subject,
                SupportTicket.description,
                SupportTicket.status,
                SupportTicket.priority,
                SupportTicket.category,
                SupportTicket.version,
                SupportTicket.first_response_due_at,
                SupportTicket.resolution_due_at,
                SupportTicket.first_responded_at,
                SupportTicket.resolved_at,
                SupportTicket.closed_at,
                SupportTicket.escalated_at,
                SupportTicket.created_at,
                SupportTicket.updated_at,
            )
        ).where(SupportTicket.organization_id == organization_id)
        if ticket_status:
            statement = statement.where(SupportTicket.status == ticket_status)
        if priority:
            statement = statement.where(SupportTicket.priority == priority)
        if assigned_to:
            statement = statement.where(SupportTicket.assigned_to == assigned_to)
        return statement

    async def get_for_organization(
        self, *, organization_id: uuid.UUID, ticket_id: uuid.UUID
    ) -> SupportTicket | None:
        return await self.db.scalar(
            select(SupportTicket).options(load_only(
                SupportTicket.id, SupportTicket.organization_id,
            )).where(
                SupportTicket.id == ticket_id,
                SupportTicket.organization_id == organization_id,
            )
        )

    async def list_for_organization(self, *, organization_id: uuid.UUID) -> list[SupportTicket]:
        statement = (
            select(SupportTicket)
            .options(
                load_only(
                    SupportTicket.id,
                    SupportTicket.organization_id,
                    SupportTicket.creator_id,
                    SupportTicket.assigned_to,
                    SupportTicket.subject,
                    SupportTicket.description,
                    SupportTicket.status,
                    SupportTicket.priority,
                    SupportTicket.category,
                    SupportTicket.version,
                    SupportTicket.first_response_due_at,
                    SupportTicket.resolution_due_at,
                    SupportTicket.first_responded_at,
                    SupportTicket.resolved_at,
                    SupportTicket.closed_at,
                    SupportTicket.escalated_at,
                    SupportTicket.created_at,
                    SupportTicket.updated_at,
                )
            )
            .where(SupportTicket.organization_id == organization_id)
            .order_by(SupportTicket.updated_at.desc(), SupportTicket.id.desc())
            .limit(self.MAX_TICKETS)
        )
        return list((await self.db.scalars(statement)).all())

    async def list_attachments(
        self, *, organization_id: uuid.UUID, ticket_id: uuid.UUID
    ) -> list[tuple[TicketAttachment, Asset | None]]:
        """Return a bounded attachment projection after ticket authorization."""
        statement = (
            select(TicketAttachment, Asset)
            .outerjoin(Asset, TicketAttachment.asset_id == Asset.id)
            .options(
                load_only(
                    TicketAttachment.id,
                    TicketAttachment.ticket_id,
                    TicketAttachment.asset_id,
                    TicketAttachment.file_name,
                    TicketAttachment.uploaded_by,
                    TicketAttachment.created_at,
                ),
                load_only(
                    Asset.id,
                    Asset.mime_type,
                    Asset.file_size_bytes,
                    Asset.processing_status,
                ),
            )
            .where(
                TicketAttachment.organization_id == organization_id,
                TicketAttachment.ticket_id == ticket_id,
            )
            .order_by(TicketAttachment.created_at.desc(), TicketAttachment.id.desc())
            .limit(self.MAX_TICKETS)
        )
        return list((await self.db.execute(statement)).all())

    async def list_comments(
        self,
        *,
        organization_id: uuid.UUID,
        ticket_id: uuid.UUID,
        include_internal: bool,
    ) -> list[tuple[TicketComment, str, str | None, str | None]]:
        """Return bounded comments with author display fields in one projection."""
        statement = (
            select(TicketComment, User.email, User.first_name, User.last_name)
            .join(User, TicketComment.author_id == User.id)
            .join(SupportTicket, TicketComment.ticket_id == SupportTicket.id)
            .where(
                TicketComment.ticket_id == ticket_id,
                SupportTicket.organization_id == organization_id,
            )
            .order_by(TicketComment.created_at.asc(), TicketComment.id.asc())
            .limit(self.MAX_TICKETS)
        )
        if not include_internal:
            statement = statement.where(TicketComment.is_internal.is_(False))
        return list((await self.db.execute(statement)).all())
