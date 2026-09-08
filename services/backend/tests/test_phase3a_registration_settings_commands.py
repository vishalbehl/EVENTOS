"""Registration settings command reliability contracts."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_all_design_settings_mutations_have_idempotency_and_version_guards():
    source = read("app/modules/registration/routers/design_studio_settings.py")
    assert source.count('alias="Idempotency-Key"') >= 5
    assert source.count("_begin_settings_command") >= 6
    assert source.count("complete_idempotent") >= 6
    assert source.count("_advance_event_settings_version") >= 5
    assert "with_for_update" in source


def test_settings_idempotency_fingerprint_includes_event_and_if_match():
    source = read("app/modules/registration/routers/design_studio_settings.py")
    assert '"event_id": str(event_id)' in source
    assert '"if_match": if_match' in source
