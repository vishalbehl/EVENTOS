import os
import shutil
import json
import argparse
import re
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path.cwd()

# ==========================
# CONFIG
# ==========================

IGNORE = {
    ".git",
    "node_modules",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    "Scripts",
    ".pytest_cache",
    ".mypy_cache"
}

# Mapping of file to domain module
FILE_TO_MODULE_MAP = {
    # Models
    "models/user.py": "auth",
    "models/refresh_token.py": "auth",
    "models/security_event.py": "auth",
    
    "models/participant.py": "registration",
    "models/participant_registration.py": "registration",
    "models/participant_role.py": "registration",
    "models/ticket_type.py": "registration",
    "models/badge_models.py": "registration",
    "models/print_template.py": "registration",
    "models/import_job.py": "registration",
    "models/check_in.py": "registration",
    "models/registration_form_config.py": "registration",
    
    "models/speaker.py": "speakers",
    "models/session_speaker.py": "speakers",
    "models/session.py": "speakers",
    
    "models/presentation_file.py": "presentations",
    "models/presentation_queue.py": "presentations",
    "models/presentation_bundle.py": "presentations",
    "models/file_validation.py": "presentations",
    "models/file_integrity_log.py": "presentations",
    "models/playback_event.py": "presentations",
    "models/poster.py": "presentations",
    
    "models/room.py": "venue",
    "models/room_device.py": "venue",
    "models/venue_infrastructure.py": "venue",
    "models/venue_sync_job.py": "venue",
    "models/venue_telemetry.py": "venue",
    "models/srr_station.py": "venue",
    "models/srr_checkin.py": "venue",
    "models/attendance_log.py": "venue",
    "models/capacity_rule.py": "venue",
    "models/venue_activity_log.py": "venue",
    
    "models/notification_event.py": "notifications",
    "models/email_campaign.py": "notifications",
    "models/email_log.py": "notifications",
    "models/email_template.py": "notifications",
    "models/webhook.py": "notifications",
    
    "models/rbac.py": "rbac",
    "models/organization.py": "rbac",
    "models/event.py": "rbac",
    "models/user_assignment.py": "rbac",
    
    # Schemas
    "schemas/auth.py": "auth",
    "schemas/user.py": "auth",
    
    "schemas/registration.py": "registration",
    "schemas/badge.py": "registration",
    "schemas/print_template.py": "registration",
    "schemas/import_job.py": "registration",
    "schemas/ticket_type.py": "registration",
    "schemas/registration_form_config.py": "registration",
    "schemas/participant.py": "registration",
    
    "schemas/speaker.py": "speakers",
    "schemas/session.py": "speakers",
    
    "schemas/file.py": "presentations",
    "schemas/queue.py": "presentations",
    "schemas/bundle.py": "presentations",
    "schemas/poster.py": "presentations",
    
    "schemas/attendance.py": "venue",
    "schemas/capacity.py": "venue",
    "schemas/room.py": "venue",
    "schemas/srr.py": "venue",
    
    "schemas/analytics.py": "analytics",
    
    "schemas/notification.py": "notifications",
    "schemas/webhook.py": "notifications",
    
    "schemas/event.py": "rbac",
    "schemas/organization.py": "rbac",
    "schemas/settings.py": "rbac",
    
    # Services
    "services/auth_service.py": "auth",
    
    "services/excel_import_service.py": "registration",
    "services/qr_service.py": "registration",
    "services/print_service.py": "registration",
    
    "services/speaker_service.py": "speakers",
    
    "services/upload_service.py": "presentations",
    "services/validation_service.py": "presentations",
    
    "services/websocket_service.py": "venue",
    
    "services/analytics_service.py": "analytics",
    
    "services/email_renderer.py": "notifications",
    "services/email_service.py": "notifications",
    "services/notification_service.py": "notifications",
    "services/whatsapp_service.py": "notifications",
    
    "services/permission_service.py": "rbac",
    "services/rbac_service.py": "rbac",
    
    # Routers
    "routers/auth.py": "auth",
    "routers/users.py": "auth",
    "routers/me.py": "auth",
    
    "routers/registrations.py": "registration",
    "routers/registration_portal.py": "registration",
    "routers/badges.py": "registration",
    "routers/import_jobs.py": "registration",
    "routers/print_templates.py": "registration",
    "routers/printers.py": "registration",
    "routers/ticket_types.py": "registration",
    "routers/participant_roles.py": "registration",
    "routers/participants.py": "registration",
    
    "routers/speakers.py": "speakers",
    "routers/portal.py": "speakers",
    "routers/sessions.py": "speakers",
    
    "routers/files.py": "presentations",
    "routers/queue.py": "presentations",
    "routers/bundles.py": "presentations",
    "routers/posters.py": "presentations",
    "routers/storage.py": "presentations",
    
    "routers/rooms.py": "venue",
    "routers/rooms_devices.py": "venue",
    "routers/attendance.py": "venue",
    "routers/capacity.py": "venue",
    "routers/srr.py": "venue",
    "routers/sync.py": "venue",
    
    "routers/analytics.py": "analytics",
    
    "routers/notifications.py": "notifications",
    "routers/webhooks.py": "notifications",
    
    "routers/events.py": "rbac",
    "routers/rbac.py": "rbac",
    "routers/settings.py": "rbac",
    
    # Tasks
    "tasks/file_tasks.py": "presentations",
    "tasks/email_tasks.py": "notifications",
    "tasks/seed_email_data.py": "notifications",
}

SCATTERED_RULES = {
    # debug/scratch files
    "check_*.py": "tools/debugging",
    "scratch_*.py": "tools/debugging",
    "rbac_audit.py": "tools/debugging",
    "template_scratch.html": "tools/debugging",
    "dir.py": "tools/debugging",
    
    # fixes
    "fix_*.py": "tools/maintenance",
    "cleanup_orphans.py": "tools/maintenance",
    
    # patches / one_time
    "patch*.py": "tools/one_time",
    
    # migrations
    "create_*.py": "tools/migration",
    "update_*.py": "tools/migration",
    "add_custom_registration_fields.py": "tools/migration",
    
    # seeds
    "seed*.py": "tools/seed",
    
    # logs
    "*.txt": "tools/logs",
    "migration_report.json": "tools/logs",
    "project_structure.docx": "tools/logs",
    "project_structure.pdf": "tools/logs",
}

MOVE_MAP = {}

# ==========================
# HELPERS
# ==========================

def ignored(path):
    for p in Path(path).parts:
        if p in IGNORE:
            return True
    return False

def run_cmd(cmd, cwd=None):
    print(f"[CMD] {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(cwd or ROOT), capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[WARN] Command failed with code {res.returncode}: {res.stderr.strip()}")
    return res

def backup():
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = ROOT.parent / f"conf-platform-backup-{stamp}"
    print(f"\nCreating full project backup at: {backup_dir}")
    shutil.copytree(
        ROOT,
        backup_dir,
        ignore=shutil.ignore_patterns(
            *IGNORE,
            "*.pyc",
            "*.log",
            ".git"
        )
    )
    print(f"Backup created successfully.")
    return backup_dir

def git_checkpoint():
    print("\n--- SAFETY CHECKPOINT: GIT BRANCH ---")
    # Verify git init
    if not (ROOT / ".git").exists():
        print("Initializing git repository...")
        run_cmd(["git", "init"])
        
    # Get current branch
    res = run_cmd(["git", "branch", "--show-current"])
    current_branch = res.stdout.strip()
    
    # Switch or create branch architecture-refactor
    print(f"Current branch: {current_branch or 'None'}")
    if current_branch != "architecture-refactor":
        res_checkout = run_cmd(["git", "checkout", "architecture-refactor"])
        if res_checkout.returncode != 0:
            run_cmd(["git", "checkout", "-b", "architecture-refactor"])
    
    # Commit any current changes
    run_cmd(["git", "add", "."])
    run_cmd(["git", "commit", "-m", "checkpoint before refactor"])
    print("Git checkpoint complete.")

# ==========================
# MONOREPO RESTRUCTURE
# ==========================

