"""Capability-cache revision partitioning for feature and usage reads."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.modules.billing.services.capability_cache_service import (
    CapabilityCacheService,
    _revision_scopes,
)
from app.modules.platform.models.organization_console import (
    CapabilityRestriction,
    UsageReservation,
)


def test_usage_mutation_invalidates_usage_scope_without_revoking_feature_cache():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    session = Session()
    session.add(UsageReservation(
        organization_id=organization_id,
        event_id=event_id,
        metric_key="storage_quota_mb",
        quantity=1,
        unit="megabyte",
        idempotency_key="revision-partition",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    ))

    scopes = _revision_scopes(session)

    assert ("USAGE_EVENT", event_id, organization_id) in scopes
    assert ("EVENT", event_id, organization_id) not in scopes


def test_policy_mutation_still_invalidates_feature_scope():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    session = Session()
    session.add(CapabilityRestriction(
        organization_id=organization_id,
        event_id=event_id,
        restriction_type="DENY",
        capability_key="FEAT_REGISTRATION_PORTAL",
        reason="test policy revision",
        reason_code="TEST",
        status="APPROVED",
        effective_at=datetime.now(timezone.utc),
        idempotency_key="revision-policy",
    ))

    scopes = _revision_scopes(session)

    assert ("EVENT", event_id, organization_id) in scopes
    assert ("USAGE_EVENT", event_id, organization_id) not in scopes


def test_full_revision_token_includes_usage_but_feature_token_does_not():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    common = dict(
        global_revision=3,
        organization_revision=5,
        event_revision=7,
    )
    feature_before = CapabilityCacheService.revision_token_from_values(
        organization_id,
        event_id,
        **common,
        usage_event_revision=11,
    )
    feature_after = CapabilityCacheService.revision_token_from_values(
        organization_id,
        event_id,
        **common,
        usage_event_revision=12,
    )
    full_before = CapabilityCacheService.revision_token_from_values(
        organization_id,
        event_id,
        **common,
        usage_event_revision=11,
        include_usage=True,
    )
    full_after = CapabilityCacheService.revision_token_from_values(
        organization_id,
        event_id,
        **common,
        usage_event_revision=12,
        include_usage=True,
    )

    assert feature_before == feature_after
    assert full_before != full_after
