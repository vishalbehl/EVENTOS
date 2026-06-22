from sqlalchemy.ext.asyncio import AsyncSession
from .repository import TemplatesRepository
from .models import NotificationTemplate
import uuid

class TemplatesService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TemplatesRepository(db)

    async def create_template(self, org_id: uuid.UUID, event_id: uuid.UUID, channel: str, name: str, subject: str, body: str, variables: dict = None) -> NotificationTemplate:
        tmpl = NotificationTemplate(
            organization_id=org_id,
            event_id=event_id,
            channel=channel,
            name=name,
            subject=subject,
            body=body,
            variables=variables or {}
        )
        return await self.repo.create(tmpl)

    async def get_template(self, id: uuid.UUID) -> NotificationTemplate:
        return await self.repo.get_by_id(id)

    async def render_template(self, body: str, context: dict) -> str:
        import re
        def replacer(match):
            var_name = match.group(1).strip()
            return str(context.get(var_name, match.group(0)))
        return re.sub(r"\{\{\s*(.*?)\s*\}\}", replacer, body)

    async def list_templates(self, org_id: uuid.UUID = None) -> list[NotificationTemplate]:
        return await self.repo.list_all(org_id)

    async def update_template(self, id: uuid.UUID, updates: dict) -> NotificationTemplate:
        tmpl = await self.get_template(id)
        if not tmpl:
            return None
        for key, value in updates.items():
            if hasattr(tmpl, key):
                setattr(tmpl, key, value)
        return tmpl

    async def delete_template(self, id: uuid.UUID) -> bool:
        tmpl = await self.get_template(id)
        if not tmpl:
            return False
        await self.repo.delete(tmpl)
        return True
