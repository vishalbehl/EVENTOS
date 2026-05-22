
import redis
from app.config import settings

def test_redis():
    print(f"Connecting to Redis at {settings.CELERY_BROKER_URL}...")
    try:
        r = redis.from_url(settings.CELERY_BROKER_URL)
        r.ping()
        print("Redis is UP!")
    except Exception as e:
        print(f"Redis is DOWN: {e}")

if __name__ == "__main__":
    test_redis()
