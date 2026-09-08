from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_participant_email_update_uses_bounded_duplicate_lookup():
    source = (ROOT / "app/modules/events/services/event_participant_mutation_service.py").read_text(encoding="utf-8")
    email_region = source.split('if "email" in changes:', 1)[1].split('old_role =', 1)[0]
    assert "await EventParticipantMutationService._email_exists" in email_region
    assert "active = list(" not in email_region


def test_participant_create_and_restore_reuse_bounded_email_lookup():
    source = (ROOT / "app/modules/events/services/event_participant_mutation_service.py").read_text(encoding="utf-8")
    assert "async def _email_exists(" in source
    helper = source.split("    async def _email_exists(", 1)[1].split("    @staticmethod", 1)[0]
    assert "func.lower(Participant.email)" in helper
    assert 'custom_fields["additional_emails"]' in helper
    assert ".limit(1)" in helper
    assert "await EventParticipantMutationService._email_exists" in source


def test_profile_merge_candidates_are_prefiltered_for_postgresql():
    source = (ROOT / "app/modules/events/services/event_participant_mutation_service.py").read_text(encoding="utf-8")
    region = source.split("    async def _profile_candidates(", 1)[1].split("    @staticmethod", 1)[0]
    assert 'if bind.dialect.name == "postgresql"' in region
    assert "func.regexp_replace" in region
    assert "func.right" in region
    assert "selectinload(Participant.role_rel)" in region
