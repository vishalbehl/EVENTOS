"""Install the 2026 PDF catalogue additions and default organisation teams.

Revision ID: 20261104_3690
Revises: 20261102_3680

Existing published offer versions are immutable.  This migration therefore
adds only missing offers from the approved pricing document; it never edits a
published price, entitlement, contract snapshot, or allocation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import uuid

from alembic import op
import sqlalchemy as sa


revision = "20261104_3690"
down_revision = "20261102_3680"
branch_labels = None
depends_on = None


Entitlement = tuple[str, str, int | None, str]
Offer = tuple[
    str, str, str, str, str, bool, int,
    tuple[tuple[str, str, int], ...],
    tuple[Entitlement, ...],
]


def _addon(
    code: str,
    family: str,
    name: str,
    description: str,
    scope: str,
    quote_only: bool,
    order: int,
    amount: int,
    entitlement_key: str,
    quantity: int,
    unit: str,
) -> Offer:
    return (
        code, family, name, name, description, quote_only, order,
        (("ONE_TIME", "BUNDLE", amount),),
        ((entitlement_key, scope, quantity, unit),),
    )


OFFERS: tuple[Offer, ...] = (
    # Complete core catalogue.  These rows are normally installed by 2400;
    # including them here repairs development databases where catalogue data
    # was cleared without inventing a new version for offers that still exist.
    ("WORKSPACE_FREE", "WORKSPACE", "Free", "Workspace Free", "Permanent workspace for individuals getting started.", False, 1, (("MONTHLY", "ACCOUNT", 0),), (("active_events", "ORGANIZATION", 1, "events"), ("team_members", "ORGANIZATION", 1, "users"), ("organization_email_credits", "ORGANIZATION", 500, "recipients"))),
    ("WORKSPACE_BASIC", "WORKSPACE", "Basic", "Workspace Basic", "Core organization workspace for small teams.", False, 2, (("MONTHLY", "ACCOUNT", 1_499), ("ANNUAL", "ACCOUNT", 14_999)), (("active_events", "ORGANIZATION", 10, "events"), ("team_members", "ORGANIZATION", 5, "users"), ("organization_email_credits", "ORGANIZATION", 500, "recipients"))),
    ("WORKSPACE_PROFESSIONAL", "WORKSPACE", "Professional", "Workspace Professional", "Advanced organization workspace for growing teams.", False, 3, (("MONTHLY", "ACCOUNT", 2_999), ("ANNUAL", "ACCOUNT", 29_999)), (("active_events", "ORGANIZATION", 50, "events"), ("team_members", "ORGANIZATION", 15, "users"), ("organization_email_credits", "ORGANIZATION", 1_500, "recipients"))),
    ("WORKSPACE_PRO", "WORKSPACE", "Pro", "Workspace Pro", "Full organization workspace governance and automation.", False, 4, (("MONTHLY", "ACCOUNT", 5_999), ("ANNUAL", "ACCOUNT", 59_999)), (("active_events", "ORGANIZATION", None, "events"), ("team_members", "ORGANIZATION", 25, "users"), ("organization_email_credits", "ORGANIZATION", 3_000, "recipients"))),
    ("WORKSPACE_ENTERPRISE", "WORKSPACE", "Enterprise", "Workspace Enterprise", "Custom users, email quota, security, integrations and retention.", True, 5, (("ANNUAL", "ACCOUNT", 0),), ()),
    ("EVENT_BASIC", "EVENT", "Basic", "Event Basic", "Core event operations.", False, 11, (("PER_EVENT", "EVENT", 9_999),), (("registrations", "EVENT", 250, "records"), ("abstracts", "EVENT", 50, "records"), ("speakers", "EVENT", 25, "profiles"), ("storage_gb", "EVENT", 5, "gb"), ("event_email_credits", "EVENT", 2_500, "recipients"))),
    ("EVENT_PROFESSIONAL", "EVENT", "Professional", "Event Professional", "Advanced event operations.", False, 12, (("PER_EVENT", "EVENT", 24_999),), (("registrations", "EVENT", 1_000, "records"), ("abstracts", "EVENT", 250, "records"), ("speakers", "EVENT", 100, "profiles"), ("storage_gb", "EVENT", 25, "gb"), ("event_email_credits", "EVENT", 10_000, "recipients"))),
    ("EVENT_PRO", "EVENT", "Pro", "Event Pro", "Full event operations.", False, 13, (("PER_EVENT", "EVENT", 49_999),), (("registrations", "EVENT", 3_000, "records"), ("abstracts", "EVENT", 1_000, "records"), ("speakers", "EVENT", 300, "profiles"), ("storage_gb", "EVENT", 75, "gb"), ("event_email_credits", "EVENT", 30_000, "recipients"))),
    ("EVENT_ENTERPRISE", "EVENT", "Enterprise", "Event Enterprise", "Custom event capacity and scope.", True, 14, (("PER_EVENT", "EVENT", 0),), ()),
    ("EMC_BASIC", "EMC", "Basic", "EMC Basic", "Annual pooled EMC platform.", True, 21, (("ANNUAL", "YEAR", 150_000),), (("annual_events", "EMC", 5, "events"), ("annual_registrations", "EMC", 5_000, "records"), ("annual_storage_gb", "EMC", 100, "gb"), ("annual_email_credits", "EMC", 60_000, "recipients"), ("client_workspaces", "EMC", 5, "workspaces"))),
    ("EMC_PROFESSIONAL", "EMC", "Professional", "EMC Professional", "Advanced annual pooled EMC platform.", True, 22, (("ANNUAL", "YEAR", 300_000),), (("annual_events", "EMC", 10, "events"), ("annual_registrations", "EMC", 15_000, "records"), ("annual_storage_gb", "EMC", 300, "gb"), ("annual_email_credits", "EMC", 200_000, "recipients"), ("client_workspaces", "EMC", 10, "workspaces"))),
    ("EMC_PRO", "EMC", "Pro", "EMC Pro", "Full annual pooled EMC platform.", True, 23, (("ANNUAL", "YEAR", 600_000),), (("annual_events", "EMC", 25, "events"), ("annual_registrations", "EMC", 35_000, "records"), ("annual_storage_gb", "EMC", 1_000, "gb"), ("annual_email_credits", "EMC", 400_000, "recipients"), ("client_workspaces", "EMC", 25, "workspaces"))),
    ("EMC_ENTERPRISE", "EMC", "Enterprise", "EMC Enterprise", "Custom annual EMC pool and scope.", True, 24, (("ANNUAL", "YEAR", 0),), ()),
    _addon("EVENT_REGISTRATIONS_250", "CAPACITY_ADDON", "Event registrations +250", "Additional event registrations.", "EVENT", False, 91, 750, "registrations", 250, "records"),
    _addon("EVENT_ABSTRACTS_250", "CAPACITY_ADDON", "Event abstracts +250", "Additional event abstracts.", "EVENT", False, 92, 1_500, "abstracts", 250, "records"),
    _addon("EVENT_SPEAKERS_25", "CAPACITY_ADDON", "Event speakers +25", "Additional event speaker profiles.", "EVENT", False, 93, 750, "speakers", 25, "profiles"),
    _addon("EVENT_STORAGE_25GB", "CAPACITY_ADDON", "Event storage +25GB", "Additional event storage.", "EVENT", False, 94, 750, "storage_gb", 25, "gb"),
    _addon("EVENT_EMAIL_10K", "CAPACITY_ADDON", "EventOS email +10K", "Additional EventOS email credits.", "EVENT", False, 95, 750, "event_email_credits", 10_000, "recipients"),
    _addon("EMC_EVENTS_5", "CAPACITY_ADDON", "EMC events +5/year", "Additional EMC annual event allocation.", "EMC", True, 191, 35_000, "annual_events", 5, "events"),
    _addon("EMC_REGISTRATIONS_5000", "CAPACITY_ADDON", "EMC registrations +5,000/year", "Additional EMC annual registration allocation.", "EMC", True, 192, 15_000, "annual_registrations", 5_000, "records"),
    _addon("EMC_STORAGE_250GB", "CAPACITY_ADDON", "EMC storage +250GB/year", "Additional EMC annual storage allocation.", "EMC", True, 193, 5_000, "annual_storage_gb", 250, "gb"),
    _addon("EMC_EMAIL_100K", "CAPACITY_ADDON", "EMC email +100K/year", "Additional EMC annual email allocation.", "EMC", True, 194, 2_500, "annual_email_credits", 100_000, "recipients"),
    _addon("EMC_WORKSPACES_5", "CAPACITY_ADDON", "EMC workspaces +5/year", "Additional EMC client workspaces.", "EMC", True, 195, 15_000, "client_workspaces", 5, "workspaces"),
    # Remaining organiser event capacity bundles (PDF section 03.4).
    _addon("EVENT_REGISTRATIONS_1000", "CAPACITY_ADDON", "Event registrations +1,000", "Additional event registrations.", "EVENT", False, 101, 2_000, "registrations", 1_000, "records"),
    _addon("EVENT_REGISTRATIONS_5000", "CAPACITY_ADDON", "Event registrations +5,000", "Additional event registrations.", "EVENT", False, 102, 8_000, "registrations", 5_000, "records"),
    _addon("EVENT_REGISTRATIONS_10000", "CAPACITY_ADDON", "Event registrations +10,000", "Additional event registrations.", "EVENT", False, 103, 15_000, "registrations", 10_000, "records"),
    _addon("EVENT_ABSTRACTS_500", "CAPACITY_ADDON", "Event abstracts +500", "Additional event abstracts.", "EVENT", False, 111, 2_500, "abstracts", 500, "records"),
    _addon("EVENT_ABSTRACTS_1000", "CAPACITY_ADDON", "Event abstracts +1,000", "Additional event abstracts.", "EVENT", False, 112, 4_500, "abstracts", 1_000, "records"),
    _addon("EVENT_ABSTRACTS_2500", "CAPACITY_ADDON", "Event abstracts +2,500", "Additional event abstracts.", "EVENT", False, 113, 9_000, "abstracts", 2_500, "records"),
    _addon("EVENT_SPEAKERS_50", "CAPACITY_ADDON", "Event speakers +50", "Additional event speaker profiles.", "EVENT", False, 121, 1_250, "speakers", 50, "profiles"),
    _addon("EVENT_SPEAKERS_100", "CAPACITY_ADDON", "Event speakers +100", "Additional event speaker profiles.", "EVENT", False, 122, 2_000, "speakers", 100, "profiles"),
    _addon("EVENT_SPEAKERS_250", "CAPACITY_ADDON", "Event speakers +250", "Additional event speaker profiles.", "EVENT", False, 123, 4_000, "speakers", 250, "profiles"),
    _addon("EVENT_SPEAKERS_500", "CAPACITY_ADDON", "Event speakers +500", "Additional event speaker profiles.", "EVENT", False, 124, 7_500, "speakers", 500, "profiles"),
    _addon("EVENT_STORAGE_100GB", "CAPACITY_ADDON", "Event storage +100GB", "Additional event storage.", "EVENT", False, 131, 2_000, "storage_gb", 100, "gb"),
    _addon("EVENT_STORAGE_250GB", "CAPACITY_ADDON", "Event storage +250GB", "Additional event storage.", "EVENT", False, 132, 4_500, "storage_gb", 250, "gb"),
    _addon("EVENT_STORAGE_500GB", "CAPACITY_ADDON", "Event storage +500GB", "Additional event storage.", "EVENT", False, 133, 7_500, "storage_gb", 500, "gb"),
    _addon("EVENT_EMAIL_25K", "CAPACITY_ADDON", "EventOS email +25K", "Additional EventOS email credits.", "EVENT", False, 141, 1_500, "event_email_credits", 25_000, "recipients"),
    _addon("EVENT_EMAIL_50K", "CAPACITY_ADDON", "EventOS email +50K", "Additional EventOS email credits.", "EVENT", False, 142, 2_500, "event_email_credits", 50_000, "recipients"),
    _addon("EVENT_EMAIL_100K", "CAPACITY_ADDON", "EventOS email +100K", "Additional EventOS email credits.", "EVENT", False, 143, 4_000, "event_email_credits", 100_000, "recipients"),
    _addon("EVENT_EMAIL_250K", "CAPACITY_ADDON", "EventOS email +250K", "Additional EventOS email credits.", "EVENT", False, 144, 8_500, "event_email_credits", 250_000, "recipients"),
    _addon("EVENT_EMAIL_500K", "CAPACITY_ADDON", "EventOS email +500K", "Additional EventOS email credits.", "EVENT", False, 145, 15_000, "event_email_credits", 500_000, "recipients"),
    # Remaining annual EMC pooled-capacity bundles (PDF section 04.5).
    _addon("EMC_EVENTS_10", "CAPACITY_ADDON", "EMC events +10/year", "Additional EMC annual event allocation.", "EMC", True, 201, 65_000, "annual_events", 10, "events"),
    _addon("EMC_EVENTS_25", "CAPACITY_ADDON", "EMC events +25/year", "Additional EMC annual event allocation.", "EMC", True, 202, 150_000, "annual_events", 25, "events"),
    _addon("EMC_EVENTS_50", "CAPACITY_ADDON", "EMC events +50/year", "Additional EMC annual event allocation.", "EMC", True, 203, 275_000, "annual_events", 50, "events"),
    _addon("EMC_REGISTRATIONS_10000", "CAPACITY_ADDON", "EMC registrations +10,000/year", "Additional EMC annual registration allocation.", "EMC", True, 211, 25_000, "annual_registrations", 10_000, "records"),
    _addon("EMC_REGISTRATIONS_25000", "CAPACITY_ADDON", "EMC registrations +25,000/year", "Additional EMC annual registration allocation.", "EMC", True, 212, 60_000, "annual_registrations", 25_000, "records"),
    _addon("EMC_REGISTRATIONS_50000", "CAPACITY_ADDON", "EMC registrations +50,000/year", "Additional EMC annual registration allocation.", "EMC", True, 213, 100_000, "annual_registrations", 50_000, "records"),
    _addon("EMC_STORAGE_500GB", "CAPACITY_ADDON", "EMC storage +500GB/year", "Additional EMC annual storage allocation.", "EMC", True, 221, 9_000, "annual_storage_gb", 500, "gb"),
    _addon("EMC_STORAGE_1TB", "CAPACITY_ADDON", "EMC storage +1TB/year", "Additional EMC annual storage allocation.", "EMC", True, 222, 16_000, "annual_storage_gb", 1_000, "gb"),
    _addon("EMC_STORAGE_2TB", "CAPACITY_ADDON", "EMC storage +2TB/year", "Additional EMC annual storage allocation.", "EMC", True, 223, 30_000, "annual_storage_gb", 2_000, "gb"),
    _addon("EMC_EMAIL_250K", "CAPACITY_ADDON", "EMC email +250K/year", "Additional EMC annual email allocation.", "EMC", True, 231, 5_000, "annual_email_credits", 250_000, "recipients"),
    _addon("EMC_EMAIL_500K", "CAPACITY_ADDON", "EMC email +500K/year", "Additional EMC annual email allocation.", "EMC", True, 232, 9_000, "annual_email_credits", 500_000, "recipients"),
    _addon("EMC_EMAIL_1M", "CAPACITY_ADDON", "EMC email +1M/year", "Additional EMC annual email allocation.", "EMC", True, 233, 17_500, "annual_email_credits", 1_000_000, "recipients"),
    _addon("EMC_EMAIL_2_5M", "CAPACITY_ADDON", "EMC email +2.5M/year", "Additional EMC annual email allocation.", "EMC", True, 234, 37_500, "annual_email_credits", 2_500_000, "recipients"),
    _addon("EMC_WORKSPACES_10", "CAPACITY_ADDON", "EMC workspaces +10/year", "Additional EMC client workspaces.", "EMC", True, 241, 25_000, "client_workspaces", 10, "workspaces"),
    _addon("EMC_WORKSPACES_25", "CAPACITY_ADDON", "EMC workspaces +25/year", "Additional EMC client workspaces.", "EMC", True, 242, 50_000, "client_workspaces", 25, "workspaces"),
    _addon("EMC_WORKSPACES_50", "CAPACITY_ADDON", "EMC workspaces +50/year", "Additional EMC client workspaces.", "EMC", True, 243, 90_000, "client_workspaces", 50, "workspaces"),
    # Venue packages are deliberately quotation-routed until venue contract
    # activation is implemented; their approved list prices remain visible.
    ("VENUE_EVENT_BASIC", "VENUE", "Venue Event Basic", "Venue Event Basic", "One-event venue software licence.", True, 301, (("PER_EVENT", "EVENT", 14_999),), (("venue_registration_devices", "EVENT", 4, "devices"), ("venue_rooms", "EVENT", 4, "rooms"), ("venue_room_devices", "EVENT", 8, "devices"), ("venue_srr_devices", "EVENT", 4, "devices"), ("venue_servers", "EVENT", 1, "servers"))),
    ("VENUE_EVENT_PROFESSIONAL", "VENUE", "Venue Event Professional", "Venue Event Professional", "One-event venue software licence.", True, 302, (("PER_EVENT", "EVENT", 24_999),), (("venue_registration_devices", "EVENT", 6, "devices"), ("venue_rooms", "EVENT", 6, "rooms"), ("venue_room_devices", "EVENT", 12, "devices"), ("venue_srr_devices", "EVENT", 6, "devices"), ("venue_servers", "EVENT", 1, "servers"))),
    ("VENUE_EVENT_PRO", "VENUE", "Venue Event Pro", "Venue Event Pro", "One-event venue software licence.", True, 303, (("PER_EVENT", "EVENT", 39_999),), (("venue_registration_devices", "EVENT", 8, "devices"), ("venue_rooms", "EVENT", 8, "rooms"), ("venue_room_devices", "EVENT", 16, "devices"), ("venue_srr_devices", "EVENT", 8, "devices"), ("venue_servers", "EVENT", 1, "servers"))),
    ("VENUE_MONTHLY_BASIC", "VENUE", "Venue Monthly Basic", "Venue Monthly Basic", "Recurring venue pack for two events per month.", True, 311, (("MONTHLY", "ACCOUNT", 29_999),), (("venue_events", "ORGANIZATION", 2, "events_per_month"), ("venue_registration_devices", "EVENT", 4, "devices"), ("venue_rooms", "EVENT", 4, "rooms"), ("venue_room_devices", "EVENT", 8, "devices"), ("venue_srr_devices", "EVENT", 4, "devices"))),
    ("VENUE_MONTHLY_PROFESSIONAL", "VENUE", "Venue Monthly Professional", "Venue Monthly Professional", "Recurring venue pack for four events per month.", True, 312, (("MONTHLY", "ACCOUNT", 44_999),), (("venue_events", "ORGANIZATION", 4, "events_per_month"), ("venue_registration_devices", "EVENT", 4, "devices"), ("venue_rooms", "EVENT", 4, "rooms"), ("venue_room_devices", "EVENT", 8, "devices"), ("venue_srr_devices", "EVENT", 4, "devices"))),
    ("VENUE_MONTHLY_PRO", "VENUE", "Venue Monthly Pro", "Venue Monthly Pro", "Recurring venue pack for six events per month.", True, 313, (("MONTHLY", "ACCOUNT", 59_999),), (("venue_events", "ORGANIZATION", 6, "events_per_month"), ("venue_registration_devices", "EVENT", 4, "devices"), ("venue_rooms", "EVENT", 4, "rooms"), ("venue_room_devices", "EVENT", 8, "devices"), ("venue_srr_devices", "EVENT", 4, "devices"))),
    ("VENUE_ANNUAL_BASIC", "VENUE", "Venue Annual Basic", "Venue Annual Basic", "Recurring venue pack for 24 events per year.", True, 321, (("ANNUAL", "ACCOUNT", 299_000),), (("venue_events", "ORGANIZATION", 24, "events_per_year"), ("venue_registration_devices", "EVENT", 4, "devices"), ("venue_rooms", "EVENT", 4, "rooms"), ("venue_room_devices", "EVENT", 8, "devices"), ("venue_srr_devices", "EVENT", 4, "devices"))),
    ("VENUE_ANNUAL_PROFESSIONAL", "VENUE", "Venue Annual Professional", "Venue Annual Professional", "Recurring venue pack for 48 events per year.", True, 322, (("ANNUAL", "ACCOUNT", 499_000),), (("venue_events", "ORGANIZATION", 48, "events_per_year"), ("venue_registration_devices", "EVENT", 4, "devices"), ("venue_rooms", "EVENT", 4, "rooms"), ("venue_room_devices", "EVENT", 8, "devices"), ("venue_srr_devices", "EVENT", 4, "devices"))),
    ("VENUE_ANNUAL_PRO", "VENUE", "Venue Annual Pro", "Venue Annual Pro", "Recurring venue pack for 72 events per year.", True, 323, (("ANNUAL", "ACCOUNT", 719_000),), (("venue_events", "ORGANIZATION", 72, "events_per_year"), ("venue_registration_devices", "EVENT", 4, "devices"), ("venue_rooms", "EVENT", 4, "rooms"), ("venue_room_devices", "EVENT", 8, "devices"), ("venue_srr_devices", "EVENT", 4, "devices"))),
    # Optional venue applications (PDF sections 05.1 and 05.2).
    _addon("VENUE_MODERATOR_1_ROOM", "VENUE_ADDON", "Moderator app · 1 room / 2 devices", "Per-event moderator application licence.", "EVENT", True, 401, 2_500, "venue_moderator_devices", 2, "devices"),
    _addon("VENUE_MODERATOR_2_ROOMS", "VENUE_ADDON", "Moderator app · 2 rooms / 4 devices", "Per-event moderator application licence.", "EVENT", True, 402, 4_500, "venue_moderator_devices", 4, "devices"),
    _addon("VENUE_MODERATOR_4_ROOMS", "VENUE_ADDON", "Moderator app · 4 rooms / 8 devices", "Per-event moderator application licence.", "EVENT", True, 403, 7_500, "venue_moderator_devices", 8, "devices"),
    _addon("VENUE_MODERATOR_6_ROOMS", "VENUE_ADDON", "Moderator app · 6 rooms / 12 devices", "Per-event moderator application licence.", "EVENT", True, 404, 10_000, "venue_moderator_devices", 12, "devices"),
    _addon("VENUE_EPOSTER_2_DEVICES", "VENUE_ADDON", "ePoster app · up to 2 devices", "Per-event ePoster application licence.", "EVENT", True, 411, 2_500, "venue_eposter_devices", 2, "devices"),
    _addon("VENUE_EPOSTER_4_DEVICES", "VENUE_ADDON", "ePoster app · up to 4 devices", "Per-event ePoster application licence.", "EVENT", True, 412, 4_000, "venue_eposter_devices", 4, "devices"),
    _addon("VENUE_EPOSTER_6_DEVICES", "VENUE_ADDON", "ePoster app · up to 6 devices", "Per-event ePoster application licence.", "EVENT", True, 413, 5_500, "venue_eposter_devices", 6, "devices"),
    _addon("VENUE_EPOSTER_8_DEVICES", "VENUE_ADDON", "ePoster app · up to 8 devices", "Per-event ePoster application licence.", "EVENT", True, 414, 7_000, "venue_eposter_devices", 8, "devices"),
    _addon("VENUE_EPOSTER_15_DEVICES", "VENUE_ADDON", "ePoster app · 9–15 devices", "Per-event ePoster application licence.", "EVENT", True, 415, 10_000, "venue_eposter_devices", 15, "devices"),
    _addon("VENUE_SIGNAGE_2_SCREENS", "VENUE_ADDON", "Signage app · up to 2 screens", "Per-event digital signage application licence.", "EVENT", True, 421, 2_000, "venue_signage_screens", 2, "screens"),
    _addon("VENUE_SIGNAGE_4_SCREENS", "VENUE_ADDON", "Signage app · up to 4 screens", "Per-event digital signage application licence.", "EVENT", True, 422, 3_500, "venue_signage_screens", 4, "screens"),
    _addon("VENUE_SIGNAGE_6_SCREENS", "VENUE_ADDON", "Signage app · up to 6 screens", "Per-event digital signage application licence.", "EVENT", True, 423, 5_000, "venue_signage_screens", 6, "screens"),
    _addon("VENUE_SIGNAGE_10_SCREENS", "VENUE_ADDON", "Signage app · up to 10 screens", "Per-event digital signage application licence.", "EVENT", True, 424, 7_500, "venue_signage_screens", 10, "screens"),
    _addon("VENUE_SIGNAGE_20_SCREENS", "VENUE_ADDON", "Signage app · 11–20 screens", "Per-event digital signage application licence.", "EVENT", True, 425, 10_000, "venue_signage_screens", 20, "screens"),
    _addon("VENUE_LIVE_QA_250", "VENUE_ADDON", "Live Q&A · up to 250 audience", "Per-event Live Q&A application licence.", "EVENT", True, 431, 2_500, "venue_live_qa_audience", 250, "attendees"),
    _addon("VENUE_LIVE_QA_500", "VENUE_ADDON", "Live Q&A · up to 500 audience", "Per-event Live Q&A application licence.", "EVENT", True, 432, 4_000, "venue_live_qa_audience", 500, "attendees"),
    _addon("VENUE_LIVE_QA_1000", "VENUE_ADDON", "Live Q&A · up to 1,000 audience", "Per-event Live Q&A application licence.", "EVENT", True, 433, 6_000, "venue_live_qa_audience", 1_000, "attendees"),
    _addon("VENUE_LIVE_QA_2500", "VENUE_ADDON", "Live Q&A · up to 2,500 audience", "Per-event Live Q&A application licence.", "EVENT", True, 434, 9_000, "venue_live_qa_audience", 2_500, "attendees"),
    _addon("VENUE_LIVE_QA_5000", "VENUE_ADDON", "Live Q&A · up to 5,000 audience", "Per-event Live Q&A application licence.", "EVENT", True, 435, 15_000, "venue_live_qa_audience", 5_000, "attendees"),
    _addon("VENUE_TECHNICIAN_SETUP_DAY", "VENUE_ADDON", "Onsite event technician", "Setup-day technician service; travel and outstation costs are separate.", "EVENT", True, 441, 10_000, "venue_technician_days", 1, "setup_days"),
)


DEFAULT_TEAMS = (
    ("Management", "Organisation leadership, commercial ownership and approvals."),
    ("Events", "Event planning, configuration and delivery."),
    ("Registration", "Registration, check-in and attendee operations."),
    ("Content & Programme", "Sessions, abstracts, schedules and programme content."),
    ("Speakers", "Speaker onboarding, files and communications."),
    ("Operations", "Venue, devices, rooms and onsite operations."),
)

DEFAULT_SYSTEM_ROLES = (
    "Super Admin", "Event Organizer", "Admin", "Session Manager", "Technician",
    "Moderator", "Speaker", "Viewer", "Registration Manager",
    "Registration Coordinator", "Registration Reviewer", "Badge Manager",
    "Check-in Staff", "Registration Viewer", "Speaker Manager", "Room Manager",
    "Venue Operator",
)


def _insert_offer(bind: sa.Connection, offer: Offer, now: datetime) -> None:
    code, family, name, display_name, description, quote_only, order, prices, entitlements = offer
    offer_id = bind.scalar(sa.text("SELECT id FROM commerce.commercial_offers WHERE code = :code"), {"code": code})
    if offer_id is None:
        offer_id = uuid.uuid4()
        bind.execute(sa.text("""
            INSERT INTO commerce.commercial_offers
                (id, code, product_family, name, display_name, description, scope_type,
                 is_quote_only, lifecycle_status, display_order, created_at, updated_at)
            VALUES
                (:id, :code, :family, :name, :display_name, :description, :scope,
                 :quote_only, 'PUBLISHED', :display_order, :now, :now)
        """), {"id": offer_id, "code": code, "family": family, "name": name,
            "display_name": display_name, "description": description,
            "scope": entitlements[0][1] if entitlements else (
                "EVENT" if family in {"EVENT", "VENUE_ADDON"} else "EMC" if family == "EMC" else "ORGANIZATION"
            ), "quote_only": quote_only,
            "display_order": order, "now": now})

    version_id = bind.scalar(sa.text("""
        SELECT id FROM commerce.commercial_offer_versions
        WHERE offer_id = :offer_id AND version_number = 1
    """), {"offer_id": offer_id})
    if version_id is None:
        version_id = uuid.uuid4()
        bind.execute(sa.text("""
            INSERT INTO commerce.commercial_offer_versions
                (id, offer_id, version_number, effective_from, version_status,
                 change_reason, published_at, created_at)
            VALUES (:id, :offer_id, 1, :now, 'PUBLISHED',
                    'Approved EventOS 2026 pricing catalogue', :now, :now)
        """), {"id": version_id, "offer_id": offer_id, "now": now})

    for interval, pricing_unit, amount in prices:
        bind.execute(sa.text("""
            INSERT INTO commerce.commercial_offer_prices
                (id, offer_version_id, billing_interval, pricing_unit, amount,
                 currency, tax_mode, created_at)
            SELECT :id, :version_id, :interval, :pricing_unit, :amount,
                   'INR', 'EXCLUSIVE', :now
            WHERE NOT EXISTS (
                SELECT 1 FROM commerce.commercial_offer_prices
                WHERE offer_version_id = :version_id
                  AND billing_interval = :interval
                  AND pricing_unit = :pricing_unit
            )
        """), {"id": uuid.uuid4(), "version_id": version_id, "interval": interval,
            "pricing_unit": pricing_unit, "amount": Decimal(amount), "now": now})

    for key, scope, quantity, unit in entitlements:
        bind.execute(sa.text("""
            INSERT INTO commerce.commercial_offer_entitlements
                (id, offer_version_id, entitlement_key, scope_type, value_type,
                 quantity, unit_type, consumption_model, hard_ceiling, metadata_json)
            VALUES (:id, :version_id, :key, :scope, 'QUANTITY', :quantity, :unit,
                    'METERED', :hard_ceiling, '{}'::jsonb)
            ON CONFLICT (offer_version_id, entitlement_key) DO NOTHING
        """), {"id": uuid.uuid4(), "version_id": version_id, "key": key,
            "scope": scope, "quantity": quantity, "unit": unit,
            "hard_ceiling": quantity is not None})


def seed_approved_catalogue(bind: sa.Connection) -> None:
    """Idempotently install missing approved offers without migration state."""
    now = datetime.now(timezone.utc)
    for offer in OFFERS:
        _insert_offer(bind, offer, now)


def backfill_default_teams(bind: sa.Connection) -> None:
    """Idempotently add starter teams where a durable actor already exists."""

    # Preserve the platform/customer boundary while making the canonical host
    # organisation's unlimited entitlement marker deterministic.
    # Backfill real teams only when a durable actor exists.  No synthetic users
    # or inferred memberships are created.  Future organisations are handled by
    # the organisation foundation service.
    for team_name, description in DEFAULT_TEAMS:
        bind.execute(sa.text("""
            INSERT INTO organizer_access.organization_teams
                (id, organization_id, name, description, owner_member_id, status,
                 version, created_by, created_at, updated_at)
            SELECT gen_random_uuid(), organization.id, :team_name, :description,
                   creator.owner_member_id, 'ACTIVE', 1, creator.user_id, now(), now()
            FROM platform.organizations organization
            JOIN LATERAL (
                SELECT candidate.user_id, candidate.owner_member_id
                FROM (
                    SELECT member.user_id, member.id AS owner_member_id, 1 AS priority
                    FROM organizer_access.organization_members member
                    WHERE member.organization_id = organization.id
                      AND member.org_role = 'owner'
                      AND member.is_active = true
                      AND member.accepted_at IS NOT NULL
                      AND member.user_id IS NOT NULL
                    UNION ALL
                    SELECT user_row.id, NULL::uuid, 2 AS priority
                    FROM identity.users user_row
                    WHERE user_row.organization_id = organization.id
                      AND user_row.is_active = true
                    UNION ALL
                    SELECT user_row.id, NULL::uuid, 3 AS priority
                    FROM identity.users user_row
                    WHERE user_row.role = 'super_admin'
                      AND user_row.is_active = true
                ) candidate
                ORDER BY candidate.priority, candidate.user_id
                LIMIT 1
            ) creator ON true
            WHERE organization.is_active = true
              AND NOT EXISTS (
                  SELECT 1 FROM organizer_access.organization_teams team
                  WHERE team.organization_id = organization.id
                    AND lower(team.name) = lower(:team_name)
                    AND team.deleted_at IS NULL
              )
        """), {"team_name": team_name, "description": description})


def backfill_commercial_accounts(bind: sa.Connection) -> None:
    """Create only the missing commercial owner foundations for customer tenants.

    NORMAL and EMC organisations own accounts. CLIENT organisations remain
    governed by their approved standalone or EMC relationship workflow, and
    the Eventos platform tenant intentionally remains outside customer
    commercial tables.
    """
    bind.execute(sa.text("""
        INSERT INTO commerce.commercial_accounts
            (id, account_type, owner_organization_id, status, currency, country,
             version, created_at, updated_at)
        SELECT gen_random_uuid(),
               CASE WHEN organization.organization_kind = 'EMC' THEN 'EMC' ELSE 'ORGANIZER' END,
               organization.id, 'ACTIVE',
               CASE
                   WHEN upper(trim(organization.currency)) ~ '^[A-Z]{3}$'
                   THEN upper(trim(organization.currency))
                   ELSE 'INR'
               END,
               CASE
                   WHEN upper(trim(organization.country)) ~ '^[A-Z]{2}$'
                   THEN upper(trim(organization.country))
                   ELSE 'IN'
               END,
               1, now(), now()
        FROM platform.organizations organization
        WHERE organization.organization_kind IN ('NORMAL', 'EMC')
          AND organization.is_platform_org = false
          AND organization.archived_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM commerce.commercial_accounts account
              WHERE account.owner_organization_id = organization.id
          )
    """))
    bind.execute(sa.text("""
        INSERT INTO commerce.commercial_account_workspaces
            (id, commercial_account_id, organization_id, workspace_role,
             status, created_at, updated_at)
        SELECT gen_random_uuid(), account.id, account.owner_organization_id,
               'OWNER', 'ACTIVE', now(), now()
        FROM commerce.commercial_accounts account
        JOIN platform.organizations organization
          ON organization.id = account.owner_organization_id
        WHERE organization.is_platform_org = false
          AND account.account_type IN ('ORGANIZER', 'EMC')
          AND NOT EXISTS (
              SELECT 1 FROM commerce.commercial_account_workspaces workspace
              WHERE workspace.commercial_account_id = account.id
                AND workspace.organization_id = account.owner_organization_id
          )
    """))


def protect_default_roles(bind: sa.Connection) -> None:
    """Make code-owned global templates immutable without touching tenant roles."""
    bind.execute(sa.text("""
        UPDATE organizer_access.user_roles
        SET is_system_role = true
        WHERE organization_id IS NULL
          AND name = ANY(:names)
    """), {"names": list(DEFAULT_SYSTEM_ROLES)})


def upgrade() -> None:
    bind = op.get_bind()
    seed_approved_catalogue(bind)

    # Preserve the platform/customer boundary while making the canonical host
    # organisation's unlimited entitlement marker deterministic.
    bind.execute(sa.text("""
        UPDATE platform.organizations
        SET is_platform_org = true,
            is_internal_unrestricted = true,
            onboarding_completed = true,
            updated_at = now()
        WHERE lower(slug) = 'eventos'
    """))
    backfill_default_teams(bind)
    backfill_commercial_accounts(bind)
    protect_default_roles(bind)


def downgrade() -> None:
    bind = op.get_bind()
    codes = [offer[0] for offer in OFFERS]
    # Referenced commercial history is immutable.  Unused seeded offers can be
    # removed; referenced offers are retired instead of deleting history.
    bind.execute(sa.text("""
        UPDATE commerce.commercial_offers offer
        SET lifecycle_status = 'RETIRED', updated_at = now()
        WHERE offer.code = ANY(:codes)
          AND EXISTS (
              SELECT 1 FROM commerce.commercial_contract_items item
              WHERE item.offer_id = offer.id
          )
    """), {"codes": codes})
    bind.execute(sa.text("""
        DELETE FROM commerce.commercial_offers offer
        WHERE offer.code = ANY(:codes)
          AND NOT EXISTS (
              SELECT 1 FROM commerce.commercial_contract_items item
              WHERE item.offer_id = offer.id
          )
    """), {"codes": codes})