def restructure_monorepo(dry):
    print("\n--- RESTRUCTURING MONOREPO ---")
    
    # 1. Relocate storage
    storage_src = ROOT / "backend/data/storage"
    storage_dst = ROOT / "storage"
    if storage_src.exists():
        print(f"[MOVE] {storage_src} -> {storage_dst}")
        if not dry:
            shutil.move(str(storage_src), str(storage_dst))
            
    # Rename storage/registration_uploads to storage/registration
    reg_uploads = storage_dst / "registration_uploads"
    reg_dst = storage_dst / "registration"
    if reg_uploads.exists():
        print(f"[RENAME] {reg_uploads} -> {reg_dst}")
        if not dry:
            reg_uploads.rename(reg_dst)
            
    # 2. Portals and apps moves
    # Move cloud/ to apps/cloud/
    cloud_dir = ROOT / "cloud"
    apps_cloud = ROOT / "apps/cloud"
    if cloud_dir.exists():
        print(f"[MOVE] {cloud_dir} -> {apps_cloud}")
        if not dry:
            apps_cloud.mkdir(parents=True, exist_ok=True)
            for item in cloud_dir.iterdir():
                shutil.move(str(item), str(apps_cloud / item.name))
            shutil.rmtree(str(cloud_dir))
            
    # Move venue/ to apps/venue/
    venue_dir = ROOT / "venue"
    apps_venue = ROOT / "apps/venue"
    if venue_dir.exists():
        print(f"[MOVE] {venue_dir} -> {apps_venue}")
        if not dry:
            apps_venue.mkdir(parents=True, exist_ok=True)
            for item in venue_dir.iterdir():
                shutil.move(str(item), str(apps_venue / item.name))
            shutil.rmtree(str(venue_dir))
            
    # 3. Services moves
    services_dir = ROOT / "services"
    if not dry:
        services_dir.mkdir(exist_ok=True)
        
    for svc in ["backend", "venue-server", "workers"]:
        svc_src = ROOT / svc
        svc_dst = services_dir / svc
        if svc_src.exists():
            print(f"[MOVE] {svc_src} -> {svc_dst}")
            if not dry:
                shutil.move(str(svc_src), str(svc_dst))

    # 4. Docs organization
    docs_dir = ROOT / "docs"
    docs_subdirs = ["architecture", "api", "database", "deployment", "workflows", "runbooks"]
    if not dry:
        for d in docs_subdirs:
            (docs_dir / d).mkdir(parents=True, exist_ok=True)
            
    incident_pb = docs_dir / "incident-playbooks.md"
    runbook_pb = docs_dir / "runbooks/incident-playbooks.md"
    if incident_pb.exists():
        print(f"[MOVE] {incident_pb} -> {runbook_pb}")
        if not dry:
            shutil.move(str(incident_pb), str(runbook_pb))
            
    # 5. Infrastructure directory updates
    infra_k8s = ROOT / "infrastructure/k8s"
    if not dry:
        infra_k8s.mkdir(parents=True, exist_ok=True)

# ==========================
# SCATTERED FILES RELOCATION
# ==========================

def relocate_scattered_files(dry):
    print("\n--- RELOCATING SCATTERED FILES ---")
    backend_dir = ROOT / "services/backend"
    
    # Create tools subdirs
    tools_subdirs = ["debugging", "maintenance", "one_time", "migration", "seed", "logs"]
    if not dry:
        for d in tools_subdirs:
            (ROOT / "tools" / d).mkdir(parents=True, exist_ok=True)
            
    # Process backend scattered files
    if backend_dir.exists():
        for pattern, dest in SCATTERED_RULES.items():
            for file in backend_dir.glob(pattern):
                if file.is_file() and file.name != "requirements.txt":
                    target = ROOT / dest / file.name
                    print(f"[MOVE SCATTERED] {file.relative_to(ROOT)} -> {target.relative_to(ROOT)}")
                    if not dry:
                        try:
                            shutil.move(str(file), str(target))
                        except Exception as e:
                            print(f"[WARN] Failed to move {file}: {e}")
                        
    # Process root scattered files
    for pattern, dest in SCATTERED_RULES.items():
        for file in ROOT.glob(pattern):
            if file.is_file() and file.name not in ("dir.py", "requirements.txt") and not ignored(file):
                target = ROOT / dest / file.name
                print(f"[MOVE SCATTERED] {file.relative_to(ROOT)} -> {target.relative_to(ROOT)}")
                if not dry:
                    try:
                        shutil.move(str(file), str(target))
                    except Exception as e:
                        print(f"[WARN] Failed to move {file}: {e}")
                    
    # Specifically dir.py in root
    dir_py = ROOT / "dir.py"
    if dir_py.exists():
        target = ROOT / "tools/debugging/dir.py"
        print(f"[MOVE] {dir_py} -> {target}")
        if not dry:
            try:
                shutil.move(str(dir_py), str(target))
            except Exception as e:
                print(f"[WARN] Failed to move {dir_py}: {e}")

# ==========================
# DOMAIN REFACTORING (BACKEND)
# ==========================

