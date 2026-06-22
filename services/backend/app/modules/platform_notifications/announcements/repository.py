from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid
from .models import *

class AnnouncementsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: uuid.UUID):
        # Dynamically find the primary model
        pass
