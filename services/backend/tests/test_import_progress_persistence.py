"""Contracts for durable import progress checkpoints."""

import inspect

from app.modules.registration.services import excel_import_service


def test_import_batches_persist_progress_counters_before_commit():
    source = inspect.getsource(excel_import_service.run_import)
    checkpoint = source.index("# Periodically commit to avoid losing all progress")
    batch = source[checkpoint : source.index("# Final commit for remaining rows", checkpoint)]

    assert "job.rows_imported = rows_imported" in batch
    assert "job.rows_failed = rows_failed" in batch
    assert batch.index("job.rows_imported = rows_imported") < batch.index("await db.commit()")
    assert batch.index("job.rows_failed = rows_failed") < batch.index("await db.commit()")
