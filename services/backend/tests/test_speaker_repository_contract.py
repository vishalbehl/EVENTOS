from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_speaker_repositories_are_explicit_and_transaction_neutral():
    source = (ROOT / "app/modules/speakers/infrastructure/repositories.py").read_text(
        encoding="utf-8"
    )
    for repository in ("SpeakerRepository", "SessionRepository"):
        region = source.split(f"class {repository}", 1)[1].split("\n\nclass ", 1)[0]
        assert "get_for_event" in region
        assert "scoped_statement" in region
        assert "commit(" not in region
        assert "HTTPException" not in region


def test_speaker_query_services_use_domain_repositories_for_cursor_reads():
    source = (ROOT / "app/modules/speakers/application/queries.py").read_text(
        encoding="utf-8"
    )
    assert "SpeakerRepository(self.db).cursor_page" in source
    assert "SessionRepository(self.db).cursor_page" in source
