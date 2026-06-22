from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import QueueService
import uuid

router = APIRouter(prefix="/queue", tags=["queue"])
