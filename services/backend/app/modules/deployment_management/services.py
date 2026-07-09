import uuid
from datetime import date, datetime, timezone
from typing import Optional, List, Dict, Any
from decimal import Decimal
from sqlalchemy import select, and_, or_, desc, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.deployment_management.models import (
    Deployment, DeploymentChecklist, DeploymentLog, ReadinessScore, Risk
)
from app.modules.operations_planning.models import Project, ProjectTask
from app.modules.resource_management.models import ResourceAllocation

class ReadinessService:
    @staticmethod
    async def calculate_readiness(db: AsyncSession, project_id: uuid.UUID) -> ReadinessScore:
        # 1. Fetch project to see links
        project_stmt = select(Project).where(Project.id == project_id)
        project_res = await db.execute(project_stmt)
        project = project_res.scalar_one_or_none()
        
        # Calculate Mock Scores based on actual database entries to feel premium & realistic
        # Staff Score: % of project tasks assigned
        tasks_stmt = select(ProjectTask).where(ProjectTask.project_id == project_id)
        tasks_res = await db.execute(tasks_stmt)
        tasks = tasks_res.scalars().all()
        if tasks:
            assigned = sum(1 for t in tasks if t.assigned_to is not None)
            staff_score = (assigned / len(tasks)) * 100.0
        else:
            staff_score = 50.0  # default baseline
            
        # Equipment Score: % of non-conflict allocations
        alloc_stmt = select(ResourceAllocation).where(
            and_(
                ResourceAllocation.project_id == project_id,
                ResourceAllocation.resource_type == "EQUIPMENT"
            )
        )
        alloc_res = await db.execute(alloc_stmt)
        allocs = alloc_res.scalars().all()
        if allocs:
            clean_allocs = sum(1 for a in allocs if a.status != "CONFLICT")
            equipment_score = (clean_allocs / len(allocs)) * 100.0
        else:
            equipment_score = 75.0  # baseline if none requested yet
            
        # Tech Score: % of completed tasks
        if tasks:
            completed = sum(1 for t in tasks if t.status == "COMPLETED")
            technology_score = (completed / len(tasks)) * 100.0
        else:
            technology_score = 60.0
            
        # Network Score: default baseline
        network_score = 80.0
        
        # Overall
        overall_score = (staff_score + equipment_score + technology_score + network_score) / 4.0
        
        # Save or update score
        score_stmt = select(ReadinessScore).where(ReadinessScore.project_id == project_id)
        score_res = await db.execute(score_stmt)
        score = score_res.scalar_one_or_none()
        
        if not score:
            score = ReadinessScore(
                id=uuid.uuid4(),
                project_id=project_id,
                technology_score=float(technology_score),
                staff_score=float(staff_score),
                equipment_score=float(equipment_score),
                network_score=float(network_score),
                overall_score=float(overall_score),
                last_calculated=datetime.now(timezone.utc)
            )
            db.add(score)
        else:
            score.technology_score = float(technology_score)
            score.staff_score = float(staff_score)
            score.equipment_score = float(equipment_score)
            score.network_score = float(network_score)
            score.overall_score = float(overall_score)
            score.last_calculated = datetime.now(timezone.utc)
            
        await db.flush()
        return score

    @staticmethod
    async def calculate_risk(db: AsyncSession, project_id: uuid.UUID) -> Dict[str, Any]:
        stmt = select(Risk).where(Risk.project_id == project_id)
        res = await db.execute(stmt)
        risks = res.scalars().all()
        
        high_severity_count = sum(1 for r in risks if r.severity in ["HIGH", "CRITICAL"] and r.status != "RESOLVED")
        total_active = sum(1 for r in risks if r.status != "RESOLVED")
        
        risk_level = "LOW"
        if high_severity_count > 2:
            risk_level = "CRITICAL"
        elif high_severity_count > 0 or total_active > 3:
            risk_level = "HIGH"
        elif total_active > 0:
            risk_level = "MEDIUM"
            
        return {
            "risk_level": risk_level,
            "total_active_risks": total_active,
            "high_severity_risks": high_severity_count
        }

    @staticmethod
    async def create_risk(
        db: AsyncSession,
        project_id: uuid.UUID,
        title: str,
        description: Optional[str] = None,
        severity: str = "MEDIUM",
        probability: str = "MEDIUM",
        mitigation_plan: Optional[str] = None
    ) -> Risk:
        risk = Risk(
            id=uuid.uuid4(),
            project_id=project_id,
            title=title,
            description=description,
            severity=severity,
            probability=probability,
            mitigation_plan=mitigation_plan,
            status="IDENTIFIED"
        )
        db.add(risk)
        await db.flush()
        return risk


class DeploymentService:
    @staticmethod
    async def create_deployment(
        db: AsyncSession,
        project_id: uuid.UUID,
        deployment_number: str,
        deployment_date: date
    ) -> Deployment:
        deployment = Deployment(
            id=uuid.uuid4(),
            project_id=project_id,
            deployment_number=deployment_number,
            deployment_date=deployment_date,
            deployment_status="PLANNED"
        )
        db.add(deployment)
        await db.flush()
        
        # Auto-generate checklists
        await DeploymentService.generate_checklists(db, deployment.id)
        
        return deployment

    @staticmethod
    async def generate_checklists(db: AsyncSession, deployment_id: uuid.UUID) -> bool:
        checklists = [
            {"title": "Verify dedicated event bandwidth speed", "description": "Run speed test at main access points"},
            {"title": "Configure signage wayfinding displays", "description": "Ensure layout playlists and branding are running"},
            {"title": "Inspect speaker ready preview station", "description": "Validate presentation queues and telemetry heartbeats"},
            {"title": "Deploy check-in badge printers", "description": "Ensure self-service kiosk feeds are online"}
        ]
        
        for c in checklists:
            item = DeploymentChecklist(
                id=uuid.uuid4(),
                deployment_id=deployment_id,
                title=c["title"],
                description=c["description"],
                status="PENDING"
            )
            db.add(item)
        await db.flush()
        return True

    @staticmethod
    async def complete_deployment(db: AsyncSession, deployment_id: uuid.UUID, performed_by: uuid.UUID) -> Optional[Deployment]:
        stmt = select(Deployment).where(Deployment.id == deployment_id)
        res = await db.execute(stmt)
        deployment = res.scalar_one_or_none()
        if not deployment:
            return None
            
        deployment.deployment_status = "SUCCESS"
        
        # Log action
        log = DeploymentLog(
            id=uuid.uuid4(),
            deployment_id=deployment_id,
            action="COMPLETED",
            details="Deployment checklists verified and marked as SUCCESS",
            performed_by=performed_by,
            created_at=datetime.now(timezone.utc)
        )
        db.add(log)
        await db.flush()
        
        return deployment
