from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.modules.events.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.badge_models import Badge, BadgeHistory, BadgePrintJob
from app.modules.registration.schemas.badge import BadgeHistoryResponse, BadgePrintJobResponse, BadgeResponse
from app.modules.registration.models.import_job import ImportJob
from app.modules.registration.schemas.import_job import ImportJobResponse
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.schemas.form_builder import FormTemplateResponse
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.schemas.print_template import PrintTemplateResponse
from app.infrastructure.repositories import Repository
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor
from app.modules.registration.services.portal_service import DashboardData, get_dashboard_data


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


class FormBuilderQueryService:
    """Read-only projections for form builder catalog reads."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_categories(self, *, organization_id: Optional[uuid.UUID]) -> list[FormCategory]:
        conditions = [FormCategory.deleted_at.is_(None), FormCategory.is_active.is_(True)]
        if organization_id:
            conditions.append(
                or_(FormCategory.is_system.is_(True), FormCategory.organization_id == organization_id)
            )
        else:
            conditions.append(FormCategory.is_system.is_(True))
        result = await self.db.scalars(
            select(FormCategory)
            .where(and_(*conditions))
            .order_by(FormCategory.sort_order, FormCategory.created_at)
        )
        return result.all()

    @staticmethod
    def _to_template_response(template: FormTemplate) -> FormTemplateResponse:
        category_name = (
            template.category.name
            if template.category
            else template.category_key.replace("_", " ").title()
        )
        return FormTemplateResponse(
            id=template.id,
            category_id=template.category_id,
            organization_id=template.organization_id,
            event_id=None,
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
        """Seed standard database-backed form templates if none exist."""
        try:
            count = await self.db.scalar(
                select(func.count(FormTemplate.id)).where(
                    FormTemplate.scope_type == "GLOBAL",
                    FormTemplate.deleted_at.is_(None)
                )
            )
            if count and count > 0:
                return

            default_tpl = FormTemplate(
                id=uuid.uuid4(),
                name="Standard Event Registration Form",
                slug="standard-event-registration",
                category_key="registration",
                description="The complete enterprise conference attendee registration questionnaire with identity verification, institutional profile, country selector, and registration category.",
                scope_type="GLOBAL",
                is_default=True,
                is_system=True,
                is_active=True,
                version=1,
                settings={
                    "steps": [
                        {"id": "step_1", "title": "Registration Details", "description": "Enter your verified identity and professional credentials"}
                    ],
                    "submit_button_label": "Complete Registration",
                    "success_title": "Registration Confirmed!",
                    "success_message": "Your registration has been successfully processed.",
                    "terms_and_conditions": "1. All registrations are subject to verification.\n2. Cancellation and refund policies apply as defined by the event organizer.\n3. Attendees agree to abide by the event code of conduct and safety regulations.",
                    "include_default_faqs": True,
                },
                fields=[
                    {
                        "id": "title",
                        "name": "title",
                        "label": "Title / Prefix",
                        "type": "select",
                        "is_default": True,
                        "is_required": False,
                        "is_active": True,
                        "sort_order": 0,
                        "step_index": 0,
                        "placeholder": "Select title",
                        "options": ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."],
                    },
                    {
                        "id": "first_name",
                        "name": "first_name",
                        "label": "First Name",
                        "type": "text",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 1,
                        "step_index": 0,
                        "placeholder": "Enter your first name",
                    },
                    {
                        "id": "last_name",
                        "name": "last_name",
                        "label": "Last Name",
                        "type": "text",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 2,
                        "step_index": 0,
                        "placeholder": "Enter your last name",
                    },
                    {
                        "id": "email",
                        "name": "email",
                        "label": "Email Address",
                        "type": "email",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 3,
                        "step_index": 0,
                        "placeholder": "attendee@example.com",
                    },
                    {
                        "id": "phone",
                        "name": "phone",
                        "label": "Phone Number",
                        "type": "phone",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 4,
                        "step_index": 0,
                        "placeholder": "Enter mobile number",
                    },
                    {
                        "id": "company",
                        "name": "company",
                        "label": "Institution / Organization",
                        "type": "text",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 5,
                        "step_index": 0,
                        "placeholder": "Enter institution, university, or organization",
                    },
                    {
                        "id": "designation",
                        "name": "designation",
                        "label": "Job Title / Designation",
                        "type": "text",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 6,
                        "step_index": 0,
                        "placeholder": "e.g. Senior Consultant / Lead Engineer",
                    },
                    {
                        "id": "country",
                        "name": "country",
                        "label": "Country & State",
                        "type": "country",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 7,
                        "step_index": 0,
                        "placeholder": "Select your country",
                    },
                    {
                        "id": "role",
                        "name": "role",
                        "label": "Registration Role / Category",
                        "type": "select",
                        "is_default": True,
                        "is_required": True,
                        "is_active": True,
                        "sort_order": 8,
                        "step_index": 0,
                        "placeholder": "Select your role category",
                        "options": ["Delegate", "Student Delegate", "VIP Guest"],
                    },
                ],
            )
            self.db.add(default_tpl)
            await self.db.commit()
        except Exception:
            await self.db.rollback()

    async def list_templates(
        self,
        *,
        organization_id: Optional[uuid.UUID],
        category_key: Optional[str] = None,
        scope_type: Optional[str] = None,
        event_id: Optional[uuid.UUID] = None,  # kept for API compat, not filtered at DB level
        search: Optional[str] = None,
    ) -> list[FormTemplateResponse]:
        await self._ensure_global_templates()
        conditions = [FormTemplate.deleted_at.is_(None), FormTemplate.is_active.is_(True)]
        if category_key and category_key != "all":
            conditions.append(FormTemplate.category_key == category_key)
        if scope_type:
            conditions.append(FormTemplate.scope_type == scope_type)
        visibility = [FormTemplate.scope_type == "GLOBAL"]
        if organization_id:
            visibility.append(FormTemplate.organization_id == organization_id)
        # event_id column does not exist in DB — skip that filter
        conditions.append(or_(*visibility))
        if search:
            pattern = f"%{search}%"
            conditions.append(or_(FormTemplate.name.ilike(pattern), FormTemplate.description.ilike(pattern)))
        result = await self.db.scalars(
            select(FormTemplate)
            .options(selectinload(FormTemplate.category))
            .where(and_(*conditions))
            .order_by(FormTemplate.is_default.desc(), FormTemplate.created_at.desc())
            .limit(500)
        )
        return [self._to_template_response(template) for template in result.all()]

    async def get_template(self, *, template_id: uuid.UUID) -> Optional[FormTemplateResponse]:
        result = await self.db.scalars(
            select(FormTemplate)
            .options(selectinload(FormTemplate.category))
            .where(FormTemplate.id == template_id, FormTemplate.deleted_at.is_(None))
        )
        template = result.one_or_none()
        return self._to_template_response(template) if template else None

    async def get_template_by_slug(self, *, slug: str) -> Optional[FormTemplateResponse]:
        """Lookup a form template by its string slug (e.g. 'tpl_standard_registration' or 'standard-event-registration')."""
        await self._ensure_global_templates()
        clean_slug = slug.replace("tpl_", "").replace("_", "-")
        result = await self.db.scalars(
            select(FormTemplate)
            .options(selectinload(FormTemplate.category))
            .where(
                or_(FormTemplate.slug == slug, FormTemplate.slug == clean_slug),
                FormTemplate.deleted_at.is_(None)
            )
        )
        template = result.first()
        return self._to_template_response(template) if template else None


class ParticipantRoleQueryService:
    """Read-only event role projection; default provisioning is a command."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(self, *, event_id: uuid.UUID) -> list[ParticipantRole]:
        result = await self.db.scalars(
            select(ParticipantRole)
            .where(ParticipantRole.event_id == event_id)
            .order_by(ParticipantRole.sort_order, ParticipantRole.name)
            .limit(500)
        )
        return result.all()


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

        return await Repository(self.db, Participant).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("registered_at", "id"),
            descending=True,
        )

    async def list_legacy(
        self,
        *,
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
        query = select(Participant).options(selectinload(Participant.role_rel)).where(
            Participant.event_id == event_id,
            Participant.deleted_at.is_(None),
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
        query = query.order_by(Participant.registered_at.desc()).offset((page - 1) * page_size).limit(page_size)
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
        return await Repository(self.db, ParticipantRegistration).cursor_page(
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

    async def stats(self, *, event_id: uuid.UUID) -> dict:
        """Return bounded registration aggregates without loading participants."""
        counts = (await self.db.execute(select(
            func.count(Participant.id),
            func.coalesce(func.sum(case((Participant.paid_status == "Paid", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Participant.paid_status == "Unpaid", 1), else_=0)), 0),
            select(func.count(CheckIn.id)).where(CheckIn.event_id == event_id).scalar_subquery(),
        ).where(Participant.event_id == event_id, Participant.deleted_at.is_(None)))).one()
        payment_rows = (await self.db.execute(select(
            func.coalesce(func.nullif(Participant.paid_status, ""), "Unspecified"),
            func.count(Participant.id),
        ).where(Participant.event_id == event_id, Participant.deleted_at.is_(None)).group_by(
            func.coalesce(func.nullif(Participant.paid_status, ""), "Unspecified")
        ).order_by(func.count(Participant.id).desc()))).all()
        role_rows = (await self.db.execute(select(
            ParticipantRole.name, func.count(Participant.id)
        ).select_from(Participant).outerjoin(
            ParticipantRole, ParticipantRole.id == Participant.role_id
        ).where(Participant.event_id == event_id, Participant.deleted_at.is_(None)).group_by(ParticipantRole.name))).all()
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

    async def list_page(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        page_size: int = 100, cursor: str | None = None,
    ) -> CursorPage[BadgeResponse]:
        query = (
            select(Badge)
            .join(Participant, Participant.id == Badge.participant_id)
            .join(Event, Event.id == Participant.event_id)
            .where(
                Event.organization_id == organization_id,
                Participant.event_id == event_id,
            )
        )
        page = await Repository(self.db, Badge).cursor_page(
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
        query = (
            select(BadgeHistory)
            .join(Badge, Badge.id == BadgeHistory.badge_id)
            .join(Participant, Participant.id == Badge.participant_id)
            .join(Event, Event.id == Participant.event_id)
            .where(
                Event.organization_id == organization_id,
                Participant.event_id == event_id,
            )
        )
        if badge_id:
            query = query.where(BadgeHistory.badge_id == badge_id)
        page = await Repository(self.db, BadgeHistory).cursor_page(
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
        query = (
            select(BadgePrintJob)
            .join(Badge, Badge.id == BadgePrintJob.badge_id)
            .join(Participant, Participant.id == Badge.participant_id)
            .join(Event, Event.id == Participant.event_id)
            .where(
                Event.organization_id == organization_id,
                Participant.event_id == event_id,
            )
        )
        page = await Repository(self.db, BadgePrintJob).cursor_page(
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
        result = await self.db.scalars(
            select(ImportJob)
            .join(Event, Event.id == ImportJob.event_id)
            .where(Event.organization_id == organization_id, ImportJob.event_id == event_id)
            .order_by(ImportJob.created_at.desc(), ImportJob.id.desc())
            .limit(min(max(limit, 1), 100))
        )
        return [ImportJobResponse.model_validate(item) for item in result.all()]

    async def get_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, job_id: uuid.UUID
    ) -> Optional[ImportJobResponse]:
        result = await self.db.scalars(
            select(ImportJob)
            .join(Event, Event.id == ImportJob.event_id)
            .where(
                Event.organization_id == organization_id,
                ImportJob.event_id == event_id,
                ImportJob.id == job_id,
            )
        )
        item = result.one_or_none()
        return ImportJobResponse.model_validate(item) if item else None

    async def list_page(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        page_size: int = 100, cursor: str | None = None,
    ) -> CursorPage[ImportJobResponse]:
        query = (
            select(ImportJob)
            .join(Event, Event.id == ImportJob.event_id)
            .where(
                Event.organization_id == organization_id,
                ImportJob.event_id == event_id,
            )
        )
        page = await Repository(self.db, ImportJob).cursor_page(
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
