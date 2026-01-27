
from fastapi.testclient import TestClient
from main import app
from app.utils.auth import api_login_required

# Mock auth
async def mock_auth():
    return "testuser"

app.dependency_overrides[api_login_required] = mock_auth

client = TestClient(app)

def test_packing_list():
    try:
        response = client.get("/api/picking/packing_list/10")
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        print(response.json())
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_packing_list()
