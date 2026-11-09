from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import and_, case, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.modules.events.models.event import Event
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.badge_models import Badge, BadgeHistory, BadgePrintJob
from app.modules.registration.schemas.badge import BadgeHistoryResponse, BadgePrintJobResponse, BadgeResponse
from app.modules.registration.models.import_job import ImportJob
from app.modules.registration.schemas.import_job import ImportJobResponse
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.registration_domain_tables import FormField
from app.modules.registration.schemas.form_builder import FormTemplateResponse
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.schemas.print_template import PrintTemplateResponse
from app.infrastructure.repositories import Repository
from app.modules.registration.infrastructure.repositories import (
    BadgeHistoryRepository,
    BadgePrintJobRepository,
    BadgeRepository,
    ImportJobRepository,
    ParticipantRegistrationRepository,
    ParticipantRepository,
)
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor
from app.modules.registration.services.portal_service import DashboardData, get_dashboard_data
from app.modules.platform.models.organization_console import UsageReservation
from app.modules.identity.models.user import User


class RegistrationFormQueryService:
    """Tenant/event-scoped projection for the compatibility form-config read."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_config_record(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> RegistrationFormConfig | None:
        return await self.db.scalar(
            select(RegistrationFormConfig)
            .join(Event, Event.id == RegistrationFormConfig.event_id)
            .where(
                Event.organization_id == organization_id,
                RegistrationFormConfig.event_id == event_id,
            )
        )

    async def get_config(
        self,
        *,
        event: Event,
        default_fields: list[dict],
        default_faqs: list[dict],
        removed_default_ids: set[str],
    ) -> dict:
        config = await self.db.scalar(
            select(RegistrationFormConfig)
            .options(load_only(
                RegistrationFormConfig.id,
                RegistrationFormConfig.event_id,
                RegistrationFormConfig.template_id,
                RegistrationFormConfig.category_id,
                RegistrationFormConfig.is_live,
                RegistrationFormConfig.fields,
                RegistrationFormConfig.settings,
                RegistrationFormConfig.version,
            ))
            .where(RegistrationFormConfig.event_id == event.id)
        )
        settings = event.registration_settings or {}
        terms = settings.get("terms_and_conditions", "")
        faqs = settings.get("faqs", default_faqs)
        include_default = settings.get("include_default_faqs", True)
        if config is None:
            return {
                "id": uuid.uuid5(uuid.NAMESPACE_URL, f"eventos:registration-form:{event.id}"),
                "event_id": event.id,
                "template_id": None,
                "category_id": None,
                "is_live": True,
                "fields": [dict(field) for field in default_fields],
                "settings": {},
                "version": 1,
                "terms_and_conditions": terms,
                "faqs": faqs,
                "include_default_faqs": include_default,
            }

        rows = await self.db.scalars(
            select(FormField)
            .options(load_only(
                FormField.id,
                FormField.form_id,
                FormField.field_name,
                FormField.label,
                FormField.field_type,
                FormField.is_default,
                FormField.is_required,
                FormField.is_active,
                FormField.placeholder,
                FormField.options,
                FormField.sort_order,
            ))
            .where(FormField.form_id == config.id)
            .order_by(FormField.sort_order, FormField.id)
            .limit(101)
        )
        db_fields = rows.all()
        if len(db_fields) > 100:
            from fastapi import HTTPException
            raise HTTPException(409, detail={"code": "FORM_DOCUMENT_RECONCILIATION_REQUIRED"})
        if not db_fields:
            base_fields = config.fields if config.fields else default_fields
            response_fields = [
                field for field in base_fields
                if not (field.get("is_default") and (field.get("id") in removed_default_ids or field.get("name") in removed_default_ids))
            ]
        else:
            response_fields = [
                {
                    "id": field.field_name,
                    "name": field.field_name,
                    "label": field.label or field.field_name,
                    "type": field.field_type,
                    "is_default": field.is_default,
                    "is_required": field.is_required,
                    "is_active": field.is_active,
                    "placeholder": field.placeholder or "",
                    "options": field.options or [],
                }
                for field in db_fields
                if not (field.is_default and field.field_name in removed_default_ids)
            ]
        existing_ids = {field.get("id") or field.get("name") for field in response_fields}
        for field in default_fields:
            if field["id"] not in existing_ids and field["name"] not in existing_ids:
                response_fields.append(field)
        return {
            "id": config.id,
            "event_id": event.id,
            "template_id": config.template_id,
            "category_id": config.category_id,
            "is_live": config.is_live,
            "fields": config.fields if config.fields else response_fields,
            "settings": config.settings or {},
            "version": config.version,
            "terms_and_conditions": terms,
            "faqs": faqs,
            "include_default_faqs": include_default,
        }


class RegistrationPortalQueryService:
    """Tenant-scoped reads shared by public registration workflows."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_event(
        self, *, event_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> Event | None:
        statement = select(Event).where(Event.id == event_id, Event.deleted_at.is_(None))
        if organization_id is not None:
            statement = statement.where(Event.organization_id == organization_id)
        return await self.db.scalar(statement)

    async def list_roles(self, *, event_id: uuid.UUID) -> list[ParticipantRole]:
        rows = await self.db.scalars(
            select(ParticipantRole)
            .where(ParticipantRole.event_id == event_id)
            .order_by(ParticipantRole.sort_order, ParticipantRole.name, ParticipantRole.id)
            .limit(100)
        )
        return list(rows.all())

    async def capacity_state(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> tuple[CapacityRule | None, int, int | None]:
        rule = await self.db.scalar(
            select(CapacityRule)
            .join(Event, Event.id == CapacityRule.event_id)
            .where(
                Event.organization_id == organization_id,
                CapacityRule.event_id == event_id,
                CapacityRule.session_id.is_(None),
                CapacityRule.room_id.is_(None),
            )
        )
        approved_count = int(
            await self.db.scalar(
                select(func.count(Participant.id))
                .join(Event, Participant.event_id == Event.id)
                .where(
                    Event.organization_id == organization_id,
                    Participant.event_id == event_id,
                )
            )
            or 0
        )
        max_waitlist = await self.db.scalar(
            select(func.max(ParticipantRegistration.waitlist_position))
            .join(Event, ParticipantRegistration.event_id == Event.id)
            .where(
                Event.organization_id == organization_id,
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.registration_status == "waitlisted",
            )
        )
        return rule, approved_count, max_waitlist

    async def get_transaction_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, gateway_order_id: str
    ) -> PaymentTransaction | None:
        return await self.db.scalar(
            select(PaymentTransaction)
            .join(Event, Event.id == PaymentTransaction.event_id)
            .where(
                Event.organization_id == organization_id,
                PaymentTransaction.event_id == event_id,
                PaymentTransaction.gateway_order_id == gateway_order_id,
            )
        )

    async def get_registration_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, registration_id: uuid.UUID
    ) -> ParticipantRegistration | None:
        return await self.db.scalar(
            select(ParticipantRegistration)
            .join(Event, Event.id == ParticipantRegistration.event_id)
            .where(
                Event.organization_id == organization_id,
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.id == registration_id,
            )
        )

    async def get_participant_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, participant_id: uuid.UUID
    ) -> Participant | None:
        return await self.db.scalar(
            select(Participant)
            .join(Event, Event.id == Participant.event_id)
            .where(
                Event.organization_id == organization_id,
                Participant.event_id == event_id,
                Participant.id == participant_id,
            )
        )

    async def get_upload_reservation(
        self, *, organization_id: uuid.UUID, idempotency_key: str
    ) -> UsageReservation | None:
        return await self.db.scalar(
            select(UsageReservation).where(
                UsageReservation.organization_id == organization_id,
                UsageReservation.idempotency_key == idempotency_key,
            )
        )

    async def get_fallback_reviewer_id(
        self, *, organization_id: uuid.UUID, preferred_id: uuid.UUID | None
    ) -> uuid.UUID | None:
        if preferred_id:
            preferred = await self.db.scalar(
                select(User.id).where(
                    User.id == preferred_id, User.organization_id == organization_id
                )
            )
            if preferred:
                return preferred
        return await self.db.scalar(
            select(User.id)
            .where(User.organization_id == organization_id, User.is_active.is_(True))
            .order_by(User.id)
            .limit(1)
        )


