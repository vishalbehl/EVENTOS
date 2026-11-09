"""CI gate test: Assert 100% complete endpoint contracts across all protected routes."""
from app.main import app
from app.core.endpoint_contracts import endpoint_inventory, require_complete_api_contracts
from fastapi.routing import APIRoute
from collections import Counter
import pytest


def test_api_routes_and_operation_ids_are_unique():
    inner = getattr(app, "other_asgi_app", app)
    operations = [(method, route.path) for route in inner.routes
        if isinstance(route, APIRoute) for method in route.methods]
    assert not [key for key, count in Counter(operations).items() if count > 1]
    operation_ids = [route.unique_id for route in inner.routes
        if isinstance(route, APIRoute)]
    assert len(operation_ids) == len(set(operation_ids))


def test_no_unregistered_api_endpoints():
    inner = getattr(app, "other_asgi_app", app)
    inventory = endpoint_inventory(inner)
    assert len(inventory) > 0, "Endpoint inventory should not be empty"
    
    gaps = [r for r in inventory if r["path"].startswith("/api/v1/") and r["contract"] is None]
    assert len(gaps) == 0, f"Found {len(gaps)} unregistered endpoints: {gaps[:10]}"
    
    # Assert standard validator completes without raising
    require_complete_api_contracts(inner, "/api/v1")


def test_endpoint_contract_audiences_valid():
    inner = getattr(app, "other_asgi_app", app)
    for row in endpoint_inventory(inner):
        if row["path"].startswith("/api/v1/") and row["contract"]:
            assert row["contract"].audience in {
                "PUBLIC",
                "CUSTOMER_BROWSER",
                "CUSTOMER_DELEGATED_BROWSER",
                "PLATFORM_BROWSER",
                "IDENTITY_BROWSER",
            }
            assert row["contract"].rate_family in {
                "login", "invite-accept", "refresh", "identity", "recovery", "context",
                "mfa", "invitations", "access-administration", "payment", "exports",
                "uploads", "reads", "writes", "machine", "provider"
            }


@pytest.mark.parametrize("name,method,rate", [
    ("reviewer_assignments", "GET", "reads"),
    ("declare_reviewer_conflict", "PUT", "writes"),
    ("submit_public_review", "POST", "writes"),
])
def test_public_review_has_explicit_grant_resolver_and_rate_contract(name, method, rate):
    from app.core.endpoint_contracts import ENDPOINT_CONTRACTS
    contract = ENDPOINT_CONTRACTS[f"app.modules.programme.router.{name}"]
    assert contract.audience == "PUBLIC" and contract.method == method
    assert contract.rate_family == rate
    assert contract.ownership_resolver == "app.modules.programme.router._reviewer_grant"
    assert not contract.actions  # Bearer grants do not become customer membership.
