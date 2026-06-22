# app/modules/platform/teams/dependencies.py
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.modules.platform.teams.service import TeamService


async def get_team_service(db: AsyncSession = Depends(get_db)) -> TeamService:
    return TeamService(db)