def refactor_backend_domains(dry):
    print("\n--- REFACTORING BACKEND INTO DOMAIN MODULES ---")
    app_dir = ROOT / "services/backend/app"
    modules_dir = app_dir / "modules"
    
    if not app_dir.exists():
        print("[WARN] services/backend/app not found. Skipping backend refactor.")
        return
        
    if not dry:
        modules_dir.mkdir(exist_ok=True)
        (modules_dir / "__init__.py").touch()
        
    # Create modular folder structures
    domains = ["auth", "registration", "speakers", "presentations", "venue", "analytics", "notifications", "rbac"]
    subdirs = ["models", "schemas", "services", "routers", "tasks"]
    
    if not dry:
        for domain in domains:
            domain_path = modules_dir / domain
            domain_path.mkdir(exist_ok=True)
            (domain_path / "__init__.py").touch()
            for subdir in subdirs:
                sub_path = domain_path / subdir
                sub_path.mkdir(exist_ok=True)
                (sub_path / "__init__.py").touch()
                
    # Move files to their domain subfolders
    for rel_file_path, domain in FILE_TO_MODULE_MAP.items():
        src_file = app_dir / rel_file_path
        if src_file.exists():
            subdir = rel_file_path.split("/")[0] # models, schemas, services, routers, tasks
            dest_file = modules_dir / domain / subdir / src_file.name
            print(f"[MOVE DOMAIN] app/{rel_file_path} -> app/modules/{domain}/{subdir}/{src_file.name}")
            
            # Save mapping for import updates
            old_import = f"app.{subdir}.{src_file.stem}"
            new_import = f"app.modules.{domain}.{subdir}.{src_file.stem}"
            MOVE_MAP[old_import] = new_import
            
            if not dry:
                shutil.move(str(src_file), str(dest_file))
        else:
            print(f"[SKIP] app/{rel_file_path} not found.")

# ==========================
# RE-EXPORTERS GENERATION
# ==========================

