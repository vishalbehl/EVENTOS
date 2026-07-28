"""Code-owned bindings for customer-facing capabilities.

Commercial names and ordering are editable catalogue data. Route, operation,
and meter bindings live in code so an admin edit cannot remove enforcement.
"""

from __future__ import annotations

from typing import Any


def _feature(
    scope: str,
    routes: list[str],
    *,
    value_type: str = "BOOLEAN",
    values: list[str] | None = None,
    operations: list[str] | None = None,
    metric: str | None = None,
    owner: str = "BUSINESS",
    page_gate: bool = True,
    backend_mode: str | None = None,
    availability_note: str | None = None,
    legacy_parent: str | None = None,
) -> dict[str, Any]:
    declared_operations = operations or []
    resolved_backend_mode = backend_mode or ("ENFORCED" if declared_operations else None)
    if resolved_backend_mode not in {
        "ENFORCED",
        "COMPOSITE",
        "READ_ONLY",
        "PROVIDER_REQUIRED",
        "NOT_IMPLEMENTED",
    }:
        raise RuntimeError(
            "Every canonical feature must declare an enforceable operation or "
            f"an explicit backend mode; routes={routes!r}"
        )
    if resolved_backend_mode == "ENFORCED" and not declared_operations:
        raise RuntimeError("ENFORCED features must declare at least one operation")
    if resolved_backend_mode != "ENFORCED" and declared_operations:
        raise RuntimeError(
            f"{resolved_backend_mode} features cannot declare backend operations"
        )
    return {
        "scope": scope,
        "value_type": value_type,
        "allowed_values": values or [],
        "portal_routes": routes,
        "page_gate": page_gate,
        "operations": declared_operations,
        "metric_key": metric,
        "owner_console": owner,
        "backend_mode": resolved_backend_mode,
        "availability_note": availability_note,
        "legacy_parent": legacy_parent,
    }


