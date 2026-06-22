from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import logging
from datetime import datetime, timedelta
from .models import NotificationDigest
from app.modules.platform_notifications.queue.models import NotificationQueue
from app.modules.identity.models.user import User
from app.core.providers.email import ResendEmailProvider

logger = logging.getLogger(__name__)

class DigestsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def configure_digest(self, org_id: uuid.UUID, user_id: uuid.UUID, frequency: str, next_run_at: datetime) -> NotificationDigest:
        res = await self.db.execute(
            select(NotificationDigest)
            .where(NotificationDigest.organization_id == org_id, NotificationDigest.user_id == user_id)
        )
        dig = res.scalar_one_or_none()
        if dig:
            dig.frequency = frequency
            dig.next_run_at = next_run_at
        else:
            dig = NotificationDigest(
                organization_id=org_id,
                user_id=user_id,
                frequency=frequency,
                next_run_at=next_run_at
            )
            self.db.add(dig)
        await self.db.flush()
        return dig

    async def get_due_digests(self) -> list[NotificationDigest]:
        now = datetime.utcnow()
        res = await self.db.execute(
            select(NotificationDigest)
            .where(NotificationDigest.next_run_at <= now)
        )
        return list(res.scalars().all())

    async def process_digest(self, digest: NotificationDigest) -> bool:
        # 1. Fetch pending notifications for this user
        res = await self.db.execute(
            select(NotificationQueue)
            .where(
                NotificationQueue.recipient_id == digest.user_id,
                NotificationQueue.organization_id == digest.organization_id,
                NotificationQueue.status == "DIGEST_PENDING"
            )
            .order_by(NotificationQueue.created_at.asc())
        )
        items = list(res.scalars().all())
        if not items:
            # Nothing to send, just update next run schedule
            self._update_next_run(digest)
            await self.db.flush()
            return False

        # 2. Get user details
        user_res = await self.db.execute(select(User).where(User.id == digest.user_id))
        user = user_res.scalar_one_or_none()
        if not user or not user.email:
            logger.warning(f"User {digest.user_id} not found or email missing for digest.")
            return False

        # 3. Compile rollup summary
        subject = f"Your EventX Notification Digest ({digest.frequency.capitalize()})"
        html_parts = [
            f"<h2>Your EventX {digest.frequency.capitalize()} Digest</h2>",
            "<p>Here is a summary of your recent notifications:</p>",
            "<ul>"
        ]
        text_parts = [
            f"Your EventX {digest.frequency.capitalize()} Digest\n",
            "Here is a summary of your recent notifications:\n\n"
        ]

        for item in items:
            title = item.payload.get("subject", "Notification Alert") if item.payload else "Notification Alert"
            body = item.payload.get("body", "") if item.payload else ""
            html_parts.append(f"<li><strong>{title}</strong>: {body}</li>")
            text_parts.append(f"- {title}: {body}\n")
            # Mark item as sent in digest
            item.status = "SENT"

        html_parts.append("</ul>")
        html_body = "".join(html_parts)
        text_body = "".join(text_parts)

        # 4. Dispatch Email
        provider = ResendEmailProvider()
        email_res = await provider.send_email(
            to_email=user.email,
            subject=subject,
            body=text_body,
            html_body=html_body
        )

        # 5. Update digest schedule
        digest.last_run_at = datetime.utcnow()
        self._update_next_run(digest)
        await self.db.flush()
        return email_res.get("status") == "success"

    def _update_next_run(self, digest: NotificationDigest):
        now = datetime.utcnow()
        freq = digest.frequency.lower()
        if freq == "hourly":
            digest.next_run_at = now + timedelta(hours=1)
        elif freq == "daily":
            digest.next_run_at = now + timedelta(days=1)
        elif freq == "weekly":
            digest.next_run_at = now + timedelta(weeks=1)
        else:
            digest.next_run_at = now + timedelta(days=1) # fallback
