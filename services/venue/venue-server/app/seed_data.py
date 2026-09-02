import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.organization import Organization
from app.models.event import Event
from app.models.room import Room
from app.models.session import Session
from app.models.speaker import Speaker
from app.models.session_speaker import SessionSpeaker
from app.models.presentation_file import PresentationFile
from app.models.presentation_queue import PresentationQueue
from app.models.room_device import RoomDevice
from app.models.srr_station import SRRStation
from app.models.srr_checkin import SRRCheckin
from app.models.operational_control import (
    VenueInstallation, VenueServiceInstance, VenueAlert, VenueIncident,
    VenueBroadcast, VenueOverride, VenueChatMessage, VenueAssetTransfer
)

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

async def seed_operational_venue_data(db: AsyncSession) -> None:
    """Seed comprehensive real-world operational venue dataset if DB is empty or missing rooms."""
    try:
        existing_event = await db.scalar(select(Event).limit(1))
        existing_rooms_count = await db.scalar(select(func.count(Room.id)))

        if existing_rooms_count and existing_rooms_count >= 18:
            logger.info(f"Database already contains {existing_rooms_count} rooms. Checking supplementary NOC tables...")
            await _seed_supplementary_noc_data(db, existing_event)
            return

        logger.info("Seeding complete NOC Venue Operations dataset (18 Rooms, Sessions, Speakers, Devices, SRR, Content)...")
        now = utcnow()

        # 0. Provision Organization if not present
        org = await db.scalar(select(Organization).limit(1))
        if not org:
            org = Organization(
                id=uuid.UUID("88210000-0000-0000-0000-000000000000"),
                name="Eventos Operations",
                slug="eventos-ops",
                plan="enterprise"
            )
            db.add(org)
            await db.flush()

        # 1. Provision or update Event
        if not existing_event:
            event = Event(
                id=uuid.UUID("88210000-0000-0000-0000-000000000001"),
                organization_id=org.id,
                name="India Oncology Congress",
                short_code="IOC-2026",
                start_date=(now - timedelta(days=1)).date(),
                end_date=(now + timedelta(days=2)).date(),
                location="Pragati Maidan, New Delhi",
                venue_name="Pragati Maidan",
                country="India",
                state="Delhi",
                organizer_name="Indian Oncology Society",
                timezone="Asia/Kolkata",
                status="active"
            )
            db.add(event)
            await db.flush()
        else:
            event = existing_event

        event_id = event.id

        # 2. Provision Installation
        install = await db.scalar(select(VenueInstallation).limit(1))
        if not install:
            install = VenueInstallation(
                installation_name="Eventos Pragati Maidan Core",
                provisioned_event_id=event_id,
                setup_status="ready",
                maintenance_mode=False,
                storage_path="/var/eventos/storage",
                backup_path="/var/eventos/backups",
                configuration={"cloud_sync": True, "p2p_distribution": True, "heartbeat_interval_sec": 10}
            )
            db.add(install)

        # 3. Create 18 Operational Rooms
        hall_names = [
            ("Hall 1 - Main Plenary", "Plenary / Keynote", 1200, "Rajesh AV Lead"),
            ("Hall 2 - Surgical Theatre", "Breakout Track", 450, "Suresh Tech"),
            ("Hall 3 - Thoracic Oncology", "Breakout Track", 350, "Kavita AV"),
            ("Hall 4 - Cardiology Update", "Symposium", 500, "Amit Kumar"),
            ("Hall 5 - Pediatric Oncology", "Breakout Track", 300, "Vikram Mod"),
            ("Hall 6 - Immunotherapy Hall", "Workshop", 250, "Pooja Tech"),
            ("Hall 7 - Radiation Oncology", "Breakout Track", 400, "Rahul Sharma"),
            ("Hall 8 - Pathology & Genetics", "Symposium", 350, "Anand Tech"),
            ("Hall 9 - Palliative Care", "Workshop", 200, "Deepak AV"),
            ("Hall 10 - Clinical Trials", "Breakout Track", 300, "Naveen Tech"),
            ("Hall 11 - AI in Medicine", "Symposium", 400, "Rohit Mod"),
            ("Hall 12 - Molecular Oncology", "Breakout Track", 250, "Manish Tech"),
            ("Hall 13 - Robotic Surgery", "Special Session", 300, "Sunil AV"),
            ("Hall 14 - Nursing Oncology", "Workshop", 200, "Priya Tech"),
            ("Hall 15 - Hematology Forum", "Breakout Track", 350, "Alok Tech"),
            ("Hall 16 - Prevention & Screening", "Symposium", 250, "Gaurav AV"),
            ("Hall 17 - Case Presentations", "Interactive", 180, "Vikas Tech"),
            ("Hall 18 - Global Oncology Panel", "Plenary / Panel", 600, "Dinesh AV Lead"),
        ]

        created_rooms = []
        for i, (h_name, h_type, cap, tech) in enumerate(hall_names, start=1):
            existing_room = await db.scalar(select(Room).where(Room.name == h_name))
            if not existing_room:
                room = Room(
                    event_id=event_id,
                    name=h_name,
                    room_type=h_type,
                    capacity=cap,
                    av_technician=tech,
                    is_active=True,
                    display_order=i,
                    location_notes=f"Level {1 if i <= 9 else 2}, Zone {chr(65 + (i % 4))}"
                )
                db.add(room)
                created_rooms.append(room)
            else:
                created_rooms.append(existing_room)

        await db.flush()

        # 4. Create Speakers
        speaker_data = [
            ("Dr. Raj Sharma", "Senior Consultant Oncologist", "Apollo Hospitals", "sharma@apollo.org"),
            ("Dr. Priya Mehta", "Head of Cardiology", "Medanta Heart Institute", "pmehta@medanta.org"),
            ("Dr. Tariq Khan", "Director Surgical Oncology", "Tata Memorial Hospital", "tkhan@tmh.gov.in"),
            ("Dr. Ananya Roy", "Professor of Thoracic Surgery", "AIIMS New Delhi", "aroy@aiims.edu"),
            ("Dr. Vikram Malhotra", "Lead Radiotherapist", "Max Healthcare", "vmalhotra@max.in"),
            ("Dr. Sanjay Gupta", "Clinical Trial Principal", "Fortis Healthcare", "sgupta@fortis.com"),
            ("Dr. Neha Verma", "Pediatric Oncology Specialist", "Sir Ganga Ram Hospital", "nverma@sgrh.com"),
            ("Dr. Arvind Swaminathan", "Head of Molecular Genetics", "NCBS Bengaluru", "aswami@ncbs.res.in")
        ]

        created_speakers = []
        for name, title, affil, email in speaker_data:
            spk = await db.scalar(select(Speaker).where(Speaker.email == email))
            if not spk:
                spk = Speaker(
                    event_id=event_id,
                    first_name=name.split()[1],
                    last_name=name.split()[-1],
                    title=title,
                    affiliation=affil,
                    email=email,
                    phone="+91-9876543210"
                )
                db.add(spk)
                created_speakers.append(spk)
            else:
                created_speakers.append(spk)

        await db.flush()

        # 5. Create Sessions & Presentations across Rooms
        topics = [
            ("Cardiology Update & Cardiac Complications", "S-104", "Cardiology_Final.pptx", 7),
            ("Surgical Margins in Solid Tumors", "S-101", "Surgical_Margins_v4.pptx", 4),
            ("Thoracic CT Biomarkers & Staging", "S-102", "Thoracic_Imaging_2026.pdf", 2),
            ("Immunotherapy Resistance Mechanisms", "S-103", "Immunotherapy_Master.pptx", 5),
            ("Pediatric Leukemia Protocol Review", "S-105", "Pediatric_Leukemia_AIIMS.pptx", 3),
            ("Targeted Radiotherapy in Head & Neck", "S-106", "Radiation_Dose_Planning.pptx", 6),
            ("Pathology AI in Diagnostic Precision", "S-107", "Pathology_AI_Precision.pdf", 1),
            ("Palliative Pain Management Regimens", "S-108", "Palliative_Care_Pain.pptx", 2)
        ]

        for i, room in enumerate(created_rooms):
            topic_idx = i % len(topics)
            sess_title, sess_code, file_name, file_ver = topics[topic_idx]
            speaker = created_speakers[i % len(created_speakers)]

            sess = await db.scalar(select(Session).where(Session.room_id == room.id))
            if not sess:
                start_t = now - timedelta(minutes=25) + timedelta(hours=(i % 3))
                end_t = start_t + timedelta(minutes=45)
                sess = Session(
                    event_id=event_id,
                    room_id=room.id,
                    session_code=f"{sess_code}-{i+1:02d}",
                    name=sess_title,
                    description=f"Key scientific presentation for {room.name}",
                    start_time=start_t,
                    end_time=end_t,
                    status="in_progress" if (start_t <= now <= end_t) else "scheduled"
                )
                db.add(sess)
                await db.flush()

                db.add(SessionSpeaker(session_id=sess.id, speaker_id=speaker.id, role="primary_speaker", sort_order=1))

                pres = PresentationFile(
                    event_id=event_id,
                    session_id=sess.id,
                    speaker_id=speaker.id,
                    original_filename=file_name,
                    file_format="pptx" if file_name.endswith(".pptx") else "pdf",
                    file_size_bytes=1024 * 1024 * (12 + (i * 3)),
                    version_number=file_ver,
                    is_current_version=True,
                    upload_status="approved",
                    local_sync_status="synced" if i != 3 else "transferring",
                    local_cache_path=f"/var/eventos/storage/presentations/{file_name}",
                    file_hash_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    uploaded_at=now - timedelta(minutes=45)
                )
                db.add(pres)
                await db.flush()

                db.add(PresentationQueue(
                    session_id=sess.id,
                    presentation_file_id=pres.id,
                    sort_order=1,
                    queue_status="playing" if sess.status == "in_progress" else "queued"
                ))

        # 6. Create Room Devices (Tech PC, Stage PC, Moderator Tablet)
        for i, room in enumerate(created_rooms, start=1):
            tech_pc = await db.scalar(select(RoomDevice).where(RoomDevice.hostname == f"TECH-PC-{i:02d}"))
            if not tech_pc:
                db.add(RoomDevice(
                    event_id=event_id,
                    room_id=room.id,
                    device_name=f"{room.name} Technical PC",
                    hostname=f"TECH-PC-{i:02d}",
                    device_type="technician_tablet",
                    ip_address=f"192.168.10.{20+i}",
                    mac_address=f"52:54:00:12:34:{i:02x}",
                    status="online",
                    os_version="Windows 11 Pro 23H2",
                    app_version="4.1.0",
                    last_heartbeat_at=now - timedelta(seconds=(i % 15))
                ))
            stage_pc = await db.scalar(select(RoomDevice).where(RoomDevice.hostname == f"STAGE-PC-{i:02d}"))
            if not stage_pc:
                st_status = "offline" if i == 7 else "online"
                st_hb = now - timedelta(minutes=4) if i == 7 else (now - timedelta(seconds=(i % 20)))
                db.add(RoomDevice(
                    event_id=event_id,
                    room_id=room.id,
                    device_name=f"{room.name} Stage Presentation PC",
                    hostname=f"STAGE-PC-{i:02d}",
                    device_type="presentation_pc",
                    ip_address=f"192.168.10.{40+i}",
                    mac_address=f"52:54:00:56:78:{i:02x}",
                    status=st_status,
                    os_version="Windows 11 Pro 23H2",
                    app_version="4.1.0",
                    last_heartbeat_at=st_hb
                ))
            mod_tab = await db.scalar(select(RoomDevice).where(RoomDevice.hostname == f"MOD-TAB-{i:02d}"))
            if not mod_tab:
                db.add(RoomDevice(
                    event_id=event_id,
                    room_id=room.id,
                    device_name=f"{room.name} Moderator Tablet",
                    hostname=f"MOD-TAB-{i:02d}",
                    device_type="moderator_tablet",
                    ip_address=f"192.168.20.{60+i}",
                    mac_address=f"52:54:00:90:ab:{i:02x}",
                    status="online",
                    os_version="Android 14",
                    app_version="2.4.0",
                    last_heartbeat_at=now - timedelta(seconds=(i % 30))
                ))

        # 7. Create SRR Stations (5 Stations)
        srr_configs = [
            (1, "SRR-01", "Dr. Priya Mehta", "Cardiology.pptx", "occupied", "192.168.30.11", 42, 38),
            (2, "SRR-02", None, None, "idle", "192.168.30.12", 12, 28),
            (3, "SRR-03", "Dr. Tariq Khan", "Oncology_Thoracic.pdf", "occupied", "192.168.30.13", 55, 62),
            (4, "SRR-04", None, None, "idle", "192.168.30.14", 15, 91),
            (5, "SRR-05", "Dr. Ananya Roy", "Surgery_Innovations.pptx", "uploading", "192.168.30.15", 68, 54),
        ]

        for st_num, dev_name, spk_name, curr_file, st_status, ip, cpu, d_usage in srr_configs:
            station = await db.scalar(select(SRRStation).where(SRRStation.station_number == st_num))
            if not station:
                station = SRRStation(
                    event_id=event_id,
                    station_number=st_num,
                    device_name=dev_name,
                    ip_address=ip,
                    status=st_status,
                    last_heartbeat=now - timedelta(seconds=12),
                    metadata_json={
                        "cpu_pct": cpu, "ram_pct": cpu + 10, "disk_pct": d_usage,
                        "current_speaker": spk_name, "current_file": curr_file,
                        "agent_version": "3.8.0", "status_text": "Working" if st_status == "occupied" else ("Uploading" if st_status == "uploading" else "Available")
                    }
                )
                db.add(station)

        # 8. Check-in Node & Supplementary NOC Data
        await _seed_supplementary_noc_data(db, event)

        await db.commit()
        logger.info("Successfully seeded operational venue control data.")

    except Exception as e:
        logger.error(f"Error seeding operational venue data: {e}")
        await db.rollback()

