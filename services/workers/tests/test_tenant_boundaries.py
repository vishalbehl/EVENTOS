from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from workers.db import get_db_session
from app.database import tenant_org_id


def test_worker_session_carries_explicit_tenant_context():
    organization_id = uuid.uuid4()
    session = MagicMock()
    session.info = {}

    with patch("workers.db._SessionLocal", return_value=session):
        with get_db_session(organization_id) as scoped_session:
            assert scoped_session.info["organization_id"] == organization_id
            assert tenant_org_id.get() == organization_id

    session.commit.assert_called_once()
    session.close.assert_called_once()
    assert tenant_org_id.get() is None


def test_worker_session_rejects_non_uuid_tenant_context():
    with pytest.raises(ValueError, match="must be a UUID"):
        with get_db_session("not-a-uuid"):  # type: ignore[arg-type]
            pass


def test_malware_scan_contract_requires_organization_id():
    from workers.tasks.file_tasks import (
        convert_presentation_to_pdf,
        generate_file_thumbnail,
        scan_file_for_viruses,
        validate_presentation_file,
    )

    assert "organization_id" in scan_file_for_viruses.run.__code__.co_varnames
    assert "organization_id" in validate_presentation_file.run.__code__.co_varnames
    assert "organization_id" in generate_file_thumbnail.run.__code__.co_varnames
    assert "organization_id" in convert_presentation_to_pdf.run.__code__.co_varnames


def test_video_task_contract_requires_organization_id():
    from workers.tasks.video_tasks import (
        extract_video_metadata,
        normalise_video_file,
    )

    assert "organization_id" in normalise_video_file.run.__code__.co_varnames
    assert "organization_id" in extract_video_metadata.run.__code__.co_varnames
