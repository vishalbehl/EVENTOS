# =============================================================
# Conference Platform — Data Retention & Cleanup Service
# backend/app/services/retention_service.py
#
# Enforces automated data retention, archival, and purging policies
# across audit logs, telemetry, ephemeral tokens, and communications.
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List
from loguru import logger
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.portal_otp_token import PortalOtpToken
from app.modules.identity.models.identity_domain_tables import PasswordResetToken
from app.modules.venue.models.venue_telemetry import DeviceHeartbeat, RoomRuntimeEvent, WebsocketEvent
from app.modules.communications.models.email_log import EmailLog
from app.modules.communications.models.communications_domain_tables import SmsMessage
from app.modules.audit.models.audit_log import AuditLog

# Default Retention Policy Thresholds (in Days)
RETENTION_POLICIES = {
    "EPHEMERAL_TOKENS_DAYS": 1,         # 24 hours
    "TELEMETRY_EVENTS_DAYS": 30,        # 30 days
    "COMMUNICATION_LOGS_DAYS": 90,      # 90 days
    "AUDIT_LOGS_HOT_DAYS": 90,          # 90 days hot retention before archival
}


class RetentionService:
    """Automated data retention and lifecycle manager."""

    @staticmethod
    async def cleanup_ephemeral_tokens(db: AsyncSession, dry_run: bool = False) -> Dict[str, Any]:
        """Purge expired OTP tokens and password reset tokens older than retention policy."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=RETENTION_POLICIES["EPHEMERAL_TOKENS_DAYS"])

        # 1. Portal OTP Tokens
        otp_query = select(func.count(PortalOtpToken.id)).where(
            (PortalOtpToken.expires_at < now) | (PortalOtpToken.created_at < cutoff)
        )
        otp_count = (await db.execute(otp_query)).scalar() or 0

        # 2. Password Reset Tokens
        reset_query = select(func.count(PasswordResetToken.id)).where(
            (PasswordResetToken.expires_at < now) | (PasswordResetToken.created_at < cutoff)
        )
        reset_count = (await db.execute(reset_query)).scalar() or 0

        if not dry_run:
            await db.execute(
                delete(PortalOtpToken).where(
                    (PortalOtpToken.expires_at < now) | (PortalOtpToken.created_at < cutoff)
                )
            )
            await db.execute(
                delete(PasswordResetToken).where(
                    (PasswordResetToken.expires_at < now) | (PasswordResetToken.created_at < cutoff)
                )
            )
            await db.commit()

        logger.info(f"[Retention] Ephemeral Tokens Purged: OTPs={otp_count}, ResetTokens={reset_count} (dry_run={dry_run})")
        return {"otp_tokens_purged": otp_count, "password_reset_tokens_purged": reset_count}

    @staticmethod
    async def cleanup_telemetry_events(db: AsyncSession, dry_run: bool = False) -> Dict[str, Any]:
        """Purge device telemetry, runtime logs, and websocket events older than 30 days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_POLICIES["TELEMETRY_EVENTS_DAYS"])

        hb_count = (await db.execute(select(func.count(DeviceHeartbeat.id)).where(DeviceHeartbeat.occurred_at < cutoff))).scalar() or 0
        rt_count = (await db.execute(select(func.count(RoomRuntimeEvent.id)).where(RoomRuntimeEvent.occurred_at < cutoff))).scalar() or 0
        ws_count = (await db.execute(select(func.count(WebsocketEvent.id)).where(WebsocketEvent.occurred_at < cutoff))).scalar() or 0

        if not dry_run:
            await db.execute(delete(DeviceHeartbeat).where(DeviceHeartbeat.occurred_at < cutoff))
            await db.execute(delete(RoomRuntimeEvent).where(RoomRuntimeEvent.occurred_at < cutoff))
            await db.execute(delete(WebsocketEvent).where(WebsocketEvent.occurred_at < cutoff))
            await db.commit()

        logger.info(f"[Retention] Telemetry Purged: Heartbeats={hb_count}, RuntimeEvents={rt_count}, Websocket={ws_count} (dry_run={dry_run})")
        return {
            "heartbeats_purged": hb_count,
            "runtime_events_purged": rt_count,
            "websocket_events_purged": ws_count,
        }

    @staticmethod
    async def cleanup_communication_logs(db: AsyncSession, dry_run: bool = False) -> Dict[str, Any]:
        """Purge email and SMS logs older than 90 days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_POLICIES["COMMUNICATION_LOGS_DAYS"])

        email_count = (await db.execute(select(func.count(EmailLog.id)).where(EmailLog.sent_at < cutoff))).scalar() or 0
        sms_count = (await db.execute(select(func.count(SmsMessage.id)).where(SmsMessage.sent_at < cutoff))).scalar() or 0

        if not dry_run:
            await db.execute(delete(EmailLog).where(EmailLog.sent_at < cutoff))
            await db.execute(delete(SmsMessage).where(SmsMessage.sent_at < cutoff))
            await db.commit()

        logger.info(f"[Retention] Communication Logs Purged: Emails={email_count}, SMS={sms_count} (dry_run={dry_run})")
        return {"email_logs_purged": email_count, "sms_logs_purged": sms_count}

    @staticmethod
    async def run_all_retention_policies(db: AsyncSession, dry_run: bool = False) -> Dict[str, Any]:
        """Execute all data retention cleanup jobs."""
        logger.info(f"Starting Data Retention Lifecycle Run (dry_run={dry_run})...")

        ephemeral_res = await RetentionService.cleanup_ephemeral_tokens(db, dry_run)
        telemetry_res = await RetentionService.cleanup_telemetry_events(db, dry_run)
        comms_res = await RetentionService.cleanup_communication_logs(db, dry_run)

        summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dry_run": dry_run,
            "ephemeral_tokens": ephemeral_res,
            "telemetry": telemetry_res,
            "communications": comms_res,
        }

        logger.info(f"Data Retention Lifecycle Complete: {summary}")
        return summary