async def _seed_supplementary_noc_data(db: AsyncSession, event: Event | None) -> None:
    now = utcnow()
    event_id = event.id if event else uuid.UUID("88210000-0000-0000-0000-000000000001")

    # 1. NOC Service Instances
    services = [
        ("srr-service", "Speaker Ready Room Service", "srr", "192.168.30.10", "3.8.0", "healthy", 5, 18),
        ("room-control", "Room Operations Supervisor", "room_control", "127.0.0.1", "4.1.0", "healthy", 0, 12),
        ("registration-service", "Registration Engine", "registration", "192.168.40.10", "2.4.0", "healthy", 2, 24),
        ("signage-broker", "Digital Signage Manager", "signage", "192.168.50.10", "2.1.0", "degraded", 1, 85),
        ("eposter-hub", "ePoster Interactive Hub", "eposter", "192.168.60.10", "1.9.0", "healthy", 0, 32),
        ("sync-engine", "Cloud Sync Bridge", "sync", "127.0.0.1", "1.0.0", "healthy", 0, 62)
    ]

    for s_key, s_name, s_type, s_host, s_ver, s_stat, s_queue, s_lat in services:
        inst = await db.scalar(select(VenueServiceInstance).where(VenueServiceInstance.service_key == s_key))
        if not inst:
            inst = VenueServiceInstance(
                service_key=s_key,
                display_name=s_name,
                service_type=s_type,
                host=s_host,
                version=s_ver,
                status=s_stat,
                evidence=f"{s_name} operational and responding to control probe.",
                queue_depth=s_queue,
                latency_ms=s_lat,
                last_heartbeat_at=now - timedelta(seconds=10),
                locally_managed=True
            )
            db.add(inst)

    # 2. Operational Alerts
    alerts = [
        ("dedup-hall7-stage-offline", "critical", "active", "device", "STAGE-PC-07", "Hall 7 Stage PC offline", "No heartbeat received in 4 minutes. Stage display is black.", "Reboot stage machine or dispatch technician Rahul."),
        ("dedup-hall4-pres-version", "warning", "active", "content", "A123-v7", "Hall 4 presentation version mismatch", "Stage PC has v6 cached, SRR uploaded v7 at 09:38.", "Force distribute version 7 to Hall 4 Stage."),
        ("dedup-srr4-disk-high", "warning", "active", "srr", "SRR-04", "SRR Station 04 disk 91%", "Free space dropped below 10GB threshold.", "Purge archived session cache on station 04."),
        ("dedup-signage12-reconnect", "warning", "active", "signage", "SCREEN-12", "Signage Screen 12 reconnecting", "WebSocket packet drop on Foyer West display.", "Check Ethernet drop on switch port 14."),
        ("dedup-kiosk3-printer", "warning", "active", "registration", "KIOSK-03", "Registration Kiosk 03 printer unavailable", "Zebra badge printer out of ribbon/paper.", "Replace thermal ribbon cartridge on Kiosk 03.")
    ]

    for d_key, sev, stat, stype, sid, title, evid, sugg in alerts:
        alt = await db.scalar(select(VenueAlert).where(VenueAlert.deduplication_key == d_key))
        if not alt:
            alt = VenueAlert(
                deduplication_key=d_key,
                severity=sev,
                status=stat,
                source_type=stype,
                source_id=sid,
                title=title,
                evidence=evid,
                suggested_action=sugg,
                first_seen_at=now - timedelta(minutes=8),
                last_seen_at=now - timedelta(seconds=45)
            )
            db.add(alt)

    # 3. Active Incident
    inc = await db.scalar(select(VenueIncident).where(VenueIncident.incident_code == "INC-0082"))
    if not inc:
        inc = VenueIncident(
            incident_code="INC-0082",
            title="Hall 7 Stage PC Offline",
            severity="critical",
            status="investigating",
            room_name="Hall 7 - Radiation Oncology",
            device_name="STAGE-PC-07",
            assigned_to="Rahul Sharma (Technician)",
            started_at=now - timedelta(minutes=11),
            timeline=[
                {"time": (now - timedelta(minutes=11)).strftime("%H:%M"), "note": "Stage PC stopped sending heartbeats", "author": "System Monitor"},
                {"time": (now - timedelta(minutes=9)).strftime("%H:%M"), "note": "Rahul Sharma assigned to inspect AV booth power & HDMI loop", "author": "NOC Operator"},
                {"time": (now - timedelta(minutes=4)).strftime("%H:%M"), "note": "Technician on site; power cycled HDMI switch", "author": "Rahul Sharma"}
            ]
        )
        db.add(inc)

    # 4. Asset Distribution Transfers
    files = list((await db.execute(select(PresentationFile).limit(5))).scalars().all())
    for f in files:
        xfer = await db.scalar(select(VenueAssetTransfer).where(VenueAssetTransfer.file_id == f.id))
        if not xfer:
            db.add(VenueAssetTransfer(
                file_id=f.id,
                filename=f.original_filename,
                version_number=f.version_number,
                source_node="SRR-02",
                target_node="Hall 4 Stage",
                target_type="room_stage",
                priority="urgent" if "Cardiology" in f.original_filename else "normal",
                progress_pct=94 if "Cardiology" in f.original_filename else 100,
                status="transferring" if "Cardiology" in f.original_filename else "completed",
                checksum_verified=True if "Cardiology" not in f.original_filename else False
            ))

    # 5. Venue Chat Messages
    chat_sample = [
        ("technical-support", "Amit Kumar", "Room Technician", "HALL04-TECH", "HALL-04", "S-104", "Cardiology v7 file downloaded. Checking presenter remote receiver.", {"latency_ms": 32}),
        ("technical-support", "NOC Admin", "Administrator", None, None, None, "Acknowledged Amit. Stage presentation queued for Hall 4 launch.", {}),
        ("rooms", "Rahul Sharma", "Room Technician", "HALL07-TECH", "HALL-07", "S-106", "Stage PC rebooting now. BIOS display active.", {"status": "rebooting"}),
        ("srr", "SRR Desk Lead", "SRR Manager", "SRR-MASTER", None, None, "Dr. Mehta presentation checked and assigned to SRR-01.", {})
    ]

    for chan, sname, srole, dev_id, r_id, sess_id, msg, meta in chat_sample:
        db.add(VenueChatMessage(
            channel=chan,
            sender_name=sname,
            sender_role=srole,
            device_id=dev_id,
            room_id=r_id,
            session_id=sess_id,
            message=msg,
            metadata_context=meta,
            created_at=now - timedelta(minutes=5)
        ))

    # 6. Active Override
    ovr = await db.scalar(select(VenueOverride).where(VenueOverride.target_name == "Hall 4"))
    if not ovr:
        db.add(VenueOverride(
            target_type="room",
            target_id="HALL-04",
            target_name="Hall 4",
            override_type="forced_session",
            payload={"session_code": "S-104", "enforce_timer": True},
            reason="Session delayed by 10 mins due to previous keynote overflow.",
            authorized_by="NOC Lead Operator",
            is_active=True,
            expires_at=now + timedelta(hours=1)
        ))

    await db.flush()
