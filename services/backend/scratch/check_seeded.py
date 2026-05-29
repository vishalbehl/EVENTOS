import asyncio
from sqlalchemy import select

# Import all models to configure SQLAlchemy registry
import app.models
from app.modules.auth.models.user import User
from app.modules.rbac.models.event import Event
from app.modules.rbac.models.organization import Organization
from app.modules.rbac.models.rbac import Role, Permission
from app.modules.notifications.models.email_template import EmailTemplate

from app.database import AsyncSessionLocal

async def check_seeded():
    async with AsyncSessionLocal() as db:
        # Check Organization
        res = await db.execute(select(Organization))
        orgs = res.scalars().all()
        print(f"Organizations found: {len(orgs)}")
        for o in orgs:
            print(f" - {o.name} ({o.slug})")

        # Check Users
        res = await db.execute(select(User))
        users = res.scalars().all()
        print(f"Users found: {len(users)}")
        for u in users:
            print(f" - {u.email} (Role: {u.role})")

        # Check Roles
        res = await db.execute(select(Role))
        roles = res.scalars().all()
        print(f"Roles found: {len(roles)}")

        # Check Email Templates
        res = await db.execute(select(EmailTemplate))
        templates = res.scalars().all()
        print(f"Email Templates found: {len(templates)}")
        for t in templates:
            print(f" - {t.name} (Type: {t.template_type}, Default: {t.is_default})")

if __name__ == "__main__":
    asyncio.run(check_seeded())
