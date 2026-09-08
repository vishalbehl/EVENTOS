from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_design_settings_mutations_use_locked_versioned_event_updates():
    source = (ROOT / "app/modules/registration/routers/design_studio_settings.py").read_text(
        encoding="utf-8"
    )
    assert "stmt = stmt.with_for_update()" in source
    assert "def _advance_event_settings_version(" in source
    assert "require_if_match(if_match)" in source
    assert "raise_version_conflict(current_version)" in source
    assert source.count("for_update=True") >= 5


def test_design_settings_mutations_record_actor_and_advance_version():
    source = (ROOT / "app/modules/registration/routers/design_studio_settings.py").read_text(
        encoding="utf-8"
    )
    helper = source.split("def _advance_event_settings_version(", 1)[1].split(
        "\n\n#", 1
    )[0]
    assert "event.version = int(event.version or 1) + 1" in helper
    assert "event.updated_by = actor_user_id" in helper
