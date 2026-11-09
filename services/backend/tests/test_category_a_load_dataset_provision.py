from pathlib import Path

import pytest

from ops.category_a_load_dataset_provision import (
    EVENT_INSERT,
    MEMBERSHIP_INSERT,
    ORGANIZATION_INSERT,
    ProvisioningConfig,
    USER_INSERT,
    WORKSPACE_BINDING_INSERT,
    owner_sequence,
    tenant_for_sequence,
    validate_config,
)


def config(**overrides):
    values = dict(environment="staging", expected_database="eventos_category_a_staging",
                  slug_prefix="category-a-load-20261028-", tenants=1000,
                  memberships=100000, events=100000, batch_size=10000,
                  approval_reference="release-approval-20261028", rehearsal=False)
    values.update(overrides)
    return ProvisioningConfig(**values)


def test_release_configuration_requires_isolated_enterprise_cohort():
    assert validate_config(config()) == []
    failures = validate_config(config(expected_database="eventos_db", tenants=999,
                                      memberships=99999, events=99999))
    assert any("isolated non-default" in item for item in failures)
    assert any("1000 tenants" in item for item in failures)
    assert any("100000 memberships" in item for item in failures)
    assert any("100000 events" in item for item in failures)
    assert any("unsafe identifier" in item for item in validate_config(config(expected_database="bad/database")))
    assert any("slug prefix" in item for item in validate_config(config(slug_prefix="category-a-load-run_%-.")))


def test_rehearsal_is_local_only_and_still_has_one_member_and_event_per_tenant():
    assert validate_config(config(environment="local-isolated", expected_database="category_a_fixture",
                                  tenants=2, memberships=10, events=10, batch_size=100,
                                  rehearsal=True)) == []
    assert any("local-isolated" in item for item in validate_config(config(rehearsal=True)))
    assert any("one membership/event" in item for item in validate_config(
        config(environment="local-isolated", expected_database="category_a_fixture",
               tenants=20, memberships=10, events=10, batch_size=100, rehearsal=True)))


def test_distribution_is_deterministic_and_has_ten_percent_noisy_tenant():
    assignments = [tenant_for_sequence(index, total=100000, tenants=1000)
                   for index in range(1, 100001)]
    assert assignments.count(1) == 10000
    assert set(assignments) == set(range(1, 1001))
    assert owner_sequence(1, total_memberships=100000) == 1
    assert owner_sequence(2, total_memberships=100000) == 10001
    assert owner_sequence(1000, total_memberships=100000) == 10999


def test_sql_is_additive_restartable_and_does_not_touch_platform_org():
    source = "\n".join((ORGANIZATION_INSERT, USER_INSERT, MEMBERSHIP_INSERT,
                         WORKSPACE_BINDING_INSERT, EVENT_INSERT)).upper()
    assert "ON CONFLICT" in source
    assert "DELETE " not in source
    assert "TRUNCATE " not in source
    assert "IS_PLATFORM_ORG" in ORGANIZATION_INSERT.upper()
    assert "IS_INTERNAL_UNRESTRICTED" in ORGANIZATION_INSERT.upper()
    assert "FALSE" in ORGANIZATION_INSERT.upper()
    assert "WORKSPACE_ROLE_BINDINGS" in WORKSPACE_BINDING_INSERT.upper()
    assert "':WORKSPACE:'" in WORKSPACE_BINDING_INSERT.upper()
    assert "':MEMBERSHIP:'" in WORKSPACE_BINDING_INSERT.upper()


@pytest.mark.parametrize("sequence", [0, 100001])
def test_distribution_rejects_out_of_range_sequences(sequence):
    with pytest.raises(ValueError):
        tenant_for_sequence(sequence, total=100000, tenants=1000)