class PricingQueryService:
    """Own bounded pricing configuration reads used by the pricing routes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_distinct_tiers(self, *, event_id: uuid.UUID) -> list[str]:
        rows = await self.db.scalars(
            select(TicketType.tier_name)
            .where(TicketType.event_id == event_id)
            .distinct()
        )
        return [name for name in rows.all() if name]

    async def pricing_map(self, *, event_id: uuid.UUID) -> dict[str, float]:
        rows = await self.db.execute(
            select(TicketType.role_name, TicketType.tier_name, TicketType.price)
            .where(TicketType.event_id == event_id)
        )
        return {
            f"{role_name}_{tier_name}": float(price or 0)
            for role_name, tier_name, price in rows.all()
        }

    async def schedules(
        self,
        *,
        event_id: uuid.UUID,
        registration_settings: dict,
    ) -> dict[str, dict[str, str | None]]:
        rows = await self.db.execute(
            select(
                TicketType.tier_name,
                TicketType.available_from,
                TicketType.available_until,
            ).where(TicketType.event_id == event_id)
        )
        schedules: dict[str, dict[str, str | None]] = {}
        for tier_name, available_from, available_until in rows.all():
            if tier_name not in schedules:
                schedules[tier_name] = {
                    "available_from": available_from.isoformat() if available_from else None,
                    "available_until": available_until.isoformat() if available_until else None,
                }

        setting_schedules = registration_settings.get("tier_schedules", {})
        setting_cutoffs = registration_settings.get("tier_cutoffs", {})
        for tier, scheduled in setting_schedules.items():
            from_settings = {
                "available_from": scheduled.get("available_from") or scheduled.get("start_time"),
                "available_until": scheduled.get("available_until") or scheduled.get("end_time") or scheduled.get("last_date"),
            }
            if tier not in schedules:
                schedules[tier] = from_settings
            else:
                schedules[tier]["available_from"] = schedules[tier].get("available_from") or from_settings["available_from"]
                schedules[tier]["available_until"] = schedules[tier].get("available_until") or from_settings["available_until"]

        for tier, cutoff in setting_cutoffs.items():
            if tier not in schedules:
                schedules[tier] = {"available_from": None, "available_until": cutoff}
            elif not schedules[tier].get("available_until") and cutoff:
                schedules[tier]["available_until"] = cutoff
        return schedules


class PromoCodeQueryService:
    """Bounded event-scoped promo-code compatibility reads."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event_code(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, code: str
    ) -> PromoCode | None:
        return await self.db.scalar(
            select(PromoCode)
            .join(Event, Event.id == PromoCode.event_id)
            .where(
                Event.organization_id == organization_id,
                PromoCode.event_id == event_id,
                PromoCode.code == code,
            )
        )

    async def get_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, promo_id: uuid.UUID
    ) -> PromoCode | None:
        return await self.db.scalar(
            select(PromoCode)
            .join(Event, Event.id == PromoCode.event_id)
            .where(
                Event.organization_id == organization_id,
                PromoCode.event_id == event_id,
                PromoCode.id == promo_id,
            )
        )

    async def list_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, limit: int = 100
    ) -> list[PromoCode]:
        bounded = bounded_page_size(limit, maximum=100)
        rows = await self.db.scalars(
            select(PromoCode)
            .join(Event, Event.id == PromoCode.event_id)
            .where(
                Event.organization_id == organization_id,
                PromoCode.event_id == event_id,
            )
            .order_by(PromoCode.created_at.desc(), PromoCode.id.desc())
            .limit(bounded)
        )
        return list(rows.all())


