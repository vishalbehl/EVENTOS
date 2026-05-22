import asyncio
from sqlalchemy import text
from app.dependencies import get_db

async def update_constraints():
    async for db in get_db():
        try:
            print("Updating ck_pf_upload_source constraint...")
            # Drop old constraint
            await db.execute(text("ALTER TABLE presentation_files DROP CONSTRAINT IF EXISTS ck_pf_upload_source"))
            # Add new constraint with 'portal'
            await db.execute(text("ALTER TABLE presentation_files ADD CONSTRAINT ck_pf_upload_source CHECK (upload_source IN ('web','kiosk','station','api','portal'))"))
            
            print("Updating ck_pf_upload_status constraint...")
            # Drop old constraint
            await db.execute(text("ALTER TABLE presentation_files DROP CONSTRAINT IF EXISTS ck_pf_upload_status"))
            # Add new constraint with 'pending_validation'
            await db.execute(text("ALTER TABLE presentation_files ADD CONSTRAINT ck_pf_upload_status CHECK (upload_status IN ('processing','valid','invalid','approved','rejected','locked','pending_validation'))"))
            
            await db.commit()
            print("Constraints updated successfully!")
        except Exception as e:
            print(f"Error updating constraints: {e}")
            await db.rollback()
        break

if __name__ == "__main__":
    asyncio.run(update_constraints())
