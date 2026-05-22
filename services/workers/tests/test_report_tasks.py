# workers/tests/test_report_tasks.py
"""Tests for report tasks — DB and R2 mocked."""

from __future__ import annotations

import io
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest


def _make_event(name="Test Conference"):
    e = MagicMock()
    e.id = uuid.uuid4()
    e.name = name
    e.upload_deadline = datetime(2026, 9, 1, 18, 0, tzinfo=timezone.utc)
    return e


def _make_session(event_id):
    s = MagicMock()
    s.id = uuid.uuid4()
    s.event_id = event_id
    s.session_code = "S-001"
    s.name = "Opening Keynote"
    s.status = "active"
    s.start_time = datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc)
    s.end_time = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    s.room = MagicMock()
    s.room.name = "Hall A"
    s.session_speakers = []
    return s


def _make_speaker(event_id):
    sp = MagicMock()
    sp.id = uuid.uuid4()
    sp.event_id = event_id
    sp.first_name = "Jane"
    sp.last_name = "Doe"
    sp.email = "jane@example.com"
    sp.phone = "+1234567890"
    sp.affiliation = "MIT"
    sp.upload_status = "approved"
    return sp


@contextmanager
def _mock_db_report(event, sessions, speakers, files=None):
    session = MagicMock()
    # .get() returns event
    session.get.return_value = event

    # .query() chain supports different models
    q = MagicMock()
    q.filter.return_value = q
    q.order_by.return_value = q
    q.all.side_effect = [sessions, speakers, files or []]
    session.query.return_value = q

    @contextmanager
    def _ctx():
        yield session

    with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx):
        yield session


class TestGenerateEventSummaryReport:
    def test_generates_xlsx_and_uploads(self):
        from workers.tasks.report_tasks import generate_event_summary_report

        event = _make_event()
        sessions = [_make_session(event.id)]
        speakers = [_make_speaker(event.id)]

        xlsx_bytes = [None]

        def capture_upload(bucket, key, data, content_type=None):
            xlsx_bytes[0] = data

        with _mock_db_report(event, sessions, speakers):
            with patch("workers.tasks.report_tasks.r2.upload_bytes", side_effect=capture_upload), \
                 patch("workers.tasks.report_tasks.r2.generate_presigned_url", return_value="https://dl.url"), \
                 patch("workers.tasks.report_tasks.send_email"):

                result = generate_event_summary_report.apply(kwargs={
                    "event_id": str(event.id),
                    "requested_by_user_id": str(uuid.uuid4()),
                }).result

        assert result["generated"] is True
        assert result["sessions"] == 1
        assert result["speakers"] == 1
        assert result["download_url"] == "https://dl.url"

        # Verify actual valid xlsx bytes were produced
        assert xlsx_bytes[0] is not None
        # XLSX files start with PK zip magic bytes
        assert xlsx_bytes[0][:2] == b"PK"

    def test_returns_error_when_event_not_found(self):
        from workers.tasks.report_tasks import generate_event_summary_report

        session = MagicMock()
        session.get.return_value = None

        @contextmanager
        def _ctx():
            yield session

        with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx):
            result = generate_event_summary_report.apply(kwargs={
                "event_id": str(uuid.uuid4()),
                "requested_by_user_id": str(uuid.uuid4()),
            }).result

        assert result["generated"] is False
        assert "not found" in result["error"]

    def test_report_key_contains_event_id(self):
        from workers.tasks.report_tasks import generate_event_summary_report

        event = _make_event()
        event_id = str(event.id)

        with _mock_db_report(event, [], []):
            with patch("workers.tasks.report_tasks.r2.upload_bytes") as mock_upload, \
                 patch("workers.tasks.report_tasks.r2.generate_presigned_url", return_value="https://x"), \
                 patch("workers.tasks.report_tasks.send_email"):

                generate_event_summary_report.apply(kwargs={
                    "event_id": event_id,
                    "requested_by_user_id": str(uuid.uuid4()),
                })

        # Report key should include event_id
        call_args = mock_upload.call_args
        report_key = call_args[1]["key"] if call_args[1] else call_args[0][1]
        assert event_id in report_key


class TestGenerateSessionReadinessCsv:
    def test_generates_csv_and_uploads(self):
        from workers.tasks.report_tasks import generate_session_readiness_csv

        event = _make_event()

        # Mock query rows (SessionSpeaker, Session, Speaker tuples)
        session_db = MagicMock()
        q = MagicMock()
        q.join.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.return_value = []
        session_db.query.return_value = q

        @contextmanager
        def _ctx():
            yield session_db

        with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx), \
             patch("workers.tasks.report_tasks.r2.upload_bytes") as mock_upload, \
             patch("workers.tasks.report_tasks.r2.generate_presigned_url", return_value="https://csv.url"):

            result = generate_session_readiness_csv.apply(
                args=[str(event.id)]
            ).result

        assert result["generated"] is True
        assert "download_url" in result
        mock_upload.assert_called_once()

    def test_csv_is_utf8_bom_encoded(self):
        from workers.tasks.report_tasks import generate_session_readiness_csv

        uploaded_data = [None]

        def capture(bucket, key, data, content_type=None):
            uploaded_data[0] = data

        session_db = MagicMock()
        q = MagicMock()
        q.join.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.return_value = []
        session_db.query.return_value = q

        @contextmanager
        def _ctx():
            yield session_db

        with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx), \
             patch("workers.tasks.report_tasks.r2.upload_bytes", side_effect=capture), \
             patch("workers.tasks.report_tasks.r2.generate_presigned_url", return_value="x"):

            generate_session_readiness_csv.apply(args=[str(uuid.uuid4())])

        # UTF-8 BOM marker
        assert uploaded_data[0] is not None
        assert uploaded_data[0][:3] == b"\xef\xbb\xbf"