class FormBuilderQueryService:
    """Read-only projections for form builder catalog reads."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_categories(self, *, organization_id: Optional[uuid.UUID],
                              cursor: str | None = None,
                              page_size: int = 50) -> CursorPage[FormCategory]:
        bounded = bounded_page_size(page_size, default=50, maximum=100)
        conditions = [FormCategory.deleted_at.is_(None), FormCategory.is_active.is_(True)]
        if organization_id:
            conditions.append(
                or_(FormCategory.organization_id.is_(None), FormCategory.organization_id == organization_id)
            )
        else:
            conditions.append(FormCategory.organization_id.is_(None))
        statement = select(FormCategory).where(and_(*conditions))
        if cursor:
            position = decode_cursor(cursor)
            statement = statement.where(or_(
                FormCategory.created_at > position.occurred_at,
                and_(FormCategory.created_at == position.occurred_at,
                    FormCategory.id > position.record_id),
            ))
        rows = list((await self.db.scalars(statement
            .order_by(FormCategory.created_at, FormCategory.id)
            .limit(bounded + 1)
            .execution_options(shared_form_catalogue=True))).all())
        has_next = len(rows) > bounded
        items = rows[:bounded]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id) if has_next and items else None
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)

    @staticmethod
    def _to_template_response(template: FormTemplate) -> FormTemplateResponse:
        category_name = (
            template.category.name
            if template.category
            else template.category_key.replace("_", " ").title()
        )
        event_id = None
        if template.settings and isinstance(template.settings, dict) and "event_id" in template.settings:
            try:
                event_id = uuid.UUID(str(template.settings["event_id"]))
            except Exception:
                pass

        return FormTemplateResponse(
            id=template.id,
            category_id=template.category_id,
            organization_id=template.organization_id,
            event_id=event_id,
            created_by=template.created_by,
            name=template.name,
            slug=template.slug,
            description=template.description,
            category_key=template.category_key,
            category_name=category_name,
            scope_type=template.scope_type,
            is_default=template.is_default,
            is_system=template.is_system,
            is_active=template.is_active,
            version=template.version,
            fields=template.fields or [],
            settings=template.settings or {},
            preview_image_url=template.preview_image_url,
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    async def _ensure_global_templates(self) -> None:
        """Provision missing canonical global rows; never replace saved documents."""
        try:
            await self.db.execute(text("SELECT pg_advisory_xact_lock(1128353876, 1)"))
            from .catalogue_lifecycle_locks import lock_catalogue_reference_writes
            await lock_catalogue_reference_writes(self.db)
            # Startup is not authorised to reconcile or delete existing data.
            standard_categories = [
                {"name": "Registration Form", "slug": "registration", "description": "Attendee sign-up, pass categories, and guest credentials.", "icon": "UserCheck", "sort_order": 1},
                {"name": "Abstract Form", "slug": "abstract", "description": "Author submission, review tracks, presentation formats, and manuscript files.", "icon": "FileText", "sort_order": 2},
                {"name": "Survey Form", "slug": "survey", "description": "Feedback ratings, CSAT questionnaires, NPS, and post-session audits.", "icon": "BarChart3", "sort_order": 3},
                {"name": "Speaker Intake Form", "slug": "speaker_intake", "description": "Speaker bio, deck uploads, AV requirements, and session disclosure.", "icon": "Mic", "sort_order": 4},
                {"name": "Sponsor Application", "slug": "sponsor_application", "description": "Sponsor packages, booth requirements, and partner deliverables.", "icon": "Award", "sort_order": 5},
            ]

            existing_cats = (await self.db.scalars(
                select(FormCategory).where(FormCategory.organization_id.is_(None),
                    FormCategory.slug.in_([entry["slug"] for entry in standard_categories]))
                .order_by(FormCategory.id).limit(11).execution_options(shared_form_catalogue=True)
            )).all()
            cats_by_slug: dict[str, list[FormCategory]] = {}
            for c in existing_cats:
                cats_by_slug.setdefault(c.slug, []).append(c)

            cat_by_slug: dict[str, FormCategory] = {}
            for slug, cat_list in cats_by_slug.items():
                if len(cat_list) != 1 or cat_list[0].deleted_at is not None or not cat_list[0].is_active:
                    raise RuntimeError("GLOBAL_FORM_CATEGORY_RECONCILIATION_REQUIRED")
                cat_by_slug[slug] = cat_list[0]

            for sc in standard_categories:
                if sc["slug"] not in cat_by_slug:
                    new_cat = FormCategory(
                        id=uuid.uuid4(),
                        name=sc["name"],
                        slug=sc["slug"],
                        description=sc["description"],
                        icon=sc["icon"],
                        is_system=True,
                        sort_order=sc["sort_order"],
                        is_active=True,
                    )
                    self.db.add(new_cat)
                    cat_by_slug[sc["slug"]] = new_cat

            await self.db.flush()

            # 2. Canonical Blueprint Definitions (5 per category = 25 total)
            blueprints = [
                # ── REGISTRATION (5 templates) ─────────────────────────
                {
                    "name": "Standard Event Registration Form",
                    "slug": "standard-event-registration",
                    "category_key": "registration",
                    "description": "Comprehensive attendee registration capturing verified identity, institutional affiliation, country, designation, and registration role.",
                    "is_default": True,
                    "settings": {
                        "steps": [{"id": "step_1", "title": "Registration Details", "description": "Enter your verified identity and professional credentials"}],
                        "submit_button_label": "Complete Registration",
                        "success_title": "Registration Confirmed!",
                        "success_message": "Your registration has been successfully processed. Check your email for badge credentials and schedule details.",
                        "terms_and_conditions": "All registrations are subject to organizer verification. Cancellation and refund policies apply.",
                    },
                    "fields": [
                        {"id": "title", "name": "title", "label": "Title / Prefix", "type": "select", "is_default": True, "is_required": False, "is_active": True, "sort_order": 0, "placeholder": "Select title", "options": ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."], "category": "identity"},
                        {"id": "first_name", "name": "first_name", "label": "First Name", "type": "text", "is_default": True, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "Enter your first name", "category": "basic"},
                        {"id": "last_name", "name": "last_name", "label": "Last Name", "type": "text", "is_default": True, "is_required": True, "is_active": True, "sort_order": 2, "placeholder": "Enter your last name", "category": "basic"},
                        {"id": "email", "name": "email", "label": "Email Address", "type": "email", "is_default": True, "is_required": True, "is_active": True, "sort_order": 3, "placeholder": "attendee@example.com", "category": "basic"},
                        {"id": "phone", "name": "phone", "label": "Phone Number", "type": "phone", "is_default": True, "is_required": True, "is_active": True, "sort_order": 4, "placeholder": "Enter mobile number", "category": "basic"},
                        {"id": "company", "name": "company", "label": "Institution / Organization", "type": "text", "is_default": True, "is_required": True, "is_active": True, "sort_order": 5, "placeholder": "Enter organization", "category": "basic"},
                        {"id": "designation", "name": "designation", "label": "Job Title / Designation", "type": "text", "is_default": True, "is_required": True, "is_active": True, "sort_order": 6, "placeholder": "e.g. Lead Consultant / Engineer", "category": "basic"},
                        {"id": "country", "name": "country", "label": "Country & State", "type": "country", "is_default": True, "is_required": True, "is_active": True, "sort_order": 7, "placeholder": "Select your country", "category": "basic"},
                        {"id": "role", "name": "role", "label": "Registration Role / Category", "type": "select", "is_default": True, "is_required": True, "is_active": True, "sort_order": 8, "options": ["Delegate", "Student Delegate", "VIP Guest"], "category": "identity"},
                    ],
                },
                {
                    "name": "VIP Gala Dinner & Social Evening RSVP",
                    "slug": "vip-gala-dinner-rsvp",
                    "category_key": "registration",
                    "description": "Exclusive evening dinner RSVP capturing attendance confirmation, plus-one credentials, dietary preferences, and seating choices.",
                    "is_default": False,
                    "settings": {
                        "submit_button_label": "Confirm Gala RSVP",
                        "success_title": "RSVP Confirmed!",
                        "success_message": "Your banquet table allocation and invitation pass have been registered.",
                    },
                    "fields": [
                        {"id": "attending_status", "name": "attending_status", "label": "Will you be attending the Presidential Gala Dinner?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["Yes, I will attend", "Regretfully, I cannot attend"], "category": "choice"},
                        {"id": "plus_one_name", "name": "plus_one_name", "label": "Accompanying Guest / Spouse Full Name (if applicable)", "type": "text", "is_default": False, "is_required": False, "is_active": True, "sort_order": 1, "placeholder": "Guest Full Name", "category": "basic"},
                        {"id": "dietary_preference", "name": "dietary_preference", "label": "Dietary Preferences & Allergies", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["No Restrictions (Standard Non-Veg)", "Vegetarian", "Vegan", "Jain Meal", "Gluten-Free", "Halal", "Kosher"], "category": "choice"},
                        {"id": "special_requests", "name": "special_requests", "label": "Accessibility or Seating Notes", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 3, "placeholder": "Wheelchair access, table preference with colleagues, etc.", "category": "basic"},
                    ],
                },
                {
                    "name": "Workshop & Masterclass Sign-up",
                    "slug": "workshop-masterclass-signup",
                    "category_key": "registration",
                    "description": "Hands-on pre-conference workshop registration capturing track selection, skill level, and laptop requirements.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Register for Workshop", "success_title": "Seat Reserved!"},
                    "fields": [
                        {"id": "workshop_track", "name": "workshop_track", "label": "Select Workshop Track", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["AI & Deep Learning Intensive", "Advanced Cloud Architecture", "Hands-on Surgical Simulation", "Healthcare Leadership Masterclass"], "category": "choice"},
                        {"id": "experience_level", "name": "experience_level", "label": "Current Experience Level in Topic", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "options": ["Beginner / Foundational", "Intermediate Practitioner", "Advanced / Specialist"], "category": "choice"},
                        {"id": "bringing_laptop", "name": "bringing_laptop", "label": "Will you bring your own laptop for the interactive lab?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Yes, macOS", "Yes, Windows / Linux", "No, need loaner device"], "category": "choice"},
                        {"id": "learning_goals", "name": "learning_goals", "label": "What do you hope to learn from this workshop?", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 3, "placeholder": "Specific tools, algorithms, or practical scenarios...", "category": "basic"},
                    ],
                },
                {
                    "name": "Student & Young Researcher Pass",
                    "slug": "student-researcher-pass",
                    "category_key": "registration",
                    "description": "Subsidized registration tier for undergraduate, graduate, and postdoctoral researchers with institutional verification.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Student Registration", "success_title": "Application Received"},
                    "fields": [
                        {"id": "university_name", "name": "university_name", "label": "University / Institute of Study", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "placeholder": "e.g. Stanford University", "category": "basic"},
                        {"id": "student_id_number", "name": "student_id_number", "label": "Student ID / Enrollment Number", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "STU-123456", "category": "basic"},
                        {"id": "degree_program", "name": "degree_program", "label": "Degree / Academic Program", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Undergraduate (BSc/BA)", "Postgraduate (MSc/MS)", "Doctoral (PhD)", "Postdoctoral Fellow"], "category": "choice"},
                        {"id": "supervisor_email", "name": "supervisor_email", "label": "Department Head / Supervisor Email", "type": "email", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "placeholder": "advisor@university.edu", "category": "basic"},
                        {"id": "grant_request", "name": "grant_request", "label": "Applying for Young Researcher Travel Grant?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 4, "options": ["Yes, apply for stipend", "No, self-funded / lab funded"], "category": "choice"},
                    ],
                },
                {
                    "name": "Virtual & Livestream Access Pass",
                    "slug": "virtual-livestream-access",
                    "category_key": "registration",
                    "description": "Digital-only conference registration for interactive streaming, on-demand recordings, and virtual networking.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Confirm Virtual Pass", "success_title": "Virtual Pass Confirmed!"},
                    "fields": [
                        {"id": "timezone", "name": "timezone", "label": "Your Primary Time Zone", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["UTC-8 (PST)", "UTC-5 (EST)", "UTC+0 (GMT)", "UTC+1 (CET)", "UTC+5:30 (IST)", "UTC+8 (SGT/JST)"], "category": "choice"},
                        {"id": "virtual_breakouts", "name": "virtual_breakouts", "label": "Interested in participating in live virtual breakout rooms?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "options": ["Yes, active participation", "No, lecture streaming only"], "category": "choice"},
                        {"id": "networking_opt_in", "name": "networking_opt_in", "label": "Allow other virtual attendees to message you on the event platform?", "type": "checkbox", "is_default": False, "is_required": False, "is_active": True, "sort_order": 2, "options": ["Opt in to 1-on-1 virtual chat"], "category": "choice"},
                    ],
                },

                # ── ABSTRACT (5 templates) ─────────────────────────────
                {
                    "name": "Scientific & Academic Abstract Submission",
                    "slug": "scientific-abstract-submission",
                    "category_key": "abstract",
                    "description": "Standard academic call-for-papers intake with author affiliations, presentation preference, structured abstract text, keywords, and manuscript upload.",
                    "is_default": True,
                    "settings": {
                        "submit_button_label": "Submit Abstract for Review",
                        "success_title": "Abstract Submitted Successfully!",
                        "success_message": "Your submission has been queued for peer review by the Scientific Committee.",
                        "terms_and_conditions": "Authors certify that this work is original and all co-authors consent to presentation.",
                    },
                    "fields": [
                        {"id": "abstract_title", "name": "abstract_title", "label": "Abstract / Paper Title", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "placeholder": "Enter full title", "category": "basic"},
                        {"id": "presentation_format", "name": "presentation_format", "label": "Preferred Presentation Format", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "options": ["Oral Podium Presentation", "ePoster Display", "Workshop Demo", "Either Oral or Poster"], "category": "choice"},
                        {"id": "scientific_track", "name": "scientific_track", "label": "Conference Topic / Track", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Clinical Innovations", "Technology & Systems", "Research & Therapeutics", "Operational Excellence"], "category": "choice"},
                        {"id": "authors_list", "name": "authors_list", "label": "Contributing Authors & Institutional Affiliations", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "placeholder": "Author 1 (University A), Author 2 (Hospital B)...", "category": "basic"},
                        {"id": "abstract_body", "name": "abstract_body", "label": "Structured Abstract Body (Background, Methods, Results, Conclusion)", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 4, "placeholder": "Structured abstract up to 500 words...", "category": "basic"},
                        {"id": "keywords", "name": "keywords", "label": "Keywords (comma separated)", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 5, "placeholder": "e.g. AI, Diagnostics, Oncology", "category": "basic"},
                        {"id": "manuscript_file", "name": "manuscript_file", "label": "Manuscript / Extended Abstract (PDF)", "type": "file", "is_default": False, "is_required": False, "is_active": True, "sort_order": 6, "category": "media"},
                    ],
                },
                {
                    "name": "Clinical Case Report Submission",
                    "slug": "clinical-case-report",
                    "category_key": "abstract",
                    "description": "Specialized submission format for unusual case presentations, novel therapies, and diagnostic dilemmas.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Case Report", "success_title": "Case Report Received"},
                    "fields": [
                        {"id": "case_title", "name": "case_title", "label": "Case Report Headline", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "placeholder": "e.g. Rare Presentation of Acute Aortic Syndrome...", "category": "basic"},
                        {"id": "clinical_history", "name": "clinical_history", "label": "Patient History & Initial Presentation", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "Age, symptoms, initial lab findings...", "category": "basic"},
                        {"id": "differential_diagnosis", "name": "differential_diagnosis", "label": "Differential Diagnosis & Management Strategy", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "category": "basic"},
                        {"id": "clinical_outcome", "name": "clinical_outcome", "label": "Clinical Outcome & Follow-up", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "category": "basic"},
                        {"id": "patient_consent", "name": "patient_consent", "label": "Patient Informed Consent", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 4, "options": ["Written informed consent obtained on file", "Institutional Ethics Board waiver granted"], "category": "choice"},
                    ],
                },
                {
                    "name": "Poster Presentation Submission",
                    "slug": "poster-presentation-submission",
                    "category_key": "abstract",
                    "description": "Dedicated intake for scientific posters, visual diagrams, graphic abstracts, and preliminary findings.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Poster Abstract", "success_title": "Poster Abstract Received"},
                    "fields": [
                        {"id": "poster_title", "name": "poster_title", "label": "Poster Title", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "poster_category", "name": "poster_category", "label": "Poster Category / Subject Group", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "options": ["Clinical Research", "Basic Science", "Epidemiology", "Quality Improvement"], "category": "choice"},
                        {"id": "graphic_summary", "name": "graphic_summary", "label": "Summary of Key Findings", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "category": "basic"},
                        {"id": "poster_pdf", "name": "poster_pdf", "label": "Poster Draft / Layout File (PDF)", "type": "file", "is_default": False, "is_required": False, "is_active": True, "sort_order": 3, "category": "media"},
                    ],
                },
                {
                    "name": "Late-Breaking Research Abstract",
                    "slug": "late-breaking-research",
                    "category_key": "abstract",
                    "description": "Fast-track review for significant trials and landmark studies whose results emerged after the standard deadline.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Late-Breaking Abstract", "success_title": "Late-Breaking Abstract Queued"},
                    "fields": [
                        {"id": "study_title", "name": "study_title", "label": "Trial / Study Name", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "late_break_rationale", "name": "late_break_rationale", "label": "Justification for Late-Breaking Status", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "Explain why results were completed only recently...", "category": "basic"},
                        {"id": "trial_endpoints", "name": "trial_endpoints", "label": "Primary & Secondary Endpoints", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "category": "basic"},
                        {"id": "statistical_findings", "name": "statistical_findings", "label": "Key Statistical Findings (p-values, hazard ratios)", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "category": "basic"},
                    ],
                },
                {
                    "name": "Symposium & Panel Proposal",
                    "slug": "symposium-panel-proposal",
                    "category_key": "abstract",
                    "description": "Organizer-submitted proposals for 60-90 minute multi-speaker thematic symposia or roundtables.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Symposium Proposal", "success_title": "Proposal Received"},
                    "fields": [
                        {"id": "symposium_title", "name": "symposium_title", "label": "Proposed Symposium Title", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "panel_chair", "name": "panel_chair", "label": "Session Chair / Organizer Name", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "category": "basic"},
                        {"id": "proposed_speakers", "name": "proposed_speakers", "label": "Confirmed / Invited Speakers & Sub-topics", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "placeholder": "1. Dr. Smith (Topic A)\n2. Dr. Lee (Topic B)...", "category": "basic"},
                        {"id": "thematic_rationale", "name": "thematic_rationale", "label": "Educational Need & Relevance to Audience", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "category": "basic"},
                    ],
                },

                # ── SURVEY (5 templates) ───────────────────────────────
                {
                    "name": "Post-Event Attendee Feedback & CSAT Survey",
                    "slug": "post-event-attendee-survey",
                    "category_key": "survey",
                    "description": "Measure delegate satisfaction, evaluate keynote lectures, gather venue facilities feedback, and calculate Net Promoter Score (NPS).",
                    "is_default": True,
                    "settings": {
                        "submit_button_label": "Submit Feedback",
                        "success_title": "Thank You for Your Feedback!",
                        "success_message": "Your responses help us improve future conferences.",
                    },
                    "fields": [
                        {"id": "overall_rating", "name": "overall_rating", "label": "How would you rate your overall conference experience?", "type": "rating", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "media"},
                        {"id": "sessions_quality", "name": "sessions_quality", "label": "Quality & Relevance of Scientific Sessions", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "options": ["Exceeded Expectations", "Met Expectations", "Needs Improvement", "Poor"], "category": "choice"},
                        {"id": "venue_facilities", "name": "venue_facilities", "label": "Venue & Hospitality Rating (AV, Catering, Logistics)", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Excellent", "Good", "Average", "Poor"], "category": "choice"},
                        {"id": "nps_score", "name": "nps_score", "label": "How likely are you to recommend this conference to a colleague?", "type": "nps", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "category": "media"},
                        {"id": "favorite_talk", "name": "favorite_talk", "label": "Which keynote session or workshop did you find most valuable?", "type": "text", "is_default": False, "is_required": False, "is_active": True, "sort_order": 4, "placeholder": "Speaker name or session title...", "category": "basic"},
                        {"id": "improvements", "name": "improvements", "label": "What can we do to make next year's conference even better?", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 5, "category": "basic"},
                    ],
                },
                {
                    "name": "Session & Keynote Evaluation Form",
                    "slug": "session-keynote-evaluation",
                    "category_key": "survey",
                    "description": "Immediate micro-survey administered right after a specific presentation or clinical symposium.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Session Rating", "success_title": "Rating Recorded"},
                    "fields": [
                        {"id": "session_name", "name": "session_name", "label": "Session Attended", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "speaker_clarity", "name": "speaker_clarity", "label": "Speaker Delivery & Clarity", "type": "rating", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "category": "media"},
                        {"id": "content_usefulness", "name": "content_usefulness", "label": "Practical Relevance to Your Daily Practice", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Directly Applicable", "Informative / High Value", "Somewhat Relevant", "Not Applicable"], "category": "choice"},
                        {"id": "qa_time", "name": "qa_time", "label": "Was there sufficient time for audience Q&A?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "options": ["Yes, adequate time", "Too brief, needed more time", "No Q&A held"], "category": "choice"},
                    ],
                },
                {
                    "name": "Pre-Event Needs Assessment Survey",
                    "slug": "pre-event-needs-survey",
                    "category_key": "survey",
                    "description": "Sent 3-4 weeks prior to the event to understand attendee expectations and tailor panel discussions.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Send Survey Responses", "success_title": "Preferences Saved"},
                    "fields": [
                        {"id": "top_challenges", "name": "top_challenges", "label": "What is the biggest operational or clinical challenge in your field this year?", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "networking_goals", "name": "networking_goals", "label": "Who are you most hoping to meet at the event?", "type": "checkbox", "is_default": False, "is_required": False, "is_active": True, "sort_order": 1, "options": ["Academic Researchers", "Clinical Practitioners", "Industry Vendors & Pharma", "Regulators & Policy Makers", "Investors & Founders"], "category": "choice"},
                        {"id": "discussion_questions", "name": "discussion_questions", "label": "Any specific questions you want posed to the keynote panelists?", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 2, "category": "basic"},
                    ],
                },
                {
                    "name": "Exhibitor & Sponsor Satisfaction Survey",
                    "slug": "exhibitor-sponsor-survey",
                    "category_key": "survey",
                    "description": "Gather feedback from booth partners regarding footfall, lead quality, venue setup, and ROI.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Exhibitor Review", "success_title": "Review Received"},
                    "fields": [
                        {"id": "booth_traffic_quality", "name": "booth_traffic_quality", "label": "Quality & Seniority of Booth Visitors", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["High Decision-Makers", "Good Cross-Section", "Junior / Exploratory Only", "Low Traffic"], "category": "choice"},
                        {"id": "logistics_support", "name": "logistics_support", "label": "Organizer Logistics & On-site Help", "type": "rating", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "category": "media"},
                        {"id": "lead_volume", "name": "lead_volume", "label": "Total Qualified Leads Captured", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["1-25 leads", "26-75 leads", "76-150 leads", "150+ leads"], "category": "choice"},
                        {"id": "rebook_intent", "name": "rebook_intent", "label": "Likelihood of renewing exhibition booth for next edition?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "options": ["Definitely will renew", "Likely to renew", "Undecided", "Unlikely"], "category": "choice"},
                    ],
                },
                {
                    "name": "Event Diversity & Inclusion (DEI) Audit",
                    "slug": "event-dei-feedback-survey",
                    "category_key": "survey",
                    "description": "Feedback questionnaire auditing representation, physical accessibility, language, and inclusive culture.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Audit", "success_title": "Thank You"},
                    "fields": [
                        {"id": "inclusive_culture", "name": "inclusive_culture", "label": "Did you feel welcomed and included at the conference?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["Strongly Agree", "Agree", "Neutral", "Disagree"], "category": "choice"},
                        {"id": "accessibility_rating", "name": "accessibility_rating", "label": "Venue Physical Accessibility (ramps, elevators, seating)", "type": "rating", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "category": "media"},
                        {"id": "speaker_diversity", "name": "speaker_diversity", "label": "Representation of diverse voices and backgrounds on speaker panels", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Well Balanced", "Acceptable", "Needs Substantial Improvement"], "category": "choice"},
                        {"id": "dei_suggestions", "name": "dei_suggestions", "label": "How can the organizer improve accessibility and equity next time?", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 3, "category": "basic"},
                    ],
                },

                # ── SPEAKER INTAKE (5 templates) ───────────────────────
                {
                    "name": "Speaker Bio & Presentation Deck Intake",
                    "slug": "speaker-bio-presentation-intake",
                    "category_key": "speaker_intake",
                    "description": "Standard speaker onboarding collecting verified bio, headshot photo, session AV requirements, and presentation slides upload.",
                    "is_default": True,
                    "settings": {
                        "submit_button_label": "Save Speaker Profile",
                        "success_title": "Profile & Materials Uploaded!",
                        "success_message": "Your speaker bio and slides have been submitted to the AV technical desk.",
                    },
                    "fields": [
                        {"id": "speaker_full_name", "name": "speaker_full_name", "label": "Speaker Full Name & Honorifics", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "placeholder": "e.g. Prof. Jane Doe, MD, PhD", "category": "basic"},
                        {"id": "affiliation_title", "name": "affiliation_title", "label": "Primary Institutional Affiliation & Official Title", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "e.g. Department Chair, University Hospital", "category": "basic"},
                        {"id": "biography", "name": "biography", "label": "Professional Speaker Biography", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "placeholder": "Brief 150-word biographical sketch...", "category": "basic"},
                        {"id": "av_requirements", "name": "av_requirements", "label": "Podium & AV Technical Requirements", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "options": ["Standard Podium Mic & HDMI Display", "Wireless Lavalier Lapel Mic", "Confidence Monitor Needed", "Audio Output for Video Playback"], "category": "choice"},
                        {"id": "headshot_image", "name": "headshot_image", "label": "Headshot Photo (JPG/PNG)", "type": "image", "is_default": False, "is_required": True, "is_active": True, "sort_order": 4, "category": "media"},
                        {"id": "presentation_deck", "name": "presentation_deck", "label": "Presentation Slides (PPTX / PDF)", "type": "file", "is_default": False, "is_required": True, "is_active": True, "sort_order": 5, "category": "media"},
                    ],
                },
                {
                    "name": "Panelist Discussion Briefing",
                    "slug": "panelist-briefing-intake",
                    "category_key": "speaker_intake",
                    "description": "Preparation form for roundtable panelists outlining talking points, debate perspectives, and moderator cues.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Panelist Brief", "success_title": "Briefing Sent to Moderator"},
                    "fields": [
                        {"id": "panelist_name", "name": "panelist_name", "label": "Panelist Name", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "core_argument", "name": "core_argument", "label": "Core Perspective / Argument in Panel", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "Key point you want to emphasize during the debate...", "category": "basic"},
                        {"id": "case_example", "name": "case_example", "label": "Real-world Case Study or Data Point You Will Mention", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 2, "category": "basic"},
                        {"id": "questions_for_peers", "name": "questions_for_peers", "label": "Suggested Provocative Question for Other Panelists", "type": "text", "is_default": False, "is_required": False, "is_active": True, "sort_order": 3, "category": "basic"},
                    ],
                },
                {
                    "name": "Keynote Speaker Technical Rider & Travel",
                    "slug": "keynote-rider-travel-form",
                    "category_key": "speaker_intake",
                    "description": "Logistics and hospitality coordinator form for plenary and international keynote faculty.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Travel & Rider", "success_title": "Logistics Saved"},
                    "fields": [
                        {"id": "arrival_flight", "name": "arrival_flight", "label": "Inbound Flight Number & Scheduled Arrival Time", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "placeholder": "e.g. BA 256, 10:45 AM Oct 14", "category": "basic"},
                        {"id": "departure_flight", "name": "departure_flight", "label": "Outbound Flight Number & Scheduled Departure", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "e.g. BA 257, 07:15 PM Oct 16", "category": "basic"},
                        {"id": "hotel_room_preference", "name": "hotel_room_preference", "label": "Hotel Room & Accommodation Preferences", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Non-smoking King Room", "Quiet High Floor", "Accessible Room Required"], "category": "choice"},
                        {"id": "stage_tech_specs", "name": "stage_tech_specs", "label": "Stage Audio/Visual Specifications", "type": "checkbox", "is_default": False, "is_required": False, "is_active": True, "sort_order": 3, "options": ["Wireless DPA Headset", "Downstage Teleprompter / Notes Monitor", "Dual Clickers / Laser Pointer", "Stage Countdown Clock"], "category": "choice"},
                    ],
                },
                {
                    "name": "CME Conflict of Interest Disclosure",
                    "slug": "cme-coi-disclosure-form",
                    "category_key": "speaker_intake",
                    "description": "Accreditation board mandatory commercial bias and financial conflict disclosure statement.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Sign & Certify Disclosure", "success_title": "Disclosure Certified"},
                    "fields": [
                        {"id": "commercial_relationships", "name": "commercial_relationships", "label": "Financial Relationships with Commercial Entities (past 24 months)", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["I have no relevant financial relationships to declare", "I have relationships to declare (Consulting, Advisory, Stock, Research Grants)"], "category": "choice"},
                        {"id": "disclosure_details", "name": "disclosure_details", "label": "List Companies and Nature of Financial Relationship", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 1, "placeholder": "e.g. Company X: Clinical Trial Advisory Board...", "category": "basic"},
                        {"id": "off_label_use", "name": "off_label_use", "label": "Will you discuss off-label or investigational drug/device uses?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["No, strictly approved labeled indications", "Yes, will explicitly notify audience during talk"], "category": "choice"},
                        {"id": "signature_date", "name": "signature_date", "label": "Digital Signature (Full Legal Name)", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "category": "basic"},
                    ],
                },
                {
                    "name": "Workshop Instructor Hands-on Requirements",
                    "slug": "workshop-instructor-requirements",
                    "category_key": "speaker_intake",
                    "description": "Instructor lab environment requirements, cloud credits, software installs, and teaching assistants.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Lab Requirements", "success_title": "Requirements Logged"},
                    "fields": [
                        {"id": "max_seats", "name": "max_seats", "label": "Maximum Recommended Classroom Size", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["25 Attendees (Intensive Hands-on)", "50 Attendees (Standard Lab)", "100+ Attendees (Lecture/Demo)"], "category": "choice"},
                        {"id": "prerequisites_software", "name": "prerequisites_software", "label": "Software Packages / Prerequisites for Attendees", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "Docker, Python 3.11, VS Code, AWS CLI...", "category": "basic"},
                        {"id": "lab_assistants", "name": "lab_assistants", "label": "Do you need teaching assistants provided by the organizer?", "type": "radio", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Yes, need 2 student TAs", "No, self-sufficient / bringing own TA"], "category": "choice"},
                    ],
                },

                # ── SPONSOR APPLICATION (5 templates) ──────────────────
                {
                    "name": "Corporate Sponsorship Application",
                    "slug": "corporate-sponsorship-application",
                    "category_key": "sponsor_application",
                    "description": "Official corporate partnership application selecting tier packages (Platinum, Gold, Silver), billing credentials, and logo deliverables.",
                    "is_default": True,
                    "settings": {
                        "submit_button_label": "Submit Sponsorship Request",
                        "success_title": "Sponsorship Application Received!",
                        "success_message": "Our sponsorship coordinator will follow up with the formal contract and tax invoice.",
                    },
                    "fields": [
                        {"id": "company_name", "name": "company_name", "label": "Company / Brand Name", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "placeholder": "e.g. Acme Corp Innovations", "category": "basic"},
                        {"id": "sponsorship_package", "name": "sponsorship_package", "label": "Desired Sponsorship Package", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "options": ["Diamond Title Sponsor ($50,000)", "Platinum Partner ($30,000)", "Gold Sponsor ($15,000)", "Silver Exhibitor ($7,500)"], "category": "choice"},
                        {"id": "billing_email", "name": "billing_email", "label": "Accounts Payable / Invoicing Email", "type": "email", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "placeholder": "finance@company.com", "category": "basic"},
                        {"id": "corporate_website", "name": "corporate_website", "label": "Corporate Website URL", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "placeholder": "https://company.com", "category": "basic"},
                        {"id": "highres_logo", "name": "highres_logo", "label": "High-Resolution Vector Logo (SVG/PNG/PDF)", "type": "file", "is_default": False, "is_required": True, "is_active": True, "sort_order": 4, "category": "media"},
                    ],
                },
                {
                    "name": "Exhibition Booth Space Booking",
                    "slug": "exhibition-booth-booking",
                    "category_key": "sponsor_application",
                    "description": "Commercial exhibition space booking form with square footage, power requirements, fascia text, and staff allocations.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Book Booth Space", "success_title": "Space Reserved"},
                    "fields": [
                        {"id": "booth_size", "name": "booth_size", "label": "Exhibition Booth Dimension Required", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["9 sqm Standard Shell Scheme (3m x 3m)", "18 sqm Double Shell Scheme (6m x 3m)", "36 sqm Island Space Only (Bare Floor)", "54 sqm Premium Pavilion Space"], "category": "choice"},
                        {"id": "fascia_name", "name": "fascia_name", "label": "Exact Name for Booth Fascia Signage", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "placeholder": "Company name as it should appear in 3D lettering", "category": "basic"},
                        {"id": "electrical_power", "name": "electrical_power", "label": "Power & Electrical Supply Requirement", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "options": ["Single Phase 13A Power Socket (Included)", "16A Industrial Power Outlet", "3-Phase 32A Heavy Duty Supply"], "category": "choice"},
                        {"id": "staff_passes_count", "name": "staff_passes_count", "label": "Estimated Number of Booth Staff Badges Needed", "type": "number", "is_default": False, "is_required": True, "is_active": True, "sort_order": 3, "placeholder": "2", "category": "basic"},
                    ],
                },
                {
                    "name": "Startup Alley & Innovation Showcase",
                    "slug": "startup-alley-application",
                    "category_key": "sponsor_application",
                    "description": "Discounted kiosk package for early-stage companies and demo day participants.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Apply for Startup Alley", "success_title": "Application Under Review"},
                    "fields": [
                        {"id": "startup_name", "name": "startup_name", "label": "Startup Name", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "funding_stage", "name": "funding_stage", "label": "Current Funding Stage", "type": "select", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "options": ["Bootstrapped / Pre-Seed", "Seed Stage", "Series A", "Growth / Series B+"], "category": "choice"},
                        {"id": "pitch_deck", "name": "pitch_deck", "label": "Executive Summary / Pitch Deck (PDF)", "type": "file", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "category": "media"},
                        {"id": "demo_url", "name": "demo_url", "label": "Live Demo / Video Link", "type": "text", "is_default": False, "is_required": False, "is_active": True, "sort_order": 3, "placeholder": "https://loom.com/... or https://startup.io", "category": "basic"},
                    ],
                },
                {
                    "name": "Academic & Nonprofit Partner Exhibit Form",
                    "slug": "academic-ngo-partnership",
                    "category_key": "sponsor_application",
                    "description": "Collaborative exhibit and promotional exchange application for universities, societies, and charitable foundations.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Submit Partnership Proposal", "success_title": "Proposal Received"},
                    "fields": [
                        {"id": "ngo_name", "name": "ngo_name", "label": "Society / Academic Institution Name", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "category": "basic"},
                        {"id": "charity_number", "name": "charity_number", "label": "Registered Charity / NGO Number", "type": "text", "is_default": False, "is_required": False, "is_active": True, "sort_order": 1, "category": "basic"},
                        {"id": "reciprocal_promotion", "name": "reciprocal_promotion", "label": "Proposed Barter / Reciprocal Promotion", "type": "textarea", "is_default": False, "is_required": True, "is_active": True, "sort_order": 2, "placeholder": "Newsletter blast to our members, banner placement on our portal...", "category": "basic"},
                    ],
                },
                {
                    "name": "Exclusive Digital & Branding Sponsorship Add-on",
                    "slug": "exclusive-branding-addon",
                    "category_key": "sponsor_application",
                    "description": "A la carte marketing add-ons: lanyard branding, conference app banner, WiFi splash page, and networking coffee breaks.",
                    "is_default": False,
                    "settings": {"submit_button_label": "Reserve Add-On", "success_title": "Add-On Reserved"},
                    "fields": [
                        {"id": "selected_addon", "name": "selected_addon", "label": "Branding Add-on Item", "type": "checkbox", "is_default": False, "is_required": True, "is_active": True, "sort_order": 0, "options": ["Delegate Lanyard & Badge Branding ($8,000)", "Official Mobile App Banner & Push Notification ($5,000)", "Conference WiFi Splash Page Sponsor ($6,500)", "Keynote Coffee Break & Pastry Sponsor ($4,000)", "Charging Lounge Station Branding ($3,500)"], "category": "choice"},
                        {"id": "contact_lead", "name": "contact_lead", "label": "Lead Marketing Contact Person", "type": "text", "is_default": False, "is_required": True, "is_active": True, "sort_order": 1, "category": "basic"},
                        {"id": "special_branding_requests", "name": "special_branding_requests", "label": "Custom Activation Requests", "type": "textarea", "is_default": False, "is_required": False, "is_active": True, "sort_order": 2, "category": "basic"},
                    ],
                },
            ]

            # 3. Bounded global-only initialisation; historical duplicates block.
            existing_tpls = (await self.db.scalars(
                select(FormTemplate).where(
                    FormTemplate.scope_type == "GLOBAL",
                    FormTemplate.organization_id.is_(None),
                    FormTemplate.slug.in_([entry["slug"] for entry in blueprints])
                ).order_by(FormTemplate.id).limit(51).execution_options(shared_form_catalogue=True)
            )).all()

            slug_to_tpls: dict[str, list[FormTemplate]] = {}
            for t in existing_tpls:
                slug_to_tpls.setdefault(t.slug, []).append(t)

            # Never delete history or recreate archived records during startup.
            for slug, tpl_list in slug_to_tpls.items():
                if len(tpl_list) != 1:
                    raise RuntimeError("GLOBAL_FORM_TEMPLATE_RECONCILIATION_REQUIRED")

            # 4. Only provision genuinely missing canonical blueprints.
            for bp in blueprints:
                cat = cat_by_slug.get(bp["category_key"])
                if bp["slug"] in slug_to_tpls and len(slug_to_tpls[bp["slug"]]) > 0:
                    continue
                else:
                    if bp["is_default"]:
                        conflicting_default = await self.db.scalar(select(FormTemplate.id).where(
                            FormTemplate.organization_id.is_(None), FormTemplate.scope_type == "GLOBAL",
                            FormTemplate.category_key == bp["category_key"],
                            FormTemplate.is_default.is_(True), FormTemplate.is_active.is_(True),
                            FormTemplate.deleted_at.is_(None)).limit(1)
                            .execution_options(shared_form_catalogue=True))
                        if conflicting_default is not None:
                            raise RuntimeError("GLOBAL_FORM_DEFAULT_RECONCILIATION_REQUIRED")
                    new_tpl = FormTemplate(
                        id=uuid.uuid4(),
                        name=bp["name"],
                        slug=bp["slug"],
                        category_key=bp["category_key"],
                        category_id=cat.id if cat else None,
                        description=bp["description"],
                        scope_type="GLOBAL",
                        is_default=bp["is_default"],
                        is_system=True,
                        is_active=True,
                        version=1,
                        settings=bp["settings"],
                        fields=bp["fields"],
                    )
                    self.db.add(new_tpl)

            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def list_templates(
        self,
        *,
        organization_id: Optional[uuid.UUID],
        category_key: Optional[str] = None,
        scope_type: Optional[str] = None,
        event_id: Optional[uuid.UUID] = None,
        source_template_id: Optional[uuid.UUID] = None,
        search: Optional[str] = None,
        cursor: Optional[str] = None,
        page_size: int = 50,
    ) -> CursorPage[FormTemplate]:
        # NOTE: _ensure_global_templates() is intentionally NOT called here.
        # It runs once at app startup via ensure_system_template_defaults().
        # Calling it per-request causes parallel race conditions and duplicate rows.
        conditions = [FormTemplate.deleted_at.is_(None), FormTemplate.is_active.is_(True)]
        if category_key and category_key != "all":
            if category_key in ("speaker", "speaker_intake"):
                conditions.append(FormTemplate.category_key.in_(["speaker", "speaker_intake"]))
            else:
                conditions.append(FormTemplate.category_key == category_key)
        if scope_type:
            conditions.append(FormTemplate.scope_type == scope_type)
        visibility = [and_(FormTemplate.scope_type == "GLOBAL", FormTemplate.organization_id.is_(None))]
        if organization_id:
            visibility.append(and_(FormTemplate.organization_id == organization_id, FormTemplate.scope_type == "ORGANIZATION"))
        if event_id:
            visibility.append(
                and_(
                    FormTemplate.scope_type == "EVENT",
                    FormTemplate.organization_id == organization_id,
                    or_(
                        func.jsonb_extract_path_text(FormTemplate.settings, "_event_id") == str(event_id),
                        func.jsonb_extract_path_text(FormTemplate.settings, "event_id") == str(event_id),
                    ),
                )
            )
        if source_template_id:
            conditions.append(
                func.jsonb_extract_path_text(FormTemplate.settings, "_source_template_id")
                == str(source_template_id)
            )
        conditions.append(or_(*visibility))
        if search:
            pattern = f"%{search}%"
            conditions.append(or_(FormTemplate.name.ilike(pattern), FormTemplate.description.ilike(pattern)))
        limit = bounded_page_size(page_size, default=50, maximum=100)
        if cursor:
            position = decode_cursor(cursor)
            conditions.append(or_(
                FormTemplate.created_at < position.occurred_at,
                and_(FormTemplate.created_at == position.occurred_at,
                    FormTemplate.id < position.record_id),
            ))
        result = await self.db.scalars(
            select(FormTemplate)
            .options(selectinload(FormTemplate.category))
            .where(and_(*conditions))
            .order_by(FormTemplate.created_at.desc(), FormTemplate.id.desc())
            .limit(limit + 1)
            .execution_options(shared_form_catalogue=True)
        )
        rows = list(result.all())
        has_next = len(rows) > limit
        items = rows[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id) if has_next and items else None
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)

    async def get_template(self, *, template_id: uuid.UUID) -> Optional[FormTemplate]:
        result = await self.db.scalars(
            select(FormTemplate)
            .options(selectinload(FormTemplate.category))
            .where(FormTemplate.id == template_id, FormTemplate.deleted_at.is_(None))
            .execution_options(shared_form_catalogue=True)
        )
        return result.one_or_none()

    async def get_template_by_slug(self, *, slug: str, organization_id: uuid.UUID,
            event_id: uuid.UUID | None = None,
            scope_types: tuple[str, ...] = ("GLOBAL", "ORGANIZATION", "EVENT"),
            include_inactive: bool = False) -> Optional[FormTemplate]:
        """Resolve a unique legacy selector, never infer a winning scope.

        Ownership/event predicates precede LIMIT. Commands must still lock,
        authorise and revalidate the selected ID before committing any write.
        """
        from fastapi import HTTPException
        from app.core.tenant_context import TenantContextGuard, TenantContextRequired
        if (not isinstance(organization_id, uuid.UUID)
                or TenantContextGuard.current() != organization_id):
            raise TenantContextRequired("Legacy catalogue lookup requires its verified owner context")
        if (not isinstance(scope_types, tuple) or not scope_types
                or not set(scope_types) <= {"GLOBAL", "ORGANIZATION", "EVENT"}
                or not isinstance(include_inactive, bool)):
            raise ValueError("Invalid catalogue lookup scope")
        if not isinstance(slug, str) or not 1 <= len(slug) <= 160:
            return None
        clean_slug = slug.removeprefix("tpl_").replace("_", "-")
        visibility = []
        if "GLOBAL" in scope_types:
            visibility.append(and_(FormTemplate.scope_type == "GLOBAL", FormTemplate.organization_id.is_(None)))
        if "ORGANIZATION" in scope_types:
            visibility.append(and_(FormTemplate.scope_type == "ORGANIZATION", FormTemplate.organization_id == organization_id))
        if "EVENT" in scope_types and event_id is not None:
            bound, legacy = FormTemplate.settings["_event_id"].astext, FormTemplate.settings["event_id"].astext
            visibility.append(and_(FormTemplate.scope_type == "EVENT", FormTemplate.organization_id == organization_id,
                or_(bound == str(event_id), legacy == str(event_id)),
                or_(bound.is_(None), bound == str(event_id)),
                or_(legacy.is_(None), legacy == str(event_id))))
        if not visibility:
            return None
        stmt = (
            select(FormTemplate)
            .options(selectinload(FormTemplate.category))
            .where(
                or_(FormTemplate.slug == slug, FormTemplate.slug == clean_slug),
                FormTemplate.deleted_at.is_(None), or_(*visibility),
            )
            .order_by(FormTemplate.id).limit(2)
            .execution_options(shared_form_catalogue=True)
        )
        if not include_inactive:
            stmt = stmt.where(FormTemplate.is_active.is_(True))
        rows = list((await self.db.scalars(stmt)).all())
        if len(rows) > 1:
            raise HTTPException(409, detail={"code": "AMBIGUOUS_FORM_TEMPLATE", "action": "SELECT_TEMPLATE_BY_ID"})
        return rows[0] if rows else None


class ParticipantRoleQueryService:
    """Read-only event role projection; default provisioning is a command."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(self, *, event_id: uuid.UUID) -> list[ParticipantRole]:
        result = await self.db.scalars(
            select(ParticipantRole)
            .where(ParticipantRole.event_id == event_id)
            .order_by(ParticipantRole.sort_order, ParticipantRole.name)
            .limit(101)
        )
        roles = result.all()
        if len(roles) > 100:
            from fastapi import HTTPException
            raise HTTPException(409, detail={"code": "ROLE_CONFIGURATION_EXCEEDS_BOUNDS"})
        return roles


