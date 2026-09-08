from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_legacy_participant_page_has_stable_timestamp_id_ordering():
    source = (ROOT / "app/modules/registration/application/queries.py").read_text(encoding="utf-8")
    legacy = source.split("    async def list_legacy(", 1)[1].split("\n\n\nclass RegistrationQueryService", 1)[0]
    assert "Participant.registered_at.desc()" in legacy
    assert "Participant.id.desc()" in legacy
    assert ".offset((page - 1) * page_size).limit(page_size)" in legacy
    assert "commit(" not in legacy
