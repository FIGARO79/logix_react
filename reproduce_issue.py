
import asyncio
from app.routers.logs import find_item
from app.core.db import get_db
from app.services import csv_handler

# Mock request and dependencies
class MockRequest:
    pass

async def test_find_item():
    print("Loading CSV data...")
    await csv_handler.load_csv_data()
    
    item_code = "001003-002" # Known item with additional bins
    print(f"Testing find_item for {item_code}...")
    
    # We don't need actual DB session for this part as it reads from CSV mostly
    # But find_item requires db for db_logs.get_latest_relocated_bin_async
    # We can mock it or use a real session if available.
    # For simplicity, let's try to run it.
    
    # Creating a dummy async session generator
    async for db in get_db():
        try:
            response = await find_item(item_code, "NA", "test_user", db)
            # Response is JSONResponse
            import json
            body = response.body.decode()
            print(f"Response Body: {body}")
            data = json.loads(body)
            print(f"Aditional Bins: '{data.get('aditionalBins')}'")
        except Exception as e:
            print(f"Error: {e}")
        break

if __name__ == "__main__":
    asyncio.run(test_find_item())