class CheckInQueryService:
    """Bounded participant check-in history read."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_participant(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        participant_id: uuid.UUID,
    ) -> list[CheckIn]:
        result = await self.db.scalars(
            select(CheckIn)
            .join(Event, Event.id == CheckIn.event_id)
            .where(
                Event.organization_id == organization_id,
                CheckIn.event_id == event_id,
                CheckIn.participant_id == participant_id,
            )
            .order_by(CheckIn.check_in_time.desc(), CheckIn.id.desc())
            .limit(500)
        )
        return result.all()


class PrintTemplateQueryService:
    """Read-only, event-scoped print-template projections."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(
        self,
        *,
        event_id: uuid.UUID,
        template_types: list[str],
    ) -> list[PrintTemplateResponse]:
        result = await self.db.scalars(
            select(PrintTemplate)
            .where(
                PrintTemplate.event_id == event_id,
                PrintTemplate.deleted_at.is_(None),
                PrintTemplate.template_type.in_(template_types),
            )
            .order_by(PrintTemplate.updated_at.desc(), PrintTemplate.id.desc())
            .limit(500)
        )
        return [PrintTemplateResponse.model_validate(template) for template in result.all()]

    async def get_for_event(
        self,
        *,
        event_id: uuid.UUID,
        template_id: uuid.UUID,
    ) -> Optional[PrintTemplateResponse]:
        result = await self.db.scalars(
            select(PrintTemplate).where(
                PrintTemplate.id == template_id,
                PrintTemplate.event_id == event_id,
                PrintTemplate.deleted_at.is_(None),
            )
        )
        template = result.one_or_none()
        return PrintTemplateResponse.model_validate(template) if template else None


