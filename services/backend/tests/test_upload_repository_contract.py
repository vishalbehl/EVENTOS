from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_upload_reads_use_tenant_aware_repository_boundary():
    service = (ROOT / "app/core/upload_service.py").read_text(encoding="utf-8")
    router = (ROOT / "app/modules/files/routers/files.py").read_text(encoding="utf-8")
    worker = (ROOT / "app/tasks/upload_jobs.py").read_text(encoding="utf-8")
    repository = (ROOT / "app/modules/files/infrastructure/repositories.py").read_text(encoding="utf-8")

    assert "DurableUploadRepository" in service
    assert "DurableUploadRepository" in router
    assert "DurableUploadRepository" in worker
    assert "DurableUpload.organization_id == organization_id" in repository
    assert "with_for_update" in repository
    assert "get_status" in repository
    assert "DurableUploadRepository(db).get_status" in (
        ROOT / "app/core/job_status_service.py"
    ).read_text(encoding="utf-8")


def test_upload_repository_is_transaction_neutral_and_bounded_to_one_record():
    repository = (ROOT / "app/modules/files/infrastructure/repositories.py").read_text(encoding="utf-8")

    assert "await self.db.commit()" not in repository
    assert "select(DurableUpload)" in repository
    assert "def create" in repository
    assert "async def delete" in repository
