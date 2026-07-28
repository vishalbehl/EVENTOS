import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text
import json

async def main():
    async with AsyncSessionLocal() as db:
        # Get all active EventCommercialContracts
        contracts = (await db.execute(text("SELECT id, event_id, plan_key, entitlements FROM platform.event_commercial_contracts WHERE status = 'ACTIVE'"))).all()
        for contract in contracts:
            print(f'Contract {contract.id} for event {contract.event_id} with plan {contract.plan_key}')
            
            plan_name = contract.entitlements.get('plan_name') or contract.plan_key
            
            res = await db.execute(text('''
                SELECT fc.key, pf.value_type, pf.entitlement_value 
                FROM billing.plan_features pf
                JOIN billing.feature_catalog fc ON fc.id = pf.feature_id
                JOIN billing.subscription_plans sp ON sp.id = pf.plan_id
                WHERE sp.name = :plan_name AND pf.enabled = true
            '''), {'plan_name': plan_name})
            
            entitlements = dict(contract.entitlements)
            for key, value_type, raw in res.all():
                value = raw.get('value') if isinstance(raw, dict) else True
                entitlements[key] = {'type': value_type, 'value': value}
                
            await db.execute(text('UPDATE platform.event_commercial_contracts SET entitlements = :entitlements WHERE id = :id'), {
                'entitlements': json.dumps(entitlements),
                'id': contract.id
            })
            
        await db.commit()
        
        # Clear redis cache just in case
        from app.redis import redis_client
        await redis_client.flushall()
        
        print('Backfill complete.')

asyncio.run(main())
