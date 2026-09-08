from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_dashboard_resolves_participant_and_linked_registration_in_one_projection():
    source = (ROOT / "app/modules/registration/services/portal_service.py").read_text(encoding="utf-8")
    helper = source.split("async def _load_participant_and_registration", 1)[1].split("async def get_dashboard_data", 1)[0]
    dashboard = source.split("async def get_dashboard_data", 1)[1].split("async def update_attendee_details", 1)[0]
    assert "select(Participant, ParticipantRegistration)" in helper
    assert ".outerjoin(" in helper
    assert "ParticipantRegistration.participant_id == Participant.id" in helper
    assert "p, reg_row = await _load_participant_and_registration" in dashboard
    assert "p = await Participant.find_by_email" not in dashboard

