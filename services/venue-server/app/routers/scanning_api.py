import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, not_

from app.database import get_database
from app.models.participant import Participant
from app.models.companion import Companion
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.badge_models import Badge, BadgeScan
from app.models.venue_checkin import VenueCheckIn
from app.models.event import Event
from app.models.venue_node import VenueNodeAssignment
from app.routers.node_sync import _authorize_node
from app.models.venue_user import VenueUser
from app.routers.auth import verify_password

router = APIRouter(prefix="/api/v1/venue/scanning", tags=["scanning_api"])

class ScanRequest(BaseModel):
    query: str
    station_id: Optional[str] = None
    scan_type: str = "check_in"

class OverrideScanRequest(BaseModel):
    participant_id: str
    station_id: str
    admin_username: str
    admin_password: str
    reason: Optional[str] = "Admin Override Gatekeeper Limit"

class ChangeGateRequest(BaseModel):
    station_id: str
    admin_username: str
    admin_password: str

@router.get("/stations")
async def get_scanning_stations(db: AsyncSession = Depends(get_database)):
    """
    Returns active venue capacity check-in stations from venue.venue_capacity_rules table.
    """
    stmt = select(VenueCapacityRule).order_by(VenueCapacityRule.created_at.asc())
    stations = (await db.execute(stmt)).scalars().all()
    
    result = []
    for s in stations:
        s_name_lower = (s.station_name or "").lower()
        s_type_lower = (s.station_type or "").lower()
        # Exclude initial participant check-in gates — they are reserved for desk & self check-in
        if "initial" in s_name_lower or "intake" in s_name_lower or "initial" in s_type_lower:
            continue

        # Count total successful check-ins at this station
        count_stmt = select(func.count(BadgeScan.id)).where(
            BadgeScan.station_id == s.id,
            BadgeScan.status != "rejected"
        )
        current_count = (await db.scalar(count_stmt)) or 0
        
        result.append({
            "id": str(s.id),
            "station_name": s.station_name,
            "station_type": s.station_type,
            "allowed_roles": s.allowed_roles or ["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"],
            "max_checkins_per_delegate": s.max_checkins_per_delegate,
            "station_capacity": s.station_capacity,
            "current_count": current_count,
            "updated_by": s.updated_by,
            "updated_reason": s.updated_reason,
        })
    return result

