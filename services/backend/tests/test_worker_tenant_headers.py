"""Publisher hints never overwrite explicit scope; task contexts never leak."""
from types import SimpleNamespace
import uuid

import pytest

from app.database import tenant_org_id
from app.worker import on_task_publish, on_task_prerun, on_task_postrun


@pytest.mark.parametrize("explicit", ["", "other"])
def test_publisher_preserves_explicit_empty_or_foreign_target(explicit):
    prior = uuid.uuid4()
    target = str(uuid.uuid4()) if explicit else ""
    token = tenant_org_id.set(prior)
    try:
        headers = {"tenant_org_id": target}
        on_task_publish(headers=headers)
        assert headers["tenant_org_id"] == target
        inherited = {}
        on_task_publish(headers=inherited)
        assert inherited["tenant_org_id"] == str(prior)
    finally:
        tenant_org_id.reset(token)


@pytest.mark.parametrize("headers", [None, {}, {"tenant_org_id": ""}, {"tenant_org_id": "invalid"}])
def test_global_or_invalid_task_drops_parent_context_and_restores_afterwards(headers):
    prior = uuid.uuid4()
    token = tenant_org_id.set(prior)
    task_id = uuid.uuid4().hex
    task = SimpleNamespace(request=SimpleNamespace(headers=headers))
    try:
        on_task_prerun(task_id, task, (), {})
        assert tenant_org_id.get() is None
        on_task_postrun(task_id, task, (), {}, None, "SUCCESS")
        assert tenant_org_id.get() == prior
    finally:
        tenant_org_id.reset(token)


def test_scoped_task_uses_target_then_restores_parent():
    prior, target = uuid.uuid4(), uuid.uuid4()
    token = tenant_org_id.set(prior)
    task_id = uuid.uuid4().hex
    task = SimpleNamespace(request=SimpleNamespace(headers={"tenant_org_id": str(target)}))
    try:
        on_task_prerun(task_id, task, (), {})
        assert tenant_org_id.get() == target
        on_task_postrun(task_id, task, (), {}, None, "FAILURE")
        assert tenant_org_id.get() == prior
    finally:
        tenant_org_id.reset(token)
