"""Read-only console summary query services."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


class ConsoleSummaryQueryService:
    """Centralize bounded aggregate reads used by the console summary route."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(self, model: type, *criteria: Any) -> int:
        statement = select(func.count()).select_from(model)
        if criteria:
            statement = statement.where(*criteria)
        return int((await self.db.scalar(statement)) or 0)
