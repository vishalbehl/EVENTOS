import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta
from loguru import logger
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.worker import celery_app
from app.tasks.tenant_job_scope import (
    TenantJobScopeRequired,
    parse_required_organization_id,
    tenant_job_session,
)


def _load_workflow_models():
    try:
        from app.modules.platform_workflows.instances.models import ApprovalInstanceStep
        from app.modules.platform_workflows.workflows.models import ApprovalWorkflowStep
        from app.modules.platform_workflows.history.models import ApprovalHistory
        from app.modules.identity.models.user import User
        from app.modules.platform_workflows.approvals.service import ApprovalService
    except ModuleNotFoundError as exc:
        raise TenantJobScopeRequired(
            "Workflow jobs are dormant until platform_workflows is restored and tenant-scoped."
        ) from exc
    return ApprovalInstanceStep, ApprovalWorkflowStep, ApprovalHistory, User, ApprovalService

def _run_async(coro):
    import threading
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        res_list = []
        exc_list = []
        def target():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                res = new_loop.run_until_complete(coro)
                res_list.append(res)
            except Exception as e:
                exc_list.append(e)
            finally:
                new_loop.close()
        thread = threading.Thread(target=target)
        thread.start()
        thread.join()
        if exc_list:
            raise exc_list[0]
        return res_list[0]
    else:
        return asyncio.run(coro)

# ── Celery Tasks ───────────────────────────────────────────────

@celery_app.task(name="app.tasks.workflow_jobs.check_expired_approvals")
def check_expired_approvals(organization_id_str: str | None = None) -> None:
    logger.info("[Celery] Starting check_expired_approvals job")
    org_id = parse_required_organization_id(organization_id_str)
    _run_async(_check_expired_approvals_async(org_id))
    logger.info("[Celery] Finished check_expired_approvals job")

@celery_app.task(name="app.tasks.workflow_jobs.check_escalations")
def check_escalations(organization_id_str: str | None = None) -> None:
    logger.info("[Celery] Starting check_escalations job")
    org_id = parse_required_organization_id(organization_id_str)
    _run_async(_check_escalations_async(org_id))
    logger.info("[Celery] Finished check_escalations job")

@celery_app.task(name="app.tasks.workflow_jobs.send_reminders")
def send_reminders(organization_id_str: str | None = None) -> None:
    logger.info("[Celery] Starting send_reminders job")
    org_id = parse_required_organization_id(organization_id_str)
    _run_async(_send_reminders_async(org_id))
    logger.info("[Celery] Finished send_reminders job")


# ── Async Implementations ──────────────────────────────────────

async def _check_expired_approvals_async(org_id: uuid.UUID) -> None:
    ApprovalInstanceStep, _, ApprovalHistory, _, _ = _load_workflow_models()
    now = datetime.now(timezone.utc)
    async with tenant_job_session(org_id) as db:
        stmt = select(ApprovalInstanceStep).where(
            and_(
                ApprovalInstanceStep.status == "PENDING",
                ApprovalInstanceStep.due_at <= now
            )
        ).options(
            selectinload(ApprovalInstanceStep.instance)
        )
        res = await db.execute(stmt)
        expired_steps = res.scalars().all()

        for step in expired_steps:
            step.status = "EXPIRED"
            instance = step.instance
            instance.status = "EXPIRED"
            instance.completed_at = now
            instance.current_step_id = None

            # Add History
            history = ApprovalHistory(
                id=uuid.uuid4(),
                instance_id=instance.id,
                event_type="expired",
                performed_by=None,
                old_status="PENDING",
                new_status="EXPIRED",
                metadata_json={"reason": "Step execution timeout reached."}
            )
            db.add(history)

        await db.commit()

async def _check_escalations_async(org_id: uuid.UUID) -> None:
    ApprovalInstanceStep, ApprovalWorkflowStep, _, User, ApprovalService = _load_workflow_models()
    now = datetime.now(timezone.utc)
    async with tenant_job_session(org_id) as db:
        # Find pending step instances whose workflow definitions have escalation_hours set
        stmt = select(ApprovalInstanceStep).join(
            ApprovalWorkflowStep,
            ApprovalInstanceStep.workflow_step_id == ApprovalWorkflowStep.id
        ).where(
            and_(
                ApprovalInstanceStep.status == "PENDING",
                ApprovalWorkflowStep.escalation_hours != None
            )
        ).options(
            selectinload(ApprovalInstanceStep.workflow_step),
            selectinload(ApprovalInstanceStep.instance),
            selectinload(ApprovalInstanceStep.escalations)
        )
        res = await db.execute(stmt)
        steps = res.scalars().all()

        for step in steps:
            # Check if already escalated
            if step.escalations:
                continue
                
            creation_time = step.instance.started_at
            escalation_deadline = creation_time + timedelta(hours=step.workflow_step.escalation_hours)
            
            if now >= escalation_deadline:
                # Find an escalation recipient (e.g. system administrator)
                admin_stmt = select(User.id).where(User.is_platform_admin == True).limit(1)
                admin_res = await db.execute(admin_stmt)
                admin_id = admin_res.scalar_one_or_none()
                
                if not admin_id:
                    # Fallback to step starter/requester
                    admin_id = step.instance.started_by

                if admin_id:
                    await ApprovalService.escalate(
                        db, step.id, "Step escalation threshold hours exceeded.", admin_id
                    )

        await db.commit()

async def _send_reminders_async(org_id: uuid.UUID) -> None:
    ApprovalInstanceStep, _, _, _, _ = _load_workflow_models()
    async with tenant_job_session(org_id) as db:
        stmt = select(ApprovalInstanceStep).where(
            ApprovalInstanceStep.status == "PENDING"
        ).options(
            selectinload(ApprovalInstanceStep.workflow_step),
            selectinload(ApprovalInstanceStep.instance)
        )
        res = await db.execute(stmt)
        pending_steps = res.scalars().all()
        
        for step in pending_steps:
            logger.info(
                f"[Reminder] Step '{step.workflow_step.name}' of Instance {step.instance_id} is pending action from {step.assigned_to}"
            )
