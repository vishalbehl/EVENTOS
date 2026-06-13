import asyncio
import app.models
from app.services.init_service import ensure_plans_and_features
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.modules.platform.models.feature import FeatureCatalog

async def main():
    print("Running ensure_plans_and_features()...")
    await ensure_plans_and_features()
    print("Done seeding features.")
    
    async with AsyncSessionLocal() as db:
        stmt = select(FeatureCatalog).where(FeatureCatalog.is_active == True)
        active_feats = (await db.execute(stmt)).scalars().all()
        print(f"Active features in DB: {len(active_feats)}")
        
        categories = {}
        for f in active_feats:
            cat = f.category
            if cat not in categories:
                categories[cat] = {
                    "category": cat,
                    "category_name": cat.replace("_", " ").title(),
                    "features": []
                }
            categories[cat]["features"].append({
                "key": f.key,
                "name": f.name,
            })
        print(f"Grouped categories count: {len(categories)}")
        for cat_key, cat in categories.items():
            print(f"- Category: {cat['category_name']} has {len(cat['features'])} features")

if __name__ == "__main__":
    asyncio.run(main())
