import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from httpx import AsyncClient, ASGITransport
from app.main import app

async def main():
    # Use ASGITransport to query the app in-process directly
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login to get access token
        login_url = "http://test/api/v1/auth/login"
        login_data = {
            "email": "admin@eventos.com",
            "password": "admin123"
        }
        print(f"Logging in to {login_url}...")
        try:
            r = await client.post(login_url, json=login_data)
            print(f"Login status code: {r.status_code}")
            if r.status_code != 200:
                print(f"Login failed: {r.text}")
                return
            
            token_data = r.json()
            token = token_data.get("access_token")
            print("Successfully logged in.")
            
            # 2. Query /platform/features/matrix
            matrix_url = "http://test/api/v1/platform/features/matrix"
            headers = {"Authorization": f"Bearer {token}"}
            print(f"Querying {matrix_url}...")
            r_matrix = await client.get(matrix_url, headers=headers)
            print(f"Matrix status code: {r_matrix.status_code}")
            if r_matrix.status_code == 200:
                matrix_data = r_matrix.json()
                print(f"Matrix features returned: {len(matrix_data)}")
                for cat in matrix_data:
                    print(f"Category: {cat.get('category_name')} ({cat.get('category')}) - {len(cat.get('features'))} features")
                    for feat in cat.get('features', []):
                        print(f"  - Key: {feat.get('key')}, Name: {feat.get('name')}, Basic: {feat.get('display_basic')}, Pro: {feat.get('display_professional')}, Enterprise: {feat.get('display_enterprise')}")
            else:
                print(f"Failed to fetch matrix: {r_matrix.text}")
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
