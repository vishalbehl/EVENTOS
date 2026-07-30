import asyncio, sys
sys.path.insert(0, '.')
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from app.config import settings

async def main():
    engine = create_async_engine(settings.async_database_url, echo=False)
    async with AsyncSession(engine) as db:
        # Check if UsageReservation, UsageLedgerEntry tables exist
        for schema, table in [
            ('platform', 'usage_reservations'),
            ('platform', 'usage_ledger_entries'),
            ('billing', 'entitlement_grants'),
            ('billing', 'grant_consumptions'),
            ('billing', 'event_entitlement_snapshot_sets'),
            ('billing', 'subscription_plans'),
            ('billing', 'organization_subscriptions'),
        ]:
            result = await db.execute(text(f"""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_schema = '{schema}' AND table_name = '{table}'
            """))
            count = result.scalar()
            print(f'{schema}.{table}: {"EXISTS" if count else "MISSING"}')

asyncio.run(main())
