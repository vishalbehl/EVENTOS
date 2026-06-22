from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import LogsService
import uuid

router = APIRouter(prefix="/logs", tags=["logs"])

@router.get("")
async def list_logs(db: AsyncSession = Depends(get_db)):
    srv = LogsService(db)
    return await srv.list_logs()
