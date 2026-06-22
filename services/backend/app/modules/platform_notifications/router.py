from fastapi import APIRouter
from app.modules.platform_notifications.deliveries.router import router as inbox_router
from app.modules.platform_notifications.templates.router import router as templates_router
from app.modules.platform_notifications.preferences.router import router as preferences_router
from app.modules.platform_notifications.announcements.router import router as announcements_router
from app.modules.platform_notifications.webhooks.router import router as webhooks_router
from app.modules.platform_notifications.logs.router import router as logs_router
from app.modules.platform_notifications.events.router import router as events_router

router = APIRouter(prefix="/platform/notifications")

router.include_router(inbox_router)
router.include_router(templates_router)
router.include_router(preferences_router)
router.include_router(announcements_router)
router.include_router(webhooks_router)
router.include_router(logs_router)
router.include_router(events_router)
