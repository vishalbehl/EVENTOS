"""Message-shape unit contracts; broker doubles are not outage acceptance."""
import uuid
import pytest

from app.tasks import catalogue_reconciliation as worker
from app.modules.registration.services import catalogue_work


@pytest.mark.parametrize("entry", ["tenant_page", "global_categories", "global_templates", "fanout", "fanout_cursor"])
def test_untracked_legacy_tasks_cannot_mutate_or_publish(entry, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Untracked task must fail before database or publication")

    monkeypatch.setattr(worker, "run_async", forbidden)
    for task in (worker.reconcile_tenant_page, worker.reconcile_global_categories,
            worker.reconcile_global_templates, worker.fanout_catalogue_reconciliation):
        monkeypatch.setattr(task, "apply_async", forbidden)
    actor, target = str(uuid.uuid4()), str(uuid.uuid4())
    task, args = {
        "tenant_page": (worker.reconcile_tenant_page, (target, actor)),
        "global_categories": (worker.reconcile_global_categories, (actor,)),
        "global_templates": (worker.reconcile_global_templates, (actor,)),
        "fanout": (worker.fanout_catalogue_reconciliation, (actor,)),
        "fanout_cursor": (worker.fanout_catalogue_reconciliation, (actor, target)),
    }[entry]
    with pytest.raises(ValueError, match="^CATALOGUE_DURABLE_RUN_REQUIRED$"):
        task.run(*args)


def test_recovery_publishes_committed_generation_and_keeps_broker_failure_pending(monkeypatch):
    actor, first, second = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    async def claims():
        return [(first, actor, 2), (second, actor, 3)]

    calls = []

    def publish(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise ConnectionError("Simulated broker publish interruption")

    monkeypatch.setattr(worker, "_claim_reconciliation_runs", claims)
    async def no_pages():
        return []
    monkeypatch.setattr(catalogue_work, "claim_pages", no_pages)
    monkeypatch.setattr(worker.fanout_catalogue_reconciliation, "apply_async", publish)
    result = worker.recover_catalogue_reconciliation_runs.run()
    assert result == {"claimed": 2, "published": 1, "pages_claimed": 0, "pages_published": 0}
    assert calls[0]["args"] == (str(actor), None, str(first), 2)
    assert calls[1]["args"] == (str(actor), None, str(second), 3)
    assert all(call["retry"] is False for call in calls)


def test_next_fanout_page_preserves_generation_and_one_hundred_tenant_bound(monkeypatch):
    actor, run = uuid.uuid4(), uuid.uuid4()
    owners = sorted(uuid.uuid4() for _ in range(101))

    async def start(run_id, actor_id, expected):
        assert (run_id, actor_id, expected) == (run, actor, 2)
        return 2

    async def organizations(actor_id, cursor, run_id):
        assert actor_id == actor and cursor is None and run_id == run
        return owners

    tenants, continuations, globals = [], [], []
    staged = []
    async def cursor(*args):
        return None
    async def stage(*args, **kwargs):
        assert kwargs == {"enumeration_complete": False}
        staged.append(args)
    monkeypatch.setattr(catalogue_work, "run_cursor", cursor)
    monkeypatch.setattr(catalogue_work, "stage_streams", stage)
    monkeypatch.setattr(worker, "_mark_run_started", start)
    monkeypatch.setattr(worker, "_organization_page", organizations)
    monkeypatch.setattr(worker.reconcile_tenant_page, "apply_async", lambda **kwargs: tenants.append(kwargs))
    monkeypatch.setattr(worker.reconcile_global_categories, "apply_async", lambda **kwargs: globals.append(kwargs))
    monkeypatch.setattr(worker.fanout_catalogue_reconciliation, "apply_async", lambda **kwargs: continuations.append(kwargs))
    result = worker.fanout_catalogue_reconciliation.run(str(actor), None, str(run), 2)
    assert result == {"scheduled": 100, "next_cursor": str(owners[99])}
    assert len(globals) == 0 and len(tenants) == 0
    assert staged == [(run, actor, 2, None, tuple(owners[:100]))]
    assert continuations == [{"args": (str(actor), str(owners[99]), str(run), 2), "retry": False}]


def test_stale_fanout_stops_before_discovery_or_publishing(monkeypatch):
    async def stale(*args):
        return None

    async def forbidden(*args):
        raise AssertionError("Stale fanout must not enumerate the cohort")

    def forbidden_publish(**kwargs):
        raise AssertionError("Stale fanout must not publish")

    monkeypatch.setattr(worker, "_mark_run_started", stale)
    monkeypatch.setattr(worker, "_organization_page", forbidden)
    monkeypatch.setattr(worker.reconcile_tenant_page, "apply_async", forbidden_publish)
    monkeypatch.setattr(worker.reconcile_global_categories, "apply_async", forbidden_publish)
    assert worker.fanout_catalogue_reconciliation.run(str(uuid.uuid4()), None, str(uuid.uuid4()), 1) == {
        "scheduled": 0, "status": "run_unavailable"}
