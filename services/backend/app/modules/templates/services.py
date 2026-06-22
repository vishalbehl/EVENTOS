import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.modules.templates.models import (
    Template, TemplateVersion, TemplateCategory, TemplateInstallation, TemplateUsage, TemplateReview
)

class TemplateService:
    @staticmethod
    async def create_template(db: AsyncSession, template_data: Dict[str, Any], created_by: Optional[uuid.UUID] = None) -> Template:
        # Create category if not exists (for testing/mock convenience)
        cat_id = template_data.get("category_id")
        if not cat_id:
            cat = (await db.execute(select(TemplateCategory))).scalars().first()
            if not cat:
                cat = TemplateCategory(
                    id=uuid.uuid4(),
                    name="Websites",
                    description="Standard websites category"
                )
                db.add(cat)
                await db.flush()
            cat_id = cat.id

        template = Template(
            id=uuid.uuid4(),
            organization_id=template_data.get("organization_id"),
            category_id=cat_id,
            name=template_data["name"],
            slug=template_data.get("slug") or template_data["name"].lower().replace(" ", "-"),
            description=template_data.get("description"),
            template_type=template_data.get("template_type", "WEBSITE"),
            status=template_data.get("status", "DRAFT"),
            visibility=template_data.get("visibility", "PRIVATE"),
            is_system=template_data.get("is_system", False),
            is_marketplace=template_data.get("is_marketplace", False),
            created_by=created_by
        )
        db.add(template)
        await db.flush()

        # If initial version content is supplied, create a version record
        if "content" in template_data:
            version = TemplateVersion(
                id=uuid.uuid4(),
                template_id=template.id,
                version_number=1,
                description="Initial version",
                content=template_data["content"],
                schema=template_data.get("schema"),
                assets=template_data.get("assets"),
                published_by=created_by
            )
            db.add(version)
            await db.flush()
            template.current_version_id = version.id
            template.status = "PUBLISHED"
            await db.flush()

        await db.commit()
        return template

    @staticmethod
    async def clone_template(db: AsyncSession, template_id: uuid.UUID, organization_id: Optional[uuid.UUID] = None) -> Template:
        original = await db.get(Template, template_id)
        if not original:
            raise ValueError("Template not found")

        clone = Template(
            id=uuid.uuid4(),
            organization_id=organization_id or original.organization_id,
            category_id=original.category_id,
            name=f"Copy of {original.name}",
            slug=f"{original.slug}-copy-{uuid.uuid4().hex[:4]}",
            description=original.description,
            template_type=original.template_type,
            status="DRAFT",
            visibility="PRIVATE",
            is_system=False,
            is_marketplace=False
        )
        db.add(clone)
        await db.flush()

        # Clone current version if exists
        if original.current_version_id:
            orig_version = await db.get(TemplateVersion, original.current_version_id)
            if orig_version:
                version = TemplateVersion(
                    id=uuid.uuid4(),
                    template_id=clone.id,
                    version_number=1,
                    description=f"Cloned from {original.name} v{orig_version.version_number}",
                    content=orig_version.content,
                    schema=orig_version.schema,
                    assets=orig_version.assets
                )
                db.add(version)
                await db.flush()
                clone.current_version_id = version.id
                clone.status = "PUBLISHED"
                await db.flush()

        await db.commit()
        return clone

    @staticmethod
    async def publish_template(db: AsyncSession, template_id: uuid.UUID, version_data: Dict[str, Any], published_by: Optional[uuid.UUID] = None) -> TemplateVersion:
        template = await db.get(Template, template_id)
        if not template:
            raise ValueError("Template not found")

        # Find latest version number
        latest_version = (await db.execute(
            select(TemplateVersion)
            .filter_by(template_id=template_id)
            .order_by(TemplateVersion.version_number.desc())
        )).scalars().first()

        next_number = (latest_version.version_number + 1) if latest_version else 1

        version = TemplateVersion(
            id=uuid.uuid4(),
            template_id=template_id,
            version_number=next_number,
            description=version_data.get("description", f"Version {next_number}"),
            content=version_data["content"],
            schema=version_data.get("schema"),
            assets=version_data.get("assets"),
            published_by=published_by
        )
        db.add(version)
        await db.flush()

        template.current_version_id = version.id
        template.status = "PUBLISHED"
        await db.flush()
        await db.commit()
        return version

    @staticmethod
    async def archive_template(db: AsyncSession, template_id: uuid.UUID) -> Template:
        template = await db.get(Template, template_id)
        if not template:
            raise ValueError("Template not found")
        template.status = "ARCHIVED"
        await db.commit()
        return template

    @staticmethod
    async def install_template(db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID, template_id: uuid.UUID, version_id: Optional[uuid.UUID] = None) -> TemplateInstallation:
        template = await db.get(Template, template_id)
        if not template:
            raise ValueError("Template not found")

        target_version_id = version_id or template.current_version_id
        if not target_version_id:
            raise ValueError("No published version available for this template")

        installation = TemplateInstallation(
            id=uuid.uuid4(),
            organization_id=organization_id,
            event_id=event_id,
            template_id=template_id,
            installed_version_id=target_version_id
        )
        db.add(installation)

        # Log template usage record
        usage = TemplateUsage(
            id=uuid.uuid4(),
            template_id=template_id,
            organization_id=organization_id,
            event_id=event_id,
            usage_type="INSTALLATION"
        )
        db.add(usage)

        await db.commit()
        return installation

    @staticmethod
    async def rollback_version(db: AsyncSession, template_id: uuid.UUID, version_number: int) -> TemplateVersion:
        template = await db.get(Template, template_id)
        if not template:
            raise ValueError("Template not found")

        target_version = (await db.execute(
            select(TemplateVersion)
            .filter(and_(
                TemplateVersion.template_id == template_id,
                TemplateVersion.version_number == version_number
            ))
        )).scalars().first()

        if not target_version:
            raise ValueError("Version not found")

        # Rollback template to refer to this version as current
        template.current_version_id = target_version.id
        await db.commit()
        return target_version

