import asyncio
import app.models
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.modules.platform.models.feature import FeatureCatalog

async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(FeatureCatalog).where(FeatureCatalog.is_active == True)
        feats = (await db.execute(stmt)).scalars().all()
        print(f"Total active features: {len(feats)}")
        for f in feats:
            print(f"key={f.key:35} name={f.name:30} category={f.category:25}")

if __name__ == "__main__":
    asyncio.run(main())
