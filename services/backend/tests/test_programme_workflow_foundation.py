import inspect

import pytest
from pydantic import ValidationError

from app.modules.programme.queries import ProgrammeQueryService
from app.modules.programme.router import _hash_token, inspect_access_grant, issue_access_grant
from app.modules.programme.schemas import ProgrammeAccessGrantCreate, ProgrammeMembershipCreate
from app.modules.abstracts.router import AbstractCallPayload


def test_programme_access_grants_are_scoped_and_hash_the_raw_token():
    payload = ProgrammeAccessGrantCreate(audience="AUTHOR", email="author@example.com")
    assert payload.expires_in_days == 14
    assert len(_hash_token("programme-token")) == 64
    assert _hash_token("programme-token") != "programme-token"

    with pytest.raises(ValidationError):
        ProgrammeAccessGrantCreate(audience="ADMIN", email="author@example.com")


def test_programme_membership_roles_are_bounded():
    assert ProgrammeMembershipCreate(email="reviewer@example.com", display_name="Reviewer").role == "EVALUATOR"
    with pytest.raises(ValidationError):
        ProgrammeMembershipCreate(email="reviewer@example.com", display_name="Reviewer", role="ROOT")


def test_programme_read_boundary_and_grant_issuer_preserve_safety_contracts():
    query_source = inspect.getsource(ProgrammeQueryService.lifecycle)
    issue_source = inspect.getsource(issue_access_grant)
    inspect_source = inspect.getsource(inspect_access_grant)
    assert "db.commit" not in query_source
    assert "event_id == event_id" in query_source
    assert "organization_id == organization_id" in query_source
    assert "token_hash=_hash_token(raw_token)" in issue_source
    assert "ACCESS_GRANT_REPLAY_REQUIRES_RESEND" in issue_source
    assert "token_hash == _hash_token(token)" in inspect_source
    assert "permissions" not in inspect_source.split("return", 1)[1]


def test_public_author_and_reviewer_routes_preserve_scoped_workflow_guards():
    import inspect
    from app.modules.programme.router import (
        list_author_submissions, revise_author_abstract, reviewer_assignments, submit_public_review, withdraw_author_abstract,
        _submit_scoped_public_review,
    )

    author_revision = inspect.getsource(revise_author_abstract)
    author_withdrawal = inspect.getsource(withdraw_author_abstract)
    reviewer_list = inspect.getsource(reviewer_assignments)
    reviewer_submit = inspect.getsource(submit_public_review) + inspect.getsource(_submit_scoped_public_review)
    from app.modules.programme.rubric_integrity import validate_review_scores
    score_contract = inspect.getsource(validate_review_scores)
    assert "validate_review_scores(rubric, payload.scores)" in reviewer_submit
    assert "TenantContextGuard.scoped" in inspect.getsource(submit_public_review)
    assert "TenantContextGuard.current() != grant.organization_id" in inspect.getsource(_submit_scoped_public_review)
    assert "_author_grant" in author_revision
    assert "revision_deadline" in author_revision
    assert "raise_version_conflict" in author_revision and "raise_version_conflict" in author_withdrawal
    assert "blind_review_enabled" in reviewer_list
    assert "reviewer_id == reviewer.id" in reviewer_submit
    assert "with_for_update()" in reviewer_submit
    assert "ABSTRACT_REVIEW_DEADLINE_PASSED" in reviewer_submit
    assert "ABSTRACT_REVIEW_SCORES_INCOMPLETE" in score_contract
    assert "ABSTRACT_REVIEW_SCORE_OUT_OF_RANGE" in score_contract
    assert "AbstractReviewer.organization_id == grant.organization_id" in inspect.getsource(__import__("app.modules.programme.router", fromlist=["_reviewer_grant"])._reviewer_grant)
    assert "AbstractAssignment.organization_id == grant.organization_id" in reviewer_submit
    assert "AbstractSubmission.organization_id == grant.organization_id" in inspect.getsource(list_author_submissions)


def test_abstract_submission_query_supports_event_scoped_operational_filters():
    from app.modules.abstracts.application.queries import AbstractQueryService
    from app.modules.abstracts.router import list_submissions

    query_source = inspect.getsource(AbstractQueryService.list_submissions)
    route_source = inspect.getsource(list_submissions)
    assert "organization_id" in query_source
    assert "AbstractSubmission.track == track" in query_source
    assert "AbstractSubmission.abstract_type == abstract_type.upper()" in query_source
    assert 'alias="format"' in route_source


def test_speaker_portal_invitation_profile_and_participation_are_durable():
    import inspect
    from app.modules.programme.router import (
        issue_speaker_invitation, speaker_programme_portal,
        update_speaker_programme_profile, update_speaker_programme_participation,
        upload_speaker_programme_headshot,
    )
    invitation = inspect.getsource(issue_speaker_invitation)
    profile = inspect.getsource(update_speaker_programme_profile)
    participation = inspect.getsource(update_speaker_programme_participation)
    assert 'audience="SPEAKER"' in invitation
    assert "token_hash=_hash_token(raw_token)" in invitation
    assert "with_for_update()" in profile
    assert "RESOURCE_VERSION_CONFLICT" in profile or "raise_version_conflict" in profile
    assert "programme.speaker_profile.update" in profile
    assert "complete_idempotent" in profile
    assert "photo_url" in profile
    assert "programme.speaker_participation.update" in participation
    assert "complete_idempotent" in participation
    assert "programme_availability" in inspect.getsource(__import__("app.modules.programme.router", fromlist=["_speaker_portal_response"])._speaker_portal_response)
    assert "programme_custom_fields" in inspect.getsource(update_speaker_programme_profile)
    assert "programme_travel_details" in inspect.getsource(update_speaker_programme_profile)
    portal_response = inspect.getsource(__import__("app.modules.programme.router", fromlist=["_speaker_portal_response"])._speaker_portal_response)
    assert "selectinload(Speaker.presentation_files)" in portal_response
    headshot = inspect.getsource(upload_speaker_programme_headshot)
    assert "If-Match" in headshot
    assert "S3_BUCKET_ASSETS" in headshot
    assert "programme.speaker_headshot.upload" in headshot


