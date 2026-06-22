import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.blueprints.models import (
    EventBlueprint, BlueprintTemplate, BlueprintInstallation, BlueprintStep
)
from app.modules.templates.models import Template, TemplateCategory
from app.modules.templates.services import TemplateService
from app.modules.website_builder.services import WebsiteBuilderService

class BlueprintService:
    @staticmethod
    async def create_blueprint(db: AsyncSession, blueprint_data: Dict[str, Any]) -> EventBlueprint:
        blueprint = EventBlueprint(
            id=uuid.uuid4(),
            name=blueprint_data["name"],
            description=blueprint_data.get("description"),
            industry=blueprint_data.get("industry", "Technology"),
            blueprint_data=blueprint_data.get("blueprint_data", {}),
            is_system=blueprint_data.get("is_system", False),
            is_active=blueprint_data.get("is_active", True)
        )
        db.add(blueprint)
        await db.flush()

        # Add steps
        steps = blueprint_data.get("steps", [])
        for idx, step_val in enumerate(steps):
            step = BlueprintStep(
                id=uuid.uuid4(),
                blueprint_id=blueprint.id,
                name=step_val["name"],
                step_order=idx + 1,
                settings=step_val.get("settings", {})
            )
            db.add(step)
            await db.flush()

        await db.commit()
        return blueprint

    @staticmethod
    async def clone_blueprint(db: AsyncSession, blueprint_id: uuid.UUID) -> EventBlueprint:
        original = await db.get(EventBlueprint, blueprint_id)
        if not original:
            raise ValueError("Blueprint not found")

        clone = EventBlueprint(
            id=uuid.uuid4(),
            name=f"Copy of {original.name}",
            description=original.description,
            industry=original.industry,
            blueprint_data=original.blueprint_data,
            is_system=False,
            is_active=True
        )
        db.add(clone)
        await db.flush()

        # Clone steps
        result_steps = await db.execute(
            select(BlueprintStep)
            .filter_by(blueprint_id=blueprint_id)
            .order_by(BlueprintStep.step_order.asc())
        )
        steps = result_steps.scalars().all()

        for step in steps:
            clone_step = BlueprintStep(
                id=uuid.uuid4(),
                blueprint_id=clone.id,
                name=step.name,
                step_order=step.step_order,
                settings=step.settings
            )
            db.add(clone_step)

        # Clone templates mappings
        result_templates = await db.execute(select(BlueprintTemplate).filter_by(blueprint_id=blueprint_id))
        templates = result_templates.scalars().all()
        for bt in templates:
            clone_bt = BlueprintTemplate(
                id=uuid.uuid4(),
                blueprint_id=clone.id,
                template_id=bt.template_id
            )
            db.add(clone_bt)

        await db.commit()
        return clone

    @staticmethod
    async def update_blueprint(db: AsyncSession, blueprint_id: uuid.UUID, blueprint_data: Dict[str, Any]) -> EventBlueprint:
        blueprint = await db.get(EventBlueprint, blueprint_id)
        if not blueprint:
            raise ValueError("Blueprint not found")

        if "name" in blueprint_data:
            blueprint.name = blueprint_data["name"]
        if "description" in blueprint_data:
            blueprint.description = blueprint_data["description"]
        if "industry" in blueprint_data:
            blueprint.industry = blueprint_data["industry"]
        if "blueprint_data" in blueprint_data:
            blueprint.blueprint_data = blueprint_data["blueprint_data"]
        if "is_active" in blueprint_data:
            blueprint.is_active = blueprint_data["is_active"]

        # If steps supplied, replace them
        if "steps" in blueprint_data:
            result_steps = await db.execute(select(BlueprintStep).filter_by(blueprint_id=blueprint_id))
            existing_steps = result_steps.scalars().all()
            for es in existing_steps:
                await db.delete(es)
            await db.flush()

            for idx, step_val in enumerate(blueprint_data["steps"]):
                step = BlueprintStep(
                    id=uuid.uuid4(),
                    blueprint_id=blueprint_id,
                    name=step_val["name"],
                    step_order=idx + 1,
                    settings=step_val.get("settings", {})
                )
                db.add(step)

        await db.commit()
        return blueprint

    @staticmethod
    async def install_blueprint(db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID, blueprint_id: uuid.UUID) -> BlueprintInstallation:
        blueprint = await db.get(EventBlueprint, blueprint_id)
        if not blueprint:
            raise ValueError("Blueprint not found")

        installation = BlueprintInstallation(
            id=uuid.uuid4(),
            organization_id=organization_id,
            event_id=event_id,
            blueprint_id=blueprint_id
        )
        db.add(installation)
        await db.flush()

        # Find templates linked to this blueprint and install them
        result_templates = await db.execute(select(BlueprintTemplate).filter_by(blueprint_id=blueprint_id))
        linked_templates = result_templates.scalars().all()
        for lt in linked_templates:
            # Install the template using TemplateService
            await TemplateService.install_template(db, organization_id, event_id, lt.template_id)

        # Mock-install: Create a website if the blueprint contains a website builder step
        result_steps = await db.execute(select(BlueprintStep).filter_by(blueprint_id=blueprint_id))
        steps = result_steps.scalars().all()
        has_website_step = any("website" in step.name.lower() for step in steps)

        if has_website_step:
            # Create a default site for this event
            await WebsiteBuilderService.create_site(db, {
                "organization_id": organization_id,
                "event_id": event_id,
                "name": f"Website for Event {event_id}",
                "slug": f"event-{event_id.hex[:6]}",
                "domain": f"event-{event_id.hex[:6]}.example.com"
            })

        await db.commit()
        return installation

