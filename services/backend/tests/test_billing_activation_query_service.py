from __future__ import annotations

import asyncio
import inspect
import uuid

import pytest

from app.modules.billing.application.queries import BillingActivationQueryService


class ScalarRows:
    def all(self):
        return []


class MappingRows:
    def all(self):
        return []


class CaptureDb:
    async def scalars(self, statement):
        self.statement = statement
        return ScalarRows()

    async def execute(self, statement):
        self.statement = statement
        return type("Result", (), {"mappings": lambda self: MappingRows()})()

    async def scalar(self, statement):
        self.statement = statement
        return None


def test_activation_query_service_is_read_only_and_bounded():
    service = BillingActivationQueryService(CaptureDb())
    assert not any(
        name in {"commit", "flush", "add", "delete"}
        for name, member in inspect.getmembers(type(service))
    )
    with pytest.raises(ValueError, match="between 1 and 100"):
        asyncio.run(service.list_activations(uuid.uuid4(), limit=101))


def test_activation_query_service_applies_organization_scope_and_limit():
    db = CaptureDb()
    service = BillingActivationQueryService(db)
    organization_id = uuid.uuid4()
    asyncio.run(service.list_grants(organization_id, limit=25))
    compiled = str(db.statement.compile(compile_kwargs={"literal_binds": False}))
    assert "entitlement_grants.organization_id" in compiled
    assert db.statement._limit_clause.value == 25


def test_consumption_query_requires_both_tenant_and_grant_scope():
    db = CaptureDb()
    service = BillingActivationQueryService(db)
    organization_id = uuid.uuid4()
    grant_id = uuid.uuid4()
    asyncio.run(service.list_consumptions(organization_id, grant_id, limit=10))
    compiled = str(db.statement.compile(compile_kwargs={"literal_binds": False}))
    assert "grant_consumptions.organization_id" in compiled
    assert "grant_consumptions.grant_id" in compiled


def test_active_subscription_query_is_projected_tenant_scoped_and_bounded():
    db = CaptureDb()
    service = BillingActivationQueryService(db)
    organization_id = uuid.uuid4()
    asyncio.run(service.list_active_subscriptions(organization_id, limit=20))
    compiled = str(db.statement.compile(compile_kwargs={"literal_binds": False}))
    assert "commerce.organization_subscriptions.organization_id" in compiled
    assert "commerce.organization_subscriptions.plan_id" in compiled
    assert db.statement._limit_clause.value == 20


def test_latest_activation_query_is_tenant_and_event_scoped():
    db = CaptureDb()
    service = BillingActivationQueryService(db)
    asyncio.run(service.get_latest_activation(uuid.uuid4(), uuid.uuid4()))
    compiled = str(db.statement.compile(compile_kwargs={"literal_binds": False}))
    assert "commerce.event_activations.organization_id" in compiled
    assert "commerce.event_activations.event_id" in compiled
    assert db.statement._limit_clause.value == 1


def test_event_existence_query_is_tenant_scoped():
    db = CaptureDb()
    service = BillingActivationQueryService(db)
    asyncio.run(service.event_exists(uuid.uuid4(), uuid.uuid4()))
    compiled = str(db.statement.compile(compile_kwargs={"literal_binds": False}))
    assert "events.events.organization_id" in compiled
