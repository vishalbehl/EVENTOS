from __future__ import annotations

import pytest

from ops.category_a_backup_restore_rehearsal import EXPECTED_REVISION
from ops.category_a_forward_recovery_rehearsal import validate_restore_evidence


def _evidence(revision: str) -> dict:
    return {
        "status": "PASSED",
        "environment": "local_isolated_rehearsal",
        "source_database": "category_a_rehearsal_20261015",
        "restored_database": "category_a_restore_20261028_012345abcdef",
        "restored_database_quarantined": True,
        "migration_revision": revision,
    }


def test_forward_recovery_requires_current_release_revision() -> None:
    current = _evidence(EXPECTED_REVISION)

    assert validate_restore_evidence(
        current,
        expected_revision=EXPECTED_REVISION,
    ) == current["restored_database"]

    with pytest.raises(ValueError, match="approved quarantined clone"):
        validate_restore_evidence(_evidence("20261019_3640"), expected_revision=EXPECTED_REVISION)


def test_legacy_probe_default_remains_explicitly_3640() -> None:
    legacy = _evidence("20261019_3640")

    assert validate_restore_evidence(legacy) == legacy["restored_database"]

    with pytest.raises(ValueError, match="approved quarantined clone"):
        validate_restore_evidence(_evidence(EXPECTED_REVISION))
