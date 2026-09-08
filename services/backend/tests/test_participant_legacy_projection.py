from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_legacy_participant_list_uses_explicit_projection_and_eager_role():
    source = (ROOT / "app/modules/registration/application/queries.py").read_text(
        encoding="utf-8"
    )
    region = source.split("    async def list_legacy(", 1)[1].split(
        "\n\n\nclass RegistrationQueryService", 1
    )[0]
    assert "load_only(" in region
    assert "Participant.custom_fields" in region
    assert "selectinload(Participant.role_rel).load_only(ParticipantRole.name)" in region
    assert ".offset((page - 1) * page_size).limit(page_size)" in region


def test_legacy_participant_projection_has_no_transaction_ownership():
    source = (ROOT / "app/modules/registration/application/queries.py").read_text(
        encoding="utf-8"
    )
    region = source.split("    async def list_legacy(", 1)[1].split(
        "\n\n\nclass RegistrationQueryService", 1
    )[0]
    assert "commit(" not in region
    assert "rollback(" not in region
