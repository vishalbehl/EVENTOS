from __future__ import annotations

import uuid
from typing import List, Optional
from sqlalchemy import select, func
from fastapi import APIRouter, Query, HTTPException, status

from app.dependencies import DB, ActiveUser
from app.modules.ai.services.ai_service import AiService
from app.modules.ai.schemas.ai_schemas import AiChatRequestIn, AiChatResponseOut, UsageStatsOut, AiCitation
from app.modules.ai.models.ai import AiConversation, AiMessage, AiUsage, AiCostTracking

router = APIRouter(prefix="/ai", tags=["ai"])

@router.post(
    "/conversations",
    summary="Create a new assistant conversation"
)
async def create_conversation(
    current_user: ActiveUser,
    db: DB
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization."
        )
        
    conversation = AiConversation(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=current_user.id,
        created_at=datetime_now_utc()
    )
    db.add(conversation)
    await db.commit()
    
    return {"conversation_id": conversation.id}

@router.get(
    "/conversations/{conversation_id}/messages",
    summary="Get conversation history"
)
async def list_messages(
    conversation_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        
    # Verify ownership
    conv_stmt = select(AiConversation).where(
        AiConversation.id == conversation_id,
        AiConversation.organization_id == org_id
    )
    conv_res = await db.execute(conv_stmt)
    if not conv_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        
    stmt = select(AiMessage).where(
        AiMessage.conversation_id == conversation_id
    ).order_by(AiMessage.created_at.asc())
    
    res = await db.execute(stmt)
    messages = res.scalars().all()
    
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at
        } for m in messages
    ]

@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=AiChatResponseOut,
    summary="Send a message to the AI Assistant"
)
async def send_message(
    conversation_id: uuid.UUID,
    body: AiChatRequestIn,
    current_user: ActiveUser,
    db: DB
) -> AiChatResponseOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        
    try:
        msg = await AiService.chat_response(
            db=db,
            org_id=org_id,
            user_id=current_user.id,
            conversation_id=conversation_id,
            message_text=body.message
        )
        await db.commit()
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
        
    return AiChatResponseOut(
        message_id=msg.id,
        conversation_id=msg.conversation_id,
        role=msg.role,
        content=msg.content,
        created_at=msg.created_at,
        citations=[
            AiCitation(
                entity_type=c["entity_type"],
                entity_id=c["entity_id"],
                title=c["title"],
                similarity=c["similarity"]
            ) for c in getattr(msg, "citations", [])
        ]
    )

@router.post(
    "/index",
    summary="Trigger full RAG vector reindexing of organization data"
)
async def index_organization(
    current_user: ActiveUser,
    db: DB
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to an organization.")
        
    result = await AiService.index_organization_entities(db, org_id)
    await db.commit()
    return {"status": "success", "indexed_entities": result["indexed_entities"]}

@router.get(
    "/usage",
    response_model=List[UsageStatsOut],
    summary="Get organization AI usage and cost metrics"
)
async def get_usage_metrics(
    current_user: ActiveUser,
    db: DB
) -> List[UsageStatsOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []
        
    # Aggregate usage tokens by model
    usage_stmt = (
        select(
            AiUsage.model,
            func.sum(AiUsage.prompt_tokens).label("prompt_tokens"),
            func.sum(AiUsage.completion_tokens).label("completion_tokens")
        )
        .where(AiUsage.organization_id == org_id)
        .group_by(AiUsage.model)
    )
    usage_res = await db.execute(usage_stmt)
    usage_rows = usage_res.all()
    
    # Aggregate cost by model
    cost_stmt = (
        select(
            AiCostTracking.model,
            func.sum(AiCostTracking.cost).label("cost")
        )
        .where(AiCostTracking.organization_id == org_id)
        .group_by(AiCostTracking.model)
    )
    cost_res = await db.execute(cost_stmt)
    cost_map = {row[0]: float(row[1] or 0.0) for row in cost_res.all()}
    
    ret = []
    for r in usage_rows:
        model = r[0]
        ret.append(
            UsageStatsOut(
                model=model,
                prompt_tokens=int(r[1] or 0),
                completion_tokens=int(r[2] or 0),
                estimated_cost_usd=cost_map.get(model, 0.0)
            )
        )
    return ret


# Helper to get current utc timestamp
from datetime import datetime, timezone
def datetime_now_utc() -> datetime:
    return datetime.now(timezone.utc)
