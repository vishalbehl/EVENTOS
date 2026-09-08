def test_import_upload_does_not_enqueue_duplicate_import_for_terminal_replay(monkeypatch):
    """Guard the exact-once logical handoff from upload verification to import."""
    import app.tasks.upload_jobs as upload_jobs

    class DummyTask:
        def __init__(self):
            self.calls = []

        def delay(self, *args):
            self.calls.append(args)

    downstream = DummyTask()
    def completed_without_io(coroutine):
        coroutine.close()
        return {"status": "ready", "idempotent": True}

    monkeypatch.setattr(upload_jobs, "_run", completed_without_io)
    monkeypatch.setattr(upload_jobs.uuid, "UUID", lambda value: value)
    # The task imports run_excel_import from app.tasks, so replace that object
    # only for the assertion and keep all storage/database work out of the test.
    import app.tasks as tasks
    monkeypatch.setattr(tasks, "run_excel_import", downstream)

    result = upload_jobs.process_import_upload.run("upload", "org", "job")
    assert result["status"] == "ready"
    assert downstream.calls == []


def test_import_upload_enqueues_only_the_first_ready_transition(monkeypatch):
    """A retry after the durable ready transition cannot duplicate the handoff."""
    import app.tasks.upload_jobs as upload_jobs

    class DummyTask:
        def __init__(self):
            self.calls = []

        def delay(self, *args):
            self.calls.append(args)

    downstream = DummyTask()
    results = iter((
        {"status": "ready", "idempotent": False},
        {"status": "ready", "idempotent": True},
    ))

    def completed_without_io(coroutine):
        coroutine.close()
        return next(results)

    monkeypatch.setattr(upload_jobs, "_run", completed_without_io)
    monkeypatch.setattr(upload_jobs.uuid, "UUID", lambda value: value)
    import app.tasks as tasks
    monkeypatch.setattr(tasks, "run_excel_import", downstream)

    upload_jobs.process_import_upload.run("upload", "org", "job")
    upload_jobs.process_import_upload.run("upload", "org", "job")

    assert downstream.calls == [("job", "org")]


def test_import_retry_exhaustion_has_a_durable_terminal_state(monkeypatch):
    """Keep upload and import-job state consistent after final retry."""
    import asyncio
    import uuid
    import app.tasks.upload_jobs as upload_jobs

    class Upload:
        status = "scanning"
        task_id = None
        processing_error = None

    class Job:
        status = "importing"
        error_summary = None
        completed_at = None

    upload, job = Upload(), Job()

    class Session:
        index = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def scalar(self, _statement):
            self.index += 1
            return upload if self.index == 1 else job

        async def flush(self):
            return None

        async def commit(self):
            return None

    class Factory:
        def __call__(self):
            return Session()

    monkeypatch.setattr(upload_jobs, "AsyncSessionLocal", Factory())
    asyncio.run(upload_jobs._mark_import_failed(
        uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), "task-2", RuntimeError("timeout")
    ))

    assert upload.status == "failed"
    assert upload.task_id == "task-2"
    assert job.status == "failed"
    assert job.error_summary == [{"row": 0, "error": "Import processing failed after retries."}]


def test_excel_import_keeps_storage_outages_retryable_until_exhaustion():
    import inspect
    from app.tasks import tasks

    source = inspect.getsource(tasks._run_excel_import_async)
    task_source = inspect.getsource(tasks.run_excel_import.run)
    assert "raise" in source
    assert "_mark_excel_import_failed" in task_source
    assert "attempt >= policy.max_retries" in task_source
