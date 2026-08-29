from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.tenant_context import TenantContextGuard
from app.dependencies import OrganizerOrAbove, StepUpAuth, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.commercial.models import (
    CommercialQuote,
    CommercialQuoteRevision,
    QuoteApprovalStep,
    QuoteApprovalWorkflow,
)
from app.modules.commercial.quote_schemas import (
    QuoteCreate,
    QuoteApprovalDecision,
    QuoteApprovalSubmit,
    QuoteApprovalWorkflowOut,
    ProposalConvert,
    ProposalDocumentOut,
    ProposalDocumentRequest,
    ProposalOut,
    ProposalShareAccessOut,
    ProposalShareCreate,
    ProposalShareCreated,
    ProposalShareOut,
    ProposalShareRevoke,
    ProposalVersionOut,
    PublicProposalDecision,
    PublicProposalDecisionOut,
    PublicProposalOut,
    QuoteOut,
    QuotePricingInput,
    QuoteRevisionOut,
    QuoteTotalsOut,
    QuoteUpdate,
)
from app.modules.commercial.quote_service import (
    add_revision,
    apply_quote_payload,
    calculate_quote,
    load_quote,
    new_quote_number,
    request_fingerprint,
    quote_snapshot,
    validity_deadline,
)
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.platform.permissions.service import PermissionService
from app.modules.crm.models.crm_domain_tables import Proposal, ProposalShare, ProposalShareAccess, ProposalVersion
from app.modules.presentations.services.upload_service import create_presigned_download
from app.config import settings
from app.worker import celery_app


router = APIRouter(prefix="/service-requests", tags=["commercial-quotes"])
public_router = APIRouter(prefix="/public/proposals", tags=["public-proposals"])

PROPOSAL_SHARE_ISSUER = "Event-os"
PROPOSAL_SHARE_AUDIENCE = "proposal-client"


def _has_platform_scope(user) -> bool:
    return bool(
        user.role == "super_admin"
        or getattr(user, "platform_role", None) == "SUPER_ADMIN"
        or getattr(user, "is_platform_admin", False)
    )


def _target_org(user, requested: uuid.UUID | None) -> uuid.UUID:
    if _has_platform_scope(user):
        return requested or user.organization_id
    if requested and requested != user.organization_id:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return user.organization_id


async def _validate_scope(
    db: AsyncSession,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    service_request_id: uuid.UUID | None,
) -> None:
    event = await db.scalar(select(Event.id).where(
        Event.id == event_id,
        Event.organization_id == organization_id,
        Event.deleted_at.is_(None),
    ))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if service_request_id:
        # ServiceRequest validation removed since technology_services module is deleted
        pass


def _audit(
    quote: CommercialQuote,
    user,
    action: str,
    old_state: dict | None = None,
    reason: str | None = None,
) -> AuditLog:
    return AuditLog(
        organization_id=quote.organization_id,
        actor_user_id=user.id,
        resource_type="commercial_quote",
        resource_id=quote.id,
        action_type=action,
        actor_role=getattr(user, "platform_role", None) or user.role,
        old_state=old_state,
        change_diff={"reason": reason} if reason else None,
        new_state={
            "quote_number": quote.quote_number,
            "version": quote.version,
            "status": quote.status,
            "total_amount": str(quote.total_amount),
            "currency": quote.currency,
        },
    )


