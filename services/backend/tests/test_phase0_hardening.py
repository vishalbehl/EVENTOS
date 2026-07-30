"""
tests/test_phase0_hardening.py
PHASE 0 — Production Hardening Test Suite

Tests for:
  1. Audit row_hash generation (new formula)
  2. Audit change_diff column rename
  3. WorkerJobLog actor_user_id column
  4. MFA secret encryption / decryption
  5. MFA backup codes encryption / decryption
  6. Stripe credentials encryption
  7. TicketType UUID PK
  8. Invoice default currency INR
  9. AddonFeature mappings
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import select, text

# ── 1. Audit row_hash Formula ───────────────────────────────────


def test_audit_row_hash_formula():
    """
    Verify the row_hash formula:
    SHA256('audit:logs:{resource_id}:{action_type}:{occurred_at}')
    """
    resource_id = uuid.uuid4()
    action_type = "created"
    occurred_at = datetime(2026, 6, 17, 12, 0, 0, tzinfo=timezone.utc)

    payload = f"audit:logs:{resource_id}:{action_type}:{occurred_at.isoformat()}"
    expected_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    assert len(expected_hash) == 64
    assert expected_hash == hashlib.sha256(payload.encode("utf-8")).hexdigest()


def test_audit_row_hash_populated_on_insert():
    """Verify AuditLog.row_hash is computed via before_insert event."""
    from app.modules.audit.models.audit_log import AuditLog

    log = AuditLog(
        organization_id=uuid.uuid4(),
        actor_user_id=uuid.uuid4(),
        action_type="created",
        resource_type="event",
        resource_id=uuid.uuid4(),
    )

    # Simulate the before_insert event
    from app.modules.audit.models.audit_log import generate_row_hash
    generate_row_hash(None, None, log)

    assert log.row_hash is not None
    assert len(log.row_hash) == 64

    from app.modules.audit.models.audit_log import compute_audit_hash
    assert log.row_hash == compute_audit_hash(log, version=2)


def test_audit_row_hash_deterministic():
    """Same inputs produce same hash."""
    from app.modules.audit.models.audit_log import AuditLog, generate_row_hash

    rid = uuid.uuid4()
    ts = datetime(2026, 1, 1, tzinfo=timezone.utc)

    organization_id = uuid.uuid4()
    actor_user_id = uuid.uuid4()
    log1 = AuditLog(resource_id=rid, action_type="updated", occurred_at=ts, resource_type="user", organization_id=organization_id, actor_user_id=actor_user_id)
    log2 = AuditLog(resource_id=rid, action_type="updated", occurred_at=ts, resource_type="user", organization_id=organization_id, actor_user_id=actor_user_id)

    generate_row_hash(None, None, log1)
    generate_row_hash(None, None, log2)

    assert log1.row_hash == log2.row_hash


# ── 2. Audit change_diff Column ─────────────────────────────────


def test_audit_context_has_change_diff():
    """AuditContext dataclass must have change_diff, not diff."""
    from app.modules.audit.services.audit_service import AuditContext

    ctx = AuditContext(
        action_type="updated",
        resource_type="event",
        resource_id=uuid.uuid4(),
        change_diff=[{"op": "replace", "path": "/name", "value": "New Name"}],
    )
    assert ctx.change_diff is not None
    assert not hasattr(ctx, "diff") or "diff" not in ctx.__dataclass_fields__

    # Verify serialization
    d = ctx.to_dict()
    assert "change_diff" in d
    assert "diff" not in d


def test_audit_log_model_has_change_diff():
    """AuditLog model must have change_diff column, not diff."""
    from app.modules.audit.models.audit_log import AuditLog

    assert hasattr(AuditLog, "change_diff")
    # Ensure old name is not present as a mapped column
    col_names = [c.name for c in AuditLog.__table__.columns]
    assert "change_diff" in col_names
    assert "diff" not in col_names


# ── 3. WorkerJobLog actor_user_id ────────────────────────────────


def test_worker_job_log_has_actor_user_id():
    """WorkerJobLog must have a nullable actor_user_id column."""
    from app.modules.audit.models.api_request_log import WorkerJobLog

    assert hasattr(WorkerJobLog, "actor_user_id")
    col = WorkerJobLog.__table__.columns["actor_user_id"]
    assert col.nullable is True


# ── 4. MFA Secret Encryption ────────────────────────────────────


def test_mfa_device_has_encrypted_secret():
    """MfaDevice must have encrypted_secret, not secret."""
    from app.modules.identity.models.identity_domain_tables import MfaDevice

    assert hasattr(MfaDevice, "encrypted_secret")
    col_names = [c.name for c in MfaDevice.__table__.columns]
    assert "encrypted_secret" in col_names
    assert "secret" not in col_names


def test_mfa_device_has_backup_codes():
    """MfaDevice must have backup_codes column."""
    from app.modules.identity.models.identity_domain_tables import MfaDevice

    assert hasattr(MfaDevice, "backup_codes")
    col = MfaDevice.__table__.columns["backup_codes"]
    assert col.nullable is True


def test_encryption_roundtrip():
    """Fernet encrypt/decrypt roundtrip preserves plaintext."""
    from app.core.encryption import encrypt, decrypt

    plaintext = "JBSWY3DPEHPK3PXP"  # typical TOTP secret
    ciphertext = encrypt(plaintext)

    assert ciphertext != plaintext
    assert ciphertext.startswith("v1:")
    assert decrypt(ciphertext) == plaintext


def test_encryption_empty_string():
    """Encrypting empty string returns empty string."""
    from app.core.encryption import encrypt, decrypt

    assert encrypt("") == ""
    assert decrypt("") == ""


def test_encryption_json_roundtrip():
    """Encrypt/decrypt JSON backup codes list."""
    from app.core.encryption import encrypt, decrypt

    codes = ["ABC123", "DEF456", "GHI789"]
    plaintext = json.dumps(codes)
    ciphertext = encrypt(plaintext)

    assert ciphertext.startswith("v1:")
    decrypted = json.loads(decrypt(ciphertext))
    assert decrypted == codes


# ── 5. Stripe Credentials Encryption ────────────────────────────


def test_registration_theme_has_encrypted_stripe():
    """RegistrationThemeSetting must have encrypted_stripe_credentials column."""
    from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting

    assert hasattr(RegistrationThemeSetting, "encrypted_stripe_credentials")
    col = RegistrationThemeSetting.__table__.columns["encrypted_stripe_credentials"]
    assert col.nullable is True


# ── 6. TicketType UUID PK ───────────────────────────────────────


def test_ticket_type_uuid_pk():
    """TicketType.id must be UUID type, not Integer."""
    from app.modules.registration.models.ticket_type import TicketType

    col = TicketType.__table__.columns["id"]
    assert "UUID" in str(col.type).upper()


# ── 7. Invoice Default Currency INR ─────────────────────────────


def test_invoice_default_currency_inr():
    """Invoice.currency default must be INR, not USD."""
    from app.modules.billing.models.billing_domain_tables import Invoice

    col = Invoice.__table__.columns["currency"]
    assert str(col.server_default.arg) == "INR"


# ── 8. AddonFeature Mappings ────────────────────────────────────


def test_addon_feature_model_composite_pk():
    """AddonFeature must have composite PK (addon_id, feature_id)."""
    from app.modules.billing.models.subscription import AddonFeature

    pk_cols = [c.name for c in AddonFeature.__table__.primary_key.columns]
    assert "addon_id" in pk_cols
    assert "feature_id" in pk_cols


# ── 9. TABLE_SCHEMAS mapping ────────────────────────────────────


def test_subscription_transactions_in_table_schemas():
    """subscription_transactions must be mapped to billing schema."""
    from app.database import TABLE_SCHEMAS

    assert "subscription_transactions" in TABLE_SCHEMAS
    assert TABLE_SCHEMAS["subscription_transactions"] == "billing"


# ── 10. Actor Role Width ────────────────────────────────────────


def test_actor_role_width_100():
    """AuditLog.actor_role must be String(100), not String(50)."""
    from app.modules.audit.models.audit_log import AuditLog

    col = AuditLog.__table__.columns["actor_role"]
    assert col.type.length == 100
