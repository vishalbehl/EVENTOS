import pytest

from ops.rebuild_analytics_projections import rebuild


@pytest.mark.asyncio
async def test_rebuild_rejects_unbounded_batches():
    with pytest.raises(ValueError, match="between 1 and 500"):
        await rebuild(limit=501, after_event_id=None)


def test_rebuild_module_has_all_projection_families():
    from ops import rebuild_analytics_projections as module

    names = {
        module.refresh_event_registration_summary,
        module.refresh_event_attendance_summary,
        module.refresh_event_payment_summary,
        module.refresh_event_speaker_summary,
    }
    assert len(names) == 4
