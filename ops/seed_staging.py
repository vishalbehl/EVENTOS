"""Idempotent staging seed entry point; safe to run repeatedly."""
import asyncio
from app.services.init_service import (
    ensure_admin_user, ensure_agenda_rooms_schema, ensure_agenda_types_defaults,
    ensure_plans_and_features, ensure_rbac_defaults,
)

async def main() -> None:
    await ensure_agenda_rooms_schema()
    await ensure_agenda_types_defaults()
    await ensure_rbac_defaults()
    await ensure_plans_and_features()
    await ensure_admin_user()
    print('Staging seed completed.')

if __name__ == '__main__':
    asyncio.run(main())
