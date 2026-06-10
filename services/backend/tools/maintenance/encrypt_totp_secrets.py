import sys
import os
sys.path.insert(0, os.path.abspath('services/backend'))

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.modules.identity.models.user import User
from app.services.credential_cipher import cipher
from sqlalchemy import select

async def encrypt_totp_secrets():
    engine = create_async_engine(settings.DATABASE_URL_SYNC.replace('postgresql+psycopg2', 'postgresql+asyncpg'))
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).filter(User._two_factor_secret != None))
        users = result.scalars().all()
        
        count = 0
        for user in users:
            # Check if it is already encrypted
            if user._two_factor_secret and not cipher.is_encrypted(user._two_factor_secret):
                print(f"Encrypting TOTP secret for user: {user.email}")
                # The setter will automatically encrypt it
                user.two_factor_secret = user._two_factor_secret
                count += 1
        
        await session.commit()
        print(f"Encrypted {count} TOTP secrets.")

if __name__ == "__main__":
    asyncio.run(encrypt_totp_secrets())
