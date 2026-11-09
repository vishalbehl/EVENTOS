"""Explicit platform operation audience; no customer membership or wildcard."""
from types import MappingProxyType
from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.rbac.services.access_foundation import lock_revision

# Frozen reviewed operations: adding a commercial operation does not extend
# platform authority automatically. Future staff roles need explicit grants.
PLATFORM_OPERATIONS = MappingProxyType({"SUPER_ADMIN": frozenset({
    "events.planning.manage",
    "registration.manage",
    "registration.read",
    "registration.approve",
    "registration.forms.manage",
    "registration.ticket_types.read",
    "registration.ticket_types.manage",
    "registration.coupons.manage",
    "registration.payments.manage",
    "registration.analytics.view",
    "registration.import",
    "registration.confirmation_qr.manage",
    "registration.checkin",
    "speakers.manage",
    "abstracts.review",
    "abstracts.configure",
    "abstracts.assign_reviewers",
    "abstracts.decide",
    "abstracts.publish",
    "abstracts.export",
    "communications.speaker.send",
    "speakers.profiles.manage",
    "presentations.upload",
    "presentations.versions.create",
    "presentations.validate",
    "eposters.manage",
    "badges.templates.read",
    "badges.templates.manage",
    "certificates.templates.read",
    "certificates.templates.manage",
    "badges.custom_design.manage",
    "certificates.custom_design.manage",
    "badges.qr.manage",
    "certificates.generate",
    "badges.export",
    "communications.email.read",
    "communications.email.send",
    "communications.email_designer.manage",
    "communications.campaign.read",
    "communications.campaign.manage",
    "communications.reminders.manage",
    "communications.bulk_email.send",
    "communications.push.send",
    "communications.whatsapp.send",
    "communications.sms.send",
    "announcements.read",
    "announcements.manage",
    "branding.theme.manage",
    "branding.colors.manage",
    "branding.fonts.manage",
    "branding.logo.manage",
    "website.manage",
    "developer.api.use",
    "developer.webhooks.manage",
    "integrations.manage",
    "presentations.queue.manage",
    "sessions.manage",
    "exports.create",
    "venue.sync",
    "venue.rooms.manage",
    "venue.devices.manage",
    "branding.custom_domain.manage",
    "branding.white_label.publish",
    "branding.custom_login.publish",
})})


async def authorize_platform_operation(db, actor_id, organization_id, operation):
    identity, org = User.__table__, Organization.__table__
    def identity_query():
        return select(identity.c.organization_id, identity.c.platform_role).select_from(identity.join(
            org, org.c.id == identity.c.organization_id)).where(identity.c.id == actor_id,
            identity.c.is_active.is_(True), identity.c.deleted_at.is_(None),
            org.c.is_platform_org.is_(True), org.c.is_active.is_(True), org.c.suspended_at.is_(None))
    found = (await db.execute(identity_query())).first()
    if found is None or operation not in PLATFORM_OPERATIONS.get(found.platform_role, frozenset()):
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    for target in sorted({found.organization_id, organization_id}, key=str):
        async with TenantContextGuard.scoped(db, target):
            await lock_revision(db, target, write=False)
    current = (await db.execute(identity_query())).first()
    if current != found:
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    async with TenantContextGuard.scoped(db, organization_id):
        active = await db.scalar(select(Organization.id).where(Organization.id == organization_id,
            Organization.is_active.is_(True), Organization.suspended_at.is_(None)))
        if active is None:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