FEATURE_DEFINITIONS: dict[str, dict[str, Any]] = {
    "FEAT_EVENT_PLANNING": _feature("EVENT", ["/events/:eventId/planning"], operations=["events.planning.manage"]),
    "FEAT_EVENT_WEBSITE": _feature("EVENT", ["/events/:eventId/design-studio/portals"], value_type="TIER", values=["BASIC", "CUSTOMIZABLE", "FULLY_BRANDED"], backend_mode="COMPOSITE", availability_note="The website workspace is composed of independently enforced registration and branding operations."),
    "FEAT_CUSTOM_DOMAIN": _feature("ORGANIZATION", ["/settings"], operations=["branding.custom_domain.manage"], page_gate=False),
    "FEAT_WHITE_LABEL": _feature("BOTH", ["/events/:eventId/design-studio/portals"], operations=["branding.white_label.publish"], page_gate=False),
    "FEAT_REGISTRATION_PORTAL": _feature("EVENT", ["/events/:eventId/registration"], value_type="TIER", values=["BASIC", "ADVANCED", "ENTERPRISE"], operations=["registration.read", "registration.manage", "registration.submit", "registration.approve"]),
    "FEAT_REGISTRATION_FORMS": _feature("EVENT", ["/events/:eventId/registration/form-builder"], value_type="TIER", values=["STANDARD", "CUSTOM"], operations=["registration.forms.manage"]),
    "FEAT_TICKET_CATEGORIES": _feature("EVENT", ["/events/:eventId/registration/settings"], value_type="LIMIT", operations=["registration.ticket_types.read", "registration.ticket_types.manage"], metric="ticket_categories", page_gate=False),
    "FEAT_COUPON_CODES": _feature("EVENT", ["/events/:eventId/registration/financials"], operations=["registration.coupons.manage"], page_gate=False),
    "FEAT_PAYMENT_GATEWAY": _feature("EVENT", ["/events/:eventId/registration/financials"], operations=["registration.payments.manage"], page_gate=False),
    "FEAT_REGISTRATION_ANALYTICS": _feature("EVENT", ["/events/:eventId/registration/dashboard"], value_type="TIER", values=["BASIC", "ADVANCED"], operations=["registration.analytics.view"]),
    "FEAT_BULK_IMPORT": _feature("EVENT", ["/events/:eventId/registration/participants"], operations=["registration.import"], page_gate=False),
    "FEAT_QR_CONFIRMATION": _feature("EVENT", ["/events/:eventId/registration/settings"], operations=["registration.confirmation_qr.manage"], page_gate=False),
    "FEAT_ATTENDEE_CHECKIN": _feature("EVENT", ["/events/:eventId/registration/review"], value_type="TIER", values=["BASIC", "ADVANCED", "ENTERPRISE"], operations=["registration.checkin"]),
    "FEAT_SPEAKER_PORTAL": _feature("EVENT", ["/events/:eventId/speakers"], value_type="TIER", values=["PARTIAL", "FULL"], operations=["speakers.manage"]),
    "FEAT_ABSTRACT_SUBMISSION": _feature("EVENT", ["/events/:eventId/speakers/dashboard", "/events/:eventId/speakers/abstracts"], value_type="TIER", values=["BASIC", "ADVANCED"], operations=["abstracts.submit", "abstracts.review"], page_gate=False),
    "FEAT_FILE_UPLOADS": _feature("EVENT", ["/events/:eventId/speakers/files"], operations=["presentations.upload"], metric="storage_bytes"),
    "FEAT_PRESENTATION_VALIDATION": _feature("EVENT", ["/events/:eventId/speakers/files"], value_type="TIER", values=["BASIC", "ADVANCED"], operations=["presentations.validate"], page_gate=False),
    "FEAT_SPEAKER_DASHBOARD": _feature("EVENT", ["/events/:eventId/speakers/dashboard"], value_type="TIER", values=["BASIC", "ADVANCED"], backend_mode="READ_ONLY", availability_note="The dashboard is a read-only projection over speaker and presentation domains whose mutations are independently enforced."),
    "FEAT_SPEAKER_COMMS": _feature("EVENT", ["/events/:eventId/communication"], value_type="TIER", values=["BASIC", "ADVANCED"], operations=["communications.speaker.send"], page_gate=False, legacy_parent="FEAT_SPEAKER_PORTAL"),
    "FEAT_SPEAKER_PROFILES": _feature("EVENT", ["/events/:eventId/speakers/list"], value_type="TIER", values=["BASIC", "CUSTOMIZABLE", "FULLY_CUSTOM"], operations=["speakers.profiles.manage"], legacy_parent="FEAT_SPEAKER_PORTAL"),
    "FEAT_MULTI_PRESENTATION_VERSIONS": _feature("EVENT", ["/events/:eventId/speakers/files"], operations=["presentations.versions.create"], page_gate=False, legacy_parent="FEAT_FILE_UPLOADS"),
    "FEAT_EPOSTER_MGMT": _feature("EVENT", ["/events/:eventId/speakers/eposters"], operations=["eposters.manage"], metric="eposters"),
    "FEAT_BADGE_TEMPLATES": _feature("EVENT", ["/events/:eventId/design-studio/badges", "/events/:eventId/registration/template-designer"], value_type="LIMIT", operations=["badges.templates.read", "badges.templates.manage"], metric="badge_templates"),
    "FEAT_CERTIFICATE_TEMPLATES": _feature("EVENT", ["/events/:eventId/design-studio/certificates"], value_type="LIMIT", operations=["certificates.templates.read", "certificates.templates.manage"], metric="certificate_templates"),
    "FEAT_CUSTOM_BADGE_DESIGN": _feature("EVENT", ["/events/:eventId/design-studio/badges"], operations=["badges.custom_design.manage"], page_gate=False, legacy_parent="FEAT_BADGE_TEMPLATES"),
    "FEAT_CUSTOM_CERT_DESIGN": _feature("EVENT", ["/events/:eventId/design-studio/certificates"], operations=["certificates.custom_design.manage"], page_gate=False, legacy_parent="FEAT_CERTIFICATE_TEMPLATES"),
    "FEAT_QR_BADGE": _feature("EVENT", ["/events/:eventId/design-studio/badges"], operations=["badges.qr.manage"], page_gate=False, legacy_parent="FEAT_BADGE_TEMPLATES"),
    "FEAT_BULK_BADGE_EXPORT": _feature("EVENT", ["/events/:eventId/design-studio/badges"], operations=["badges.export"], page_gate=False),
    "FEAT_AUTO_CERTIFICATE": _feature("EVENT", ["/events/:eventId/registration/certificates"], operations=["certificates.generate"]),
    "FEAT_EMAIL_NOTIFICATIONS": _feature("EVENT", ["/events/:eventId/communication/notifications"], value_type="LIMIT", operations=["communications.email.read", "communications.email.send"], metric="emails_sent", page_gate=False),
    "FEAT_REMINDER_EMAILS": _feature("EVENT", ["/events/:eventId/communication/emails"], operations=["communications.reminders.manage"], page_gate=False, legacy_parent="FEAT_CAMPAIGN_MGMT"),
    "FEAT_CAMPAIGN_MGMT": _feature("EVENT", ["/events/:eventId/communication/emails", "/events/:eventId/communication/email-designer", "/events/:eventId/design-studio/emails"], operations=["communications.campaign.manage"]),
    "FEAT_BULK_EMAIL": _feature("EVENT", ["/events/:eventId/communication/emails"], operations=["communications.bulk_email.send"], metric="emails_sent", page_gate=False),
    "FEAT_ANNOUNCEMENT_CENTER": _feature("EVENT", ["/events/:eventId/communication/announcements"], operations=["announcements.read", "announcements.manage"]),
    "FEAT_PUSH_NOTIFICATIONS": _feature("EVENT", ["/events/:eventId/communication/notifications"], operations=["communications.push.send"], metric="push_sent", page_gate=False, availability_note="Push delivery requires an active, verified Expo provider configuration owned by Command Center."),
    "FEAT_WHATSAPP": _feature("EVENT", ["/events/:eventId/communication/notifications"], operations=["communications.whatsapp.send"], metric="whatsapp_sent", page_gate=False, availability_note="WhatsApp delivery requires an active, verified Meta Cloud provider configuration owned by Command Center."),
    "FEAT_SMS": _feature("EVENT", ["/events/:eventId/communication/notifications"], operations=["communications.sms.send"], metric="sms_sent", page_gate=False, availability_note="SMS delivery requires an active, verified Twilio provider configuration owned by Command Center."),
    "FEAT_DEFAULT_THEME": _feature("EVENT", ["/events/:eventId/design-studio/theme"], backend_mode="READ_ONLY", availability_note="The default theme is a read-only baseline; paid mutations use the independently enforced customization capabilities."),
    "FEAT_THEME_CUSTOMIZATION": _feature("EVENT", ["/events/:eventId/design-studio/theme"], operations=["branding.theme.manage"], page_gate=False),
    "FEAT_CUSTOM_COLORS": _feature("EVENT", ["/events/:eventId/design-studio/theme"], operations=["branding.colors.manage"], page_gate=False),
    "FEAT_CUSTOM_FONTS": _feature("EVENT", ["/events/:eventId/design-studio/theme"], value_type="TIER", values=["LIMITED", "UNLIMITED"], operations=["branding.fonts.manage"], page_gate=False),
    "FEAT_LOGO_BRANDING": _feature("BOTH", ["/events/:eventId/design-studio/theme"], value_type="TIER", values=["BASIC", "ADVANCED", "WHITE_LABEL"], operations=["branding.logo.manage"], page_gate=False),
    "FEAT_CUSTOM_LOGIN_PAGE": _feature("ORGANIZATION", ["/settings"], operations=["branding.custom_login.publish"], page_gate=False),
    "FEAT_API_ACCESS": _feature("ORGANIZATION", ["/settings"], operations=["developer.api.use"], metric="api_calls", owner="DEVELOPER", page_gate=False),
    "FEAT_WEBHOOK_ACCESS": _feature("BOTH", ["/events/:eventId/developer"], operations=["developer.webhooks.manage"], metric="webhook_deliveries", owner="DEVELOPER"),
    "FEAT_THIRD_PARTY_INTEGRATIONS": _feature("BOTH", ["/events/:eventId/developer"], operations=["integrations.manage"], metric="integration_operations", owner="DEVELOPER", page_gate=False),
    "FEAT_SESSION_QUEUE": _feature("EVENT", ["/events/:eventId/sessions"], operations=["presentations.queue.manage"], page_gate=False),
    "FEAT_SESSION_MANAGEMENT": _feature("EVENT", ["/events/:eventId/sessions"], operations=["sessions.manage"], metric="sessions"),
    "FEAT_COMMUNICATION_CENTER": _feature("EVENT", ["/events/:eventId/communication"], backend_mode="COMPOSITE", availability_note="The communication hub contains independently enforced email, campaign, announcement, and provider capabilities."),
    "FEAT_DATA_EXPORTS": _feature("EVENT", ["/events/:eventId/speakers/export"], operations=["exports.create"], metric="exports"),
    "FEAT_VENUE_SYNC": _feature("EVENT", ["/events/:eventId/sessions/rooms"], operations=["venue.sync", "venue.rooms.manage", "venue.devices.manage"], metric="integration_operations", owner="OPERATIONS"),
    "FEAT_DEDICATED_MANAGER": _feature("ORGANIZATION", ["/help-support"], operations=["support.dedicated_manager"], owner="SUPPORT"),
    "FEAT_SLA": _feature("ORGANIZATION", ["/help-support"], value_type="TIER", values=["STANDARD", "PRIORITY", "MISSION_CRITICAL"], operations=["support.sla.apply"], owner="SUPPORT"),
}