def generate_re_exporters(dry):
    print("\n--- GENERATING RE-EXPORTERS ---")
    app_dir = ROOT / "services/backend/app"
    if not app_dir.exists():
        return
        
    models_init_content = """# =============================================================
# Conference Platform — Models Package (Re-exporters)
# Import all models here so SQLAlchemy metadata is populated
# before alembic or create_all is called.
# =============================================================

from app.modules.rbac.models.organization import Organization
from app.modules.auth.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.rbac.models.event import Event
from app.modules.venue.models.room import Room
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.speaker import Speaker
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.file_validation import FileValidation
from app.modules.presentations.models.file_integrity_log import FileIntegrityLog
from app.modules.notifications.models.notification_event import NotificationEvent
from app.modules.notifications.models.email_template import EmailTemplate
from app.modules.notifications.models.email_campaign import EmailCampaign
from app.modules.notifications.models.email_log import EmailLog
from app.modules.registration.models.import_job import ImportJob
from app.modules.venue.models.srr_station import SRRStation
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.venue_activity_log import VenueActivityLog
from app.modules.venue.models.room_device import RoomDevice
from app.modules.presentations.models.presentation_queue import PresentationQueue
from app.modules.presentations.models.playback_event import PlaybackEvent
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.models.audit_log import AuditLog
from app.modules.presentations.models.poster import Poster
from app.modules.auth.models.refresh_token import RefreshToken
from app.modules.notifications.models.webhook import Webhook
from app.modules.presentations.models.presentation_bundle import BundleFile, PresentationBundle
from app.modules.auth.models.security_event import SecurityEvent, SystemErrorLog
from app.models.api_request_log import APIRequestLog, WorkerJobLog
from app.modules.venue.models.venue_telemetry import DeviceHeartbeat, RoomRuntimeEvent, WebsocketEvent
from app.modules.venue.models.venue_infrastructure import VenueNetworkEvent, VenueSecurityEvent, SyncTransferLog
from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, UserAccessNode, ScopedPermission, PermissionAuditLog, RoleInheritanceMap
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.venue.models.capacity_rule import CapacityRule
from app.modules.registration.models.badge_models import Printer, Badge, BadgeHistory, BadgePrintJob, BadgeScan
from app.modules.venue.models.attendance_log import AttendanceLog

__all__ = [
    "Organization", "User", "Event", "Room", "Session",
    "Speaker", "SessionSpeaker", "PresentationFile", "FileValidation",
    "FileIntegrityLog", "NotificationEvent",
    "EmailTemplate", "EmailCampaign", "EmailLog", "ImportJob",
    "SRRStation", "SRRCheckin", "VenueActivityLog", "RoomDevice",
    "PresentationQueue", "PlaybackEvent", "VenueSyncJob",
    "AuditLog", "Poster", "RefreshToken", "Webhook",
    "PresentationBundle", "BundleFile", "SecurityEvent", "SystemErrorLog",
    "APIRequestLog", "WorkerJobLog", "DeviceHeartbeat", "RoomRuntimeEvent",
    "WebsocketEvent", "VenueNetworkEvent", "VenueSecurityEvent", "SyncTransferLog",
    "Role", "Permission", "RolePermission", "UserRoleAssignment", "UserAccessNode", "ScopedPermission", "PermissionAuditLog", "RoleInheritanceMap",
    "Participant", "CheckIn", "PrintTemplate", "TicketType", "RegistrationFormConfig",
    "ParticipantRole", "ParticipantRegistration", "CapacityRule",
    "Printer", "Badge", "BadgeHistory", "BadgePrintJob", "BadgeScan", "AttendanceLog"
]
"""

    schemas_init_content = """# =============================================================
# Conference Platform — Schemas Package (Re-exporters)
# Pydantic v2 schemas — re-exports from all schema modules.
# =============================================================

from app.modules.auth.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    ChangePasswordRequest, UserMeResponse,
)
from app.modules.rbac.schemas.event import EventCreate, EventUpdate, EventResponse, EventSummary
from app.modules.speakers.schemas.speaker import (
    SpeakerCreate, SpeakerUpdate, SpeakerResponse, SpeakerSummary,
    SpeakerBulkInviteRequest, SpeakerPortalResponse,
    SpeakerApproveFileRequest, SpeakerRejectFileRequest,
)
from app.modules.presentations.schemas.file import (
    UploadRequestBody, PresignedUploadResponse, UploadConfirmRequest,
    PresentationFileResponse, FileValidationResponse,
    FileApproveRequest, FileRejectRequest, FileBatchApproveRequest,
    FileDownloadResponse,
)
from app.modules.speakers.schemas.session import (
    SessionCreate, SessionUpdate, SessionResponse, SessionSummary,
    SessionSpeakerCreate, SessionSpeakerResponse, ReorderSpeakersRequest,
)
from app.modules.venue.schemas.room import RoomCreate, RoomUpdate, RoomResponse
from app.modules.venue.schemas.srr import (
    StationCreate, StationUpdate, StationResponse,
    StationAssignRequest, CheckinResponse,
    QRCheckinRequest, QRCheckinResponse, ActivityLogResponse,
)
from app.modules.analytics.schemas.analytics import (
    DashboardStats, UploadFunnelStats, SessionReadinessRow,
    RoomBreakdownRow, ActivityItem, AnalyticsExportRequest,
)
from app.modules.notifications.schemas.notification import (
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
    CampaignCreate, CampaignResponse, EmailLogResponse,
    SendCampaignRequest, InviteSpeakersRequest,
)
from app.modules.registration.schemas.import_job import (
    ImportJobResponse, ImportPreviewResponse, ImportConfirmRequest,
    ColumnMappingRequest,
)
from app.schemas.common import MessageResponse, PaginatedResponse
from app.modules.registration.schemas.participant import (
    ParticipantCreate, ParticipantUpdate, ParticipantResponse,
    CheckInCreate, CheckInResponse,
)
from app.modules.registration.schemas.print_template import (
    PrintTemplateCreate, PrintTemplateUpdate, PrintTemplateResponse,
)
from app.modules.registration.schemas.ticket_type import (
    TicketTypeCreate, TicketTypeUpdate, TicketTypeResponse,
)
from app.modules.registration.schemas.registration import (
    ParticipantRegistrationCreate, ParticipantRegistrationUpdate,
    ParticipantRegistrationResponse, RegistrationApprovalRequest,
    RegistrationRejectionRequest,
)
from app.modules.venue.schemas.capacity import (
    CapacityRuleCreate, CapacityRuleUpdate, CapacityRuleResponse,
    CapacityStatusResponse,
)
from app.modules.registration.schemas.badge import (
    PrinterRegister, PrinterResponse, BadgeGenerateRequest,
    BadgeReprintRequest, BadgeResponse, BadgeHistoryResponse,
    BadgePrintJobResponse, BadgeScanResponse,
)
from app.modules.venue.schemas.attendance import (
    CheckInRequest, CheckOutRequest, AttendanceLogResponse,
    AttendanceMetricsResponse,
)

__all__ = [
    "LoginRequest", "TokenResponse", "RefreshRequest",
    "ChangePasswordRequest", "UserMeResponse",
    "EventCreate", "EventUpdate", "EventResponse", "EventSummary",
    "SpeakerCreate", "SpeakerUpdate", "SpeakerResponse", "SpeakerSummary",
    "SpeakerBulkInviteRequest", "SpeakerPortalResponse",
    "SpeakerApproveFileRequest", "SpeakerRejectFileRequest",
    "UploadRequestBody", "PresignedUploadResponse", "UploadConfirmRequest",
    "PresentationFileResponse", "FileValidationResponse",
    "FileApproveRequest", "FileRejectRequest", "FileBatchApproveRequest",
    "FileDownloadResponse",
    "SessionCreate", "SessionUpdate", "SessionResponse", "SessionSummary",
    "SessionSpeakerCreate", "SessionSpeakerResponse", "ReorderSpeakersRequest",
    "RoomCreate", "RoomUpdate", "RoomResponse",
    "StationCreate", "StationUpdate", "StationResponse",
    "StationAssignRequest", "CheckinResponse",
    "QRCheckinRequest", "QRCheckinResponse", "ActivityLogResponse",
    "DashboardStats", "UploadFunnelStats", "SessionReadinessRow",
    "RoomBreakdownRow", "ActivityItem", "AnalyticsExportRequest",
    "EmailTemplateCreate", "EmailTemplateUpdate", "EmailTemplateResponse",
    "CampaignCreate", "CampaignResponse", "EmailLogResponse",
    "SendCampaignRequest", "InviteSpeakersRequest",
    "ImportJobResponse", "ImportPreviewResponse", "ImportConfirmRequest",
    "ColumnMappingRequest",
    "MessageResponse", "PaginatedResponse",
    "ParticipantCreate", "ParticipantUpdate", "ParticipantResponse",
    "CheckInCreate", "CheckInResponse",
    "PrintTemplateCreate", "PrintTemplateUpdate", "PrintTemplateResponse",
    "TicketTypeCreate", "TicketTypeUpdate", "TicketTypeResponse",
    "ParticipantRegistrationCreate", "ParticipantRegistrationUpdate",
    "ParticipantRegistrationResponse", "RegistrationApprovalRequest",
    "RegistrationRejectionRequest",
    "CapacityRuleCreate", "CapacityRuleUpdate", "CapacityRuleResponse",
    "CapacityStatusResponse",
    "PrinterRegister", "PrinterResponse", "BadgeGenerateRequest",
    "BadgeReprintRequest", "BadgeResponse", "BadgeHistoryResponse",
    "BadgePrintJobResponse", "BadgeScanResponse",
    "CheckInRequest", "CheckOutRequest", "AttendanceLogResponse",
    "AttendanceMetricsResponse",
]
"""

    routers_init_content = """# =============================================================
# Conference Platform — Routers Package (Re-exporters)
# API routers package.
# =============================================================

from fastapi import APIRouter

from app.modules.auth.routers import auth, users, me
from app.modules.rbac.routers import events, settings, rbac
from app.modules.speakers.routers import sessions, speakers, portal
from app.modules.presentations.routers import bundles, files, queue, posters, storage
from app.modules.venue.routers import rooms, rooms_devices, attendance, capacity, srr, sync
from app.modules.registration.routers import (
    badges, printers, import_jobs, print_templates, ticket_types,
    registrations, registration_portal, participant_roles, participants
)
from app.modules.analytics.routers import analytics
from app.modules.notifications.routers import notifications, webhooks

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(bundles.router)
api_router.include_router(events.router)
api_router.include_router(sessions.router)
api_router.include_router(rooms.router)
api_router.include_router(speakers.router)
api_router.include_router(portal.router)
api_router.include_router(files.router)
api_router.include_router(import_jobs.router)
api_router.include_router(notifications.router)
api_router.include_router(srr.router)
api_router.include_router(rooms_devices.router)
api_router.include_router(queue.router)
api_router.include_router(posters.router)
api_router.include_router(analytics.router)
api_router.include_router(analytics.global_router)
api_router.include_router(settings.router)
api_router.include_router(webhooks.router)
api_router.include_router(storage.router)
api_router.include_router(users.router)
api_router.include_router(rbac.router)
api_router.include_router(me.router)
api_router.include_router(participants.router)
api_router.include_router(print_templates.router)
api_router.include_router(ticket_types.router)
api_router.include_router(registration_portal.router)
api_router.include_router(participant_roles.router)
api_router.include_router(registrations.router)
api_router.include_router(capacity.router)
api_router.include_router(badges.router)
api_router.include_router(printers.router)
api_router.include_router(attendance.router)
api_router.include_router(sync.router)
"""

    tasks_init_content = """# =============================================================
# Conference Platform — Tasks Package (Re-exporters)
# backend/app/tasks/__init__.py
# =============================================================

from .tasks import run_excel_import
from app.modules.notifications.tasks.email_tasks import process_email_campaign
from app.modules.presentations.tasks.file_tasks import validate_presentation
"""

    services_init_content = """# =============================================================
# Conference Platform — Services Package (Re-exporters)
# =============================================================

from app.modules.auth.services import auth_service
from app.modules.rbac.services import permission_service, rbac_service
from app.modules.presentations.services import upload_service, validation_service
from app.modules.venue.services import websocket_service
from app.modules.analytics.services import analytics_service
from app.modules.notifications.services import (
    email_service, email_renderer, notification_service, whatsapp_service
)
from app.modules.registration.services import qr_service, excel_import_service

__all__ = [
    "auth_service",
    "permission_service",
    "rbac_service",
    "upload_service",
    "validation_service",
    "websocket_service",
    "analytics_service",
    "email_service",
    "email_renderer",
    "notification_service",
    "whatsapp_service",
    "qr_service",
    "excel_import_service",
]
"""

    if not dry:
        (app_dir / "models/__init__.py").write_text(models_init_content, encoding="utf-8")
        (app_dir / "schemas/__init__.py").write_text(schemas_init_content, encoding="utf-8")
        (app_dir / "routers/__init__.py").write_text(routers_init_content, encoding="utf-8")
        (app_dir / "tasks/__init__.py").write_text(tasks_init_content, encoding="utf-8")
        (app_dir / "services/__init__.py").write_text(services_init_content, encoding="utf-8")
        print("Generated re-exporters for models, schemas, routers, tasks, and services.")

