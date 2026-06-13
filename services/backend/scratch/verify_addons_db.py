import asyncio
from sqlalchemy import text
from app.database import AsyncSessionLocal

async def main():
    print("Verifying billing.addons columns...")
    async with AsyncSessionLocal() as db:
        try:
            # Run ensure_addon_columns logic via query to trigger Alter Table
            from app.modules.platform.router import ensure_addon_columns
            await ensure_addon_columns(db)
            print("ensure_addon_columns run complete.")

            # Query columns from information_schema
            result = await db.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'billing' AND table_name = 'addons';
            """))
            columns = result.all()
            print("\nColumns in billing.addons:")
            for col in columns:
                print(f" - {col[0]}: {col[1]}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