OPERATION_FEATURES: dict[str, str] = {}
for _feature_key, _definition in FEATURE_DEFINITIONS.items():
    for _operation in _definition["operations"]:
        if _operation in OPERATION_FEATURES:
            raise RuntimeError(
                f"Backend operation {_operation!r} is assigned to both "
                f"{OPERATION_FEATURES[_operation]!r} and {_feature_key!r}."
            )
        OPERATION_FEATURES[_operation] = _feature_key


# Auditable code-owned destinations for every canonical operation. CI scans
# these modules for the corresponding literal operation call, so catalogue
# metadata alone can never make an operation appear enforced.
OPERATION_ENFORCEMENT_SITES: dict[str, list[dict[str, str]]] = {
    "events.planning.manage": [{"site": "modules/rbac/routers/events.py:update_event", "mode": "ENFORCE"}],
    "branding.custom_domain.manage": [{"site": "modules/platform/router.py:organization_domain_mutations", "mode": "ENFORCE"}],
    "branding.white_label.publish": [{"site": "modules/platform/organization_console_router.py:branding_publication", "mode": "ENFORCE"}],
    "branding.custom_login.publish": [{"site": "modules/platform/organization_console_router.py:branding_publication", "mode": "ENFORCE"}],
    "registration.manage": [{"site": "modules/registration/routers/participants.py:create_participant", "mode": "ENFORCE"}],
    "registration.read": [{"site": "modules/registration/routers/participants.py:list_participants", "mode": "ENFORCE"}],
    "registration.submit": [{"site": "modules/registration/routers/registrations.py:submit_registration", "mode": "ENFORCE"}],
    "registration.approve": [{"site": "modules/registration/routers/registrations.py:helper_approve_registration", "mode": "ENFORCE"}],
    "registration.forms.manage": [{"site": "modules/registration/routers/registration_portal.py:update_form_config", "mode": "ENFORCE"}],
    "registration.ticket_types.read": [{"site": "modules/registration/routers/participant_roles.py:list_roles", "mode": "ENFORCE"}],
    "registration.ticket_types.manage": [{"site": "modules/registration/routers/participant_roles.py:create_participant_role", "mode": "ENFORCE"}],
    "registration.coupons.manage": [{"site": "modules/registration/routers/payments.py:promo_mutations", "mode": "ENFORCE"}],
    "registration.payments.manage": [{"site": "modules/registration/routers/payments.py:update_payment_config", "mode": "ENFORCE"}],
    "registration.analytics.view": [{"site": "modules/registration/routers/participants.py:registration_analytics", "mode": "ENFORCE"}],
    "registration.import": [{"site": "modules/registration/routers/participants.py:participant_imports", "mode": "ENFORCE"}],
    "registration.confirmation_qr.manage": [{"site": "modules/registration/routers/participants.py:registration_confirmation_qr", "mode": "ENFORCE"}],
    "registration.checkin": [{"site": "modules/venue/routers/attendance.py:attendance_router", "mode": "ENFORCE"}],
    "speakers.manage": [{"site": "modules/speakers/routers/speakers.py:speakers_router", "mode": "ENFORCE"}],
    "abstracts.submit": [{"site": "modules/speakers/routers/portal.py:abstract_submission_mutations", "mode": "ENFORCE"}],
    "abstracts.review": [{"site": "modules/speakers/routers/speakers.py:abstract_review_mutations", "mode": "ENFORCE"}],
    "communications.speaker.send": [{"site": "modules/speakers/routers/speakers.py:speaker_invitation_mutations", "mode": "ENFORCE"}],
    "speakers.profiles.manage": [
        {"site": "modules/speakers/routers/speakers.py:update_speaker", "mode": "ENFORCE"},
        {"site": "modules/speakers/routers/portal.py:speaker_profile_mutations", "mode": "ENFORCE"},
    ],
    "presentations.upload": [{"site": "modules/presentations/routers/files.py:request_upload_url", "mode": "ENFORCE"}],
    "presentations.versions.create": [
        {"site": "modules/presentations/routers/files.py:request_upload_url", "mode": "ENFORCE"},
        {"site": "modules/speakers/routers/portal.py:portal_request_upload_url", "mode": "ENFORCE"},
    ],
    "presentations.validate": [{"site": "modules/presentations/routers/files.py:file_review_mutations", "mode": "ENFORCE"}],
    "eposters.manage": [{"site": "modules/presentations/routers/posters.py:posters_router", "mode": "ENFORCE"}],
    "badges.templates.read": [{"site": "modules/registration/routers/print_templates.py:list_print_templates", "mode": "ENFORCE"}],
    "badges.templates.manage": [{"site": "modules/registration/routers/print_templates.py:_enforce_template_operation", "mode": "ENFORCE"}],
    "certificates.templates.read": [{"site": "modules/registration/routers/print_templates.py:list_print_templates", "mode": "ENFORCE"}],
    "certificates.templates.manage": [{"site": "modules/registration/routers/print_templates.py:_enforce_template_operation", "mode": "ENFORCE"}],
    "badges.custom_design.manage": [{"site": "modules/registration/routers/print_templates.py:_enforce_template_design_operations", "mode": "ENFORCE"}],
    "certificates.custom_design.manage": [{"site": "modules/registration/routers/print_templates.py:_enforce_template_design_operations", "mode": "ENFORCE"}],
    "badges.qr.manage": [{"site": "modules/registration/routers/print_templates.py:_enforce_template_design_operations", "mode": "ENFORCE"}],
    "certificates.generate": [{"site": "modules/registration/routers/print_templates.py:authorize_certificate_generation", "mode": "ENFORCE"}],
    "badges.export": [{"site": "modules/registration/routers/badges.py:export_badge_manifest", "mode": "ENFORCE"}],
    "communications.email.read": [{"site": "modules/notifications/routers/notifications.py:get_analytics", "mode": "ENFORCE"}],
    "communications.email.send": [{"site": "modules/notifications/routers/notifications.py:test_email_template", "mode": "ENFORCE"}],
    "communications.campaign.manage": [{"site": "modules/notifications/routers/notifications.py:campaign_mutations", "mode": "ENFORCE"}],
    "communications.reminders.manage": [{"site": "modules/notifications/routers/notifications.py:create_campaign", "mode": "ENFORCE"}],
    "communications.bulk_email.send": [{"site": "modules/notifications/routers/notifications.py:campaign_send_mutations", "mode": "ENFORCE"}],
    "communications.push.send": [{"site": "modules/notifications/routers/notifications.py:provider_delivery_mutations", "mode": "ENFORCE"}],
    "communications.whatsapp.send": [{"site": "modules/notifications/routers/notifications.py:provider_delivery_mutations", "mode": "ENFORCE"}],
    "communications.sms.send": [{"site": "modules/notifications/routers/notifications.py:provider_delivery_mutations", "mode": "ENFORCE"}],
    "announcements.read": [{"site": "modules/notifications/routers/announcements.py:list_announcements", "mode": "ENFORCE"}],
    "announcements.manage": [{"site": "modules/notifications/routers/announcements.py:announcements_router", "mode": "ENFORCE"}],
    "branding.theme.manage": [{"site": "modules/rbac/routers/events.py:update_event", "mode": "ENFORCE"}],
    "branding.colors.manage": [{"site": "modules/rbac/routers/events.py:update_event", "mode": "ENFORCE"}],
    "branding.fonts.manage": [{"site": "modules/rbac/routers/events.py:update_event", "mode": "ENFORCE"}],
    "branding.logo.manage": [{"site": "modules/rbac/routers/events.py:branding_uploads", "mode": "ENFORCE"}],
    "developer.api.use": [{"site": "modules/developer/routers/developer.py:developer_router", "mode": "ENFORCE"}],
    "developer.webhooks.manage": [{"site": "modules/notifications/routers/webhooks.py:webhooks_router", "mode": "ENFORCE"}],
    "integrations.manage": [{"site": "modules/platform/organization_console_router.py:integration_connection_mutations", "mode": "ENFORCE"}],
    "presentations.queue.manage": [{"site": "modules/presentations/routers/queue.py:queue_router", "mode": "ENFORCE"}],
    "sessions.manage": [{"site": "modules/speakers/routers/sessions.py:sessions_router", "mode": "ENFORCE"}],
    "exports.create": [{"site": "modules/speakers/routers/sessions.py:export_agenda", "mode": "ENFORCE"}],
    "venue.sync": [{"site": "modules/venue/routers/sync.py:venue_sync", "mode": "ENFORCE"}],
    "venue.rooms.manage": [{"site": "modules/venue/routers/rooms.py:rooms_router", "mode": "ENFORCE"}],
    "venue.devices.manage": [{"site": "modules/venue/routers/rooms_devices.py:room_devices_router", "mode": "ENFORCE"}],
    "support.dedicated_manager": [{"site": "modules/platform/support_router.py:create_ticket", "mode": "POLICY"}],
    "support.sla.apply": [{"site": "modules/platform/support_router.py:create_ticket", "mode": "POLICY"}],
}

