# backend/app/redis.py
import redis.asyncio as redis
from app.config import settings

# Create a global redis client
redis_client = redis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True
)

async def get_redis():
    """Dependency helper for redis"""
    return redis_client
