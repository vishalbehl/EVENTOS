import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_, or_, desc, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.technology_services.models import (
    ServiceRequest, ServiceRequestItem, Requirement, RequirementDocument, RequestComment, RequestHistory
)
from app.modules.operations_planning.services import ProjectService

from sqlalchemy.orm import selectinload

class ServiceRequestService:
    @staticmethod
    async def generate_request_number(db: AsyncSession) -> str:
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        # Find count of requests today
        stmt = select(sa_func_count := sa_func_count if 'sa_func_count' in locals() else ServiceRequest.id).where(
            ServiceRequest.request_number.like(f"REQ-{date_str}-%")
        )
        # Wait, let's just write a count helper
        from sqlalchemy import func
        count_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.request_number.like(f"REQ-{date_str}-%")
        )
        res = await db.execute(count_stmt)
        count = res.scalar() or 0
        return f"REQ-{date_str}-{count + 1:04d}"

    @staticmethod
    async def create_request(
        db: AsyncSession,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        requested_by: uuid.UUID,
        title: str,
        description: Optional[str] = None,
        priority: str = "MEDIUM",
        request_type: str = "CUSTOM",
        items_data: Optional[List[Dict[str, Any]]] = None,
        requirements_data: Optional[List[Dict[str, Any]]] = None
    ) -> ServiceRequest:
        req_num = await ServiceRequestService.generate_request_number(db)
        request = ServiceRequest(
            id=uuid.uuid4(),
            organization_id=organization_id,
            event_id=event_id,
            request_number=req_num,
            title=title,
            description=description,
            status="DRAFT",
            priority=priority,
            request_type=request_type,
            requested_by=requested_by,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(request)
        await db.flush()

        # Add items
        if items_data:
            for item in items_data:
                db_item = ServiceRequestItem(
                    id=uuid.uuid4(),
                    service_request_id=request.id,
                    service_id=uuid.UUID(str(item["service_id"])),
                    quantity=item.get("quantity", 1),
                    configuration=item.get("configuration", {}),
                    notes=item.get("notes")
                )
                db.add(db_item)
            await db.flush()

        # Add requirements
        if requirements_data:
            for req in requirements_data:
                db_req = Requirement(
                    id=uuid.uuid4(),
                    service_request_id=request.id,
                    requirement_type=req["requirement_type"],
                    requirement_data=req.get("requirement_data", {})
                )
                db.add(db_req)
            await db.flush()

        # Log history
        history = RequestHistory(
            id=uuid.uuid4(),
            request_id=request.id,
            action="CREATED",
            old_status=None,
            new_status="DRAFT",
            performed_by=requested_by,
            performed_at=datetime.now(timezone.utc),
            metadata_json={"title": title}
        )
        db.add(history)
        await db.flush()

        return request

    @staticmethod
    async def get_request(db: AsyncSession, request_id: uuid.UUID) -> Optional[ServiceRequest]:
        stmt = (
            select(ServiceRequest)
            .options(
                selectinload(ServiceRequest.items),
                selectinload(ServiceRequest.requirements)
            )
            .where(ServiceRequest.id == request_id)
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def list_requests(
        db: AsyncSession,
        event_id: uuid.UUID,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[ServiceRequest]:
        stmt = (
            select(ServiceRequest)
            .options(
                selectinload(ServiceRequest.items),
                selectinload(ServiceRequest.requirements)
            )
            .where(ServiceRequest.event_id == event_id)
        )
        if status:
            stmt = stmt.where(ServiceRequest.status == status)
        stmt = stmt.order_by(desc(ServiceRequest.created_at)).limit(limit).offset(offset)
        res = await db.execute(stmt)
        return list(res.scalars().all())


    @staticmethod
    async def submit_request(db: AsyncSession, request_id: uuid.UUID, performed_by: uuid.UUID) -> Optional[ServiceRequest]:
        request = await ServiceRequestService.get_request(db, request_id)
        if not request or request.status != "DRAFT":
            return None

        old_status = request.status
        request.status = "SUBMITTED"
        request.submitted_at = datetime.now(timezone.utc)
        request.updated_at = datetime.now(timezone.utc)

        history = RequestHistory(
            id=uuid.uuid4(),
            request_id=request.id,
            action="SUBMITTED",
            old_status=old_status,
            new_status="SUBMITTED",
            performed_by=performed_by,
            performed_at=datetime.now(timezone.utc)
        )
        db.add(history)
        await db.flush()
        return request

    @staticmethod
    async def approve_request(db: AsyncSession, request_id: uuid.UUID, performed_by: uuid.UUID) -> Optional[ServiceRequest]:
        request = await ServiceRequestService.get_request(db, request_id)
        if not request or request.status not in ["SUBMITTED", "UNDER_REVIEW", "QUOTED"]:
            return None

        old_status = request.status
        request.status = "APPROVED"
        request.approved_at = datetime.now(timezone.utc)
        request.updated_at = datetime.now(timezone.utc)

        history = RequestHistory(
            id=uuid.uuid4(),
            request_id=request.id,
            action="APPROVED",
            old_status=old_status,
            new_status="APPROVED",
            performed_by=performed_by,
            performed_at=datetime.now(timezone.utc)
        )
        db.add(history)
        await db.flush()

        # Trigger project generation automatically
        await ProjectService.create_project_from_request(db, request)

        return request

    @staticmethod
    async def cancel_request(db: AsyncSession, request_id: uuid.UUID, performed_by: uuid.UUID) -> Optional[ServiceRequest]:
        request = await ServiceRequestService.get_request(db, request_id)
        if not request or request.status in ["COMPLETED", "CANCELLED"]:
            return None

        old_status = request.status
        request.status = "CANCELLED"
        request.updated_at = datetime.now(timezone.utc)

        history = RequestHistory(
            id=uuid.uuid4(),
            request_id=request.id,
            action="CANCELLED",
            old_status=old_status,
            new_status="CANCELLED",
            performed_by=performed_by,
            performed_at=datetime.now(timezone.utc)
        )
        db.add(history)
        await db.flush()
        return request


class RequirementService:
    @staticmethod
    async def add_requirement(
        db: AsyncSession,
        service_request_id: uuid.UUID,
        requirement_type: str,
        requirement_data: Dict[str, Any]
    ) -> Requirement:
        req = Requirement(
            id=uuid.uuid4(),
            service_request_id=service_request_id,
            requirement_type=requirement_type,
            requirement_data=requirement_data
        )
        db.add(req)
        await db.flush()
        return req

    @staticmethod
    async def update_requirement(
        db: AsyncSession,
        requirement_id: uuid.UUID,
        requirement_data: Dict[str, Any]
    ) -> Optional[Requirement]:
        stmt = select(Requirement).where(Requirement.id == requirement_id)
        res = await db.execute(stmt)
        req = res.scalar_one_or_none()
        if not req:
            return None
        req.requirement_data = requirement_data
        await db.flush()
        return req

    @staticmethod
    async def upload_document(
        db: AsyncSession,
        requirement_id: uuid.UUID,
        file_id: uuid.UUID,
        uploaded_by: uuid.UUID
    ) -> RequirementDocument:
        doc = RequirementDocument(
            id=uuid.uuid4(),
            requirement_id=requirement_id,
            file_id=file_id,
            uploaded_by=uploaded_by,
            uploaded_at=datetime.now(timezone.utc)
        )
        db.add(doc)
        await db.flush()
        return doc

    @staticmethod
    async def validate_requirements(db: AsyncSession, service_request_id: uuid.UUID) -> Dict[str, Any]:
        # Perform logical validation of requirement data
        stmt = select(Requirement).where(Requirement.service_request_id == service_request_id)
        res = await db.execute(stmt)
        reqs = res.scalars().all()
        errors = []
        for req in reqs:
            data = req.requirement_data
            if req.requirement_type == "REGISTRATION":
                if not data.get("attendees") or int(data["attendees"]) <= 0:
                    errors.append("REGISTRATION: attendees must be greater than 0")
            elif req.requirement_type == "SRR":
                if not data.get("stations") or int(data["stations"]) <= 0:
                    errors.append("SRR: stations must be greater than 0")
            elif req.requirement_type == "ROOM":
                if not data.get("rooms") or int(data["rooms"]) <= 0:
                    errors.append("ROOM: room count must be greater than 0")
            elif req.requirement_type == "NETWORK":
                if not data.get("wifi_users") or int(data["wifi_users"]) <= 0:
                    errors.append("NETWORK: wifi_users must be greater than 0")

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }
