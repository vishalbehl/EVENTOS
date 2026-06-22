from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_database_async

async def get_db(db: AsyncSession = Depends(get_database_async)) -> AsyncSession:
    return db
