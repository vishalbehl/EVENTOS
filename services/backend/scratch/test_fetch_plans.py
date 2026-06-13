import sys
import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings
import app.models
from app.modules.billing.models.subscription import SubscriptionPlan

async def test_query():
    # Use async database url
    db_url = settings.async_database_url
    print(f"Connecting to async DB: {db_url}")
    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session() as session:
        print("Executing SELECT query on SubscriptionPlan...")
        result = await session.execute(
            select(SubscriptionPlan).order_by(SubscriptionPlan.created_at.asc())
        )
        plans = result.scalars().all()
        print(f"Successfully retrieved {len(plans)} plans:")
        for p in plans:
            print(f"  - ID: {p.id}, Name: {p.name}, Stripe Price ID: {p.stripe_price_id}")
            
    await engine.dispose()
    print("Done.")

if __name__ == "__main__":
    asyncio.run(test_query())
