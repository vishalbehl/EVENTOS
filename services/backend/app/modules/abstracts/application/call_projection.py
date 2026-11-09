"""One allowlisted aggregate read, usable before a writer commits."""
from sqlalchemy import select
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.abstracts.models import AbstractCall, AbstractPortalSettings, AbstractCategory, AbstractTopic, AbstractFormat
from app.modules.abstracts.call_contracts import AbstractCallResponse


async def call_response(db: AsyncSession, row: AbstractCall) -> AbstractCallResponse:
    portal = await db.scalar(select(AbstractPortalSettings).where(AbstractPortalSettings.event_id == row.event_id,
        AbstractPortalSettings.organization_id == row.organization_id))
    portal_dict = None
    if portal:
        portal_dict = {
            "submission_portal": {
                "access_mode": portal.sub_access_mode,
                "show_countdown_banner": portal.sub_show_countdown,
                "show_taxonomy_guide": portal.sub_show_taxonomy_guide,
                "guidelines_text": portal.sub_guidelines_text,
                "allow_author_edits": portal.sub_allow_edits,
                "allow_author_withdrawal": portal.sub_allow_withdrawal,
                "require_coauthor_verification": portal.sub_require_coauthor_verify,
                "feedback_release_policy": portal.sub_feedback_policy,
                "success_message": portal.sub_success_message,
                "support_email": portal.sub_support_email,
                "support_phone": portal.sub_support_phone,
            },
            "review_portal": {
                "redact_author_names": portal.rev_redact_author_names,
                "redact_affiliations": portal.rev_redact_affiliations,
                "redact_coauthors": portal.rev_redact_coauthors,
                "peer_visibility_mode": portal.rev_peer_visibility,
                "show_aggregate_scores": portal.rev_show_aggregate_scores,
                "allow_review_editing": portal.rev_allow_editing,
                "mandatory_comments_policy": portal.rev_mandatory_comments,
                "enforce_coi_declaration": portal.rev_enforce_coi,
                "auto_warn_institutional_conflict": portal.rev_auto_warn_institution,
                "in_browser_pdf_viewer": portal.rev_in_browser_pdf,
                "reminders": {
                    "remind_72h": portal.rev_remind_72h,
                    "remind_48h": portal.rev_remind_48h,
                    "remind_24h": portal.rev_remind_24h,
                },
            },
        }

    # Relational categories
    cats = list((await db.scalars(
        select(AbstractCategory.name)
        .where(AbstractCategory.event_id == row.event_id, AbstractCategory.organization_id == row.organization_id,
            AbstractCategory.is_active.is_(True))
        .order_by(AbstractCategory.sort_order, AbstractCategory.name).limit(101)
    )).all())

    # Relational topics
    top_names = list((await db.scalars(
        select(AbstractTopic.name)
        .where(AbstractTopic.event_id == row.event_id, AbstractTopic.organization_id == row.organization_id,
            AbstractTopic.is_active.is_(True))
        .order_by(AbstractTopic.sort_order, AbstractTopic.name).limit(201)
    )).all())

    # Relational formats
    fmt_codes = list((await db.scalars(
        select(AbstractFormat.code)
        .where(AbstractFormat.event_id == row.event_id, AbstractFormat.organization_id == row.organization_id,
            AbstractFormat.is_active.is_(True))
        .order_by(AbstractFormat.sort_order, AbstractFormat.code).limit(21)
    )).all())

    data = {
        field: getattr(row, field)
        for field in AbstractCallResponse.model_fields
        if hasattr(row, field) and getattr(row, field) is not None
    }
    if top_names:
        data["topics"] = top_names
    if fmt_codes:
        data["abstract_types"] = fmt_codes
    if cats:
        data["categories"] = cats
    elif isinstance(row.author_rules, dict) and "categories" in row.author_rules:
        data["categories"] = row.author_rules["categories"]
    if portal_dict:
        data["portal_settings"] = portal_dict
    elif isinstance(row.author_rules, dict) and "portal_settings" in row.author_rules:
        data["portal_settings"] = row.author_rules["portal_settings"]
    if "allowed_file_extensions" in data and isinstance(data["allowed_file_extensions"], str):
        data["allowed_file_extensions"] = [x.strip() for x in data["allowed_file_extensions"].split(",") if x.strip()]
    try:
        return AbstractCallResponse(**data)
    except ValueError:
        raise HTTPException(409, detail={"code": "ABSTRACT_CALL_RECONCILIATION_REQUIRED"})
    except HTTPException as exc:
        if exc.status_code != 422:
            raise
        raise HTTPException(409, detail={"code": "ABSTRACT_CALL_RECONCILIATION_REQUIRED"}) from exc
