# =============================================================
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
