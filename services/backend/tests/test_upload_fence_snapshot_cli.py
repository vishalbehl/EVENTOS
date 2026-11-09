"""Reject ambiguous repair modes before connecting to a database/provider."""
from pathlib import Path
from types import SimpleNamespace
import uuid

import pytest

from ops.category_a_upload_fence_reconciliation import run


@pytest.mark.asyncio
@pytest.mark.parametrize("overrides", [
    {"apply": True},
    {"capture_snapshot": Path("new-snapshot"), "apply": True},
    {"snapshot_dir": Path("snapshot")},
    {"snapshot_dir": Path("snapshot"), "snapshot_page": 0, "reviewed_page_sha256": "0" * 64,
        "upload_id": [uuid.uuid4()]},
    {"capture_snapshot": Path("new-snapshot"), "after": uuid.uuid4()},
    {"review_missing_path": True},
    {"review_missing_path": True, "upload_id": [uuid.uuid4()], "apply": True},
    {"review_missing_path": True, "upload_id": [uuid.uuid4()], "after": uuid.uuid4()},
    {"review_missing_path": True, "upload_id": [uuid.uuid4()], "capture_snapshot": Path("snapshot")},
])
async def test_invalid_snapshot_or_live_apply_selection_is_rejected(overrides):
    args = SimpleNamespace(apply=False, after=None, upload_id=[], capture_snapshot=None,
        snapshot_dir=None, snapshot_page=None, reviewed_page_sha256=None)
    for key, value in overrides.items():
        setattr(args, key, value)
    with pytest.raises(ValueError):
        await run(args)
