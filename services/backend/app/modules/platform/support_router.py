import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.modules.identity.models.user import User
from app.modules.support.models.ticket import SupportTicket, TicketComment
from app.modules.billing.models.subscription import ActivityTimeline
from app.dependencies import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/support/tickets", tags=["Support Desk"])

class TicketCreateRequest(BaseModel):
    subject: str
    content: str
    priority: str = "MEDIUM"

class TicketCommentRequest(BaseModel):
    content: str

@router.post("")
async def create_ticket(
    payload: TicketCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Organization User creates a new support ticket."""
    if not getattr(current_user, "organization_id", None):
        raise HTTPException(status_code=400, detail="User not attached to an organization")
        
    ticket = SupportTicket(
        organization_id=current_user.organization_id,
        creator_id=current_user.id,
        subject=payload.subject,
        description=payload.content,
        priority=payload.priority,
        status="OPEN"
    )
    db.add(ticket)
    await db.flush() # flush to get ticket ID
    
    comment = TicketComment(
        ticket_id=ticket.id,
        author_id=current_user.id,
        content=payload.content
    )
    db.add(comment)
    
    # Log timeline event
    log = ActivityTimeline(
        organization_id=current_user.organization_id, 
        actor_id=current_user.id, 
        action_type="SUPPORT_TICKET_CREATED", 
        metadata_data={"ticket_id": str(ticket.id), "subject": payload.subject}
    )
    db.add(log)
    
    await db.commit()
    return {"message": "Ticket created successfully", "ticket_id": ticket.id}

@router.get("")
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List tickets. If Super Admin, can list all (with filters).
    If Org User, lists only their organization's tickets.
    """
    stmt = select(SupportTicket).order_by(SupportTicket.created_at.desc())
    
    if current_user.platform_role not in ["SUPER_ADMIN", "SUPPORT_ADMIN"]:
        stmt = stmt.where(SupportTicket.organization_id == current_user.organization_id)
        
    result = await db.execute(stmt)
    
    return [
        {
            "id": t.id,
            "organization_id": t.organization_id,
            "subject": t.subject,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "created_at": t.created_at,
            "assigned_agent": None,
            "is_escalated": t.priority in ["HIGH", "CRITICAL"],
        } for t in result.scalars().all()
    ]

@router.get("/{ticket_id}/comments")
async def get_ticket_comments(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve comments for a specific ticket."""
    ticket = await db.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    if current_user.platform_role not in ["SUPER_ADMIN", "SUPPORT_ADMIN"]:
        if ticket.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
            
    stmt = (
        select(TicketComment, User.email, User.first_name, User.last_name)
        .join(User, TicketComment.author_id == User.id)
        .where(TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at.asc())
    )
    result = await db.execute(stmt)
    
    return [
        {
            "id": c.id,
            "ticket_id": c.ticket_id,
            "author_id": c.author_id,
            "author_email": email,
            "author_name": f"{first_name} {last_name}".strip() or email,
            "content": c.content,
            "created_at": c.created_at
        } for c, email, first_name, last_name in result.all()
    ]

@router.post("/{ticket_id}/comments")
async def add_ticket_comment(
    ticket_id: uuid.UUID,
    payload: TicketCommentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a reply to a ticket."""
    ticket = await db.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    if current_user.platform_role not in ["SUPER_ADMIN", "SUPPORT_ADMIN"]:
        if ticket.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
            
    comment = TicketComment(
        ticket_id=ticket.id,
        author_id=current_user.id,
        content=payload.content
    )
    db.add(comment)
    
    # Auto-update status if super admin replies
    if current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"] and ticket.status == "OPEN":
        ticket.status = "IN_PROGRESS"
        
    await db.commit()
    return {"message": "Comment added successfully"}
