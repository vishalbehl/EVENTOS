import httpx
import asyncio
async def test():
    async with httpx.AsyncClient() as c:
        try:
            r = await c.get('http://127.0.0.1:8001/api/v1/venue/admin/sync-status')
            print(r.status_code)
            print(r.text)
        except Exception as e:
            print('Error:', e)
asyncio.run(test())
