"""Read-only, bounded query services for technology service requests."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.modules.events.models.event import Event
from app.modules.technology_services.models import (
    ServiceRequest, ServiceRequestItem, ServiceRequestComment,
    ServiceRequestEventSnapshot, ServiceRequestAttachment,
    VenueOpsServiceDefinition, VenueOpsFulfilmentHandoff,
)
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.commercial.models import CommercialQuote, CommercialQuoteRevision
from app.modules.crm.models.crm_domain_tables import Proposal
from app.modules.technology_services.recommendations import recommendations, event_facts
from app.core.cache import cache_service
from app.core.cache_keys import TenantCacheKey
from app.core.cache_policy import CacheTTL, ttl


class TechnologyServiceQueryService:
    """Keep service-request reads explicit and free of transaction ownership."""

    _columns = (
        ServiceRequest.id,
        ServiceRequest.organization_id,
        ServiceRequest.event_id,
        ServiceRequest.request_number,
        ServiceRequest.title,
        ServiceRequest.description,
        ServiceRequest.status,
        ServiceRequest.priority,
        ServiceRequest.request_type,
        ServiceRequest.requested_by,
        ServiceRequest.version,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_event_for_scope(
        self,
        *,
        event_id: uuid.UUID,
        organization_id: uuid.UUID,
        is_platform_admin: bool = False,
    ) -> Event | None:
        """Load only event scope data needed by the route authorization check and venue ops."""
        statement = (
            select(Event)
            .options(
                load_only(
                    Event.id,
                    Event.organization_id,
                    Event.name,
                    Event.venue_name,
                    Event.start_date,
                    Event.end_date,
                    Event.event_mode,
                    Event.feature_toggles,
                )
            )
            .where(Event.id == event_id, Event.deleted_at.is_(None))
        )
        if not is_platform_admin:
            statement = statement.where(Event.organization_id == organization_id)
        else:
            # The router has already required a platform-admin principal. The
            # explicit branch is needed so the general request tenant hook
            # does not hide a deliberately selected cross-tenant admin scope.
            statement = statement.execution_options(skip_tenant_filter=True)
        return await self.db.scalar(statement)

    async def get(self, *, request_id: uuid.UUID, organization_id: uuid.UUID) -> ServiceRequest | None:
        return await self.db.scalar(
            select(ServiceRequest)
            .options(load_only(*self._columns, ServiceRequest.event_snapshot, ServiceRequest.planning_overrides, ServiceRequest.submitted_at, ServiceRequest.submitted_by, ServiceRequest.owner_user_id), selectinload(ServiceRequest.items))
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.organization_id == organization_id,
            )
        )

    async def venue_ops_overview(self, *, event_id: uuid.UUID, organization_id: uuid.UUID) -> dict[str, Any]:
        event = await self.get_event_for_scope(event_id=event_id, organization_id=organization_id)
        if event is None:
            return {}
        request = await self.db.scalar(select(ServiceRequest).where(ServiceRequest.event_id == event_id, ServiceRequest.organization_id == organization_id).order_by(ServiceRequest.id.desc()).limit(1))
        result = await recommendations(self.db, event, request.planning_overrides if request else {})
        start_date_str = event.start_date.isoformat() if getattr(event, "start_date", None) else ""
        end_date_str = event.end_date.isoformat() if getattr(event, "end_date", None) else ""
        return {
            "event": {
                "id": str(event.id),
                "name": getattr(event, "name", "") or "",
                "venue_name": getattr(event, "venue_name", "") or "",
                "start_date": start_date_str,
                "end_date": end_date_str,
            },
            "facts": result["facts"],
            "recommendations": result["recommendations"],
            "request": self._request_out(request) if request else None,
        }

    async def venue_ops_recommendations(self, *, event_id: uuid.UUID, organization_id: uuid.UUID, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        event = await self.get_event_for_scope(event_id=event_id, organization_id=organization_id)
        if event is None: return {}
        if overrides:
            return await recommendations(self.db, event, overrides)
        key = TenantCacheKey.event(event_id, "venue-ops-recommendations", organization_id=organization_id)
        return await cache_service.get_or_set(
            key,
            lambda: recommendations(self.db, event, None),
            ttl(CacheTTL.DASHBOARD),
        )

    async def venue_ops_service_definitions(self, *, limit: int = 200) -> list[dict[str, Any]]:
        """Return the published service catalogue as a bounded projection."""
        bounded_limit = max(1, min(limit, 500))
        rows = (
            await self.db.execute(
                select(
                    VenueOpsServiceDefinition.id,
                    VenueOpsServiceDefinition.code,
                    VenueOpsServiceDefinition.name,
                    VenueOpsServiceDefinition.category,
                    VenueOpsServiceDefinition.description,
                    VenueOpsServiceDefinition.unit_type,
                    VenueOpsServiceDefinition.dependencies,
                    VenueOpsServiceDefinition.template_refs,
                    VenueOpsServiceDefinition.version,
                )
                .where(VenueOpsServiceDefinition.is_published.is_(True))
                .order_by(
                    VenueOpsServiceDefinition.category.asc(),
                    VenueOpsServiceDefinition.name.asc(),
                    VenueOpsServiceDefinition.id.asc(),
                )
                .limit(bounded_limit)
            )
        ).mappings().all()
        return [dict(row) for row in rows]

    async def venue_ops_quotes(
        self, *, event_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Return quotes, proposal state, and proposal documents in batched reads."""
        bounded_limit = max(1, min(limit, 200))
        quotes = list(
            (
                await self.db.scalars(
                    select(CommercialQuote)
                    .options(
                        load_only(
                            CommercialQuote.id,
                            CommercialQuote.quote_number,
                            CommercialQuote.title,
                            CommercialQuote.status,
                            CommercialQuote.currency,
                            CommercialQuote.total_amount,
                            CommercialQuote.version,
                            CommercialQuote.valid_until,
                        )
                    )
                    .where(
                        CommercialQuote.event_id == event_id,
                        CommercialQuote.organization_id == organization_id,
                        CommercialQuote.service_request_id.is_not(None),
                    )
                    .order_by(CommercialQuote.created_at.desc(), CommercialQuote.id.desc())
                    .limit(bounded_limit)
                )
            ).all()
        )
        if not quotes:
            return []

        quote_ids = [quote.id for quote in quotes]
        proposals = list(
            (
                await self.db.scalars(
                    select(Proposal)
                    .options(
                        load_only(
                            Proposal.id,
                            Proposal.quote_id,
                            Proposal.proposal_number,
                            Proposal.status,
                            Proposal.current_version,
                        )
                    )
                    .where(
                        Proposal.quote_id.in_(quote_ids),
                        Proposal.organization_id == organization_id,
                    )
                )
            ).all()
        )
        proposal_by_quote = {proposal.quote_id: proposal for proposal in proposals}
        proposal_ids = [proposal.id for proposal in proposals]
        exports = []
        if proposal_ids:
            exports = list(
                (
                    await self.db.scalars(
                        select(DataExport)
                        .options(
                            load_only(
                                DataExport.id,
                                DataExport.source_id,
                                DataExport.source_version,
                                DataExport.status,
                                DataExport.file_format,
                                DataExport.created_at,
                                DataExport.completed_at,
                                DataExport.expires_at,
                                DataExport.failure_reason,
                            )
                        )
                        .where(
                            DataExport.organization_id == organization_id,
                            DataExport.source_type == "proposal",
                            DataExport.source_id.in_(proposal_ids),
                            DataExport.export_type == "proposal_pdf",
                        )
                        .order_by(DataExport.created_at.desc(), DataExport.id.desc())
                        .limit(min(len(proposal_ids) * 20, 500))
                    )
                ).all()
            )
        exports_by_proposal: dict[uuid.UUID, list[dict[str, Any]]] = {}
        for item in exports:
            exports_by_proposal.setdefault(item.source_id, []).append(
                {
                    "export_id": str(item.id),
                    "proposal_version": item.source_version,
                    "status": item.status,
                    "file_format": item.file_format,
                    "created_at": item.created_at,
                    "completed_at": item.completed_at,
                    "expires_at": item.expires_at,
                    "failure_reason": item.failure_reason,
                }
            )

        result = []
        for quote in quotes:
            proposal = proposal_by_quote.get(quote.id)
            result.append(
                {
                    "id": str(quote.id),
                    "quote_number": quote.quote_number,
                    "title": quote.title,
                    "status": quote.status,
                    "currency": quote.currency,
                    "total_amount": quote.total_amount,
                    "version": quote.version,
                    "valid_until": quote.valid_until.isoformat() if quote.valid_until else None,
                    "proposal": (
                        {
                            "id": str(proposal.id),
                            "proposal_number": proposal.proposal_number,
                            "status": proposal.status,
                            "current_version": proposal.current_version,
                        }
                        if proposal
                        else None
                    ),
                    "documents": exports_by_proposal.get(proposal.id, []) if proposal else [],
                }
            )
        return result

    async def venue_ops_fulfilment(
        self, *, event_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 200
    ) -> list[dict[str, Any]]:
        """Return tenant/event-scoped fulfilment handoffs with stable ordering."""
        bounded_limit = max(1, min(limit, 500))
        rows = (
            await self.db.execute(
                select(
                    VenueOpsFulfilmentHandoff.id,
                    VenueOpsFulfilmentHandoff.request_id,
                    VenueOpsFulfilmentHandoff.quote_id,
                    VenueOpsFulfilmentHandoff.status,
                    VenueOpsFulfilmentHandoff.approved_version,
                    VenueOpsFulfilmentHandoff.locked_scope,
                    VenueOpsFulfilmentHandoff.created_at,
                )
                .where(
                    VenueOpsFulfilmentHandoff.event_id == event_id,
                    VenueOpsFulfilmentHandoff.organization_id == organization_id,
                )
                .order_by(
                    VenueOpsFulfilmentHandoff.created_at.desc(),
                    VenueOpsFulfilmentHandoff.id.desc(),
                )
                .limit(bounded_limit)
            )
        ).mappings().all()
        return [
            {
                **dict(row),
                "id": str(row["id"]),
                "request_id": str(row["request_id"]),
                "quote_id": str(row["quote_id"]),
                "created_at": row["created_at"].isoformat(),
            }
            for row in rows
        ]

    @staticmethod
    def _request_out(row: ServiceRequest | None) -> dict[str, Any] | None:
        if row is None: return None
        return {"id": str(row.id), "request_number": row.request_number, "title": row.title, "description": row.description, "status": row.status, "priority": row.priority, "request_type": row.request_type, "version": row.version, "event_snapshot": row.event_snapshot, "planning_overrides": row.planning_overrides, "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None, "items": [{"id": str(item.id), "description": item.description, "quantity": item.quantity, "service_definition_id": str(item.service_definition_id) if item.service_definition_id else None, "template_type": item.template_type, "template_id": str(item.template_id) if item.template_id else None, "template_version": item.template_version, "source": item.source, "duration_days": item.duration_days, "room_scope": item.room_scope, "configuration": item.configuration, "notes": item.notes, "included_scope": item.included_scope, "excluded_scope": item.excluded_scope} for item in getattr(row, "items", [])]}

    async def request_detail(self, *, request_id: uuid.UUID, organization_id: uuid.UUID) -> dict[str, Any] | None:
        row = await self.get(request_id=request_id, organization_id=organization_id)
        return self._request_out(row)

    async def request_timeline(self, *, request_id: uuid.UUID, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        row = await self.db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == organization_id))
        if row is None: return []
        comments = list((await self.db.scalars(select(ServiceRequestComment).where(ServiceRequestComment.request_id == request_id).order_by(ServiceRequestComment.created_at))).all())
        audit_rows = list((await self.db.scalars(select(AuditLog).where(
            AuditLog.organization_id == organization_id,
            AuditLog.resource_id == request_id,
            AuditLog.resource_type.in_(("service_request", "venue_ops_service_request")),
        ).order_by(AuditLog.occurred_at))).all())
        quote_rows = list((await self.db.scalars(select(CommercialQuote).where(
            CommercialQuote.organization_id == organization_id,
            CommercialQuote.service_request_id == request_id,
        ))).all())
        entries: list[dict[str, Any]] = [
            {"type": "comment", "id": str(comment.id), "body": comment.body, "author_type": comment.author_type, "action": "Clarification added", "created_at": comment.created_at.isoformat()}
            for comment in comments
        ]
        entries.extend({
            "type": "audit", "id": str(item.id), "action": item.action_type, "status": (item.new_state or {}).get("status"),
            "actor_type": item.actor_role, "created_at": item.occurred_at.isoformat() if item.occurred_at else None,
        } for item in audit_rows)
        for quote in quote_rows:
            revisions = list((await self.db.scalars(select(CommercialQuoteRevision).where(
                CommercialQuoteRevision.quote_id == quote.id,
                CommercialQuoteRevision.organization_id == organization_id,
            ).order_by(CommercialQuoteRevision.created_at))).all())
            entries.extend({
                "type": "quote", "id": str(revision.id), "quote_id": str(quote.id),
                "action": f"Quote version {revision.version} recorded", "reason": revision.reason,
                "created_at": revision.created_at.isoformat() if revision.created_at else None,
            } for revision in revisions)
        entries.sort(key=lambda item: item.get("created_at") or "")
        return entries

    async def request_snapshots(self, *, request_id: uuid.UUID, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        row = await self.db.scalar(select(ServiceRequest.id).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == organization_id))
        if row is None:
            return []
        snapshots = list((await self.db.scalars(select(ServiceRequestEventSnapshot).where(
            ServiceRequestEventSnapshot.request_id == request_id,
        ).order_by(ServiceRequestEventSnapshot.run_number))).all())
        return [{"id": str(item.id), "request_id": str(item.request_id), "event_id": str(item.event_id), "run_number": item.run_number, "facts": item.facts, "overrides": item.overrides, "created_at": item.created_at.isoformat()} for item in snapshots]

    async def request_attachments(self, *, request_id: uuid.UUID, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        row = await self.db.scalar(select(ServiceRequest.id).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == organization_id))
        if row is None:
            return []
        items = list((await self.db.scalars(select(ServiceRequestAttachment).where(ServiceRequestAttachment.request_id == request_id).order_by(ServiceRequestAttachment.created_at))).all())
        return [{"id": str(item.id), "file_name": item.file_name, "content_type": item.content_type, "size_bytes": item.size_bytes, "created_at": item.created_at.isoformat()} for item in items]

    async def list(self, *, event_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 100) -> list[ServiceRequest]:
        bounded_limit = max(1, min(limit, 200))
        result = await self.db.scalars(
            select(ServiceRequest)
            .options(load_only(*self._columns, ServiceRequest.event_snapshot, ServiceRequest.planning_overrides, ServiceRequest.submitted_at), selectinload(ServiceRequest.items))
            .where(
                ServiceRequest.event_id == event_id,
                ServiceRequest.organization_id == organization_id,
            )
            .order_by(ServiceRequest.id.desc())
            .limit(bounded_limit)
        )
        return list(result.all())

    async def kpis(self, *, event_id: uuid.UUID, organization_id: uuid.UUID) -> dict[str, Any]:
        rows = (
            await self.db.execute(
                select(ServiceRequest.status, func.count(ServiceRequest.id))
                .where(
                    ServiceRequest.event_id == event_id,
                    ServiceRequest.organization_id == organization_id,
                )
                .group_by(ServiceRequest.status)
            )
        ).all()
        counts = {str(status): int(count) for status, count in rows}
        return {
            "total": sum(counts.values()),
            "open": sum(v for k, v in counts.items() if k not in {"COMPLETED", "CANCELLED"}),
            "status_counts": counts,
        }

    async def kanban(self, *, event_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[ServiceRequest]:
        bounded_limit = max(1, min(limit, 200))
        bounded_offset = max(0, offset)
        result = await self.db.scalars(
            select(ServiceRequest)
            .options(load_only(*self._columns))
            .where(
                ServiceRequest.event_id == event_id,
                ServiceRequest.organization_id == organization_id,
            )
            .order_by(ServiceRequest.id.desc())
            .offset(bounded_offset)
            .limit(bounded_limit)
        )
        return list(result.all())
