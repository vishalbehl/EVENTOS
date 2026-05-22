# workers/tests/test_config.py
"""Tests for WorkerSettings config validation."""

from __future__ import annotations

import pytest
from workers.config import WorkerSettings


class TestWorkerSettings:
    def test_defaults_load(self):
        """WorkerSettings must instantiate with defaults only (no .env needed)."""
        s = WorkerSettings(_env_file=None)
        assert s.CELERY_BROKER_URL.startswith("redis://")
        assert s.CELERY_RESULT_BACKEND.startswith("redis://")
        assert s.S3_BUCKET_PRESENTATIONS == "presentations"
        assert s.S3_BUCKET_THUMBNAILS == "thumbnails"
        assert s.THUMBNAIL_WIDTH == 960
        assert s.THUMBNAIL_HEIGHT == 540
        assert s.VIDEO_MAX_WIDTH == 1920

    def test_venue_server_list_empty(self):
        s = WorkerSettings(_env_file=None, VENUE_SERVER_URLS="")
        assert s.venue_server_list == []

    def test_venue_server_list_parsed(self):
        s = WorkerSettings(
            _env_file=None,
            VENUE_SERVER_URLS="http://venue1:8100,http://venue2:8100"
        )
        assert s.venue_server_list == ["http://venue1:8100", "http://venue2:8100"]

    def test_venue_server_list_strips_spaces(self):
        s = WorkerSettings(
            _env_file=None,
            VENUE_SERVER_URLS="http://v1:8100 , http://v2:8100 "
        )
        assert s.venue_server_list == ["http://v1:8100", "http://v2:8100"]

    def test_video_bitrate_default(self):
        s = WorkerSettings(_env_file=None)
        assert s.VIDEO_TARGET_BITRATE == "4M"
        assert s.VIDEO_TARGET_CODEC == "libx264"

    def test_thumbnail_format_default(self):
        s = WorkerSettings(_env_file=None)
        assert s.THUMBNAIL_FORMAT == "WEBP"
        assert s.THUMBNAIL_QUALITY == 85
