import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.sql import text
from app.config import settings

async def drop_schemas():
    engine = create_async_engine(settings.async_database_url, echo=True)
    async with engine.begin() as conn:
        for schema in ['search', 'resource_management', 'mobile', 'inventory', 'deployment_management', 'operations_planning', 'platform_compliance', 'technology_services', 'procurement']:
            await conn.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
    print("Done dropping schemas")

asyncio.run(drop_schemas())
