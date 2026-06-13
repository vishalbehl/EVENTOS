import sys
import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app.models
from app.config import settings
from app.database import AsyncSessionLocal
from app.modules.platform.router import get_dashboard_metrics
from app.modules.identity.models.user import User

async def test_dashboard():
    print("Connecting to DB and calling get_dashboard_metrics...")
    async with AsyncSessionLocal() as db:
        # Create a mock user who is a platform admin
        mock_user = User(platform_role="SUPER_ADMIN", role="super_admin")
        metrics = await get_dashboard_metrics(db=db, current_user=mock_user)
        print("Successfully fetched dashboard metrics.")
        print("Keys returned in dashboard metrics:")
        for k, v in metrics.items():
            print(f"  {k}: {type(v)} = {v}")
            
if __name__ == "__main__":
    asyncio.run(test_dashboard())