@router.post("/change-gate")
async def change_workstation_gate(
    payload: ChangeGateRequest,
    x_venue_node_token: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_database),
):
    """Rebind this signed workstation to a different scanning gate.

    A node assignment is the source of truth. Changing it requires an active
    node token plus an admin/super-admin password, then increments the
    assignment snapshot so the local replica picks up the new binding.
    """
    assignment = await _authorize_node(x_venue_node_token, db)
    if assignment.mode != "scanning":
        raise HTTPException(status_code=403, detail="Only scanning workstations can change their gate")

    username = payload.admin_username.strip().lower()
    admin_user = (await db.execute(
        select(VenueUser).where(
            (VenueUser.username == username) | (VenueUser.email == username)
        ).limit(1)
    )).scalar_one_or_none()
    if not admin_user or not admin_user.is_active or admin_user.role not in {"admin", "super_admin"} or not verify_password(payload.admin_password, admin_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid Admin Username or Password")

    try:
        gate_id = uuid.UUID(payload.station_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid check-in gate id")
    gate = await db.get(VenueCapacityRule, gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Selected check-in gate was not found")

    assignment.capacity_rule_id = gate.id
    assignment.snapshot_version += 1
    assignment.last_sync_at = datetime.now(timezone.utc)
    await db.commit()
    return {
        "status": "updated",
        "assignment_id": str(assignment.id),
        "capacity_rule_id": str(gate.id),
        "gate_name": gate.station_name,
        "snapshot_version": assignment.snapshot_version,
    }

@router.post("/scan")
async def process_badge_scan(payload: ScanRequest, x_venue_node_token: Optional[str] = Header(default=None), db: AsyncSession = Depends(get_database)):
    """
    Validates QR / Barcode / Query scan against venue station capacity gatekeeper rules.
    Logs scan result in venue.badge_scans PostgreSQL table.
    """
    node: Optional[VenueNodeAssignment] = None
    if x_venue_node_token:
        node = await _authorize_node(x_venue_node_token, db)
        if node.mode != "scanning" or not node.capacity_rule_id:
            raise HTTPException(status_code=403, detail="This workstation is not authorized for scanning")
        # A bound workstation may scan only at its assigned gate. Rebinding is
        # an explicit admin-authenticated operation, never a client payload
        # override.
        assigned_gate_id = str(node.capacity_rule_id)
        if payload.station_id and payload.station_id != assigned_gate_id:
            raise HTTPException(status_code=403, detail="This workstation is bound to its assigned gate. Admin authorization is required to change it.")
        payload.station_id = assigned_gate_id
    q = payload.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Scan query cannot be empty.")

    # Resolve the requested gate once, before resolving the person. This is
    # important for companion scans too: every scan must be recorded against
    # the gate selected by the operator (or the node's assigned default).
    station = None
    if payload.station_id:
        try:
            st_uuid = uuid.UUID(payload.station_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid check-in gate id")
        station = (await db.execute(
            select(VenueCapacityRule).where(VenueCapacityRule.id == st_uuid)
        )).scalar_one_or_none()
        if not station:
            raise HTTPException(status_code=404, detail="Selected check-in gate was not found")
    else:
        station = (await db.execute(select(VenueCapacityRule).limit(1))).scalar_one_or_none()

    station_name = station.station_name if station else "Main Gate Check-In"
    station_type = station.station_type if station else "Main Entrance"
    station_id = station.id if station else None

    # 1. Resolve Badge or Participant by regno, badge_code, name, email, or phone
    badge = (await db.execute(
        select(Badge).where(or_(Badge.badge_code.ilike(f"%{q}%"), Badge.qr_token == q))
    )).scalar_one_or_none()

    if badge:
        participant = await db.get(Participant, badge.participant_id)
    else:
        p_stmt = select(Participant).where(
            or_(
                Participant.regno.ilike(f"%{q}%"),
                Participant.name.ilike(f"%{q}%"),
                Participant.email.ilike(f"%{q}%"),
                Participant.phone.ilike(f"%{q}%")
            )
        ).limit(1)
        participant = (await db.execute(p_stmt)).scalar_one_or_none()
    
    # Companion badge/name identifiers take precedence over a participant
    # match. This prevents a companion scan from displaying the primary
    # delegate when their query happens to overlap.
    direct_companion = None
    try:
        direct_companion = (await db.execute(
            select(Companion).where(Companion.id == uuid.UUID(q)).limit(1)
        )).scalar_one_or_none()
    except ValueError:
        direct_companion = None
    if not direct_companion:
        direct_companion = (await db.execute(
            select(Companion).where(
                or_(
                    Companion.badge_code == q,
                    (Companion.first_name + " " + Companion.last_name).ilike(q),
                )
            ).limit(1)
        )).scalar_one_or_none()
    if direct_companion:
        participant = None

    if not participant:
        # Fallback to Companion table
        c_stmt = select(Companion).where(
            or_(
                Companion.badge_code.ilike(f"%{q}%"),
                (Companion.first_name + " " + Companion.last_name).ilike(f"%{q}%"),
                Companion.email.ilike(f"%{q}%"),
                Companion.phone.ilike(f"%{q}%")
            )
        ).limit(1)
        companion_rec = direct_companion or (await db.execute(c_stmt)).scalar_one_or_none()

        if not companion_rec and q.count("-") == 4:
            try:
                c_uuid = uuid.UUID(q)
                companion_rec = (await db.execute(select(Companion).where(Companion.id == c_uuid))).scalar_one_or_none()
            except ValueError:
                pass

        if companion_rec:
            comp_name = f"{companion_rec.first_name} {companion_rec.last_name}".strip()
            primary_participant = await db.get(Participant, companion_rec.primary_participant_id)
            b_code = companion_rec.badge_code or f"CMP-{str(companion_rec.id)[:8].upper()}"
            if not companion_rec.badge_code:
                companion_rec.badge_code = b_code

            existing_comp_checkins = (await db.scalar(
                select(func.count(VenueCheckIn.id)).where(
                    VenueCheckIn.event_id == (primary_participant.event_id if primary_participant else None),
                    VenueCheckIn.checkin_gate_id == station_id,
                    VenueCheckIn.companion_id == companion_rec.id,
                    or_(
                        VenueCheckIn.badge_code == b_code,
                        VenueCheckIn.badge_code == companion_rec.badge_code,
                        VenueCheckIn.participant_id == companion_rec.primary_participant_id
                    ),
                    VenueCheckIn.status.in_(["success", "admin_overridden"])
                )
            )) or 0
            if existing_comp_checkins > 0:
                now_utc = datetime.now(timezone.utc)
                reason = f"Companion '{comp_name}' is already checked in."
                # Rejected attempts remain auditable in venue_scan_events and
                # are returned as a normal scan result so the UI can display
                # the same result popup as any other scan.
                db.add(BadgeScan(
                    id=uuid.uuid4(),
                    event_id=primary_participant.event_id if primary_participant else None,
                    participant_id=companion_rec.primary_participant_id,
                    companion_id=companion_rec.id,
                    checkin_gate_id=station_id,
                    station_name=station_name,
                    station_type=station_type,
                    badge_code=b_code,
                    scan_type=payload.scan_type,
                    status="rejected",
                    rejection_reason=reason,
                    created_at=now_utc,
                ))
                await db.commit()
                return {
                    "status": "rejected",
                    "reason": reason,
                    "requires_admin_override": False,
                    "participant": {
                        "id": str(companion_rec.id),
                        "name": comp_name,
                        "regno": b_code,
                        "role": "Companion",
                        "company": f"Guest of {companion_rec.relationship}",
                        "email": companion_rec.email or "N/A",
                        "phone": companion_rec.phone or "—",
                        "checked_in": True,
                        "is_companion": True,
                    },
                    "station_name": station_name,
                    "scan_time": now_utc.isoformat(),
                }

            now_utc = datetime.now(timezone.utc)
            companion_rec.checked_in = True
            companion_rec.checked_in_at = now_utc

            scan_log = BadgeScan(
                id=uuid.uuid4(),
                event_id=primary_participant.event_id if primary_participant else None,
                participant_id=companion_rec.primary_participant_id,
                companion_id=companion_rec.id,
                checkin_gate_id=station_id,
                station_name=station_name,
                station_type=station_type,
                badge_code=b_code,
                scan_type=payload.scan_type,
                status="success",
                created_at=now_utc
            )
            db.add(scan_log)

            venue_checkin_log = VenueCheckIn(
                id=uuid.uuid4(),
                event_id=primary_participant.event_id if primary_participant else None,
                participant_id=companion_rec.primary_participant_id,
                companion_id=companion_rec.id,
                station_id=station_id,
                capacity_rule_id=station_id,
                station_name=station_name,
                station_type=station_type,
                station_capacity=station.station_capacity if station else 5000,
                badge_code=b_code,
                scan_type=payload.scan_type,
                status="success",
                checkin_time=now_utc,
                method="qr",
                device_id=str(node.device_id) if node else "scanning-ui",
                created_at=now_utc
            )
            db.add(venue_checkin_log)
            await db.commit()

            return {
                "status": "success",
                "participant": {
                    "id": str(companion_rec.id),
                    "name": comp_name,
                    "regno": b_code,
                    "role": "Companion",
                    "company": f"Guest of {companion_rec.relationship}",
                    "email": companion_rec.email or "N/A",
                    "phone": companion_rec.phone or "—",
                    "checked_in": True,
                    "is_companion": True
                },
                "station_name": station_name,
                "scan_time": now_utc.isoformat()
            }

        raise HTTPException(status_code=404, detail=f"No participant or companion found matching code or query: '{q}'")

    # Participant identity is stored separately from badge issuance. Resolve
    # the current badge code from the Badge table and fall back to registration
    # code for participants who have not been issued a badge yet.
    participant_badge_code = badge.badge_code if badge and badge.participant_id == participant.id else None
    if not participant_badge_code:
        participant_badge_code = await db.scalar(
            select(Badge.badge_code).where(Badge.participant_id == participant.id).order_by(Badge.created_at.desc()).limit(1)
        )
    participant_badge_code = participant_badge_code or participant.regno or ""

    # Apply gate capacity and eligibility rules.
    rejection_reason = None
    if station:
        # Rule A: Role Restriction
        allowed = station.allowed_roles or ["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"]
        if participant.role and participant.role not in allowed:
            rejection_reason = f"Role '{participant.role}' is not authorized at check-in station '{station_name}'."

        # Rule B: Delegate Check-in Limit
        if not rejection_reason and station.max_checkins_per_delegate > 0:
            delegate_scan_count = (await db.scalar(
                select(func.count(BadgeScan.id)).where(
                    BadgeScan.event_id == participant.event_id,
                    BadgeScan.participant_id == participant.id,
                    BadgeScan.companion_id.is_(None),
                    BadgeScan.station_id == station.id,
                    BadgeScan.scan_type == "check_in",
                    BadgeScan.status != "rejected",
                    # Companion attendance uses the primary participant ID
                    # for event ownership. Do not count those scans against
                    # the delegate's own per-gate limit.
                    not_(BadgeScan.badge_code.ilike("CMP-%")),
                    ~select(Companion.id).where(
                        Companion.primary_participant_id == participant.id,
                        Companion.badge_code == BadgeScan.badge_code,
                    ).exists(),
                )
            )) or 0
            if delegate_scan_count >= station.max_checkins_per_delegate:
                rejection_reason = f"Participant is already checked in at '{station_name}'."

        # Rule C: Station Capacity Limit
        if not rejection_reason and station.station_capacity > 0:
            total_station_scans = (await db.scalar(
                select(func.count(BadgeScan.id)).where(
                    BadgeScan.event_id == participant.event_id,
                    BadgeScan.station_id == station.id,
                    BadgeScan.status != "rejected"
                )
            )) or 0
            if total_station_scans >= station.station_capacity:
                rejection_reason = f"Station capacity limit ({station.station_capacity}) reached for '{station_name}'."

    scan_id = uuid.uuid4()
    now_utc = datetime.now(timezone.utc)

    # 4. Handle Rejection
    if rejection_reason:
        scan_log = BadgeScan(
            id=scan_id,
            event_id=participant.event_id,
            participant_id=participant.id,
            station_id=station_id,
            station_name=station_name,
            station_type=station_type,
            badge_code=participant_badge_code,
            scan_type=payload.scan_type,
            status="rejected",
            rejection_reason=rejection_reason,
            created_at=now_utc
        )
        db.add(scan_log)
        await db.commit()

        return {
            "status": "rejected",
            "reason": rejection_reason,
            "requires_admin_override": True,
            "participant": {
                "id": str(participant.id),
                "name": participant.name,
                "regno": participant.regno,
                "role": participant.role,
                "company": participant.company or "N/A",
                "email": participant.email,
                "phone": participant.phone or "—",
            },
            "station_name": station_name,
            "scan_time": now_utc.isoformat()
        }

    # 5. Handle Success Check-In
    scan_log = BadgeScan(
        id=scan_id,
        event_id=participant.event_id,
        participant_id=participant.id,
        station_id=station_id,
        station_name=station_name,
        station_type=station_type,
        badge_code=participant_badge_code,
        scan_type=payload.scan_type,
        status="success",
        created_at=now_utc
    )
    db.add(scan_log)

    venue_checkin_log = VenueCheckIn(
        id=uuid.uuid4(),
        event_id=participant.event_id,
        participant_id=participant.id,
        station_id=station_id,
        capacity_rule_id=station_id,
        station_name=station_name,
        station_type=station_type,
        station_capacity=station.station_capacity if station else 5000,
        badge_code=participant_badge_code,
        scan_type=payload.scan_type,
        status="success",
        checkin_time=now_utc,
        created_at=now_utc
    )
    db.add(venue_checkin_log)

    # Update participant status
    participant.checked_in = True
    participant.check_in_time = now_utc

    await db.commit()

    return {
        "status": "success",
        "participant": {
            "id": str(participant.id),
            "name": participant.name,
            "regno": participant.regno,
            "role": participant.role,
            "company": participant.company or "N/A",
            "email": participant.email,
            "phone": participant.phone or "—",
            "checked_in": True,
        },
        "station_name": station_name,
        "scan_time": now_utc.isoformat()
    }

@router.post("/override-scan")
async def override_badge_scan(payload: OverrideScanRequest, db: AsyncSession = Depends(get_database)):
    """
    Validates admin username and password, bypasses capacity/role gatekeeper rules,
    and logs overridden scan entry in venue.badge_scans table.
    """
    if not payload.admin_username or not payload.admin_password:
        raise HTTPException(status_code=400, detail="Admin username and password are required for override.")

    admin_user = (await db.execute(select(VenueUser).where((VenueUser.username == payload.admin_username.strip().lower()) | (VenueUser.email == payload.admin_username.strip().lower())).limit(1))).scalar_one_or_none()
    if not admin_user or not admin_user.is_active or admin_user.role not in {"admin", "super_admin"} or not verify_password(payload.admin_password, admin_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid Admin Username or Password.")

    try:
        p_uuid = uuid.UUID(payload.participant_id)
        participant = (await db.execute(select(Participant).where(Participant.id == p_uuid))).scalar_one_or_none()
    except ValueError:
        participant = None

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found for override.")

    override_badge_code = await db.scalar(
        select(Badge.badge_code).where(Badge.participant_id == participant.id).order_by(Badge.created_at.desc()).limit(1)
    ) or participant.regno or ""

    station_name = "Admin Gate Override"
    station_type = "Main Entrance"
    station_id = None
    if payload.station_id:
        try:
            st_uuid = uuid.UUID(payload.station_id)
            station = (await db.execute(select(VenueCapacityRule).where(VenueCapacityRule.id == st_uuid))).scalar_one_or_none()
            if station:
                station_name = station.station_name
                station_type = station.station_type
                station_id = station.id
        except ValueError:
            pass

    scan_id = uuid.uuid4()
    now_utc = datetime.now(timezone.utc)

    scan_log = BadgeScan(
        id=scan_id,
        event_id=participant.event_id,
        participant_id=participant.id,
        station_id=station_id,
        station_name=station_name,
        station_type=station_type,
        badge_code=override_badge_code,
        scan_type="check_in",
        status="admin_overridden",
        rejection_reason=payload.reason,
        admin_overridden_by=admin_user.username,
        created_at=now_utc
    )
    db.add(scan_log)

    db.add(VenueCheckIn(
        id=uuid.uuid4(),
        event_id=participant.event_id,
        participant_id=participant.id,
        checkin_gate_id=station_id,
        gate_name=station_name,
        gate_type=station_type,
        gate_capacity=station.station_capacity if station else 5000,
        badge_code=override_badge_code,
        scan_type="check_in",
        status="admin_overridden",
        admin_overridden_by=admin_user.username,
        checkin_time=now_utc,
        method="admin_override",
        device_id="admin-override",
        created_at=now_utc,
    ))

    participant.checked_in = True
    participant.check_in_time = now_utc

    await db.commit()

    return {
        "status": "admin_overridden",
        "admin_overridden_by": admin_user.username,
        "participant": {
            "id": str(participant.id),
            "name": participant.name,
            "regno": participant.regno,
            "role": participant.role,
            "company": participant.company or "N/A",
            "email": participant.email,
            "phone": participant.phone or "—",
            "checked_in": True,
        },
        "station_name": station_name,
        "scan_time": now_utc.isoformat()
    }

@router.get("/recent")
async def get_recent_scans(
    limit: int = 30,
    station_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_database)
):
    """
    Returns recent scans from venue.badge_scans joined with participant details.
    When station_id is provided, only returns scans for that specific check-in gate.
    """
    stmt = (
        select(BadgeScan, Participant)
        .outerjoin(Participant, BadgeScan.participant_id == Participant.id)
        .order_by(desc(BadgeScan.created_at))
    )

    # Filter strictly by station when provided
    if station_id:
        try:
            st_uuid = uuid.UUID(station_id)
            station_rule = await db.get(VenueCapacityRule, st_uuid)
            target_station_name = station_rule.station_name if station_rule else None
            if target_station_name:
                stmt = stmt.where(
                    or_(
                        BadgeScan.station_id == st_uuid,
                        BadgeScan.station_name == target_station_name
                    )
                )
            else:
                stmt = stmt.where(BadgeScan.station_id == st_uuid)
        except ValueError:
            stmt = stmt.where(BadgeScan.station_name.ilike(f"%{station_id}%"))
    else:
        # If no station_id is supplied, return empty list to avoid displaying unassigned gate scans
        return []
    rows = (await db.execute(stmt)).all()

    result = []
    for scan, part in rows:
        companion = None
        if scan.companion_id:
            companion = await db.get(Companion, scan.companion_id)
        if not companion:
            companion = (await db.execute(
                select(Companion).where(Companion.badge_code == scan.badge_code).limit(1)
            )).scalar_one_or_none()
        if not companion and scan.badge_code.startswith("CMP-") and scan.participant_id:
            companion = (await db.execute(
                select(Companion).where(
                    Companion.primary_participant_id == scan.participant_id,
                    Companion.badge_code.is_(None),
                ).limit(1)
            )).scalar_one_or_none()
        if companion:
            companion_name = f"{companion.first_name} {companion.last_name}".strip()
            participant_name = companion_name
            regno = companion.badge_code or scan.badge_code
            role = "Companion"
            company = "Companion"
        else:
            participant_name = part.name if part else "Unknown Delegate"
            regno = part.regno if part else scan.badge_code
            role = part.role if part else "Delegate"
            company = part.company if part else "N/A"
        result.append({
            "id": str(scan.id),
            "participant_id": str(scan.participant_id) if scan.participant_id else (str(part.id) if part else (str(companion.id) if companion else None)),
            "participant_name": participant_name,
            "regno": regno,
            "role": role,
            "company": company,
            "station_name": scan.station_name,
            "station_id": str(scan.station_id) if scan.station_id else None,
            "status": scan.status,
            "scan_type": scan.scan_type,
            "rejection_reason": scan.rejection_reason,
            "admin_overridden_by": scan.admin_overridden_by,
            "created_at": scan.created_at.isoformat() if scan.created_at else None
        })
    return result