if set(OPERATION_ENFORCEMENT_SITES) != set(OPERATION_FEATURES):
    missing = sorted(set(OPERATION_FEATURES) - set(OPERATION_ENFORCEMENT_SITES))
    unknown = sorted(set(OPERATION_ENFORCEMENT_SITES) - set(OPERATION_FEATURES))
    raise RuntimeError(
        f"Canonical operation enforcement manifest mismatch; missing={missing}, unknown={unknown}"
    )


# Entitlements answer whether the tenant may use a capability; permissions
# independently answer whether the current actor may perform the operation.
# None is reserved for public/device flows or policy-only evaluation.
OPERATION_PERMISSIONS: dict[str, str | None] = {
    "events.planning.manage": "EVENTS:EDIT",
    "branding.custom_domain.manage": None,
    "branding.white_label.publish": None,
    "branding.custom_login.publish": None,
    "registration.manage": "PARTICIPANTS:CREATE",
    "registration.read": "PARTICIPANTS:VIEW",
    "registration.submit": None,
    "registration.approve": "REGISTRATION:APPROVE",
    "registration.forms.manage": "REG_CONFIG:FORM",
    "registration.ticket_types.read": "REG_CONFIG:VIEW",
    "registration.ticket_types.manage": "REG_CONFIG:EDIT",
    "registration.coupons.manage": "PAYMENTS:PRICING",
    "registration.payments.manage": "PAYMENTS:PRICING",
    "registration.analytics.view": "ANALYTICS:REG_DASHBOARD",
    "registration.import": "PARTICIPANTS:IMPORT",
    "registration.confirmation_qr.manage": "PARTICIPANTS:EDIT",
    "registration.checkin": "CHECKIN:MANUAL",
    "speakers.manage": "SPEAKERS:EDIT",
    "abstracts.submit": None,
    "abstracts.review": "SPEAKERS:EDIT",
    "communications.speaker.send": "CAMPAIGNS:SEND",
    "speakers.profiles.manage": "SPEAKERS:EDIT",
    "presentations.upload": "FILES:CREATE",
    "presentations.versions.create": "FILES:CREATE",
    "presentations.validate": "FILES:APPROVE",
    "eposters.manage": "POSTERS:EDIT",
    "badges.templates.read": "BADGES:VIEW",
    "badges.templates.manage": "BADGES:TEMPLATES",
    "certificates.templates.read": "BADGES:VIEW",
    "certificates.templates.manage": "BADGES:TEMPLATES",
    "badges.custom_design.manage": "BADGES:TEMPLATES",
    "certificates.custom_design.manage": "BADGES:TEMPLATES",
    "badges.qr.manage": "BADGES:TEMPLATES",
    "certificates.generate": "BADGES:GENERATE",
    "badges.export": "BADGES:EXPORT",
    "communications.email.read": "CAMPAIGNS:VIEW",
    "communications.email.send": "CAMPAIGNS:SEND",
    "communications.campaign.manage": "CAMPAIGNS:EDIT",
    "communications.reminders.manage": "CAMPAIGNS:EDIT",
    "communications.bulk_email.send": "CAMPAIGNS:SEND",
    "communications.push.send": "CAMPAIGNS:SEND",
    "communications.whatsapp.send": "CAMPAIGNS:SEND",
    "communications.sms.send": "CAMPAIGNS:SEND",
    "announcements.read": "ANNOUNCEMENTS:VIEW",
    "announcements.manage": "ANNOUNCEMENTS:EDIT",
    "branding.theme.manage": "EVENTS:EDIT",
    "branding.colors.manage": "EVENTS:EDIT",
    "branding.fonts.manage": "EVENTS:EDIT",
    "branding.logo.manage": "EVENTS:EDIT",
    "developer.api.use": "DEVELOPER:API_USE",
    "developer.webhooks.manage": "DEVELOPER:WEBHOOKS_MANAGE",
    "integrations.manage": "DEVELOPER:INTEGRATIONS_MANAGE",
    "presentations.queue.manage": "QUEUE:EDIT",
    "sessions.manage": "SESSIONS:EDIT",
    "exports.create": "ANALYTICS:EXPORT",
    "venue.sync": "DEVICES:EDIT",
    "venue.rooms.manage": "ROOMS:EDIT",
    "venue.devices.manage": "DEVICES:EDIT",
    "support.dedicated_manager": None,
    "support.sla.apply": None,
}

