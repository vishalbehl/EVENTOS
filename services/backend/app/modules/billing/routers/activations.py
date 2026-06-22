import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.dependencies import ActiveUser, DB
from app.modules.events.models.event import Event
from app.modules.billing.models.subscription import OrganizationSubscription
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.schemas.event_activation import EventActivationCreate, EventActivationResponse

router = APIRouter(prefix="/billing", tags=["billing-activations"])


@router.post("/events/{event_id}/activate", response_model=EventActivationResponse)
async def activate_event(event_id: uuid.UUID, payload: EventActivationCreate, user: ActiveUser, db: DB):
    """
    Create a new active license activation for an event.
    Enforces that only one activation record for the event can be 'ACTIVE' at a time.
    """
    if not user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context is required."
        )

    # Fetch event to check if it exists and belongs to the org
    event_stmt = select(Event).where(
        Event.id == event_id,
        Event.organization_id == user.organization_id,
        Event.deleted_at.is_(None)
    )
    event = await db.scalar(event_stmt)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")

    # Check for existing active activation
    existing_active_stmt = select(EventActivation).where(
        EventActivation.event_id == event_id,
        EventActivation.status == "ACTIVE"
    )
    existing_active = await db.scalar(existing_active_stmt)
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event is already active."
        )

    # Check that subscription exists and is active/trial
    sub_stmt = select(OrganizationSubscription).where(
        OrganizationSubscription.id == payload.subscription_id,
        OrganizationSubscription.organization_id == user.organization_id,
        OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])
    )
    sub = await db.scalar(sub_stmt)
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active or trial subscription not found."
        )

    # Create new event activation
    activation = EventActivation(
        organization_id=user.organization_id,
        event_id=event_id,
        subscription_id=payload.subscription_id,
        status="ACTIVE",
        activated_at=datetime.now(timezone.utc)
    )
    db.add(activation)
    await db.commit()
    await db.refresh(activation)
    return activation


@router.get("/events/{event_id}/activation", response_model=EventActivationResponse)
async def get_event_activation(event_id: uuid.UUID, user: ActiveUser, db: DB):
    """
    Retrieve the current/most recent activation record for an event.
    """
    if not user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context is required."
        )

    stmt = (
        select(EventActivation)
        .where(
            EventActivation.event_id == event_id,
            EventActivation.organization_id == user.organization_id
        )
        .order_by(EventActivation.activated_at.desc())
        .limit(1)
    )
    activation = await db.scalar(stmt)
    if not activation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No activation record found for this event."
        )
    return activation


@router.get("/organizations/{org_id}/activations", response_model=List[EventActivationResponse])
async def list_organization_activations(org_id: uuid.UUID, user: ActiveUser, db: DB):
    """
    Retrieve all activation records for an organization.
    """
    if not user.organization_id or user.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization's billing data."
        )

    stmt = (
        select(EventActivation)
        .where(EventActivation.organization_id == org_id)
        .order_by(EventActivation.activated_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/events/{event_id}/deactivate", response_model=EventActivationResponse)
async def deactivate_event(event_id: uuid.UUID, user: ActiveUser, db: DB):
    """
    Deactivate the active license for an event.
    """
    if not user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context is required."
        )

    stmt = select(EventActivation).where(
        EventActivation.event_id == event_id,
        EventActivation.organization_id == user.organization_id,
        EventActivation.status == "ACTIVE"
    )
    activation = await db.scalar(stmt)
    if not activation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active activation found for this event."
        )

    activation.status = "DEACTIVATED"
    activation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(activation)
    return activation
