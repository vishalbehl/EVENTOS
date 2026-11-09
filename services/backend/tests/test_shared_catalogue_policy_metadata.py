"""Structural checks supplement, but do not replace, actual-role SQL probes."""
from copy import deepcopy
import pytest
from ops.category_a_catalogue_policy_metadata import shared_catalogue_structure_is_safe


def rows():
    return [{"relname": name, "relrowsecurity": True, "relforcerowsecurity": True,
        "inspecting_role_owns_table": False, "policy_count": 1, "scoped_policy": True, "owner_guard": True}
        for name in ("form_categories", "form_templates")]


@pytest.mark.parametrize("key,value", [("relrowsecurity", False), ("relforcerowsecurity", False),
    ("inspecting_role_owns_table", True), ("policy_count", 2), ("scoped_policy", False), ("owner_guard", False)])
def test_preflight_rejects_incomplete_or_unsafe_shared_catalogue_structure(key, value):
    current = deepcopy(rows())
    current[0][key] = value
    assert not shared_catalogue_structure_is_safe(current)


def test_preflight_requires_both_tables_and_runtime_non_ownership():
    assert shared_catalogue_structure_is_safe(rows())
    assert not shared_catalogue_structure_is_safe(rows()[:1])
    operator = rows()
    operator[0]["inspecting_role_owns_table"] = True
    assert shared_catalogue_structure_is_safe(operator, require_non_owner=False)