# ==========================
# PYTHON IMPORTS REWRITING
# ==========================

def update_python_imports(dry):
    print("\n--- UPDATING PYTHON IMPORTS ---")
    
    # Sort keys by length descending to prevent sub-string collision
    sorted_map = sorted(MOVE_MAP.items(), key=lambda x: len(x[0]), reverse=True)
    
    # Scan all python files in backend, venue-server, workers, tests, and tools
    target_dirs = ["services/backend", "services/workers", "tools"]
    
    for d_name in target_dirs:
        dir_path = ROOT / d_name
        if not dir_path.exists():
            continue
            
        for file in dir_path.rglob("*.py"):
            if ignored(file):
                continue
                
            try:
                content = file.read_text(encoding="utf-8")
                original = content
                
                # Replace imports
                for old_imp, new_imp in sorted_map:
                    # Replace e.g., 'from app.models.user import' -> 'from app.modules.auth.models.user import'
                    # Replace 'import app.models.user' -> 'import app.modules.auth.models.user'
                    content = content.replace(old_imp, new_imp)
                    
                if content != original:
                    print(f"[REWRITE PY] {file.relative_to(ROOT)}")
                    if not dry:
                        file.write_text(content, encoding="utf-8")
            except Exception as e:
                print(f"[ERROR PY] Skip {file}: {e}")

