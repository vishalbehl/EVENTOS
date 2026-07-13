import uuid
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_, or_, desc, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.operations_planning.models import Project, Milestone, ProjectTask, TaskDependency
from app.modules.events.models.event import Event

class ProjectService:
    @staticmethod
    async def create_project(
        db: AsyncSession,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        name: str,
        service_request_id: Optional[uuid.UUID] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        project_manager_id: Optional[uuid.UUID] = None
    ) -> Project:
        code_rand = uuid.uuid4().hex[:6].upper()
        project_code = f"PRJ-{code_rand}"
        project = Project(
            id=uuid.uuid4(),
            organization_id=organization_id,
            event_id=event_id,
            service_request_id=service_request_id,
            project_code=project_code,
            name=name,
            status="INITIATED",
            start_date=start_date,
            end_date=end_date,
            project_manager_id=project_manager_id,
            completion_percentage=0.0
        )
        db.add(project)
        await db.flush()
        return project

    @staticmethod
    async def get_project(db: AsyncSession, project_id: uuid.UUID) -> Optional[Project]:
        from sqlalchemy.orm import selectinload
        stmt = (
            select(Project)
            .options(
                selectinload(Project.milestones).selectinload(Milestone.tasks),
                selectinload(Project.tasks)
            )
            .where(Project.id == project_id)
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def list_projects(
        db: AsyncSession,
        event_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0
    ) -> List[Project]:
        from sqlalchemy.orm import selectinload
        stmt = (
            select(Project)
            .options(
                selectinload(Project.milestones).selectinload(Milestone.tasks),
                selectinload(Project.tasks)
            )
            .where(Project.event_id == event_id)
        )
        stmt = stmt.order_by(desc(Project.id)).limit(limit).offset(offset)
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def create_milestones(db: AsyncSession, project_id: uuid.UUID, milestones_data: List[Dict[str, Any]]) -> List[Milestone]:
        milestones = []
        for ms in milestones_data:
            milestone = Milestone(
                id=uuid.uuid4(),
                project_id=project_id,
                name=ms["name"],
                description=ms.get("description"),
                status=ms.get("status", "PLANNED"),
                start_date=ms.get("start_date"),
                due_date=ms.get("due_date"),
                tasks=[]
            )
            db.add(milestone)
            milestones.append(milestone)
        await db.flush()
        return milestones

    @staticmethod
    async def create_tasks(db: AsyncSession, project_id: uuid.UUID, tasks_data: List[Dict[str, Any]]) -> List[ProjectTask]:
        tasks = []
        for t in tasks_data:
            task = ProjectTask(
                id=uuid.uuid4(),
                project_id=project_id,
                milestone_id=t.get("milestone_id"),
                assigned_to=t.get("assigned_to"),
                title=t["title"],
                description=t.get("description"),
                status=t.get("status", "TODO"),
                priority=t.get("priority", "MEDIUM"),
                start_date=t.get("start_date"),
                due_date=t.get("due_date"),
                created_at=datetime.now(timezone.utc)
            )
            db.add(task)
            tasks.append(task)
        await db.flush()
        return tasks

    @staticmethod
    async def generate_project_plan(db: AsyncSession, project_id: uuid.UUID) -> bool:
        project = await ProjectService.get_project(db, project_id)
        if not project:
            return False

        # Define default milestones
        milestones_list = [
            {"name": "Requirements Clarification", "description": "Verify specifications & resolve ambiguities"},
            {"name": "Resource Allocation", "description": "Allocate staff & hardware assets"},
            {"name": "On-Site Setup & Integration", "description": "Deploy, install & perform trials"},
            {"name": "Operations Support", "description": "Provide live operational assistance"},
            {"name": "Dismantle & Handover", "description": "Dismantle systems & compile reports"}
        ]
        
        created_milestones = []
        for ms in milestones_list:
            milestone = Milestone(
                id=uuid.uuid4(),
                project_id=project.id,
                name=ms["name"],
                description=ms.get("description"),
                status=ms.get("status", "PLANNED"),
                start_date=ms.get("start_date"),
                due_date=ms.get("due_date"),
                tasks=[]
            )
            project.milestones.append(milestone)
            created_milestones.append(milestone)

        # Map milestones to create default tasks
        m_clarify = created_milestones[0].id
        m_resource = created_milestones[1].id
        m_setup = created_milestones[2].id
        m_support = created_milestones[3].id
        m_dismantle = created_milestones[4].id

        tasks_list = [
            # Clarification
            {"milestone_id": m_clarify, "title": "Verify service request details with client", "description": "Go through item configurations & specifications"},
            {"milestone_id": m_clarify, "title": "Obtain layout & floor plans", "description": "Acquire network & electrical drawings"},
            # Resource
            {"milestone_id": m_resource, "title": "Assign technical engineers & operators", "description": "Select staff roles matching rates & schedule"},
            {"milestone_id": m_resource, "title": "Reserve hardware inventory", "description": "Allocate printers, servers, APs, and cabling"},
            # Setup
            {"milestone_id": m_setup, "title": "Deploy on-site hardware in rooms", "description": "Assemble booths, ready-rooms, and registration desks"},
            {"milestone_id": m_setup, "title": "Perform system validation dry runs", "description": "Validate streaming, signage, and printing flows"},
            # Support
            {"milestone_id": m_support, "title": "Monitor device status & heartbeats", "description": "Track telemetry logs during sessions"},
            {"milestone_id": m_support, "title": "Coordinate speaker upload desk", "description": "Resolve presenter room assistance tickets"},
            # Dismantle
            {"milestone_id": m_dismantle, "title": "Dismantle on-site hardware", "description": "Pack equipment and return to stock warehouse"},
            {"milestone_id": m_dismantle, "title": "Generate operations performance summary", "description": "Compile logs, tickets, and feedback"}
        ]
        
        for t in tasks_list:
            task = ProjectTask(
                id=uuid.uuid4(),
                project_id=project.id,
                milestone_id=t.get("milestone_id"),
                assigned_to=t.get("assigned_to"),
                title=t["title"],
                description=t.get("description"),
                status=t.get("status", "TODO"),
                priority=t.get("priority", "MEDIUM"),
                start_date=t.get("start_date"),
                due_date=t.get("due_date"),
                created_at=datetime.now(timezone.utc)
            )
            project.tasks.append(task)
            for m in created_milestones:
                if m.id == task.milestone_id:
                    m.tasks.append(task)
                    
        await db.flush()
        return True

    @staticmethod
    async def recalculate_completion(db: AsyncSession, project_id: uuid.UUID) -> float:
        project = await ProjectService.get_project(db, project_id)
        if not project:
            return 0.0
        
        # Get tasks count
        stmt = select(ProjectTask).where(ProjectTask.project_id == project_id)
        res = await db.execute(stmt)
        tasks = res.scalars().all()
        if not tasks:
            project.completion_percentage = 0.0
            await db.flush()
            return 0.0
        
        completed = sum(1 for t in tasks if t.status == "COMPLETED")
        percentage = (completed / len(tasks)) * 100.0
        project.completion_percentage = percentage
        await db.flush()
        return percentage