class RegistrationDashboardQueryService:
    """Read-only dashboard use case with an explicit event projection boundary.

    The event is resolved and authorized by the router. Passing it through
    prevents a second event lookup and keeps this service free of HTTP logic.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def execute(
        self,
        *,
        email: str,
        event_id: uuid.UUID,
        event: Event,
    ) -> DashboardData:
        if event.id != event_id:
            raise ValueError("Event context mismatch.")
        return await get_dashboard_data(
            email=email,
            event_id=event_id,
            db=self.db,
            event=event,
        )


class ParticipantQueryService:
    """Read-only participant projection used by large event lists."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page_size: int = 100,
        cursor: Optional[str] = None,
        search: Optional[str] = None,
        role: Optional[str] = None,
        paid_status: Optional[str] = None,
    ) -> CursorPage[Participant]:
        """Return a bounded, stable page with relationships preloaded."""
        query = (
            select(Participant)
            .join(Event, Participant.event_id == Event.id)
            .options(
                load_only(
                    Participant.id,
                    Participant.event_id,
                    Participant.regno,
                    Participant.first_name,
                    Participant.last_name,
                    Participant.email,
                    Participant.phone,
                    Participant.role_id,
                    Participant.roles,
                    Participant.track_id,
                    Participant.company,
                    Participant.designation,
                    Participant.country,
                    Participant.approval_status,
                    Participant.paid_status,
                    Participant.badge_status,
                    Participant.checkin_status,
                    Participant.source,
                    Participant.qr_code_url,
                    Participant.custom_fields,
                    Participant.registered_at,
                    Participant.updated_at,
                    Participant.version,
                ),
                selectinload(Participant.role_rel).load_only(ParticipantRole.name),
            )
            .where(
                Event.organization_id == organization_id,
                Participant.event_id == event_id,
                Participant.deleted_at.is_(None),
            )
        )
        if search:
            term = f"%{search}%"
            query = query.where(
                Participant.first_name.ilike(term)
                | Participant.last_name.ilike(term)
                | Participant.email.ilike(term)
                | Participant.phone.ilike(term)
                | Participant.company.ilike(term)
                | Participant.regno.ilike(term)
            )
        if role:
            query = query.where(Participant.role == role)
        if paid_status:
            if paid_status.lower() == "paid":
                query = query.where(Participant.paid_status == "Paid")
            elif paid_status.lower() == "free":
                query = query.where(Participant.paid_status != "Paid")
            else:
                query = query.where(Participant.paid_status == paid_status)

        return await ParticipantRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("registered_at", "id"),
            descending=True,
        )

    async def list_legacy(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        search: str | None,
        role: str | None,
        paid_status: str | None,
        page: int,
        page_size: int,
        payment_enabled: bool,
        active_prices: dict,
    ) -> list[Participant]:
        """Compatibility read for the offset endpoint, kept bounded and eager."""
        # Keep the compatibility route bounded without loading columns that
        # ParticipantResponse never reads. The role is the only relationship
        # needed during serialization, so preload just its display name.
        query = (
            select(Participant)
            .options(
                load_only(
                    Participant.id,
                    Participant.event_id,
                    Participant.regno,
                    Participant.first_name,
                    Participant.last_name,
                    Participant.email,
                    Participant.phone,
                    Participant.role_id,
                    Participant.roles,
                    Participant.track_id,
                    Participant.company,
                    Participant.designation,
                    Participant.country,
                    Participant.approval_status,
                    Participant.paid_status,
                    Participant.badge_status,
                    Participant.checkin_status,
                    Participant.source,
                    Participant.qr_code_url,
                    Participant.custom_fields,
                    Participant.registered_at,
                    Participant.updated_at,
                    Participant.version,
                ),
                selectinload(Participant.role_rel).load_only(ParticipantRole.name),
            )
            .where(
                Event.organization_id == organization_id,
                Participant.event_id == event_id,
                Participant.deleted_at.is_(None),
            )
        )
        if search:
            term = f"%{search}%"
            query = query.where(
                Participant.name.ilike(term)
                | Participant.email.ilike(term)
                | Participant.phone.ilike(term)
                | Participant.company.ilike(term)
                | Participant.regno.ilike(term)
            )
        if role:
            query = query.where(Participant.role == role)
        if paid_status:
            if paid_status.lower() == "free":
                if payment_enabled:
                    query = query.where(Participant.role.in_([name for name, price in active_prices.items() if price <= 0.0]))
            elif paid_status.lower() == "paid":
                query = query.where(Participant.paid_status == "Paid")
                if payment_enabled:
                    query = query.where(Participant.role.in_([name for name, price in active_prices.items() if price > 0.0]))
                else:
                    query = query.where(False)
            else:
                query = query.where(Participant.paid_status == paid_status)
        query = query.order_by(
            Participant.registered_at.desc(),
            Participant.id.desc(),
        ).offset((page - 1) * page_size).limit(page_size)
        return list((await self.db.scalars(query)).all())