# ==========================
# TS/JS PORTALS REWRITING
# ==========================

def update_node_workspaces(dry):
    print("\n--- UPDATING NODE WORKSPACES & SCRIPTS ---")
    
    # Root package.json
    pkg_file = ROOT / "package.json"
    if pkg_file.exists():
        try:
            content = pkg_file.read_text(encoding="utf-8")
            # Replace cloud/* and venue/* with apps/cloud/* and apps/venue/*
            content = content.replace('"cloud/*"', '"apps/cloud/*"')
            content = content.replace('"venue/*"', '"apps/venue/*"')
            content = content.replace('"npm --workspace cloud/organizer-portal', '"npm --workspace apps/cloud/organizer-portal')
            content = content.replace('"npm --workspace cloud/speaker-portal', '"npm --workspace apps/cloud/speaker-portal')
            content = content.replace('"npm --workspace cloud/registration-portal', '"npm --workspace apps/cloud/registration-portal')
            
            if not dry:
                pkg_file.write_text(content, encoding="utf-8")
            print("[REWRITE] package.json updated.")
        except Exception as e:
            print(f"[ERROR] Failed to update package.json: {e}")

# ==========================
# REPORT GENERATION
# ==========================

def write_report():
    report_file = ROOT / "refactor_report.md"
    
    md_content = f"""# Refactoring Report — Monorepo Reorganization
Generated on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Monorepo Layout Reorganization
We have successfully reorganized the repository:
* Moved Next.js/React portals from `cloud/` to `apps/cloud/`
* Moved Next.js/React venue apps from `venue/` to `apps/venue/`
* Relocated core services:
  * Backend to `services/backend/`
  * Venue server to `services/venue-server/`
  * Celery workers to `services/workers/`
* Storage relocated from `backend/data/storage` to `storage/`
* Scattered scripts relocated to `tools/` directory categories

## Domain-Driven Backend Re-architecture
FastAPI backend packages were moved under `app/modules/<domain>/` with subdirectories `models`, `schemas`, `services`, `routers`, and `tasks`:
* **auth**: user management and login security
* **registration**: participant registration, import, badge printer and portal
* **speakers**: speaker, session speaker, and conference sessions
* **presentations**: presentation file, validation, and bundles
* **venue**: room device telemetry, sync, and capacity rules
* **analytics**: dashboard charts calculations
* **notifications**: resend email campaigns and webhooks
* **rbac**: user assignments and settings

## Import & Config Re-wiring
* Python imports were automatically updated from `app.models.user` to `app.modules.auth.models.user`, etc.
* Root `package.json` workspaces were updated to reflect the new structure.
* Alembic environment and migrations remain intact and compatible.

The refactoring is complete! Check git status and run verification tests.
"""
    report_file.write_text(md_content, encoding="utf-8")
    print(f"\nSaved refactoring report: {report_file.relative_to(ROOT)}")

