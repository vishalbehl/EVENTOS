"""Finite operation registration shared by enforcement and endpoint inventory."""
from types import MappingProxyType

# Explicit operation names make compatibility URL aliases share decisions and
# require new handlers to select authority deliberately.
CUSTOMER_COMMERCIAL_ACTIONS = MappingProxyType({
    "get_cloud_catalog": None, "compare_cloud_catalog": None, "get_cloud_catalog_offer": None,
    "preview_cloud_pricing": None,
    "get_commercial_account": "billing:view", "get_commercial_overview": "billing:view", "get_commercial_contracts": "billing:view",
    "get_commercial_contract": "billing:view", "get_commercial_usage": "billing:view",
    "get_commercial_entitlements": "billing:view", "get_capacity_purchases": "billing:view",
    "get_commercial_requests": "billing:view", "get_commercial_request": "billing:view",
    "get_emc_workspaces": "billing:view", "get_emc_allocations": "billing:view", "get_emc_usage": "billing:view",
    "cancel_commercial_contract": "billing:cancel", "create_commercial_checkout": "billing:purchase",
    "create_commercial_cart_checkout": "billing:purchase",
    "get_pending_commercial_cart_payment": "billing:purchase",
    "confirm_mock_commercial_cart_payment": "billing:purchase",
    "create_capacity_purchase": "billing:purchase", "create_commercial_request": "billing:purchase",
    "accept_commercial_quote": "billing:purchase", "add_emc_workspace": "billing:allocate",
    "allocate_emc_capacity": "billing:allocate", "transfer_emc_allocation": "billing:transfer",
    "mutate_commercial_usage": "billing:allocate",
})

