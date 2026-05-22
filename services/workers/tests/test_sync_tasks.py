# workers/tests/test_sync_tasks.py
"""Tests for venue sync tasks — httpx and DB mocked."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest


def _make_mock_file():
    f = MagicMock()
    f.id = uuid.uuid4()
    f.event_id = uuid.uuid4()
    f.file_format = "pptx"
    f.storage_path = f"presentations/{f.event_id}/{f.id}.pptx"
    return f


@contextmanager
def _mock_db(file_obj=None):
    session = MagicMock()
    session.get.return_value = file_obj
    session.add.return_value = None
    session.commit.return_value = None
    mock_query = MagicMock()
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = [file_obj] if file_obj else []
    session.query.return_value = mock_query

    @contextmanager
    def _ctx():
        yield session

    with patch("workers.tasks.sync_tasks.get_db_session", side_effect=_ctx):
        yield session


class TestSyncApprovedFileToVenues:
    def test_skips_when_no_venues_configured(self):
        from workers.tasks.sync_tasks import sync_approved_file_to_venues

        mock_file = _make_mock_file()

        with _mock_db(mock_file):
            with patch("workers.tasks.sync_tasks.settings") as mock_settings:
                mock_settings.venue_server_list = []
                mock_settings.S3_BUCKET_PRESENTATIONS = "presentations"
                mock_settings.VENUE_SYNC_TIMEOUT_SECONDS = 30

                result = sync_approved_file_to_venues.apply(
                    args=[str(mock_file.id)]
                ).result

        assert result["synced"] is False
        assert "No venue servers" in result["reason"]

    def test_syncs_to_single_venue(self):
        from workers.tasks.sync_tasks import sync_approved_file_to_venues

        mock_file = _make_mock_file()

        mock_resp = MagicMock()
        mock_resp.is_success = True

        http_ctx = MagicMock()
        http_ctx.__enter__ = MagicMock(return_value=http_ctx)
        http_ctx.__exit__ = MagicMock(return_value=False)
        http_ctx.post.return_value = mock_resp

        with _mock_db(mock_file):
            with patch("workers.tasks.sync_tasks.settings") as mock_settings, \
                 patch("workers.tasks.sync_tasks.r2.download_bytes", return_value=b"file_data"), \
                 patch("workers.tasks.sync_tasks.httpx.Client", return_value=http_ctx), \
                 patch("workers.tasks.sync_tasks.VenueSyncJob"):

                mock_settings.venue_server_list = ["http://venue1:8100"]
                mock_settings.S3_BUCKET_PRESENTATIONS = "presentations"
                mock_settings.VENUE_SYNC_TIMEOUT_SECONDS = 30
                mock_settings.BACKEND_INTERNAL_API_KEY = "key"

                result = sync_approved_file_to_venues.apply(
                    args=[str(mock_file.id)]
                ).result

        assert result["file_id"] == str(mock_file.id)
        results = result["results"]
        assert len(results) == 1
        assert results[0]["success"] is True

    def test_records_failure_on_http_error(self):
        from workers.tasks.sync_tasks import sync_approved_file_to_venues

        mock_file = _make_mock_file()

        mock_resp = MagicMock()
        mock_resp.is_success = False
        mock_resp.status_code = 503
        mock_resp.text = "Service Unavailable"

        http_ctx = MagicMock()
        http_ctx.__enter__ = MagicMock(return_value=http_ctx)
        http_ctx.__exit__ = MagicMock(return_value=False)
        http_ctx.post.return_value = mock_resp

        with _mock_db(mock_file):
            with patch("workers.tasks.sync_tasks.settings") as mock_settings, \
                 patch("workers.tasks.sync_tasks.r2.download_bytes", return_value=b"file"), \
                 patch("workers.tasks.sync_tasks.httpx.Client", return_value=http_ctx), \
                 patch("workers.tasks.sync_tasks.VenueSyncJob"):

                mock_settings.venue_server_list = ["http://venue1:8100"]
                mock_settings.S3_BUCKET_PRESENTATIONS = "presentations"
                mock_settings.VENUE_SYNC_TIMEOUT_SECONDS = 30
                mock_settings.BACKEND_INTERNAL_API_KEY = ""

                result = sync_approved_file_to_venues.apply(
                    args=[str(mock_file.id)]
                ).result

        assert result["results"][0]["success"] is False

    def test_file_not_found_returns_error(self):
        from workers.tasks.sync_tasks import sync_approved_file_to_venues

        session = MagicMock()
        session.get.return_value = None

        @contextmanager
        def _ctx():
            yield session

        with patch("workers.tasks.sync_tasks.get_db_session", side_effect=_ctx), \
             patch("workers.tasks.sync_tasks.settings") as mock_settings:

            mock_settings.venue_server_list = ["http://v:8100"]
            result = sync_approved_file_to_venues.apply(
                args=[str(uuid.uuid4())]
            ).result

        assert "error" in result


class TestNotifyVenueQueueUpdate:
    def test_returns_not_notified_when_no_venues(self):
        from workers.tasks.sync_tasks import notify_venue_queue_update

        with patch("workers.tasks.sync_tasks.settings") as mock_settings:
            mock_settings.venue_server_list = []

            result = notify_venue_queue_update.apply(kwargs={
                "event_id": str(uuid.uuid4()),
                "session_id": str(uuid.uuid4()),
            }).result

        assert result["notified"] is False

    def test_notifies_all_configured_venues(self):
        from workers.tasks.sync_tasks import notify_venue_queue_update

        mock_resp = MagicMock()
        mock_resp.is_success = True

        http_ctx = MagicMock()
        http_ctx.__enter__ = MagicMock(return_value=http_ctx)
        http_ctx.__exit__ = MagicMock(return_value=False)
        http_ctx.post.return_value = mock_resp

        with patch("workers.tasks.sync_tasks.settings") as mock_settings, \
             patch("workers.tasks.sync_tasks.httpx.Client", return_value=http_ctx):

            mock_settings.venue_server_list = ["http://v1:8100", "http://v2:8100"]
            mock_settings.VENUE_SYNC_TIMEOUT_SECONDS = 30
            mock_settings.BACKEND_INTERNAL_API_KEY = "key"

            result = notify_venue_queue_update.apply(kwargs={
                "event_id": str(uuid.uuid4()),
                "session_id": str(uuid.uuid4()),
            }).result

        assert result["notified_venues"] == 2
