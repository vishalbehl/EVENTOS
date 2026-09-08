"""Phase 3B query-boundary and additive-envelope evidence."""

from pathlib import Path

import pytest
from httpx import AsyncClient

from app.core.response import ResponseEnvelope
from tests.conftest import auth_headers


ROOT = Path(__file__).resolve().parents[1]


def _region(source: str, start: str, end: str) -> str:
    return source.split(start, 1)[1].split(end, 1)[0]


def test_pricing_catalog_reads_use_one_bounded_projected_query_service():
    router = (ROOT / "app/modules/pricing/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/pricing/application/queries.py").read_text(encoding="utf-8")

    rules = _region(router, "async def superadmin_get_pricing_rules", "async def superadmin_get_pricing_rule_detail")
    detail = _region(router, "async def superadmin_get_pricing_rule_detail", "async def superadmin_create_pricing_rule")
    template = _region(router, "async def get_template_details", "async def superadmin_get_templates")
    templates = _region(router, "async def superadmin_get_templates", "async def superadmin_get_pricing_rules_enveloped")

    for region in (rules, detail, template, templates):
        assert "PricingCatalogQueryService" in region
        assert "await db.execute" not in region
        assert "await db.scalars" not in region
        assert "select(RoomTemplate)" not in region
        assert "select(RegistrationTemplate)" not in region
        assert "select(SrrTemplate)" not in region

    assert "load_only(*self._RULE_COLUMNS)" in queries
    assert "self._template_options(model, template_type)" in queries
    assert ".limit(bounded_limit)" in queries
    assert "PricingRule.name.asc(), PricingRule.id.asc()" in queries
    assert "model.name.asc(), model.id.asc()" in queries


def test_organiser_attention_state_and_owner_read_is_tenant_scoped_and_bounded():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")

    route = _region(router, "async def organiser_needs_attention", "async def _attention_state")
    state_method = _region(queries, "async def list_task_states", "@dataclass(frozen=True)\nclass OrganiserAddonProjection")

    assert "list_task_states" in route
    assert "await db.scalars" not in route
    assert "OrganizationAttentionState.organization_id == organization_id" in state_method
    assert "OrganizationAttentionState.task_key.in_(task_keys)" in state_method
    assert ".outerjoin(User, User.id == OrganizationAttentionState.owner_user_id)" in state_method
    assert ".limit(bounded_limit)" in state_method
    assert "OrganizationAttentionState.task_key.asc()" in state_method
    assert "OrganizationAttentionState.version.desc()" in state_method
    assert "async def get_event_target" in queries
    assert "Event.organization_id == organization_id" in queries
    assert "select(Event.id, Event.organization_id, Event.deleted_at)" in queries

    event_route = router.split("async def event_needs_attention", 1)[1]
    assert "get_event_target" in event_route
    assert "await db.scalar" not in event_route


def test_phase3b_envelopes_are_additive_and_include_request_and_freshness_metadata():
    router = (ROOT / "app/modules/pricing/router.py").read_text(encoding="utf-8")
    rules = _region(router, "async def superadmin_get_pricing_rules_enveloped", "async def superadmin_get_templates_enveloped")
    templates = router.split("async def superadmin_get_templates_enveloped", 1)[1].split("class SuperAdminTemplateInput", 1)[0]

    assert "/superadmin/catalog/v2/pricing-rules" in router
    assert "/superadmin/catalog/v2/templates" in router
    for region in (rules, templates):
        assert "ResponseEnvelope.success" in region
        assert "request_id=request.headers.get(\"X-Request-ID\")" in region
        assert "freshness_at=datetime.now(timezone.utc).isoformat()" in region

    response = ResponseEnvelope.success(
        {"items": []}, request_id="phase3b-request", freshness_at="2026-09-07T00:00:00+00:00"
    )
    assert response.data == {"items": []}
    assert response.meta.request_id == "phase3b-request"
    assert response.meta.freshness_at == "2026-09-07T00:00:00+00:00"


@pytest.mark.asyncio
async def test_phase3b_catalog_routes_work_in_the_application_contract(
    client: AsyncClient,
    super_admin,
):
    headers = {**auth_headers(super_admin), "X-Request-ID": "phase3b-live-request"}

    legacy_rules = await client.get(
        "/pricing/superadmin/catalog/pricing-rules", headers=headers
    )
    legacy_templates = await client.get(
        "/pricing/superadmin/catalog/templates", headers=headers
    )
    enveloped_rules = await client.get(
        "/pricing/superadmin/catalog/v2/pricing-rules", headers=headers
    )
    enveloped_templates = await client.get(
        "/pricing/superadmin/catalog/v2/templates", headers=headers
    )

    assert legacy_rules.status_code == 200, legacy_rules.text
    assert isinstance(legacy_rules.json(), list)
    assert legacy_templates.status_code == 200, legacy_templates.text
    assert set(legacy_templates.json()) == {
        "room_templates", "registration_templates", "srr_templates"
    }
    assert enveloped_rules.status_code == 200, enveloped_rules.text
    assert enveloped_rules.json()["meta"]["request_id"] == "phase3b-live-request"
    assert enveloped_rules.json()["meta"]["freshness_at"]
    assert enveloped_templates.status_code == 200, enveloped_templates.text
    assert set(enveloped_templates.json()["data"]) == {
        "room_templates", "registration_templates", "srr_templates"
    }
