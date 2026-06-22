import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.modules.templates.models import (
    Template, TemplateVersion, MarketplaceListing, MarketplacePurchase, MarketplaceFavorite, TemplateReview
)
from app.modules.templates.services import TemplateService

class MarketplaceService:
    @staticmethod
    async def publish_listing(db: AsyncSession, template_id: uuid.UUID, listing_data: Dict[str, Any]) -> MarketplaceListing:
        template = await db.get(Template, template_id)
        if not template:
            raise ValueError("Template not found")

        # Mark template visibility as MARKETPLACE
        template.visibility = "MARKETPLACE"
        template.is_marketplace = True
        await db.flush()

        listing = MarketplaceListing(
            id=uuid.uuid4(),
            template_id=template_id,
            price=listing_data.get("price", 0.0),
            status="ACTIVE"
        )
        db.add(listing)
        await db.commit()
        return listing

    @staticmethod
    async def install_marketplace_template(db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID, listing_id: uuid.UUID) -> MarketplacePurchase:
        listing = await db.get(MarketplaceListing, listing_id)
        if not listing:
            raise ValueError("Listing not found")

        purchase = MarketplacePurchase(
            id=uuid.uuid4(),
            listing_id=listing_id,
            organization_id=organization_id,
            price_paid=listing.price
        )
        db.add(purchase)
        await db.flush()

        # Install template
        await TemplateService.install_template(db, organization_id, event_id, listing.template_id)

        await db.commit()
        return purchase

    @staticmethod
    async def favorite_template(db: AsyncSession, user_id: uuid.UUID, template_id: uuid.UUID) -> MarketplaceFavorite:
        # Check if already favorited
        result = await db.execute(
            select(MarketplaceFavorite)
            .filter(and_(
                MarketplaceFavorite.user_id == user_id,
                MarketplaceFavorite.template_id == template_id
            ))
        )
        fav = result.scalars().first()

        if fav:
            return fav

        fav = MarketplaceFavorite(
            id=uuid.uuid4(),
            user_id=user_id,
            template_id=template_id
        )
        db.add(fav)
        await db.commit()
        return fav

    @staticmethod
    async def review_template(db: AsyncSession, user_id: uuid.UUID, template_id: uuid.UUID, rating: int, review: str) -> TemplateReview:
        tr = TemplateReview(
            id=uuid.uuid4(),
            template_id=template_id,
            user_id=user_id,
            rating=rating,
            review=review
        )
        db.add(tr)
        await db.commit()
        return tr

