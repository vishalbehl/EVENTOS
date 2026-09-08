from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_upload_worker_uses_central_transition_service_for_every_state_change():
    source = (ROOT / "app/tasks/upload_jobs.py").read_text(encoding="utf-8")

    assert "UploadService.apply_transition" in source
    assert 'row.status = "quarantined"' not in source
    assert 'row.status = "scanning"' not in source
    assert 'row.status = "processing"' not in source
    assert 'row.status = "ready"' not in source
    assert 'row.status = "failed"' not in source
    assert "UploadService.apply_transition" in source


def test_upload_transition_service_owns_validation_and_commit_is_absent():
    service = (ROOT / "app/core/upload_service.py").read_text(encoding="utf-8")

    assert "transition_upload(row.status, target)" in service
    assert "await db.commit()" not in service
    assert "TERMINAL_UPLOAD_STATES" in service