if set(OPERATION_PERMISSIONS) != set(OPERATION_FEATURES):
    raise RuntimeError("Canonical operation permission manifest is incomplete")


def feature_for_operation(operation: str) -> str:
    try:
        return OPERATION_FEATURES[operation]
    except KeyError as exc:
        raise ValueError(f"Unknown canonical capability operation: {operation}") from exc


LIMIT_DEFINITIONS: dict[str, dict[str, str]] = {
    "max_events": {"scope": "ORGANIZATION", "unit": "events", "period": "CONTRACT", "metric_key": "active_events"},
    "max_users": {"scope": "ORGANIZATION", "unit": "users", "period": "CONTRACT", "metric_key": "active_users"},
    "max_event_team_members": {"scope": "EVENT", "unit": "users", "period": "EVENT", "metric_key": "event_team_members"},
    "max_registrations": {"scope": "EVENT", "unit": "registrations", "period": "EVENT", "metric_key": "registrations"},
    "max_speakers": {"scope": "EVENT", "unit": "speakers", "period": "EVENT", "metric_key": "speakers"},
    "max_sessions": {"scope": "EVENT", "unit": "sessions", "period": "EVENT", "metric_key": "sessions"},
    "max_rooms": {"scope": "EVENT", "unit": "rooms", "period": "EVENT", "metric_key": "rooms"},
    "max_ticket_categories": {"scope": "EVENT", "unit": "ticket_categories", "period": "EVENT", "metric_key": "ticket_categories"},
    "max_badge_templates": {"scope": "EVENT", "unit": "templates", "period": "EVENT", "metric_key": "badge_templates"},
    "max_certificate_templates": {"scope": "EVENT", "unit": "templates", "period": "EVENT", "metric_key": "certificate_templates"},
    "max_emails_per_event": {"scope": "EVENT", "unit": "messages", "period": "EVENT", "metric_key": "emails_sent"},
    "storage_quota_mb": {"scope": "EVENT", "unit": "megabytes", "period": "EVENT", "metric_key": "storage_bytes"},
    "max_sms_per_event": {"scope": "EVENT", "unit": "messages", "period": "EVENT", "metric_key": "sms_sent"},
    "max_whatsapp_per_event": {"scope": "EVENT", "unit": "messages", "period": "EVENT", "metric_key": "whatsapp_sent"},
    "max_push_per_event": {"scope": "EVENT", "unit": "messages", "period": "EVENT", "metric_key": "push_sent"},
    "max_api_calls_per_month": {"scope": "ORGANIZATION", "unit": "requests", "period": "BILLING_PERIOD", "metric_key": "api_calls"},
    "max_webhook_deliveries_per_month": {"scope": "ORGANIZATION", "unit": "deliveries", "period": "BILLING_PERIOD", "metric_key": "webhook_deliveries"},
    "max_integrations": {"scope": "ORGANIZATION", "unit": "integrations", "period": "CONTRACT", "metric_key": "active_integrations"},
    "max_exports_per_event": {"scope": "EVENT", "unit": "exports", "period": "EVENT", "metric_key": "exports"},
    "max_devices_per_event": {"scope": "EVENT", "unit": "devices", "period": "EVENT", "metric_key": "devices"},
}