class RegistrationQueryService:
    """Read-only registration list query for large and changing datasets."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page_size: int = 100,
        cursor: str | None = None,
        registration_status: str | None = None,
    ) -> CursorPage[ParticipantRegistration]:
        query = (
            select(ParticipantRegistration)
            .options(
                load_only(
                    ParticipantRegistration.id,
                    ParticipantRegistration.event_id,
                    ParticipantRegistration.participant_id,
                    ParticipantRegistration.registration_status,
                    ParticipantRegistration.registration_data,
                    ParticipantRegistration.submitted_at,
                    ParticipantRegistration.reviewed_by,
                    ParticipantRegistration.reviewed_at,
                    ParticipantRegistration.review_notes,
                    ParticipantRegistration.waitlist_position,
                    ParticipantRegistration.rejection_reason,
                    ParticipantRegistration.approval_source,
                    ParticipantRegistration.version,
                )
            )
            .join(Event, ParticipantRegistration.event_id == Event.id)
            .where(
                Event.organization_id == organization_id,
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.deleted_at.is_(None),
            )
        )
        if registration_status:
            query = query.where(
                ParticipantRegistration.registration_status == registration_status
            )
        return await ParticipantRegistrationRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("submitted_at", "id"),
            descending=True,
        )

    async def list_legacy(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page: int,
        page_size: int,
        registration_status: str | None,
    ) -> list[ParticipantRegistration]:
        """Offset-compatible registration read for existing clients."""
        query = (
            select(ParticipantRegistration)
            .join(Event, ParticipantRegistration.event_id == Event.id)
            .where(
                Event.organization_id == organization_id,
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.deleted_at.is_(None),
            )
        )
        if registration_status:
            query = query.where(ParticipantRegistration.registration_status == registration_status)
        query = query.order_by(
            ParticipantRegistration.submitted_at.desc(),
            ParticipantRegistration.id.desc(),
        ).offset((page - 1) * page_size).limit(page_size)
        return list((await self.db.scalars(query)).all())

    async def stats(self, *, organization_id: uuid.UUID, event_id: uuid.UUID) -> dict:
        """Return bounded registration aggregates without loading participants."""
        counts = (await self.db.execute(select(
            func.count(Participant.id),
            func.coalesce(func.sum(case((Participant.paid_status == "Paid", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Participant.paid_status == "Unpaid", 1), else_=0)), 0),
            select(func.count(CheckIn.id)).where(CheckIn.event_id == event_id).scalar_subquery(),
        ).join(Event, Participant.event_id == Event.id).where(Event.organization_id == organization_id, Participant.event_id == event_id, Participant.deleted_at.is_(None)))).one()
        payment_rows = (await self.db.execute(select(
            func.coalesce(func.nullif(Participant.paid_status, ""), "Unspecified"),
            func.count(Participant.id),
        ).join(Event, Participant.event_id == Event.id).where(Event.organization_id == organization_id, Participant.event_id == event_id, Participant.deleted_at.is_(None)).group_by(
            func.coalesce(func.nullif(Participant.paid_status, ""), "Unspecified")
        ).order_by(func.count(Participant.id).desc()))).all()
        role_rows = (await self.db.execute(select(
            ParticipantRole.name, func.count(Participant.id)
        ).select_from(Participant).outerjoin(
            ParticipantRole, ParticipantRole.id == Participant.role_id
        ).join(Event, Participant.event_id == Event.id).where(Event.organization_id == organization_id, Participant.event_id == event_id, Participant.deleted_at.is_(None)).group_by(ParticipantRole.name))).all()
        return {
            "total": counts[0], "paid": counts[1], "unpaid": counts[2],
            "payment_breakdown": {row[0]: row[1] for row in payment_rows},
            "checkins": counts[3],
            "role_breakdown": {row[0] or "Delegate": row[1] for row in role_rows},
        }


class PaymentTransactionQueryService:
    """Read-only, tenant-scoped cursor query for payment history."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_legacy(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        page: int = 1, page_size: int = 100,
    ) -> list[tuple]:
        """Bounded offset compatibility read; cursor pagination is canonical."""
        bounded_page = max(1, page)
        bounded_size = bounded_page_size(page_size, maximum=100)
        query = (
            select(PaymentTransaction, ParticipantRegistration.registration_data)
            .join(Event, PaymentTransaction.event_id == Event.id)
            .outerjoin(
                ParticipantRegistration,
                PaymentTransaction.registration_id == ParticipantRegistration.id,
            )
            .where(
                Event.organization_id == organization_id,
                PaymentTransaction.event_id == event_id,
            )
            .order_by(PaymentTransaction.created_at.desc(), PaymentTransaction.id.desc())
            .offset((bounded_page - 1) * bounded_size)
            .limit(bounded_size)
        )
        return list((await self.db.execute(query)).all())

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page_size: int = 100,
        cursor: str | None = None,
    ) -> CursorPage[tuple]:
        query = (
            select(
                PaymentTransaction,
                ParticipantRegistration.registration_data,
            )
            .join(Event, PaymentTransaction.event_id == Event.id)
            .outerjoin(
                ParticipantRegistration,
                PaymentTransaction.registration_id == ParticipantRegistration.id,
            )
            .where(
                Event.organization_id == organization_id,
                PaymentTransaction.event_id == event_id,
            )
        )
        bounded = bounded_page_size(page_size, maximum=100)
        if cursor:
            token = decode_cursor(cursor)
            query = query.where(
                or_(
                    PaymentTransaction.created_at < token.occurred_at,
                    and_(
                        PaymentTransaction.created_at == token.occurred_at,
                        PaymentTransaction.id < token.record_id,
                    ),
                )
            )
        query = query.order_by(
            PaymentTransaction.created_at.desc(),
            PaymentTransaction.id.desc(),
        ).limit(bounded + 1)
        rows = list((await self.db.execute(query)).all())
        has_next = len(rows) > bounded
        items = rows[:bounded]
        next_cursor = None
        if has_next and items:
            transaction = items[-1][0]
            next_cursor = encode_cursor(transaction.created_at, transaction.id)
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)


