import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.modules.platform.models.feature import FeatureCatalog

async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(FeatureCatalog)
        features = (await db.execute(stmt)).scalars().all()
        print(f"Total features in DB: {len(features)}")
        for f in features:
            print(f"Key: {f.key} | Basic: {f.display_value_basic!r} | Pro: {f.display_value_professional!r} | Ent: {f.display_value_enterprise!r}")

if __name__ == "__main__":
    asyncio.run(main())