def test_speaker_invitation_revocation_and_readiness_are_explicit():
    import inspect
    from app.modules.programme.router import revoke_access_grant
    from app.modules.speakers.schemas.speaker import SpeakerSummary

    revoke_source = inspect.getsource(revoke_access_grant)
    assert "revoked_at" in revoke_source
    assert "ACCESS_GRANT_NOT_FOUND" in revoke_source
    assert {"programme_availability", "programme_custom_fields", "programme_travel_details", "programme_readiness"}.issubset(
        SpeakerSummary.model_fields
    )


def test_targeted_speaker_campaigns_are_durable_and_replay_safe():
    import inspect
    from app.modules.notifications.routers.notifications import send_to_speakers

    source = inspect.getsource(send_to_speakers)
    assert 'operation="programme.speaker_campaign.send"' in source
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert "status=\"sending\" if data.send_immediately else \"draft\"" in source
    assert "One or more selected speakers do not belong to this event" in source


def test_auto_invite_campaign_has_one_durable_dispatch_intent():
    import inspect
    from app.modules.notifications.routers.notifications import auto_invite_speakers

    source = inspect.getsource(auto_invite_speakers)
    assert 'operation="programme.speaker_auto_invite.send"' in source
    assert "begin_idempotent" in source
    assert "complete_idempotent" in source
    assert 'status="sending"' in source


def test_abstract_reviews_and_decisions_are_replay_safe_and_stateful():
    import inspect
    from app.modules.abstracts.application.decision_commands import AbstractDecisionCommandService
    from app.modules.abstracts.application.review_commands import AbstractReviewCommandService
    from app.modules.abstracts.models import AbstractReview
    from app.modules.abstracts.router import decide_submissions_bulk
    assert any(constraint.name == "uq_abstract_reviews_assignment_id" for constraint in AbstractReview.__table__.constraints)
    assert "abstract.review.submit" in inspect.getsource(AbstractReviewCommandService.submit)
    assert '"WAITLISTED"' in inspect.getsource(AbstractDecisionCommandService.decide)
    assert "decide_many" in inspect.getsource(decide_submissions_bulk)


def test_public_author_contract_preserves_coauthors_attachments_and_replay_boundaries():
    import inspect
    from app.modules.programme.router import add_author_attachment, list_author_submissions, revise_author_abstract
    from app.modules.programme.router import upload_author_attachment
    from app.modules.programme.schemas import PublicAbstractAttachmentCreate, PublicAbstractSubmissionResponse

    response_fields = PublicAbstractSubmissionResponse.model_fields
    assert {"abstract_type", "track", "form_payload", "authors", "attachments"}.issubset(response_fields)
    attachment = PublicAbstractAttachmentCreate(filename="poster.pdf", storage_path="events/e1/abstracts/a1/poster.pdf", file_size_bytes=1024)
    assert attachment.kind == "SUPPORTING_FILE"
    assert "begin_idempotent" in inspect.getsource(add_author_attachment)
    assert "AbstractAuthor" in inspect.getsource(list_author_submissions)
    assert "AbstractAuthor" in inspect.getsource(revise_author_abstract)
    assert "revision_deadline" in inspect.getsource(revise_author_abstract)
    upload_source = inspect.getsource(upload_author_attachment)
    assert "S3_BUCKET_ASSETS" in upload_source
    assert "programme.author.attachment.upload" in upload_source
    assert "ABSTRACT_ATTACHMENT_TYPE_UNSUPPORTED" in upload_source


def test_abstract_call_builder_rejects_invalid_schedule_and_duplicate_choices():
    with pytest.raises(ValidationError):
        AbstractCallPayload(min_words=500, max_words=100)
    with pytest.raises(ValidationError):
        AbstractCallPayload(opens_at="2026-09-10T10:00:00Z", closes_at="2026-09-10T09:00:00Z")
    with pytest.raises(ValidationError):
        AbstractCallPayload(abstract_types=["ORAL", "ORAL"])


def test_author_confirmation_is_versioned_and_replay_safe():
    import inspect
    from app.modules.programme.router import confirm_author_abstract
    from app.modules.programme.schemas import PublicAbstractSubmissionResponse

    source = inspect.getsource(confirm_author_abstract)
    assert "_author_grant" in source
    assert "with_for_update()" in source
    assert "raise_version_conflict" in source
    assert 'operation="programme.author_submission.confirm"' in source
    assert "complete_idempotent" in source
    assert "author_confirmation" in source
    assert "author_confirmation" in PublicAbstractSubmissionResponse.model_fields


def test_public_abstract_submission_enforces_published_form_and_disclosure_rules():
    import inspect
    from app.modules.programme.router import _validate_public_submission_form, revise_author_abstract, submit_author_abstract

    helper = inspect.getsource(_validate_public_submission_form)
    assert "ABSTRACT_FORM_FIELD_REQUIRED" in helper
    assert "ABSTRACT_DISCLOSURE_REQUIRED" in helper
    assert "published_at.is_not(None)" in helper
    assert "_validate_public_submission_form" in inspect.getsource(submit_author_abstract)
    assert "_validate_public_submission_form" in inspect.getsource(revise_author_abstract)
