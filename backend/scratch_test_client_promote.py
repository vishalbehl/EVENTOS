# scratch_test_client_promote.py
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.dependencies import get_db
from app.database import AsyncSessionLocal
from app.models.event import Event
from app.models.user import User
from sqlalchemy import select
import uuid
import json

# We want to override the dependencies
async def get_test_db():
    async with AsyncSessionLocal() as session:
        yield session

# Let's find a user in the database to act as the current user
async def get_admin_user():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.role.in_(['organiser', 'super_admin'])).limit(1))
        return res.scalar_one_or_none()

async def main():
    admin = await get_admin_user()
    if not admin:
        print("No admin user found in DB!")
        return

    # Let's get an event
    async with AsyncSessionLocal() as db:
        event_res = await db.execute(select(Event).limit(1))
        event = event_res.scalar_one_or_none()
    
    if not event:
        print("No event found in DB!")
        return

    print(f"Running AsyncClient promote request for event {event.id} as user {admin.email}")

    app.dependency_overrides[get_db] = get_test_db

    from app.dependencies import settings
    from jose import jwt
    from datetime import datetime, timedelta, timezone

    # Generate token with correct claims
    token_data = {
        "sub": str(admin.id),
        "role": admin.role,
        "org": str(admin.organization_id),
        "jti": uuid.uuid4().hex,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30)
    }
    token = jwt.encode(token_data, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    headers = {"Authorization": f"Bearer {token}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(f"/api/v1/events/{event.id}/capacity/promote", headers=headers)
    
    print("Response Status Code:", response.status_code)
    try:
        print("Response JSON:", response.json())
    except Exception:
        print("Response Text:", response.text)

    with open("scratch_client_promote_log.txt", "w") as f:
        f.write(f"Response Status Code: {response.status_code}\n")
        f.write("Response:\n")
        try:
            f.write(json.dumps(response.json(), indent=2))
        except Exception:
            f.write(response.text)

if __name__ == "__main__":
    asyncio.run(main())