# Code-owned reservation destinations for every quantitative entitlement.
# PROVIDER_REQUIRED means the catalogue/portal state exists but no customer
# operation can run until an approved delivery provider is configured.
LIMIT_ENFORCEMENT_SITES: dict[str, dict[str, Any]] = {
    "max_events": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/rbac/routers/events.py:create_event", "mode": "RESERVE_CONSUME"}],
    },
    "max_users": {
        "status": "ENFORCED",
        "sites": [
            {"site": "modules/rbac/routers/organisations.py:invite_member", "mode": "RESERVE_CONSUME"},
            {"site": "modules/identity/routers/users.py:create_user", "mode": "RESERVE_CONSUME"},
        ],
    },
    "max_event_team_members": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/identity/routers/users.py:create_assignment", "mode": "RESERVE_CONSUME"}],
    },
    "max_registrations": {
        "status": "ENFORCED",
        "sites": [
            {"site": "modules/registration/routers/participants.py:create_participant", "mode": "RESERVE_CONSUME"},
            {"site": "modules/registration/routers/registrations.py:approve_registration", "mode": "RESERVE_CONSUME"},
        ],
    },
    "max_speakers": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/speakers/routers/speakers.py:create_speaker", "mode": "RESERVE_CONSUME"}],
    },
    "max_sessions": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/speakers/routers/sessions.py:create_session", "mode": "RESERVE_CONSUME"}],
    },
    "max_rooms": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/venue/routers/rooms.py:create_room", "mode": "RESERVE_CONSUME"}],
    },
    "max_ticket_categories": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/registration/routers/participant_roles.py:create_participant_role", "mode": "RESERVE_CONSUME"}],
    },
    "max_badge_templates": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/registration/routers/print_templates.py:create_template", "mode": "RESERVE_CONSUME"}],
    },
    "max_certificate_templates": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/registration/routers/print_templates.py:create_template", "mode": "RESERVE_CONSUME"}],
    },
    "max_emails_per_event": {
        "status": "ENFORCED",
        "sites": [
            {"site": "modules/notifications/tasks/email_tasks.py:process_email_campaign", "mode": "RESERVE_CONSUME"},
            {"site": "modules/notifications/routers/notifications.py:send_single_email", "mode": "RESERVE_CONSUME"},
        ],
    },
    "storage_quota_mb": {
        "status": "ENFORCED",
        "sites": [
            {"site": "modules/presentations/routers/files.py:request_upload_url", "mode": "RESERVE_CONSUME"},
            {"site": "modules/speakers/routers/portal.py:request_upload", "mode": "RESERVE_CONSUME"},
        ],
    },
    "max_sms_per_event": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/notifications/routers/notifications.py:provider_delivery_mutations", "mode": "RESERVE_CONSUME"}],
    },
    "max_whatsapp_per_event": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/notifications/routers/notifications.py:provider_delivery_mutations", "mode": "RESERVE_CONSUME"}],
    },
    "max_push_per_event": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/notifications/routers/notifications.py:provider_delivery_mutations", "mode": "RESERVE_CONSUME"}],
    },
    "max_api_calls_per_month": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/developer/services/developer_service.py:authenticate_api_key", "mode": "RESERVE_CONSUME"}],
    },
    "max_webhook_deliveries_per_month": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/notifications/routers/webhooks.py:deliver_webhook", "mode": "RESERVE_CONSUME"}],
    },
    "max_integrations": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/developer/routers/developer.py:create_integration", "mode": "RESERVE_CONSUME"}],
    },
    "max_exports_per_event": {
        "status": "ENFORCED",
        "sites": [
            {"site": "modules/analytics/routers/analytics.py:export_event_analytics", "mode": "RESERVE_CONSUME"},
            {"site": "modules/registration/routers/badges.py:export_badges", "mode": "RESERVE_CONSUME"},
        ],
    },
    "max_devices_per_event": {
        "status": "ENFORCED",
        "sites": [{"site": "modules/venue/routers/rooms_devices.py:create_device", "mode": "RESERVE_CONSUME"}],
    },
}

