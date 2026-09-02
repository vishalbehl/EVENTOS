from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/import_commands.py"


def test_event_import_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def import_organiser_events", 1)[1].split("@router.", 1)[0]
    assert "OrganizerImportCommandService(db).import_events" in region
    assert "await db.commit()" not in region


def test_event_import_command_validates_batches_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "EventMutationService.create" in source
    assert "EVENT_IMPORT_ROW_LIMIT" in source
    assert "idempotency_key" in source and "EVENTS_IMPORTED" in source
    assert "await self.db.rollback()" in source
