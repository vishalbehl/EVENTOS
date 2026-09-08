from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_postgresql_regno_allocation_is_set_based_and_preserves_gap_semantics():
    source = (ROOT / "app/modules/registration/routers/participants.py").read_text(
        encoding="utf-8"
    )
    region = source.split("async def generate_next_regno(", 1)[1].split(
        "\n\nDEFAULT_PARTICIPANT_FIELDS", 1
    )[0]
    assert 'bind.dialect.name == "postgresql"' in region
    assert "func.generate_series" in region
    assert "~exists(used_number)" in region
    assert "get_used_numbers_for_prefix" in region


def test_regno_query_excludes_malformed_numeric_suffixes_before_casting():
    source = (ROOT / "app/modules/registration/routers/participants.py").read_text(
        encoding="utf-8"
    )
    region = source.split("async def generate_next_regno(", 1)[1].split(
        "\n\nDEFAULT_PARTICIPANT_FIELDS", 1
    )[0]
    assert 'Participant.regno.op("~*")' in region
    assert "[0-9]+$" in region
