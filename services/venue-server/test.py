import httpx
import asyncio
async def test():
    async with httpx.AsyncClient() as c:
        r = await c.get('http://127.0.0.1:8001/api/v1/venue/admin/sync-status')
        print(r.status_code)
        print(r.text)
asyncio.run(test())
