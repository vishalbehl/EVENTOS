# workers/tests/test_notification_tasks.py
"""Tests for notification tasks — all HTTP calls mocked."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestSendEmail:
    def _mock_response(self, status_code=200, body=None):
        resp = MagicMock()
        resp.status_code = status_code
        resp.is_success = status_code < 400
        resp.json.return_value = body or {"id": "email_abc123"}
        resp.text = str(body) if body else ""
        return resp

    def test_sends_email_successfully(self):
        from workers.tasks.notification_tasks import send_email

        with patch("workers.tasks.notification_tasks.settings") as mock_settings, \
             patch("workers.tasks.notification_tasks.httpx.Client") as mock_http:

            mock_settings.RESEND_API_KEY = "re_test_key"
            mock_settings.EMAIL_FROM_NAME = "Conf Platform"
            mock_settings.EMAIL_FROM_ADDRESS = "no-reply@conf.com"

            ctx = MagicMock()
            ctx.__enter__ = MagicMock(return_value=ctx)
            ctx.__exit__ = MagicMock(return_value=False)
            ctx.post.return_value = self._mock_response(200, {"id": "res_001"})
            mock_http.return_value = ctx

            result = send_email.apply(kwargs={
                "to_address": "speaker@example.com",
                "subject": "Upload Reminder",
                "html_body": "<p>Please upload</p>",
            }).result

        assert result["sent"] is True
        assert result["resend_id"] == "res_001"

    def test_skips_when_no_api_key(self):
        from workers.tasks.notification_tasks import send_email

        with patch("workers.tasks.notification_tasks.settings") as mock_settings:
            mock_settings.RESEND_API_KEY = ""

            result = send_email.apply(kwargs={
                "to_address": "x@x.com",
                "subject": "Test",
                "html_body": "<p>hi</p>",
            }).result

        assert result["sent"] is False
        assert result["reason"] == "No API key"

    def test_includes_text_body_when_provided(self):
        from workers.tasks.notification_tasks import send_email

        with patch("workers.tasks.notification_tasks.settings") as mock_settings, \
             patch("workers.tasks.notification_tasks.httpx.Client") as mock_http:

            mock_settings.RESEND_API_KEY = "key"
            mock_settings.EMAIL_FROM_NAME = "Test"
            mock_settings.EMAIL_FROM_ADDRESS = "no@no.com"

            ctx = MagicMock()
            ctx.__enter__ = MagicMock(return_value=ctx)
            ctx.__exit__ = MagicMock(return_value=False)
            ctx.post.return_value = self._mock_response()
            mock_http.return_value = ctx

            send_email.apply(kwargs={
                "to_address": "x@x.com",
                "subject": "S",
                "html_body": "<p>H</p>",
                "text_body": "Plain text",
            })

            call_kwargs = ctx.post.call_args[1]["json"]
            assert call_kwargs.get("text") == "Plain text"


class TestSendWhatsApp:
    def _mock_response(self, status_code=200):
        resp = MagicMock()
        resp.status_code = status_code
        resp.is_success = status_code < 400
        resp.json.return_value = {"messages": [{"id": "wamid.123"}]}
        resp.text = ""
        return resp

    def test_sends_successfully(self):
        from workers.tasks.notification_tasks import send_whatsapp

        with patch("workers.tasks.notification_tasks.settings") as mock_settings, \
             patch("workers.tasks.notification_tasks.httpx.Client") as mock_http:

            mock_settings.WHATSAPP_ACCESS_TOKEN = "test_token"
            mock_settings.WHATSAPP_PHONE_NUMBER_ID = "123456"
            mock_settings.WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"

            ctx = MagicMock()
            ctx.__enter__ = MagicMock(return_value=ctx)
            ctx.__exit__ = MagicMock(return_value=False)
            ctx.post.return_value = self._mock_response()
            mock_http.return_value = ctx

            result = send_whatsapp.apply(kwargs={
                "to_phone": "+919876543210",
                "template_name": "upload_reminder",
            }).result

        assert result["sent"] is True
        assert result["message_id"] == "wamid.123"

    def test_skips_when_not_configured(self):
        from workers.tasks.notification_tasks import send_whatsapp

        with patch("workers.tasks.notification_tasks.settings") as mock_settings:
            mock_settings.WHATSAPP_ACCESS_TOKEN = ""
            mock_settings.WHATSAPP_PHONE_NUMBER_ID = ""

            result = send_whatsapp.apply(kwargs={
                "to_phone": "+1234567890",
                "template_name": "test",
            }).result

        assert result["sent"] is False

    def test_strips_plus_from_phone(self):
        from workers.tasks.notification_tasks import send_whatsapp

        with patch("workers.tasks.notification_tasks.settings") as mock_settings, \
             patch("workers.tasks.notification_tasks.httpx.Client") as mock_http:

            mock_settings.WHATSAPP_ACCESS_TOKEN = "tok"
            mock_settings.WHATSAPP_PHONE_NUMBER_ID = "pid"
            mock_settings.WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"

            ctx = MagicMock()
            ctx.__enter__ = MagicMock(return_value=ctx)
            ctx.__exit__ = MagicMock(return_value=False)
            ctx.post.return_value = self._mock_response()
            mock_http.return_value = ctx

            send_whatsapp.apply(kwargs={
                "to_phone": "+91 98765-43210",
                "template_name": "t",
            })

            payload = ctx.post.call_args[1]["json"]
            # Phone should be digits only
            assert payload["to"] == "919876543210"


class TestPushWsEvent:
    def test_skips_when_no_api_key(self):
        from workers.tasks.notification_tasks import push_ws_event
        import uuid

        with patch("workers.tasks.notification_tasks.settings") as mock_settings:
            mock_settings.BACKEND_INTERNAL_API_KEY = ""

            result = push_ws_event.apply(kwargs={
                "event_id": str(uuid.uuid4()),
                "event_type": "file.approved",
                "payload": {"key": "val"},
            }).result

        assert result["pushed"] is False

    def test_pushes_successfully(self):
        from workers.tasks.notification_tasks import push_ws_event
        import uuid

        with patch("workers.tasks.notification_tasks.settings") as mock_settings, \
             patch("workers.tasks.notification_tasks.httpx.Client") as mock_http:

            mock_settings.BACKEND_INTERNAL_API_KEY = "internal_key"
            mock_settings.BACKEND_WS_URL = "http://localhost:8000"

            ctx = MagicMock()
            ctx.__enter__ = MagicMock(return_value=ctx)
            ctx.__exit__ = MagicMock(return_value=False)
            resp = MagicMock()
            resp.is_success = True
            ctx.post.return_value = resp
            mock_http.return_value = ctx

            result = push_ws_event.apply(kwargs={
                "event_id": str(uuid.uuid4()),
                "event_type": "file.approved",
                "payload": {"file_id": "abc"},
            }).result

        assert result["pushed"] is True
