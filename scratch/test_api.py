import requests

def test_api():
    try:
        # Assuming the server is running on localhost:8000
        # Since I don't have auth, I'll just check if it's reachable
        res = requests.get('http://localhost:8000/api/grn/unique_references')
        print(f"Status: {res.status_code}")
        print(f"Content: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_api()
