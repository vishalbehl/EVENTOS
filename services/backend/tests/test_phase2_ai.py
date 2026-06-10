import pytest
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.models.ai import AiConversation, AiMessage, AiUsage
from app.modules.ai.services.ai_service import AiService
from app.modules.events.models.event import Event

@pytest.mark.asyncio
async def test_ai_rag_indexing_and_chat(db: AsyncSession, organization, organizer):
    org_id = organization.id
    user_id = organizer.id
    
    from datetime import date
    # Create mock event to index
    event = Event(
        id=uuid.uuid4(),
        organization_id=org_id,
        created_by=user_id,
        name="Advanced AI Seminar",
        short_code="AISEM26",
        location="Hall B briefing on Gemini 2.0 architectures",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 3),
        timezone="UTC",
        status="draft"
    )
    db.add(event)
    await db.flush()
    
    # 1. Test indexing
    index_res = await AiService.index_organization_entities(db, org_id)
    assert index_res["indexed_entities"] >= 1
    
    # 2. Test semantic search matching
    search_res = await AiService.semantic_search(db, org_id, " briefing on Gemini", limit=2)
    assert len(search_res) >= 1
    assert search_res[0]["title"] == "Advanced AI Seminar"
    
    # 3. Test chat generation
    conversation = AiConversation(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id
    )
    db.add(conversation)
    await db.flush()
    
    msg = await AiService.chat_response(
        db=db,
        org_id=org_id,
        user_id=user_id,
        conversation_id=conversation.id,
        message_text="Tell me about the AI Seminar?"
    )
    await db.flush()
    
    assert msg.role == "assistant"
    assert "Advanced AI Seminar" in msg.content
    assert len(msg.citations) >= 1
    
    # Verify usage logged
    usage_stmt = select(AiUsage).where(AiUsage.organization_id == org_id)
    usage_res = await db.execute(usage_stmt)
    usage = usage_res.scalar_one_or_none()
    assert usage is not None
    assert usage.prompt_tokens > 0
    assert usage.completion_tokens > 0
