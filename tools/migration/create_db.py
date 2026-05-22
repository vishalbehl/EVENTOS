import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.config import settings

async def create_db():
    # Use postgresql+asyncpg:// but pointing to the default postgres db
    base_dsn = settings.async_database_url.replace("conf_platform", "postgres")
    
    # We must use isolation_level="AUTOCOMMIT" to run CREATE DATABASE
    engine = create_async_engine(base_dsn, isolation_level="AUTOCOMMIT")
    
    try:
        async with engine.connect() as conn:
            await conn.execute(text("CREATE DATABASE conf_platform"))
            print("Database 'conf_platform' created successfully.")
    except Exception as e:
        print(f"Failed to create database: {e}")
    finally:
        await engine.dispose()

asyncio.run(create_db())
