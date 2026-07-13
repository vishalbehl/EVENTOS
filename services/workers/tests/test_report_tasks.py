# workers/tests/test_report_tasks.py
"""Tests for report tasks — DB and R2 mocked."""

from __future__ import annotations

import io
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest


def _make_event(name="Test Conference", organization_id=None):
    e = MagicMock()
    e.id = uuid.uuid4()
    e.organization_id = organization_id or uuid.uuid4()
    e.name = name
    e.upload_deadline = datetime(2026, 9, 1, 18, 0, tzinfo=timezone.utc)
    return e


def _make_requester(organization_id):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.organization_id = organization_id
    user.email = "organizer@example.com"
    return user


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
def _mock_db_report(event, sessions, speakers, files=None, requester=None):
    session = MagicMock()
    requester = requester or _make_requester(event.organization_id)
    session.get.side_effect = [event, requester, requester]

    # .query() chain supports different models
    q = MagicMock()
    q.filter.return_value = q
    q.order_by.return_value = q
    q.all.side_effect = [sessions, speakers, files or []]
    session.query.return_value = q

    @contextmanager
    def _ctx(*_args, **_kwargs):
        yield session

    with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx):
        yield session


class TestGenerateEventSummaryReport:
    def test_generates_xlsx_and_uploads(self):
        from workers.tasks.report_tasks import generate_event_summary_report

        event = _make_event()
        requester = _make_requester(event.organization_id)
        sessions = [_make_session(event.id)]
        speakers = [_make_speaker(event.id)]

        xlsx_bytes = [None]

        def capture_upload(bucket, key, data, content_type=None):
            xlsx_bytes[0] = data

        with _mock_db_report(event, sessions, speakers, requester=requester):
            with patch("workers.tasks.report_tasks.r2.upload_bytes", side_effect=capture_upload), \
                 patch("workers.tasks.report_tasks.send_email"):

                result = generate_event_summary_report.apply(kwargs={
                    "event_id": str(event.id),
                    "organization_id": str(event.organization_id),
                    "requested_by_user_id": str(requester.id),
                }).result

        assert result["generated"] is True
        assert result["sessions"] == 1
        assert result["speakers"] == 1
        assert "download_url" not in result
        assert "expires_at" in result

        # Verify actual valid xlsx bytes were produced
        assert xlsx_bytes[0] is not None
        # XLSX files start with PK zip magic bytes
        assert xlsx_bytes[0][:2] == b"PK"

    def test_returns_error_when_event_not_found(self):
        from workers.tasks.report_tasks import generate_event_summary_report

        session = MagicMock()
        session.get.return_value = None

        @contextmanager
        def _ctx(*_args, **_kwargs):
            yield session

        with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx):
            result = generate_event_summary_report.apply(kwargs={
                "event_id": str(uuid.uuid4()),
                "organization_id": str(uuid.uuid4()),
                "requested_by_user_id": str(uuid.uuid4()),
            }).result

        assert result["generated"] is False
        assert "not found" in result["error"]

    def test_report_key_is_tenant_and_event_scoped(self):
        from workers.tasks.report_tasks import generate_event_summary_report

        event = _make_event()
        requester = _make_requester(event.organization_id)
        event_id = str(event.id)

        with _mock_db_report(event, [], [], requester=requester):
            with patch("workers.tasks.report_tasks.r2.upload_bytes") as mock_upload, \
                 patch("workers.tasks.report_tasks.send_email"):

                generate_event_summary_report.apply(kwargs={
                    "event_id": event_id,
                    "organization_id": str(event.organization_id),
                    "requested_by_user_id": str(requester.id),
                })

        # Report key must carry the tenant namespace and event scope.
        call_args = mock_upload.call_args
        report_key = call_args[1]["key"] if call_args[1] else call_args[0][1]
        assert report_key.startswith(f"{event.organization_id}/events/{event_id}/exports/")
        assert event_id in report_key

    def test_rejects_event_owned_by_another_organization(self):
        from workers.tasks.report_tasks import generate_event_summary_report

        event = _make_event()
        session = MagicMock()
        session.get.return_value = event

        @contextmanager
        def _ctx(*_args, **_kwargs):
            yield session

        with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx), \
             patch("workers.tasks.report_tasks.r2.upload_bytes") as upload:
            result = generate_event_summary_report.apply(kwargs={
                "event_id": str(event.id),
                "organization_id": str(uuid.uuid4()),
                "requested_by_user_id": str(uuid.uuid4()),
            }).result

        assert result["generated"] is False
        upload.assert_not_called()


class TestGenerateSessionReadinessCsv:
    def test_generates_csv_and_uploads(self):
        from workers.tasks.report_tasks import generate_session_readiness_csv

        event = _make_event()

        # Mock query rows (SessionSpeaker, Session, Speaker tuples)
        session_db = MagicMock()
        session_db.get.return_value = event
        q = MagicMock()
        q.join.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.return_value = []
        session_db.query.return_value = q

        @contextmanager
        def _ctx(*_args, **_kwargs):
            yield session_db

        with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx), \
             patch("workers.tasks.report_tasks.r2.upload_bytes") as mock_upload:

            result = generate_session_readiness_csv.apply(
                args=[str(event.id), str(event.organization_id)]
            ).result

        assert result["generated"] is True
        assert "download_url" not in result
        assert result["report_key"].startswith(f"{event.organization_id}/events/{event.id}/exports/")
        mock_upload.assert_called_once()

    def test_csv_is_utf8_bom_encoded(self):
        from workers.tasks.report_tasks import generate_session_readiness_csv

        uploaded_data = [None]

        def capture(bucket, key, data, content_type=None):
            uploaded_data[0] = data

        session_db = MagicMock()
        event = _make_event()
        session_db.get.return_value = event
        q = MagicMock()
        q.join.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.return_value = []
        session_db.query.return_value = q

        @contextmanager
        def _ctx(*_args, **_kwargs):
            yield session_db

        with patch("workers.tasks.report_tasks.get_db_session", side_effect=_ctx), \
             patch("workers.tasks.report_tasks.r2.upload_bytes", side_effect=capture):

            generate_session_readiness_csv.apply(args=[str(event.id), str(event.organization_id)])

        # UTF-8 BOM marker
        assert uploaded_data[0] is not None
        assert uploaded_data[0][:3] == b"\xef\xbb\xbf"
