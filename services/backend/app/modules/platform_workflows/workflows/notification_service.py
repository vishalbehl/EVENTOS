import uuid
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

class NotificationService:
    @staticmethod
    async def notify_approvers(db: AsyncSession, step_instance_id: uuid.UUID, user_ids: list[uuid.UUID]):
        logger.info(
            f"NOTIFICATION: Approvers {user_ids} assigned to pending Approval Step instance {step_instance_id}."
        )

    @staticmethod
    async def notify_requester(db: AsyncSession, instance_id: uuid.UUID, event_type: str):
        logger.info(
            f"NOTIFICATION: Request creator notified that Approval Instance {instance_id} state changed: {event_type}."
        )

    @staticmethod
    async def notify_escalation(db: AsyncSession, step_instance_id: uuid.UUID, escalated_to: uuid.UUID):
        logger.info(
            f"NOTIFICATION: Approval Step instance {step_instance_id} escalated to User {escalated_to}."
        )