if set(LIMIT_ENFORCEMENT_SITES) != set(LIMIT_DEFINITIONS):
    raise RuntimeError("Canonical limit enforcement manifest is incomplete")

# Absolute safety bounds are code-owned enforcement policy, not commercial
# allocations. Plans, add-ons, and overrides may grant less, but never more.
PLATFORM_HARD_CEILINGS: dict[str, int] = {
    "max_events": 10_000,
    "max_users": 1_000_000,
    "max_event_team_members": 100_000,
    "max_registrations": 10_000_000,
    "max_speakers": 100_000,
    "max_sessions": 100_000,
    "max_rooms": 10_000,
    "max_ticket_categories": 10_000,
    "max_badge_templates": 10_000,
    "max_certificate_templates": 10_000,
    "max_emails_per_event": 100_000_000,
    "storage_quota_mb": 10_485_760,
    "max_sms_per_event": 10_000_000,
    "max_whatsapp_per_event": 10_000_000,
    "max_push_per_event": 100_000_000,
    "max_api_calls_per_month": 1_000_000_000,
    "max_webhook_deliveries_per_month": 1_000_000_000,
    "max_integrations": 10_000,
    "max_exports_per_event": 1_000_000,
    "max_devices_per_event": 100_000,
}

CATALOG_LIMIT_KEYS: dict[str, str] = {
    "LIMIT_EVENTS": "max_events",
    "LIMIT_ORGANIZER_USERS": "max_users",
    "LIMIT_EVENT_TEAM_MEMBERS": "max_event_team_members",
    "LIMIT_REGISTRATIONS": "max_registrations",
    "LIMIT_SPEAKERS": "max_speakers",
    "LIMIT_SESSIONS": "max_sessions",
    "LIMIT_ROOMS": "max_rooms",
    "LIMIT_STORAGE": "storage_quota_mb",
    "FEAT_TICKET_CATEGORIES": "max_ticket_categories",
    "FEAT_BADGE_TEMPLATES": "max_badge_templates",
    "FEAT_CERTIFICATE_TEMPLATES": "max_certificate_templates",
    "FEAT_EMAIL_NOTIFICATIONS": "max_emails_per_event",
    "LIMIT_SMS": "max_sms_per_event",
    "LIMIT_WHATSAPP": "max_whatsapp_per_event",
    "LIMIT_PUSH": "max_push_per_event",
    "LIMIT_API_CALLS_MONTHLY": "max_api_calls_per_month",
    "LIMIT_WEBHOOK_DELIVERIES_MONTHLY": "max_webhook_deliveries_per_month",
    "LIMIT_INTEGRATIONS": "max_integrations",
    "LIMIT_EXPORTS": "max_exports_per_event",
    "LIMIT_DEVICES": "max_devices_per_event",
}


def registry_coverage() -> dict[str, Any]:
    return {
        "features": FEATURE_DEFINITIONS,
        "limits": LIMIT_DEFINITIONS,
        "limit_enforcement_sites": LIMIT_ENFORCEMENT_SITES,
        "platform_hard_ceilings": PLATFORM_HARD_CEILINGS,
        "catalog_limit_keys": CATALOG_LIMIT_KEYS,
        "operation_features": OPERATION_FEATURES,
        "operation_enforcement_sites": OPERATION_ENFORCEMENT_SITES,
        "operation_permissions": OPERATION_PERMISSIONS,
        "feature_count": len(FEATURE_DEFINITIONS),
        "limit_count": len(LIMIT_DEFINITIONS),
    }
