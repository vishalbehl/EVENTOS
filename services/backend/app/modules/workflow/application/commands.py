from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.workflow.schemas.workflow_schemas import (
    CompleteTaskRequest,
    WorkflowCreate,
    WorkflowInstanceOut,
    WorkflowOut,
)
from app.modules.workflow.services.workflow_service import WorkflowService
from app.modules.workflow.application.queries import WorkflowQueryService
from app.modules.rbac.services.access_contexts import actor_request_context
from app.modules.audit.models.audit_log import AuditLog


async def _admit(db, organization_id, actor_id, action, key):
    if not key:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    async with actor_request_context(db, actor_id, organization_id, action=action):
        pass  # Transaction-owned revision locks survive until command commit.


def _audit(db, organization_id, actor_id, action, resource_id, reason):
    token = db.info.get("customer_request_selector")
    db.add(AuditLog(organization_id=organization_id, actor_user_id=actor_id,
        resource_type="workflow", resource_id=resource_id, action_type=action,
        correlation_id=uuid.uuid4(), is_sensitive=True,
        new_state={"acting_organization_id": str(organization_id),
                   "target_organization_id": str(organization_id),
                   "workspace_id": str(token.active_workspace_id) if token and token.active_workspace_id else None,
                   "reason": reason}))


class WorkflowCommandService:
    """Owns workflow command transactions and durable replay behavior."""

    @staticmethod
    def _validate_steps(payload: WorkflowCreate) -> None:
        for index, step in enumerate(sorted(payload.steps, key=lambda item: item.step_order), start=1):
            if step.step_order != index:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Workflow steps must be sequential starting at 1. Expected step order {index}, got {step.step_order}.",
                )

    @staticmethod
    async def create(
        db: AsyncSession,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        payload: WorkflowCreate,
        *,
        idempotency_key: Optional[str] = None,
    ):
        WorkflowCommandService._validate_steps(payload)
        operation = None
        try:
            await _admit(db, organization_id, actor_id, "workflows:manage", idempotency_key)
            if idempotency_key:
                operation = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="workflow.create",
                    key=idempotency_key,
                    payload=payload.model_dump(mode="json"),
                )
                replay = replay_response(operation)
                if replay:
                    await db.rollback()
                    return replay[1]

            workflow = await WorkflowService.create_workflow(db, organization_id, payload)
            result = await WorkflowQueryService.get_workflow(db, organization_id, workflow.id)
            if result is None:
                raise HTTPException(status_code=500, detail="Workflow creation failed.")
            serialized = WorkflowOut.model_validate(result).model_dump(mode="json")
            _audit(db, organization_id, actor_id, "WORKFLOW_CREATED", result.id, "User requested template creation")
            if operation is not None:
                await complete_idempotent(db, operation, response_status=201, response_body=serialized, resource_id=result.id)
            await db.commit()
            return serialized
        except Exception:
            if db.in_transaction():
                await db.rollback()
            raise

    @staticmethod
    async def trigger(
        db: AsyncSession,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        workflow_id: uuid.UUID,
        entity_id: Optional[uuid.UUID],
        *,
        idempotency_key: Optional[str] = None,
    ):
        operation = None
        try:
            await _admit(db, organization_id, actor_id, "workflows:manage", idempotency_key)
            if idempotency_key:
                operation = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="workflow.trigger",
                    key=idempotency_key,
                    payload={"workflow_id": str(workflow_id), "entity_id": str(entity_id) if entity_id else None},
                )
                replay = replay_response(operation)
                if replay:
                    await db.rollback()
                    return replay[1]
            instance = await WorkflowService.trigger_workflow(db, organization_id, workflow_id, entity_id)
            if not instance:
                raise HTTPException(status_code=400, detail="Could not trigger workflow. Verify it is active.")
            result = await WorkflowQueryService.get_instance(db, organization_id, instance.id)
            if result is None:
                raise HTTPException(status_code=500, detail="Workflow execution failed.")
            serialized = WorkflowInstanceOut.model_validate(result).model_dump(mode="json")
            _audit(db, organization_id, actor_id, "WORKFLOW_TRIGGERED", result.id, "User requested workflow execution")
            if operation is not None:
                await complete_idempotent(db, operation, response_status=202, response_body=serialized, resource_id=result.id)
            await db.commit()
            return serialized
        except Exception:
            if db.in_transaction():
                await db.rollback()
            raise

    @staticmethod
    async def complete_task(
        db: AsyncSession,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        task_id: uuid.UUID,
        payload: CompleteTaskRequest,
        *,
        idempotency_key: Optional[str] = None,
        expected_version: int | None = None,
    ) -> dict:
        operation = None
        try:
            await _admit(db, organization_id, actor_id, "workflows:approve", idempotency_key)
            if expected_version is None:
                raise HTTPException(428, detail={"code": "IF_MATCH_REQUIRED"})
            if idempotency_key:
                operation = await begin_idempotent(
                    db,
                    organization_id=organization_id,
                    actor_id=actor_id,
                    operation="workflow.complete_task",
                    key=idempotency_key,
                    payload={"task_id": str(task_id), "comment": payload.comment, "version": expected_version},
                )
                replay = replay_response(operation)
                if replay:
                    await db.rollback()
                    return replay[1]
            success = await WorkflowService.complete_task(db, organization_id, task_id, payload.comment,
                expected_version=expected_version)
            if not success:
                raise HTTPException(status_code=400, detail="Could not complete task. Task may not be pending manual review, or you do not have permission.")
            response = {"status": "success", "message": "Manual task completed."}
            _audit(db, organization_id, actor_id, "WORKFLOW_TASK_APPROVED", task_id, payload.comment)
            if operation is not None:
                await complete_idempotent(db, operation, response_status=200, response_body=response)
            await db.commit()
            return response
        except Exception:
            if db.in_transaction():
                await db.rollback()
            raise
