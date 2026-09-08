import inspect
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_registration_repositories_expose_explicit_transaction_neutral_methods():
    source = (ROOT / "app/modules/registration/infrastructure/repositories.py").read_text(
        encoding="utf-8"
    )
    for repository in (
        "ParticipantRepository",
        "ParticipantRegistrationRepository",
        "BadgeRepository",
        "BadgeHistoryRepository",
        "BadgePrintJobRepository",
        "ImportJobRepository",
    ):
        region = source.split(f"class {repository}", 1)[1].split("\n\nclass ", 1)[0]
        assert "get_for_event" in region
        assert "scoped_statement" in region
        assert "commit(" not in region
        assert "HTTPException" not in region


def test_registration_query_services_use_domain_repositories_for_cursor_reads():
    source = (ROOT / "app/modules/registration/application/queries.py").read_text(
        encoding="utf-8"
    )
    assert "ParticipantRepository(self.db).cursor_page" in source
    assert "ParticipantRegistrationRepository(self.db).cursor_page" in source
    assert "BadgeRepository(self.db).cursor_page" in source
    assert "BadgeHistoryRepository(self.db).cursor_page" in source
    assert "BadgePrintJobRepository(self.db).cursor_page" in source
    assert "ImportJobRepository(self.db).cursor_page" in source
    assert "from app.modules.registration.infrastructure.repositories import" in source