async def _load_approval(
    db: AsyncSession,
    quote_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> QuoteApprovalWorkflow | None:
    query = (
        select(QuoteApprovalWorkflow)
        .options(selectinload(QuoteApprovalWorkflow.steps))
        .where(
            QuoteApprovalWorkflow.quote_id == quote_id,
            QuoteApprovalWorkflow.organization_id == organization_id,
        )
    )
    if for_update:
        query = query.with_for_update()
    return await db.scalar(query)


def _approval_audit(
    quote: CommercialQuote,
    workflow: QuoteApprovalWorkflow,
    user,
    action: str,
    reason: str,
) -> AuditLog:
    return AuditLog(
        organization_id=quote.organization_id,
        actor_user_id=user.id,
        resource_type="quote_approval",
        resource_id=workflow.id,
        action_type=action,
        actor_role=getattr(user, "platform_role", None) or user.role,
        new_state={
            "quote_id": str(quote.id),
            "quote_version": workflow.quote_version,
            "workflow_version": workflow.workflow_version,
            "workflow_status": workflow.status,
            "quote_status": quote.status,
        },
        change_diff={"reason": reason},
        is_sensitive=True,
    )


def _proposal_snapshot(quote: CommercialQuote) -> dict:
    snapshot = quote_snapshot(quote)
    snapshot.pop("internal_notes", None)
    return snapshot


async def _load_proposal(
    db: AsyncSession,
    proposal_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Proposal | None:
    query = (
        select(Proposal)
        .options(selectinload(Proposal.versions))
        .where(Proposal.id == proposal_id, Proposal.organization_id == organization_id)
    )
    if for_update:
        query = query.with_for_update()
    return await db.scalar(query)


def _proposal_number() -> str:
    return f"PRP-{datetime.now(timezone.utc):%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def _proposal_share_secret() -> str:
    return settings.PROPOSAL_SHARE_SECRET or settings.JWT_SECRET_KEY


def _encode_proposal_share(share: ProposalShare) -> str:
    return jwt.encode(
        {
            "sub": str(share.id),
            "org": str(share.organization_id),
            "proposal": str(share.proposal_id),
            "version": share.proposal_version,
            "type": "proposal_share",
            "iss": PROPOSAL_SHARE_ISSUER,
            "aud": PROPOSAL_SHARE_AUDIENCE,
            "iat": int(share.created_at.timestamp()),
            "exp": int(share.expires_at.timestamp()),
            "jti": str(share.id),
        },
        _proposal_share_secret(),
        algorithm=settings.JWT_ALGORITHM,
    )


def _decode_proposal_share(token: str) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, int]:
    try:
        claims = jwt.decode(
            token,
            _proposal_share_secret(),
            algorithms=[settings.JWT_ALGORITHM],
            audience=PROPOSAL_SHARE_AUDIENCE,
            issuer=PROPOSAL_SHARE_ISSUER,
        )
        if claims.get("type") != "proposal_share":
            raise ValueError("wrong token type")
        return (
            uuid.UUID(claims["org"]),
            uuid.UUID(claims["proposal"]),
            uuid.UUID(claims["sub"]),
            int(claims["version"]),
        )
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Proposal share not found.")


def _proposal_share_bearer(authorization: str) -> str:
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme != "ProposalShare" or not token:
        raise HTTPException(status_code=401, detail="Proposal share authorization required.")
    return token


def _share_status(share: ProposalShare) -> str:
    if share.status == "ACTIVE" and share.expires_at <= datetime.now(timezone.utc):
        return "EXPIRED"
    return share.status


def _share_payload(share: ProposalShare) -> dict:
    return {
        "id": share.id,
        "proposal_id": share.proposal_id,
        "proposal_version": share.proposal_version,
        "recipient_name": share.recipient_name,
        "recipient_email": share.recipient_email,
        "status": _share_status(share),
        "expires_at": share.expires_at,
        "created_by": share.created_by,
        "created_at": share.created_at,
        "last_accessed_at": share.last_accessed_at,
        "access_count": share.access_count,
        "decision": share.decision,
        "decision_reason": share.decision_reason,
        "signer_name": share.signer_name,
        "signer_title": share.signer_title,
        "decided_at": share.decided_at,
        "revoked_at": share.revoked_at,
        "revocation_reason": share.revocation_reason,
    }


def _request_evidence(request: Request) -> tuple[str | None, str | None]:
    return (
        request.client.host if request.client else None,
        request.headers.get("User-Agent", "")[:1000] or None,
    )


@router.post("/quotes/calculate", response_model=QuoteTotalsOut)
async def calculate_quote_totals(
    payload: QuotePricingInput,
    current_user: OrganizerOrAbove,
) -> dict:
    return calculate_quote(payload)


@router.get("/all-quotes", response_model=list[QuoteOut])
async def list_quotes(
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    event_id: uuid.UUID | None = Query(default=None),
    request_id: uuid.UUID | None = Query(default=None),
    quote_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
) -> list[CommercialQuote]:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        query = (
            select(CommercialQuote)
            .options(selectinload(CommercialQuote.line_items))
            .where(CommercialQuote.organization_id == target_org)
            .order_by(CommercialQuote.created_at.desc())
            .limit(limit)
        )
        if event_id:
            query = query.where(CommercialQuote.event_id == event_id)
        if request_id:
            query = query.where(CommercialQuote.service_request_id == request_id)
        if quote_status:
            query = query.where(CommercialQuote.status == quote_status.upper())
        return list((await db.scalars(query)).unique().all())


@router.post("/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
async def create_quote(
    payload: QuoteCreate,
    current_user: OrganizerOrAbove,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CommercialQuote:
    target_org = _target_org(current_user, payload.organization_id)
    fingerprint = request_fingerprint(payload.model_dump(mode="json"))
    async with TenantContextGuard.scoped(db, target_org):
        # Serialize idempotency allocation within a tenant; correctness does not rely on a pre-check race.
        await db.scalar(select(Organization.id).where(Organization.id == target_org).with_for_update())
        existing = await db.scalar(
            select(CommercialQuote)
            .options(selectinload(CommercialQuote.line_items))
            .where(
                CommercialQuote.organization_id == target_org,
                CommercialQuote.idempotency_key == idempotency_key,
            )
        )
        if existing:
            if existing.request_hash != fingerprint:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
            return existing

        await _validate_scope(db, target_org, payload.event_id, payload.service_request_id)
        quote = CommercialQuote(
            organization_id=target_org,
            event_id=payload.event_id,
            service_request_id=payload.service_request_id,
            quote_number=new_quote_number(),
            title=payload.title,
            status="DRAFT",
            currency=payload.currency,
            validity_days=payload.validity_days,
            valid_until=validity_deadline(payload.validity_days),
            internal_notes=payload.internal_notes,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            created_by=current_user.id,
        )
        apply_quote_payload(quote, payload)
        db.add(quote)
        await db.flush()
        add_revision(db, quote, current_user.id, "Initial quote creation")
        db.add(_audit(quote, current_user, "QUOTE_CREATED"))
        await db.commit()
        return await load_quote(db, quote.id, target_org)


@router.get("/quotes/{quote_id}", response_model=QuoteOut)
async def get_quote(
    quote_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> CommercialQuote:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        quote = await load_quote(db, quote_id, target_org)
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found.")
        return quote


@router.patch("/quotes/{quote_id}", response_model=QuoteOut)
async def update_quote(
    quote_id: uuid.UUID,
    payload: QuoteUpdate,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> CommercialQuote:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        quote = await load_quote(db, quote_id, target_org, for_update=True)
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found.")
        if quote.status != "DRAFT":
            raise HTTPException(status_code=409, detail="Only draft quotes can be edited.")
        if quote.version != payload.expected_version:
            raise HTTPException(status_code=409, detail="QUOTE_VERSION_CONFLICT")

        old_state = {"version": quote.version, "total_amount": str(quote.total_amount)}
        quote.title = payload.title
        quote.currency = payload.currency
        quote.validity_days = payload.validity_days
        quote.valid_until = validity_deadline(payload.validity_days)
        quote.internal_notes = payload.internal_notes
        quote.version += 1
        quote.updated_at = datetime.now(timezone.utc)
        apply_quote_payload(quote, payload)
        await db.flush()
        add_revision(db, quote, current_user.id, payload.reason)
        db.add(_audit(quote, current_user, "QUOTE_UPDATED", old_state, payload.reason))
        await db.commit()
        return await load_quote(db, quote.id, target_org)


@router.get("/quotes/{quote_id}/revisions", response_model=list[QuoteRevisionOut])
async def list_quote_revisions(
    quote_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[CommercialQuoteRevision]:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        quote = await load_quote(db, quote_id, target_org)
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found.")
        return list((await db.scalars(
            select(CommercialQuoteRevision)
            .where(
                CommercialQuoteRevision.quote_id == quote_id,
                CommercialQuoteRevision.organization_id == target_org,
            )
            .order_by(CommercialQuoteRevision.version.desc())
        )).all())


@router.get("/quotes/{quote_id}/approval", response_model=QuoteApprovalWorkflowOut | None)
async def get_quote_approval(
    quote_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> QuoteApprovalWorkflow | None:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        quote = await load_quote(db, quote_id, target_org)
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found.")
        return await _load_approval(db, quote_id, target_org)


@router.post("/quotes/{quote_id}/approval/submit", response_model=QuoteApprovalWorkflowOut)
async def submit_quote_for_approval(
    quote_id: uuid.UUID,
    payload: QuoteApprovalSubmit,
    current_user: OrganizerOrAbove,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> QuoteApprovalWorkflow:
    target_org = _target_org(current_user, organization_id)
    fingerprint = request_fingerprint({"quote_id": str(quote_id), **payload.model_dump(mode="json")})
    async with TenantContextGuard.scoped(db, target_org):
        await db.scalar(select(Organization.id).where(Organization.id == target_org).with_for_update())
        idempotent = await db.scalar(
            select(QuoteApprovalWorkflow)
            .options(selectinload(QuoteApprovalWorkflow.steps))
            .where(
                QuoteApprovalWorkflow.organization_id == target_org,
                QuoteApprovalWorkflow.submission_idempotency_key == idempotency_key,
            )
        )
        if idempotent:
            if idempotent.submission_request_hash != fingerprint:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
            return idempotent

        quote = await load_quote(db, quote_id, target_org, for_update=True)
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found.")
        if quote.version != payload.expected_quote_version:
            raise HTTPException(status_code=409, detail="QUOTE_VERSION_CONFLICT")
        if quote.status != "DRAFT":
            raise HTTPException(status_code=409, detail="Quote is not eligible for submission.")
        if await _load_approval(db, quote_id, target_org):
            raise HTTPException(status_code=409, detail="QUOTE_APPROVAL_ALREADY_EXISTS")

        if payload.assigned_user_id:
            assignee = await db.get(User, payload.assigned_user_id)
            if not assignee or not assignee.is_active:
                raise HTTPException(status_code=404, detail="Approver not found.")
            if assignee.organization_id != target_org and not _has_platform_scope(assignee):
                raise HTTPException(status_code=404, detail="Approver not found.")

        workflow = QuoteApprovalWorkflow(
            organization_id=target_org,
            quote_id=quote.id,
            quote_version=quote.version,
            status="PENDING",
            workflow_version=1,
            submission_reason=payload.reason,
            submission_idempotency_key=idempotency_key,
            submission_request_hash=fingerprint,
            submitted_by=current_user.id,
        )
        workflow.steps = [QuoteApprovalStep(
            organization_id=target_org,
            step_order=1,
            name="Commercial approval",
            assigned_user_id=payload.assigned_user_id,
            required_permission="quotes.approve",
            status="PENDING",
        )]
        quote.status = "PENDING_APPROVAL"
        quote.updated_at = datetime.now(timezone.utc)
        db.add(workflow)
        await db.flush()
        db.add(_approval_audit(quote, workflow, current_user, "QUOTE_APPROVAL_SUBMITTED", payload.reason))
        await db.commit()
        return await _load_approval(db, quote_id, target_org)


@router.post("/quotes/{quote_id}/approval/steps/{step_id}/action", response_model=QuoteApprovalWorkflowOut)
async def decide_quote_approval_step(
    quote_id: uuid.UUID,
    step_id: uuid.UUID,
    payload: QuoteApprovalDecision,
    current_user: OrganizerOrAbove,
    step_up: StepUpAuth,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> QuoteApprovalWorkflow:
    del step_up  # Dependency enforces recent MFA assurance before domain mutation.
    target_org = _target_org(current_user, organization_id)
    fingerprint = request_fingerprint({
        "quote_id": str(quote_id),
        "step_id": str(step_id),
        **payload.model_dump(mode="json"),
    })
    async with TenantContextGuard.scoped(db, target_org):
        workflow = await _load_approval(db, quote_id, target_org, for_update=True)
        quote = await load_quote(db, quote_id, target_org, for_update=True)
        if not workflow or not quote:
            raise HTTPException(status_code=404, detail="Approval workflow not found.")
        step = await db.scalar(select(QuoteApprovalStep).where(
            QuoteApprovalStep.id == step_id,
            QuoteApprovalStep.workflow_id == workflow.id,
            QuoteApprovalStep.organization_id == target_org,
        ).with_for_update())
        if not step:
            raise HTTPException(status_code=404, detail="Approval step not found.")

        if step.decision_idempotency_key:
            if step.decision_idempotency_key == idempotency_key and step.decision_request_hash == fingerprint:
                return workflow
            raise HTTPException(status_code=409, detail="APPROVAL_STEP_ALREADY_DECIDED")
        if workflow.workflow_version != payload.expected_workflow_version:
            raise HTTPException(status_code=409, detail="APPROVAL_VERSION_CONFLICT")
        if workflow.status != "PENDING" or step.status != "PENDING":
            raise HTTPException(status_code=409, detail="APPROVAL_STEP_ALREADY_DECIDED")
        if workflow.quote_version != quote.version or quote.status != "PENDING_APPROVAL":
            raise HTTPException(status_code=409, detail="QUOTE_APPROVAL_VERSION_MISMATCH")

        is_platform_approver = _has_platform_scope(current_user)
        if step.assigned_user_id and step.assigned_user_id != current_user.id and not is_platform_approver:
            raise HTTPException(status_code=403, detail="Approval step is assigned to another user.")
        if not is_platform_approver:
            allowed = await PermissionService(db).check_user_permission(
                current_user.id,
                target_org,
                step.required_permission,
            )
            if not allowed:
                raise HTTPException(status_code=403, detail="Permission denied.")

        now = datetime.now(timezone.utc)
        step.status = "APPROVED" if payload.action == "APPROVE" else "REJECTED"
        step.decided_by = current_user.id
        step.decision_reason = payload.reason
        step.decided_at = now
        step.decision_idempotency_key = idempotency_key
        step.decision_request_hash = fingerprint
        workflow.status = step.status
        workflow.workflow_version += 1
        workflow.completed_at = now
        quote.status = "APPROVED" if payload.action == "APPROVE" else "REJECTED"
        quote.updated_at = now
        db.add(_approval_audit(
            quote,
            workflow,
            current_user,
            "QUOTE_APPROVED" if payload.action == "APPROVE" else "QUOTE_REJECTED",
            payload.reason,
        ))
        await db.commit()
        return await _load_approval(db, quote_id, target_org)


@router.post("/quotes/{quote_id}/proposal", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
async def convert_quote_to_proposal(
    quote_id: uuid.UUID,
    payload: ProposalConvert,
    current_user: OrganizerOrAbove,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> Proposal:
    target_org = _target_org(current_user, organization_id)
    fingerprint = request_fingerprint({"quote_id": str(quote_id), **payload.model_dump(mode="json")})
    async with TenantContextGuard.scoped(db, target_org):
        await db.scalar(select(Organization.id).where(Organization.id == target_org).with_for_update())
        existing = await db.scalar(
            select(Proposal)
            .options(selectinload(Proposal.versions))
            .where(Proposal.organization_id == target_org, Proposal.idempotency_key == idempotency_key)
        )
        if existing:
            if existing.request_hash != fingerprint:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
            return existing

        quote = await load_quote(db, quote_id, target_org, for_update=True)
        approval = await _load_approval(db, quote_id, target_org, for_update=True)
        if not quote or not approval:
            raise HTTPException(status_code=404, detail="Approved quote not found.")
        if quote.version != payload.expected_quote_version:
            raise HTTPException(status_code=409, detail="QUOTE_VERSION_CONFLICT")
        if quote.status != "APPROVED" or approval.status != "APPROVED" or approval.quote_version != quote.version:
            raise HTTPException(status_code=409, detail="QUOTE_NOT_APPROVED")
        prior = await db.scalar(select(Proposal).options(selectinload(Proposal.versions)).where(
            Proposal.organization_id == target_org,
            Proposal.quote_id == quote.id,
        ))
        if prior:
            raise HTTPException(status_code=409, detail="PROPOSAL_ALREADY_EXISTS")

        proposal = Proposal(
            organization_id=target_org,
            event_id=quote.event_id,
            quote_id=quote.id,
            proposal_number=_proposal_number(),
            title=quote.title,
            status="DRAFT",
            current_version=1,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            created_by=current_user.id,
        )
        proposal.versions = [ProposalVersion(
            organization_id=target_org,
            version=1,
            source_quote_id=quote.id,
            source_quote_version=quote.version,
            snapshot_json=_proposal_snapshot(quote),
            reason=payload.reason,
            created_by=current_user.id,
        )]
        db.add(proposal)
        await db.flush()
        db.add(AuditLog(
            organization_id=target_org,
            actor_user_id=current_user.id,
            resource_type="proposal",
            resource_id=proposal.id,
            action_type="PROPOSAL_CREATED_FROM_QUOTE",
            actor_role=getattr(current_user, "platform_role", None) or current_user.role,
            new_state={
                "proposal_number": proposal.proposal_number,
                "quote_id": str(quote.id),
                "quote_version": quote.version,
                "proposal_version": 1,
            },
            change_diff={"reason": payload.reason},
        ))
        await db.commit()
        return await _load_proposal(db, proposal.id, target_org)


@router.get("/proposals/{proposal_id}", response_model=ProposalOut)
async def get_proposal(
    proposal_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> Proposal:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        proposal = await _load_proposal(db, proposal_id, target_org)
        if not proposal or not proposal.quote_id:
            raise HTTPException(status_code=404, detail="Proposal not found.")
        return proposal


@router.get("/proposals/{proposal_id}/version-history", response_model=list[ProposalVersionOut])
async def get_proposal_versions(
    proposal_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[ProposalVersion]:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        proposal = await _load_proposal(db, proposal_id, target_org)
        if not proposal or not proposal.quote_id:
            raise HTTPException(status_code=404, detail="Proposal not found.")
        return list(reversed(proposal.versions))


@router.post("/proposals/{proposal_id}/documents", response_model=ProposalDocumentOut, status_code=status.HTTP_202_ACCEPTED)
async def request_proposal_document(
    proposal_id: uuid.UUID,
    payload: ProposalDocumentRequest,
    current_user: OrganizerOrAbove,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target_org = _target_org(current_user, organization_id)
    fingerprint = request_fingerprint({"proposal_id": str(proposal_id), **payload.model_dump(mode="json")})
    async with TenantContextGuard.scoped(db, target_org):
        await db.scalar(select(Organization.id).where(Organization.id == target_org).with_for_update())
        existing = await db.scalar(select(DataExport).where(
            DataExport.organization_id == target_org,
            DataExport.export_type == "proposal_pdf",
            DataExport.idempotency_key == idempotency_key,
        ))
        if existing:
            if existing.request_hash != fingerprint:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
            return {
                "export_id": existing.id, "proposal_id": proposal_id,
                "proposal_version": existing.source_version, "status": existing.status,
                "file_format": existing.file_format, "created_at": existing.created_at,
                "completed_at": existing.completed_at, "expires_at": existing.expires_at,
                "failure_reason": existing.failure_reason,
            }

        proposal = await _load_proposal(db, proposal_id, target_org, for_update=True)
        if not proposal or not proposal.quote_id:
            raise HTTPException(status_code=404, detail="Proposal not found.")
        if proposal.current_version != payload.expected_version:
            raise HTTPException(status_code=409, detail="PROPOSAL_VERSION_CONFLICT")
        version = next((item for item in proposal.versions if item.version == proposal.current_version), None)
        if not version:
            raise HTTPException(status_code=409, detail="PROPOSAL_VERSION_MISSING")

        export = DataExport(
            organization_id=target_org,
            event_id=proposal.event_id,
            requested_by=current_user.id,
            status="QUEUED",
            export_type="proposal_pdf",
            file_format="pdf",
            source_type="proposal",
            source_id=proposal.id,
            source_version=version.version,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            request_metadata={
                "proposal_number": proposal.proposal_number,
                "version_id": str(version.id),
                "reason": payload.reason,
            },
        )
        db.add(export)
        await db.flush()
        db.add(AuditLog(
            organization_id=target_org,
            actor_user_id=current_user.id,
            resource_type="data_export",
            resource_id=export.id,
            action_type="PROPOSAL_PDF_REQUESTED",
            actor_role=getattr(current_user, "platform_role", None) or current_user.role,
            new_state={"proposal_id": str(proposal.id), "proposal_version": version.version, "status": "QUEUED"},
            change_diff={"reason": payload.reason},
        ))
        await db.commit()
        try:
            celery_app.send_task(
                "workers.tasks.report_tasks.generate_quote_proposal_pdf",
                kwargs={
                    "organization_id": str(target_org),
                    "proposal_id": str(proposal.id),
                    "proposal_version_id": str(version.id),
                    "requested_by_user_id": str(current_user.id),
                    "export_id": str(export.id),
                },
            )
        except Exception:
            export.status = "FAILED"
            export.failure_reason = "Document worker dispatch failed."
            db.add(AuditLog(
                organization_id=target_org,
                actor_user_id=current_user.id,
                resource_type="data_export",
                resource_id=export.id,
                action_type="PROPOSAL_PDF_DISPATCH_FAILED",
                actor_role=getattr(current_user, "platform_role", None) or current_user.role,
                new_state={"proposal_id": str(proposal.id), "status": "FAILED"},
                is_sensitive=True,
            ))
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "DOCUMENT_DISPATCH_FAILED", "export_id": str(export.id)},
            )
        return {
            "export_id": export.id, "proposal_id": proposal.id,
            "proposal_version": version.version, "status": export.status,
            "file_format": export.file_format, "created_at": export.created_at,
            "completed_at": None, "expires_at": None, "failure_reason": None,
        }


@router.get("/proposals/{proposal_id}/documents", response_model=list[ProposalDocumentOut])
async def list_proposal_documents(
    proposal_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        proposal = await _load_proposal(db, proposal_id, target_org)
        if not proposal or not proposal.quote_id:
            raise HTTPException(status_code=404, detail="Proposal not found.")
        exports = list((await db.scalars(
            select(DataExport).where(
                DataExport.organization_id == target_org,
                DataExport.source_type == "proposal",
                DataExport.source_id == proposal_id,
                DataExport.export_type == "proposal_pdf",
            ).order_by(DataExport.created_at.desc()).limit(20)
        )).all())
        return [{
            "export_id": item.id, "proposal_id": proposal_id,
            "proposal_version": item.source_version, "status": item.status,
            "file_format": item.file_format, "created_at": item.created_at,
            "completed_at": item.completed_at, "expires_at": item.expires_at,
            "failure_reason": item.failure_reason,
        } for item in exports]


@router.get("/proposals/{proposal_id}/documents/{export_id}", response_model=ProposalDocumentOut)
async def get_proposal_document(
    proposal_id: uuid.UUID,
    export_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        export = await db.scalar(select(DataExport).where(
            DataExport.id == export_id,
            DataExport.organization_id == target_org,
            DataExport.source_type == "proposal",
            DataExport.source_id == proposal_id,
            DataExport.export_type == "proposal_pdf",
        ))
        if not export:
            raise HTTPException(status_code=404, detail="Proposal document not found.")
        return {
            "export_id": export.id, "proposal_id": proposal_id,
            "proposal_version": export.source_version, "status": export.status,
            "file_format": export.file_format, "created_at": export.created_at,
            "completed_at": export.completed_at, "expires_at": export.expires_at,
            "failure_reason": export.failure_reason,
        }


@router.get("/proposals/{proposal_id}/documents/{export_id}/download")
async def download_proposal_document(
    proposal_id: uuid.UUID,
    export_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        proposal = await _load_proposal(db, proposal_id, target_org)
        export = await db.scalar(select(DataExport).where(
            DataExport.id == export_id,
            DataExport.organization_id == target_org,
            DataExport.source_type == "proposal",
            DataExport.source_id == proposal_id,
            DataExport.export_type == "proposal_pdf",
        ))
        if not proposal or not export:
            raise HTTPException(status_code=404, detail="Proposal document not found.")
        if export.status != "COMPLETED" or not export.storage_key:
            raise HTTPException(status_code=409, detail={"code": "EXPORT_NOT_READY", "status": export.status})
        now = datetime.now(timezone.utc)
        if export.expires_at and export.expires_at <= now:
            raise HTTPException(status_code=410, detail={"code": "EXPORT_EXPIRED"})
        filename = f"{proposal.proposal_number or proposal.id}_v{export.source_version}.pdf"
        url = create_presigned_download(
            bucket=settings.S3_BUCKET_EXPORTS,
            storage_path=export.storage_key,
            filename=filename,
            expiry_seconds=min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300),
        )
        export.downloaded_at = now
        db.add(AuditLog(
            organization_id=target_org,
            actor_user_id=current_user.id,
            resource_type="data_export",
            resource_id=export.id,
            action_type="PROPOSAL_PDF_DOWNLOADED",
            actor_role=getattr(current_user, "platform_role", None) or current_user.role,
            new_state={"proposal_id": str(proposal.id), "downloaded_at": now.isoformat()},
        ))
        await db.commit()
        return {"download_url": url, "expires_in": min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300), "filename": filename}


@router.post("/proposals/{proposal_id}/shares", response_model=ProposalShareCreated, status_code=status.HTTP_201_CREATED)
async def create_proposal_share(
    proposal_id: uuid.UUID,
    payload: ProposalShareCreate,
    current_user: OrganizerOrAbove,
    step_up: StepUpAuth,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    target_org = _target_org(current_user, organization_id)
    fingerprint = request_fingerprint({"proposal_id": str(proposal_id), **payload.model_dump(mode="json")})
    async with TenantContextGuard.scoped(db, target_org):
        proposal = await _load_proposal(db, proposal_id, target_org, for_update=True)
        if not proposal or not proposal.quote_id:
            raise HTTPException(status_code=404, detail="Proposal not found.")
        existing = await db.scalar(select(ProposalShare).where(
            ProposalShare.organization_id == target_org,
            ProposalShare.proposal_id == proposal_id,
            ProposalShare.idempotency_key == idempotency_key,
        ))
        if existing:
            if existing.request_hash != fingerprint:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
            return {**_share_payload(existing), "token": _encode_proposal_share(existing)}
        if proposal.current_version != payload.expected_version:
            raise HTTPException(status_code=409, detail="PROPOSAL_VERSION_CONFLICT")
        if proposal.status in {"ACCEPTED", "REJECTED"}:
            raise HTTPException(status_code=409, detail="PROPOSAL_ALREADY_DECIDED")
        now = datetime.now(timezone.utc)
        share = ProposalShare(
            id=uuid.uuid4(),
            organization_id=target_org,
            proposal_id=proposal.id,
            proposal_version=proposal.current_version,
            token_hash="",
            recipient_name=payload.recipient_name.strip(),
            recipient_email=payload.recipient_email.strip().lower(),
            status="ACTIVE",
            expires_at=now + timedelta(hours=payload.expires_in_hours),
            created_by=current_user.id,
            created_at=now,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
        )
        token = _encode_proposal_share(share)
        share.token_hash = hashlib.sha256(token.encode()).hexdigest()
        db.add(share)
        await db.flush()
        db.add(AuditLog(
            organization_id=target_org,
            actor_user_id=current_user.id,
            resource_type="proposal_share",
            resource_id=share.id,
            action_type="PROPOSAL_SHARE_CREATED",
            actor_role=getattr(current_user, "platform_role", None) or current_user.role,
            new_state={"proposal_id": str(proposal.id), "proposal_version": proposal.current_version, "expires_at": share.expires_at.isoformat()},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()
        return {**_share_payload(share), "token": token}


@router.get("/proposals/{proposal_id}/shares", response_model=list[ProposalShareOut])
async def list_proposal_shares(
    proposal_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        if not await _load_proposal(db, proposal_id, target_org):
            raise HTTPException(status_code=404, detail="Proposal not found.")
        shares = list((await db.scalars(select(ProposalShare).where(
            ProposalShare.organization_id == target_org,
            ProposalShare.proposal_id == proposal_id,
        ).order_by(ProposalShare.created_at.desc()))).all())
        return [_share_payload(share) for share in shares]


@router.get("/proposals/{proposal_id}/shares/{share_id}/accesses", response_model=list[ProposalShareAccessOut])
async def list_proposal_share_accesses(
    proposal_id: uuid.UUID,
    share_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[ProposalShareAccess]:
    target_org = _target_org(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org):
        share = await db.scalar(select(ProposalShare).where(
            ProposalShare.id == share_id,
            ProposalShare.proposal_id == proposal_id,
            ProposalShare.organization_id == target_org,
        ))
        if not share:
            raise HTTPException(status_code=404, detail="Proposal share not found.")
        return list((await db.scalars(select(ProposalShareAccess).where(
            ProposalShareAccess.organization_id == target_org,
            ProposalShareAccess.share_id == share_id,
        ).order_by(ProposalShareAccess.occurred_at.desc()).limit(100))).all())


@router.post("/proposals/{proposal_id}/shares/{share_id}/revoke", response_model=ProposalShareOut)
async def revoke_proposal_share(
    proposal_id: uuid.UUID,
    share_id: uuid.UUID,
    payload: ProposalShareRevoke,
    current_user: OrganizerOrAbove,
    step_up: StepUpAuth,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    target_org = _target_org(current_user, organization_id)
    fingerprint = request_fingerprint({"proposal_id": str(proposal_id), "share_id": str(share_id), **payload.model_dump()})
    async with TenantContextGuard.scoped(db, target_org):
        share = await db.scalar(select(ProposalShare).where(
            ProposalShare.id == share_id,
            ProposalShare.proposal_id == proposal_id,
            ProposalShare.organization_id == target_org,
        ).with_for_update())
        if not share:
            raise HTTPException(status_code=404, detail="Proposal share not found.")
        if share.revocation_idempotency_key:
            if share.revocation_idempotency_key != idempotency_key or share.revocation_request_hash != fingerprint:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
            return _share_payload(share)
        if share.status != "ACTIVE":
            raise HTTPException(status_code=409, detail="PROPOSAL_SHARE_NOT_ACTIVE")
        now = datetime.now(timezone.utc)
        share.status = "REVOKED"
        share.revoked_at = now
        share.revoked_by = current_user.id
        share.revocation_reason = payload.reason
        share.revocation_idempotency_key = idempotency_key
        share.revocation_request_hash = fingerprint
        db.add(AuditLog(
            organization_id=target_org,
            actor_user_id=current_user.id,
            resource_type="proposal_share",
            resource_id=share.id,
            action_type="PROPOSAL_SHARE_REVOKED",
            actor_role=getattr(current_user, "platform_role", None) or current_user.role,
            new_state={"proposal_id": str(proposal_id), "status": "REVOKED"},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()
        return _share_payload(share)


@public_router.get("/share", response_model=PublicProposalOut)
async def view_public_proposal(
    request: Request,
    authorization: str = Header(default="", alias="Authorization"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    token = _proposal_share_bearer(authorization)
    organization_id, proposal_id, share_id, proposal_version = _decode_proposal_share(token)
    async with TenantContextGuard.scoped(db, organization_id):
        share = await db.scalar(select(ProposalShare).where(
            ProposalShare.id == share_id,
            ProposalShare.organization_id == organization_id,
            ProposalShare.proposal_id == proposal_id,
            ProposalShare.proposal_version == proposal_version,
        ).with_for_update())
        if not share or not hmac.compare_digest(share.token_hash, hashlib.sha256(token.encode()).hexdigest()):
            raise HTTPException(status_code=404, detail="Proposal share not found.")
        effective_status = _share_status(share)
        if effective_status != "ACTIVE":
            raise HTTPException(status_code=410, detail={"code": f"PROPOSAL_SHARE_{effective_status}"})
        proposal = await _load_proposal(db, proposal_id, organization_id)
        version = next((item for item in proposal.versions if item.version == proposal_version), None) if proposal else None
        if not proposal or not version:
            raise HTTPException(status_code=404, detail="Proposal share not found.")
        now = datetime.now(timezone.utc)
        ip_address, user_agent = _request_evidence(request)
        share.last_accessed_at = now
        share.access_count += 1
        db.add(ProposalShareAccess(
            organization_id=organization_id,
            share_id=share.id,
            action="VIEWED",
            ip_address=ip_address,
            user_agent=user_agent,
            occurred_at=now,
        ))
        await db.commit()
        return {
            "proposal_id": proposal.id,
            "proposal_number": proposal.proposal_number,
            "title": proposal.title,
            "proposal_version": proposal_version,
            "recipient_name": share.recipient_name,
            "status": "ACTIVE",
            "expires_at": share.expires_at,
            "snapshot": version.snapshot_json,
            "decided_at": None,
        }


@public_router.post("/share/decision", response_model=PublicProposalDecisionOut)
async def decide_public_proposal(
    payload: PublicProposalDecision,
    request: Request,
    authorization: str = Header(default="", alias="Authorization"),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
) -> dict:
    token = _proposal_share_bearer(authorization)
    organization_id, proposal_id, share_id, proposal_version = _decode_proposal_share(token)
    fingerprint = request_fingerprint(payload.model_dump(mode="json"))
    async with TenantContextGuard.scoped(db, organization_id):
        proposal = await db.scalar(select(Proposal).where(
            Proposal.id == proposal_id,
            Proposal.organization_id == organization_id,
        ).with_for_update())
        share = await db.scalar(select(ProposalShare).where(
            ProposalShare.id == share_id,
            ProposalShare.organization_id == organization_id,
            ProposalShare.proposal_id == proposal_id,
            ProposalShare.proposal_version == proposal_version,
        ).with_for_update())
        if not proposal or not share or not hmac.compare_digest(share.token_hash, hashlib.sha256(token.encode()).hexdigest()):
            raise HTTPException(status_code=404, detail="Proposal share not found.")
        if share.decision_idempotency_key:
            if share.decision_idempotency_key != idempotency_key or share.decision_request_hash != fingerprint:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
            return {"proposal_id": proposal.id, "proposal_version": share.proposal_version, "decision": share.decision, "signer_name": share.signer_name, "decided_at": share.decided_at}
        effective_status = _share_status(share)
        if effective_status != "ACTIVE":
            raise HTTPException(status_code=410, detail={"code": f"PROPOSAL_SHARE_{effective_status}"})
        if proposal.status in {"ACCEPTED", "REJECTED"}:
            raise HTTPException(status_code=409, detail="PROPOSAL_ALREADY_DECIDED")
        now = datetime.now(timezone.utc)
        ip_address, user_agent = _request_evidence(request)
        share.status = payload.decision
        share.decision = payload.decision
        share.decision_reason = payload.reason
        share.signer_name = payload.signer_name.strip()
        share.signer_title = payload.signer_title.strip() if payload.signer_title else None
        share.decided_at = now
        share.decision_idempotency_key = idempotency_key
        share.decision_request_hash = fingerprint
        proposal.status = payload.decision
        proposal.updated_at = now
        other_shares = list((await db.scalars(select(ProposalShare).where(
            ProposalShare.organization_id == organization_id,
            ProposalShare.proposal_id == proposal_id,
            ProposalShare.id != share.id,
            ProposalShare.status == "ACTIVE",
        ).with_for_update())).all())
        for other in other_shares:
            other.status = "REVOKED"
            other.revoked_at = now
            other.revocation_reason = "Proposal decision finalized through another share."
        db.add(ProposalShareAccess(
            organization_id=organization_id,
            share_id=share.id,
            action=payload.decision,
            ip_address=ip_address,
            user_agent=user_agent,
            occurred_at=now,
        ))
        db.add(AuditLog(
            organization_id=organization_id,
            resource_type="proposal_share",
            resource_id=share.id,
            action_type=f"PROPOSAL_{payload.decision}",
            actor_role="proposal_recipient",
            actor_ip=ip_address,
            actor_user_agent=user_agent,
            new_state={"proposal_id": str(proposal.id), "proposal_version": proposal_version, "decision": payload.decision, "signer_name": share.signer_name},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()
        return {"proposal_id": proposal.id, "proposal_version": proposal_version, "decision": share.decision, "signer_name": share.signer_name, "decided_at": share.decided_at}
