import asyncio
import sys
import uuid
from datetime import datetime, date, timezone, timedelta
from loguru import logger
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.worker import celery_app
from app.config import settings
from app.modules.operations_planning.models import Project
from app.modules.deployment_management.models import Deployment, DeploymentChecklist
from app.modules.deployment_management.services import ReadinessService, DeploymentService
from app.modules.resource_management.services import ResourcePlanningService

def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
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


async def get_task_db_session() -> AsyncSession:
    task_engine = create_async_engine(
        settings.async_database_url,
        echo=settings.debug,
        poolclass=NullPool,
    )
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    return TaskSessionLocal()


@celery_app.task(name="app.tasks.operations_jobs.calculate_all_readiness_scores")
def calculate_all_readiness_scores() -> str:
    """Calculate and update readiness scores for all active projects."""
    async def _calculate():
        async with await get_task_db_session() as db:
            stmt = select(Project.id).where(Project.status.in_(["INITIATED", "PLANNING", "ACTIVE"]))
            res = await db.execute(stmt)
            project_ids = res.scalars().all()
            
            updated_count = 0
            for pid in project_ids:
                try:
                    await ReadinessService.calculate_readiness(db, pid)
                    updated_count += 1
                except Exception as e:
                    logger.error(f"Error calculating readiness for project {pid}: {e}")
            
            await db.commit()
            return f"Recalculated readiness scores for {updated_count} active projects."

    return _run_async(_calculate())


@celery_app.task(name="app.tasks.operations_jobs.detect_all_resource_conflicts")
def detect_all_resource_conflicts() -> str:
    """Scan and detect resource overlaps/conflicts for all active projects."""
    async def _detect():
        async with await get_task_db_session() as db:
            stmt = select(Project.id).where(Project.status.in_(["INITIATED", "PLANNING", "ACTIVE"]))
            res = await db.execute(stmt)
            project_ids = res.scalars().all()
            
            conflict_count = 0
            for pid in project_ids:
                try:
                    conflicts = await ResourcePlanningService.detect_resource_conflicts(db, pid)
                    conflict_count += len(conflicts)
                except Exception as e:
                    logger.error(f"Error checking resource conflicts for project {pid}: {e}")
                    
            await db.commit()
            return f"Scanned resources. Detected {conflict_count} resource conflicts across active projects."

    return _run_async(_detect())


@celery_app.task(name="app.tasks.operations_jobs.generate_upcoming_deployment_checklists")
def generate_upcoming_deployment_checklists() -> str:
    """Generate default deployment checklists for upcoming deployments in the next 7 days."""
    async def _generate():
        async with await get_task_db_session() as db:
            today = date.today()
            next_week = today + timedelta(days=7)
            
            # Find deployments in next 7 days
            stmt = select(Deployment).where(
                and_(
                    Deployment.deployment_date >= today,
                    Deployment.deployment_date <= next_week,
                    Deployment.deployment_status == "PLANNED"
                )
            )
            res = await db.execute(stmt)
            deployments = res.scalars().all()
            
            generated_count = 0
            for deployment in deployments:
                # Check if checklists already exist
                chk_stmt = select(DeploymentChecklist).where(DeploymentChecklist.deployment_id == deployment.id).limit(1)
                chk_res = await db.execute(chk_stmt)
                if chk_res.scalar() is None:
                    await DeploymentService.generate_checklists(db, deployment.id)
                    generated_count += 1
                    
            await db.commit()
            return f"Generated baseline checklists for {generated_count} upcoming deployments."

    return _run_async(_generate())