class BadgeQueryService:
    """Bounded, tenant-scoped badge and print-history reads."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, badge_id: uuid.UUID
    ) -> Badge | None:
        return await BadgeRepository(self.db).get_for_event(
            badge_id, event_id, organization_id=organization_id
        )

    async def get_print_job_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, job_id: uuid.UUID
    ) -> BadgePrintJob | None:
        return await BadgePrintJobRepository(self.db).get_for_event(
            job_id, event_id, organization_id=organization_id
        )

    async def list_legacy(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, limit: int = 100
    ) -> list[BadgeResponse]:
        """Bounded compatibility listing; the cursor endpoint is canonical."""
        bounded = bounded_page_size(limit, maximum=100)
        rows = await self.db.scalars(
            BadgeRepository(self.db).scoped_statement(
                event_id, organization_id=organization_id
            )
            .order_by(Badge.created_at.desc(), Badge.id.desc())
            .limit(bounded)
        )
        return [BadgeResponse.model_validate(row) for row in rows.all()]

    async def history_legacy(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        badge_id: uuid.UUID | None = None, limit: int = 100,
    ) -> list[BadgeHistoryResponse]:
        bounded = bounded_page_size(limit, maximum=100)
        query = BadgeHistoryRepository(self.db).scoped_statement(
            event_id, organization_id=organization_id
        )
        if badge_id:
            query = query.where(BadgeHistory.badge_id == badge_id)
        rows = await self.db.scalars(
            query.order_by(BadgeHistory.created_at.desc(), BadgeHistory.id.desc())
            .limit(bounded)
        )
        return [BadgeHistoryResponse.model_validate(row) for row in rows.all()]

    async def print_jobs_legacy(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, limit: int = 100
    ) -> list[BadgePrintJobResponse]:
        bounded = bounded_page_size(limit, maximum=100)
        rows = await self.db.scalars(
            BadgePrintJobRepository(self.db).scoped_statement(
                event_id, organization_id=organization_id
            )
            .order_by(BadgePrintJob.queued_at.desc(), BadgePrintJob.id.desc())
            .limit(bounded)
        )
        return [BadgePrintJobResponse.model_validate(row) for row in rows.all()]

    async def list_page(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        page_size: int = 100, cursor: str | None = None,
    ) -> CursorPage[BadgeResponse]:
        query = BadgeRepository(self.db).scoped_statement(
            event_id, organization_id=organization_id
        )
        page = await BadgeRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("created_at", "id"),
            descending=True,
        )
        return CursorPage(
            items=[BadgeResponse.model_validate(item) for item in page.items],
            next_cursor=page.next_cursor,
            has_next=page.has_next,
        )

    async def history_page(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        page_size: int = 100, cursor: str | None = None,
        badge_id: uuid.UUID | None = None,
    ) -> CursorPage[BadgeHistoryResponse]:
        query = BadgeHistoryRepository(self.db).scoped_statement(
            event_id, organization_id=organization_id
        )
        if badge_id:
            query = query.where(BadgeHistory.badge_id == badge_id)
        page = await BadgeHistoryRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("created_at", "id"),
            descending=True,
        )
        return CursorPage(
            items=[BadgeHistoryResponse.model_validate(item) for item in page.items],
            next_cursor=page.next_cursor,
            has_next=page.has_next,
        )

    async def print_jobs_page(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        page_size: int = 100, cursor: str | None = None,
    ) -> CursorPage[BadgePrintJobResponse]:
        query = BadgePrintJobRepository(self.db).scoped_statement(
            event_id, organization_id=organization_id
        )
        page = await BadgePrintJobRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("queued_at", "id"),
            descending=True,
        )
        return CursorPage(
            items=[BadgePrintJobResponse.model_validate(item) for item in page.items],
            next_cursor=page.next_cursor,
            has_next=page.has_next,
        )


class ImportJobQueryService:
    """Bounded, tenant-scoped import history read."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_recent(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, limit: int = 50
    ) -> list[ImportJobResponse]:
        query = ImportJobRepository(self.db).scoped_statement(
            event_id, organization_id=organization_id
        ).order_by(ImportJob.created_at.desc(), ImportJob.id.desc()).limit(
            min(max(limit, 1), 100)
        )
        result = await self.db.scalars(query)
        return [ImportJobResponse.model_validate(item) for item in result.all()]

    async def get_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, job_id: uuid.UUID
    ) -> Optional[ImportJobResponse]:
        query = ImportJobRepository(self.db).scoped_statement(
            event_id, organization_id=organization_id
        ).where(ImportJob.id == job_id)
        result = await self.db.scalars(query)
        item = result.one_or_none()
        return ImportJobResponse.model_validate(item) if item else None

    async def list_page(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        page_size: int = 100, cursor: str | None = None,
    ) -> CursorPage[ImportJobResponse]:
        query = ImportJobRepository(self.db).scoped_statement(
            event_id, organization_id=organization_id
        )
        page = await ImportJobRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("created_at", "id"),
            descending=True,
        )
        return CursorPage(
            items=[ImportJobResponse.model_validate(item) for item in page.items],
            next_cursor=page.next_cursor,
            has_next=page.has_next,
        )
