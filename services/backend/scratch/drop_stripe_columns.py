import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as db:
        print("Dropping Stripe and Razorpay columns from billing.subscription_plans...")
        try:
            await db.execute(text("ALTER TABLE billing.subscription_plans DROP COLUMN IF EXISTS stripe_product_id CASCADE;"))
            await db.execute(text("ALTER TABLE billing.subscription_plans DROP COLUMN IF EXISTS stripe_price_id CASCADE;"))
            await db.execute(text("ALTER TABLE billing.subscription_plans DROP COLUMN IF EXISTS razorpay_plan_id CASCADE;"))
            await db.commit()
            print("Successfully dropped columns.")
        except Exception as e:
            await db.rollback()
            print(f"Error dropping columns: {e}")

if __name__ == "__main__":
    asyncio.run(main())
