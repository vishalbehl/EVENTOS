import uuid
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class ApprovalWorkflowCondition(Base):
    __tablename__ = "approval_workflow_conditions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_workflows.approval_workflows.id", ondelete="CASCADE"), index=True
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    operator: Mapped[str] = mapped_column(String(50), nullable=False)  # >, <, =, !=, CONTAINS
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    logical_operator: Mapped[str] = mapped_column(String(10), default="AND")  # AND, OR

    # Relationships
    workflow: Mapped["ApprovalWorkflow"] = relationship("ApprovalWorkflow", back_populates="conditions")
