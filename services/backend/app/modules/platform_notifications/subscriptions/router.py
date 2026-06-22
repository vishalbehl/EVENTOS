from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import SubscriptionsService
import uuid

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
