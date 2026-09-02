from __future__ import annotations

import inspect

from app.modules.billing.services.provider_webhook_service import ProviderWebhookService


def test_webhook_ingest_does_not_commit_inside_persistence_operation():
    source = inspect.getsource(ProviderWebhookService.ingest)
    assert "db.commit" not in source


def test_webhook_command_owns_commit_boundary():
    source = inspect.getsource(ProviderWebhookService.execute_command)
    assert "await db.commit()" in source