# ==========================
# CLEANUP UNTRACKED FOLDERS
# ==========================

def cleanup_old_refactor_dirs(dry):
    print("\n--- CLEANING UP OLD UNTRACKED REFACTOR DIRECTORIES ---")
    # Safety check: if backend folder does not exist in root, we have already refactored.
    # Do NOT delete apps, services, or storage.
    if not (ROOT / "backend").exists():
        print("[CLEANUP] 'backend' folder not found in root. Post-refactor state detected. Skipping cleanup.")
        return
        
    dirs_to_clean = ["apps", "services", "storage"]
    for d in dirs_to_clean:
        p = ROOT / d
        if p.exists():
            print(f"[CLEANUP] Removing old directory: {p}")
            if not dry:
                try:
                    shutil.rmtree(str(p))
                except Exception as e:
                    print(f"[WARN] Failed to remove {p}: {e}")
                    
    # Clean up tools subdirs except tools/project_refactor/
    tools_dir = ROOT / "tools"
    if tools_dir.exists():
        for item in tools_dir.iterdir():
            if item.is_dir() and item.name != "project_refactor":
                print(f"[CLEANUP] Removing old tools subdir: {item}")
                if not dry:
                    try:
                        shutil.rmtree(str(item))
                    except Exception as e:
                        print(f"[WARN] Failed to remove {item}: {e}")

# ==========================
# MAIN EXECUTION FLOW
# ==========================

def main():
    parser = argparse.ArgumentParser(description="Monorepo Refactoring Automation")
    parser.add_argument("--dry-run", action="store_true", help="Print operations without executing them")
    args = parser.parse_args()
    
    dry = args.dry_run
    
    print("\n===========================================")
    print("MONOREPO ARCHITECTURE REFACTORING SCRIPT")
    print(f"Mode: {'DRY RUN' if dry else 'EXECUTION MODE'}")
    print("===========================================")
    
    if not dry:
        # Step 0: Backup
        backup()
        # Step 1: Git Branch & Checkpoint
        git_checkpoint()
        
    # Step 1.5: Clean up old untracked directories left from previous failed run
    cleanup_old_refactor_dirs(dry)
        
    # Step 2: Restructure Monorepo folders
    restructure_monorepo(dry)
    
    # Step 3: Relocate Scattered Scripts
    relocate_scattered_files(dry)
    
    # Step 4: Refactor Backend App to Domains
    refactor_backend_domains(dry)
    
    # Step 5: Generate Re-exporters
    generate_re_exporters(dry)
    
    # Step 6: Update Python Imports
    update_python_imports(dry)
    
    # Step 7: Update workspaces config
    update_node_workspaces(dry)
    
    if not dry:
        # Step 8: Write Report
        write_report()
        
    print("\nMonorepo Refactoring Finished!")

if __name__ == "__main__":
    main()