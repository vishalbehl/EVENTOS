import uuid
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.theme_engine.models import Theme, ThemeAsset
from app.modules.website_builder.models import Site

class ThemeService:
    @staticmethod
    async def create_theme(db: AsyncSession, theme_data: Dict[str, Any]) -> Theme:
        theme = Theme(
            id=uuid.uuid4(),
            organization_id=theme_data.get("organization_id"),
            name=theme_data["name"],
            description=theme_data.get("description"),
            theme_data=theme_data.get("theme_data", {})
        )
        db.add(theme)
        await db.flush()

        # Add assets if provided
        assets = theme_data.get("assets", [])
        for asset in assets:
            asset_entry = ThemeAsset(
                id=uuid.uuid4(),
                theme_id=theme.id,
                asset_url=asset["asset_url"],
                asset_type=asset.get("asset_type", "IMAGE")
            )
            db.add(asset_entry)
            await db.flush()

        await db.commit()
        return theme

    @staticmethod
    async def apply_theme(db: AsyncSession, theme_id: uuid.UUID, site_id: uuid.UUID) -> Site:
        site = await db.get(Site, site_id)
        if not site:
            raise ValueError("Site not found")

        theme = await db.get(Theme, theme_id)
        if not theme:
            raise ValueError("Theme not found")

        # Map theme styles into site templates settings (mock apply)
        # Update site status to draft since theme changed
        site.status = "DRAFT"
        await db.commit()
        return site

    @staticmethod
    async def export_theme(db: AsyncSession, theme_id: uuid.UUID) -> Dict[str, Any]:
        theme = await db.get(Theme, theme_id)
        if not theme:
            raise ValueError("Theme not found")

        result = await db.execute(select(ThemeAsset).filter_by(theme_id=theme_id))
        assets = result.scalars().all()
        assets_export = [{"asset_url": a.asset_url, "asset_type": a.asset_type} for a in assets]

        return {
            "name": theme.name,
            "description": theme.description,
            "theme_data": theme.theme_data,
            "assets": assets_export
        }

    @staticmethod
    async def import_theme(db: AsyncSession, organization_id: uuid.UUID, theme_data: Dict[str, Any]) -> Theme:
        imported_data = dict(theme_data)
        imported_data["organization_id"] = organization_id
        return await ThemeService.create_theme(db, imported_data)

