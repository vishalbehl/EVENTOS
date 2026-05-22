"""API routers package."""

from fastapi import APIRouter

from app.routers import (
    analytics,
    auth,
    bundles,
    events,
    files,
    import_jobs,
    notifications,
    posters,
    queue,
    rooms,
    rooms_devices,
    sessions,
    settings,
    speakers,
    portal,
    srr,
    webhooks,
    storage,
    users,
    rbac,
    me,
    participants,
    print_templates,
    ticket_types,
    registration_portal,
    participant_roles,
    registrations,
    capacity,
    badges,
    printers,
    attendance,
    sync,
)

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



