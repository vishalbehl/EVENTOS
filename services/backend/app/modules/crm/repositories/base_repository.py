from typing import Generic, TypeVar, Type, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import Base
import uuid

T = TypeVar("T", bound=Base)

class BaseRepository(Generic[T]):
    def __init__(self, model: Type[T], session: AsyncSession, organization_id: uuid.UUID):
        self.model = model
        self.session = session
        self.organization_id = organization_id

    async def get_all(self) -> List[T]:
        stmt = select(self.model).filter_by(organization_id=self.organization_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_id(self, id: uuid.UUID) -> Optional[T]:
        stmt = select(self.model).filter_by(id=id, organization_id=self.organization_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> T:
        kwargs["organization_id"] = self.organization_id
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance
