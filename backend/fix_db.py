import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgres://postgres:847425@localhost:5432/conf_platform')
    try:
        await conn.execute('ALTER TABLE email_templates DROP CONSTRAINT ck_et_type;')
        print("Dropped constraint ck_et_type")
    except Exception as e:
        print(f"Error dropping constraint: {e}")
        
    try:
        await conn.execute("ALTER TABLE email_templates ADD CONSTRAINT ck_et_type CHECK (template_type IN ('upload_invite', 'reminder', 'deadline', 'approval', 'rejection', 'confirmation', 'custom', 'guidelines', 'promotion'));")
        print("Added new constraint ck_et_type")
    except Exception as e:
        print(f"Error adding constraint: {e}")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
