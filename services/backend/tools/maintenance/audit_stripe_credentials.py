import sys
import os
sys.path.insert(0, os.path.abspath('services/backend'))
sys.path.insert(0, os.path.abspath('.'))

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
import app.models # Crucial to load all models for relationship mapping!
from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
from app.core.encryption import encrypt
from sqlalchemy import select

async def audit_stripe_credentials():
    engine = create_async_engine(settings.DATABASE_URL_SYNC.replace('postgresql+psycopg2', 'postgresql+asyncpg'))
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as session:
        # Load all registration settings
        result = await session.execute(select(RegistrationThemeSetting))
        settings_list = result.scalars().all()
        
        count = 0
        for setting in settings_list:
            creds = setting.stripe_credentials
            if isinstance(creds, dict):
                secret_key = creds.get("secret_key")
                # If secret key starts with 'sk_', it's plaintext — encrypt it!
                if secret_key and secret_key.startswith("sk_"):
                    print(f"Encrypting plaintext Stripe secret key for registration setting ID: {setting.id}")
                    new_creds = dict(creds)
                    new_creds["secret_key"] = encrypt(secret_key)
                    setting.stripe_credentials = new_creds
                    count += 1
        
        if count > 0:
            await session.commit()
            print(f"Audit complete. Encrypted {count} Stripe secret keys.")
        else:
            print("Audit complete. No plaintext Stripe secret keys found.")

if __name__ == "__main__":
    asyncio.run(audit_stripe_credentials())
