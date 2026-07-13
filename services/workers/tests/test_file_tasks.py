# workers/tests/test_file_tasks.py
"""
Tests for file_tasks — all DB and R2 calls mocked.

Strategy:
  - Celery eager mode (conftest) — tasks run synchronously.
  - DB session is mocked via get_db_session context manager.
  - R2 download/upload mocked at the module level.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch, call
from contextlib import contextmanager

import pytest


def _make_mock_file(status="uploaded", fmt="pptx"):
    """Create a mock PresentationFile ORM object."""
    f = MagicMock()
    f.id = uuid.uuid4()
    f.organization_id = uuid.uuid4()
    f.event_id = uuid.uuid4()
    f.speaker_id = uuid.uuid4()
    f.upload_status = status
    f.file_format = fmt
    f.storage_path = f"presentations/{f.event_id}/{f.id}.{fmt}"
    f.original_filename = f"talk.{fmt}"
    f.thumbnail_url = None
    f.file_size_bytes = 10_485_760
    return f


def _task_args(file_obj):
    return [str(file_obj.id), str(file_obj.organization_id)]


@contextmanager
def _mock_db(file_obj, fv_class=None):
    """
    Patches get_db_session to yield a session that returns file_obj on .get().
    Also mocks FileValidation creation so add/commit work.
    """
    session = MagicMock()
    session.get.return_value = file_obj
    session.add.return_value = None
    session.commit.return_value = None

    @contextmanager
    def _ctx(*_args, **_kwargs):
        yield session

    with patch("workers.tasks.file_tasks.get_db_session", side_effect=_ctx):
        yield session


class TestValidatePresentationFile:
    def test_validate_pptx_success(self):
        from workers.tasks.file_tasks import validate_presentation_file
        from workers.lib.pptx_validator import PptxValidationResult

        mock_file = _make_mock_file(status="uploaded", fmt="pptx")
        fake_result = PptxValidationResult(
            is_valid=True, slide_count=5, aspect_ratio="16:9"
        )

        with _mock_db(mock_file):
            with patch("workers.tasks.file_tasks.r2.download_bytes", return_value=b"pptx_data"), \
                 patch("workers.tasks.file_tasks.validate_pptx", return_value=fake_result), \
                 patch("workers.tasks.file_tasks.generate_file_thumbnail") as mock_thumb, \
                 patch("workers.tasks.file_tasks.FileValidation"):

                result = validate_presentation_file.apply(args=_task_args(mock_file))

        assert result.successful()
        data = result.result
        assert data["is_valid"] is True
        assert data["slide_count"] == 5

    def test_validate_pptx_failure(self):
        from workers.tasks.file_tasks import validate_presentation_file
        from workers.lib.pptx_validator import PptxValidationResult

        mock_file = _make_mock_file(status="uploaded", fmt="pptx")
        fake_result = PptxValidationResult(
            is_valid=False, errors=["Corrupt file"]
        )

        with _mock_db(mock_file):
            with patch("workers.tasks.file_tasks.r2.download_bytes", return_value=b"bad_data"), \
                 patch("workers.tasks.file_tasks.validate_pptx", return_value=fake_result), \
                 patch("workers.tasks.file_tasks.generate_file_thumbnail") as mock_thumb, \
                 patch("workers.tasks.file_tasks.FileValidation"):

                result = validate_presentation_file.apply(args=_task_args(mock_file))

        data = result.result
        assert data["is_valid"] is False
        assert "Corrupt file" in data["errors"]
        # Thumbnail should NOT be triggered for invalid file
        mock_thumb.delay.assert_not_called()

    def test_file_not_found_returns_error(self):
        from workers.tasks.file_tasks import validate_presentation_file

        mock_session = MagicMock()
        mock_session.get.return_value = None
        mock_session.commit.return_value = None

        @contextmanager
        def _ctx(*_args, **_kwargs):
            yield mock_session

        with patch("workers.tasks.file_tasks.get_db_session", side_effect=_ctx):
            result = validate_presentation_file.apply(args=[str(uuid.uuid4()), str(uuid.uuid4())])

        assert "error" in result.result

    def test_thumbnail_triggered_on_valid_file(self):
        from workers.tasks.file_tasks import validate_presentation_file
        from workers.lib.pptx_validator import PptxValidationResult

        mock_file = _make_mock_file(status="uploaded", fmt="pptx")
        fake_result = PptxValidationResult(is_valid=True, slide_count=3)

        with _mock_db(mock_file):
            with patch("workers.tasks.file_tasks.r2.download_bytes", return_value=b"ok"), \
                 patch("workers.tasks.file_tasks.validate_pptx", return_value=fake_result), \
                 patch("workers.tasks.file_tasks.generate_file_thumbnail") as mock_thumb, \
                 patch("workers.tasks.file_tasks.FileValidation"):

                validate_presentation_file.apply(args=_task_args(mock_file))

        mock_thumb.delay.assert_called_once_with(str(mock_file.id), str(mock_file.organization_id))


class TestGenerateFileThumbnail:
    def test_generates_pptx_thumbnail(self):
        from workers.tasks.file_tasks import generate_file_thumbnail

        mock_file = _make_mock_file(fmt="pptx")
        thumb_data = b"\x89PNG\r\n..."

        with _mock_db(mock_file):
            with patch("workers.tasks.file_tasks.r2.download_bytes", return_value=b"pptx"), \
                 patch("workers.tasks.file_tasks.generate_pptx_thumbnail", return_value=thumb_data), \
                 patch("workers.tasks.file_tasks.r2.upload_bytes") as mock_upload:

                result = generate_file_thumbnail.apply(args=_task_args(mock_file))

        assert result.successful()
        assert result.result["thumbnail_generated"] is True
        assert result.result["thumbnail_key"].startswith(f"{mock_file.organization_id}/thumbnails/")
        mock_upload.assert_called_once()

    def test_skips_upload_when_thumbnail_is_none(self):
        from workers.tasks.file_tasks import generate_file_thumbnail

        mock_file = _make_mock_file(fmt="pptx")

        with _mock_db(mock_file):
            with patch("workers.tasks.file_tasks.r2.download_bytes", return_value=b"pptx"), \
                 patch("workers.tasks.file_tasks.generate_pptx_thumbnail", return_value=None), \
                 patch("workers.tasks.file_tasks.r2.upload_bytes") as mock_upload:

                result = generate_file_thumbnail.apply(args=_task_args(mock_file))

        assert result.result["thumbnail_generated"] is False
        mock_upload.assert_not_called()

    def test_thumbnail_key_set_on_file(self):
        from workers.tasks.file_tasks import generate_file_thumbnail

        mock_file = _make_mock_file(fmt="pdf")
        thumb_data = b"fake_webp"

        with _mock_db(mock_file):
            with patch("workers.tasks.file_tasks.r2.download_bytes", return_value=b"pdf"), \
                 patch("workers.tasks.file_tasks.generate_pdf_thumbnail", return_value=thumb_data), \
                 patch("workers.tasks.file_tasks.r2.upload_bytes"):

                result = generate_file_thumbnail.apply(args=_task_args(mock_file))

        assert "thumbnail_key" in result.result
        assert result.result["thumbnail_key"].startswith(f"{mock_file.organization_id}/thumbnails/")
        assert str(mock_file.id) in result.result["thumbnail_key"]


class TestConvertPresentationToPdf:
    def test_skips_non_pptx_format(self):
        from workers.tasks.file_tasks import convert_presentation_to_pdf

        mock_file = _make_mock_file(fmt="mp4")

        with _mock_db(mock_file):
            result = convert_presentation_to_pdf.apply(args=_task_args(mock_file))

        assert result.result.get("skipped") is True

    def test_converts_pptx_successfully(self):
        from workers.tasks.file_tasks import convert_presentation_to_pdf

        mock_file = _make_mock_file(fmt="pptx")
        pdf_data = b"%PDF content"

        with _mock_db(mock_file):
            with patch("workers.tasks.file_tasks.r2.download_bytes", return_value=b"pptx"), \
                 patch("workers.tasks.file_tasks.convert_to_pdf", return_value=pdf_data), \
                 patch("workers.tasks.file_tasks.r2.upload_bytes") as mock_upload:

                result = convert_presentation_to_pdf.apply(args=_task_args(mock_file))

        assert result.result["converted"] is True
        assert result.result["pdf_key"].startswith(f"{mock_file.organization_id}/pdf_previews/")
        mock_upload.assert_called_once()
