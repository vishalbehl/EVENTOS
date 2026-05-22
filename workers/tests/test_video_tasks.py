# workers/tests/test_video_tasks.py
"""Tests for video tasks — DB, R2, and FFmpeg all mocked."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest


def _make_mock_video_file(fmt="mp4"):
    f = MagicMock()
    f.id = uuid.uuid4()
    f.event_id = uuid.uuid4()
    f.file_format = fmt
    f.storage_path = f"presentations/{f.event_id}/{f.id}.{fmt}"
    f.file_size_bytes = 50_000_000
    return f


@contextmanager
def _mock_db(file_obj):
    session = MagicMock()
    session.get.return_value = file_obj
    session.add.return_value = None
    session.commit.return_value = None
    # query chain for FileValidation lookup
    mock_query = MagicMock()
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.first.return_value = None
    session.query.return_value = mock_query

    @contextmanager
    def _ctx():
        yield session

    with patch("workers.tasks.video_tasks.get_db_session", side_effect=_ctx):
        yield session


class TestNormaliseVideoFile:
    def test_skips_non_video_format(self):
        from workers.tasks.video_tasks import normalise_video_file

        mock_file = _make_mock_video_file(fmt="pptx")

        with _mock_db(mock_file):
            result = normalise_video_file.apply(args=[str(mock_file.id)]).result

        assert result.get("skipped") is True

    def test_normalises_mp4_successfully(self):
        from workers.tasks.video_tasks import normalise_video_file

        mock_file = _make_mock_video_file(fmt="mp4")
        normalised_data = b"normalised_mp4"

        with _mock_db(mock_file):
            with patch("workers.tasks.video_tasks.r2.download_bytes", return_value=b"original"), \
                 patch("workers.tasks.video_tasks.get_video_metadata", return_value=None), \
                 patch("workers.tasks.video_tasks.normalise_video", return_value=normalised_data), \
                 patch("workers.tasks.video_tasks.r2.upload_bytes") as mock_upload, \
                 patch("workers.tasks.video_tasks.generate_file_thumbnail") as mock_thumb:

                result = normalise_video_file.apply(args=[str(mock_file.id)]).result

        assert result["normalised"] is True
        assert result["normalised_bytes"] == len(normalised_data)
        mock_upload.assert_called_once()
        mock_thumb.delay.assert_called_once_with(str(mock_file.id))

    def test_returns_not_normalised_when_ffmpeg_unavailable(self):
        from workers.tasks.video_tasks import normalise_video_file

        mock_file = _make_mock_video_file(fmt="mp4")

        with _mock_db(mock_file):
            with patch("workers.tasks.video_tasks.r2.download_bytes", return_value=b"video"), \
                 patch("workers.tasks.video_tasks.get_video_metadata", return_value=None), \
                 patch("workers.tasks.video_tasks.normalise_video", return_value=None):

                result = normalise_video_file.apply(args=[str(mock_file.id)]).result

        assert result["normalised"] is False

    def test_file_not_found(self):
        from workers.tasks.video_tasks import normalise_video_file

        session = MagicMock()
        session.get.return_value = None

        @contextmanager
        def _ctx():
            yield session

        with patch("workers.tasks.video_tasks.get_db_session", side_effect=_ctx):
            result = normalise_video_file.apply(args=[str(uuid.uuid4())]).result

        assert "error" in result

    def test_updates_file_size_after_normalisation(self):
        from workers.tasks.video_tasks import normalise_video_file

        mock_file = _make_mock_video_file(fmt="mp4")
        normalised_data = b"x" * 1000

        with _mock_db(mock_file) as session:
            with patch("workers.tasks.video_tasks.r2.download_bytes", return_value=b"big_video"), \
                 patch("workers.tasks.video_tasks.get_video_metadata", return_value=None), \
                 patch("workers.tasks.video_tasks.normalise_video", return_value=normalised_data), \
                 patch("workers.tasks.video_tasks.r2.upload_bytes"), \
                 patch("workers.tasks.video_tasks.generate_file_thumbnail"):

                normalise_video_file.apply(args=[str(mock_file.id)])

        assert mock_file.file_size_bytes == 1000
        assert mock_file.file_format == "mp4"


class TestExtractVideoMetadata:
    def test_returns_metadata_dict(self):
        from workers.tasks.video_tasks import extract_video_metadata
        from workers.lib.ffmpeg_wrapper import VideoMetadata

        mock_file = _make_mock_video_file(fmt="mp4")
        meta = VideoMetadata(
            duration_seconds=300.0, width=1920, height=1080,
            video_codec="h264", audio_codec="aac",
            bit_rate_kbps=4000, frame_rate=30.0,
            file_size_bytes=50_000_000,
        )

        with _mock_db(mock_file):
            with patch("workers.tasks.video_tasks.r2.download_bytes", return_value=b"video"), \
                 patch("workers.tasks.video_tasks.get_video_metadata", return_value=meta), \
                 patch("workers.tasks.video_tasks.FileValidation"):

                result = extract_video_metadata.apply(args=[str(mock_file.id)]).result

        assert result["duration_seconds"] == 300.0
        assert result["width"] == 1920
        assert result["video_codec"] == "h264"

    def test_returns_not_extracted_when_ffmpeg_unavailable(self):
        from workers.tasks.video_tasks import extract_video_metadata

        mock_file = _make_mock_video_file(fmt="mp4")

        with _mock_db(mock_file):
            with patch("workers.tasks.video_tasks.r2.download_bytes", return_value=b"v"), \
                 patch("workers.tasks.video_tasks.get_video_metadata", return_value=None):

                result = extract_video_metadata.apply(args=[str(mock_file.id)]).result

        assert result["metadata_extracted"] is False
