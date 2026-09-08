from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_public_checkout_supports_durable_idempotency_for_all_outcomes():
    source = (ROOT / "app/modules/registration/routers/registration_portal.py").read_text(encoding="utf-8")
    region = source.split("async def public_checkout_payment", 1)[1].split("@router.post(\"/portal/registration/{event_id}/payment/verify\")", 1)[0]
    assert 'alias="Idempotency-Key"' in region
    assert 'operation="registration.payment.checkout"' in region
    assert "replay_response(idem)" in region
    assert "complete_idempotent" in region
    assert region.count("return await finish({") == 5
    assert "await db.commit()" in region
