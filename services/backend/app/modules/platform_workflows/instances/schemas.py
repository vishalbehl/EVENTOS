import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# Comments
class ApprovalCommentCreate(BaseModel):
    comment: str
    is_internal: bool = False

class ApprovalCommentOut(BaseModel):
    id: uuid.UUID
    instance_step_id: uuid.UUID
    comment: str
    is_internal: bool
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Attachments
class ApprovalAttachmentOut(BaseModel):
    id: uuid.UUID
    instance_id: uuid.UUID
    file_id: uuid.UUID
    uploaded_by: uuid.UUID
    uploaded_at: datetime

    class Config:
        from_attributes = True

# Escalations
class ApprovalEscalationOut(BaseModel):
    id: uuid.UUID
    instance_step_id: uuid.UUID
    escalated_to: uuid.UUID
    escalated_at: datetime
    reason: Optional[str] = None

    class Config:
        from_attributes = True

# History
class ApprovalHistoryOut(BaseModel):
    id: uuid.UUID
    instance_id: uuid.UUID
    event_type: str
    performed_by: Optional[uuid.UUID] = None
    old_status: Optional[str] = None
    new_status: str
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Instance Steps
class ApprovalInstanceStepOut(BaseModel):
    id: uuid.UUID
    instance_id: uuid.UUID
    workflow_step_id: uuid.UUID
    status: str
    assigned_to: Optional[uuid.UUID] = None
    approved_by: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    rejected_by: Optional[uuid.UUID] = None
    rejected_at: Optional[datetime] = None
    returned_by: Optional[uuid.UUID] = None
    returned_at: Optional[datetime] = None
    comments: Optional[str] = None
    due_at: Optional[datetime] = None
    comments_list: List[ApprovalCommentOut] = []
    escalations: List[ApprovalEscalationOut] = []

    class Config:
        from_attributes = True

# Instances
class ApprovalInstanceOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    workflow_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    status: str
    current_step_id: Optional[uuid.UUID] = None
    started_by: Optional[uuid.UUID] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    steps: List[ApprovalInstanceStepOut] = []
    attachments: List[ApprovalAttachmentOut] = []
    history: List[ApprovalHistoryOut] = []

    class Config:
        from_attributes = True

# Requests
class StartApprovalRequest(BaseModel):
    workflow_id: Optional[uuid.UUID] = None
    entity_type: str
    entity_id: uuid.UUID
    entity_data: Dict[str, Any] = {}

class ApproveRequest(BaseModel):
    comments: Optional[str] = None

class RejectRequest(BaseModel):
    comments: Optional[str] = None

class ReturnRequest(BaseModel):
    comments: Optional[str] = None

class EscalateRequest(BaseModel):
    reason: str
    escalated_to: uuid.UUID

# Delegations
class ApprovalDelegationCreate(BaseModel):
    to_user_id: uuid.UUID
    start_date: datetime
    end_date: datetime

class ApprovalDelegationOut(BaseModel):
    id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    start_date: datetime
    end_date: datetime
    is_active: bool

    class Config:
        from_attributes = True
