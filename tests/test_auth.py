from app.core.config import UPDATE_PASSWORD

def test_auth_flow(client):
    """
    Test the full authentication flow:
    Register -> Fail Login (Pending) -> Admin Approve -> Success Login -> Access Protected -> Logout
    """
    username = "testuser"
    password = "TestPassword123"

    # 1. Register
    response = client.post("/register", data={"username": username, "password": password})
    assert response.status_code == 200
    assert "Registro exitoso" in response.text

    # 2. Login (Pending)
    response = client.post("/login", data={"username": username, "password": password})
    assert response.status_code == 200
    # The response is the login page again with an error
    assert "pendiente de aprobación" in response.text

    # 3. Admin Login
    # We don't follow redirects to check the immediate response (cookie setting)
    response = client.post("/admin/login", data={"password": UPDATE_PASSWORD}, follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/admin/users"
    # Session cookie should be set
    assert "session" in response.cookies

    # 4. Approve User via Admin API
    # Assuming ID 1 for the first user
    response = client.post("/admin/approve/1")
    assert response.status_code == 200
    assert "aprobado" in response.json()['message']

    # 5. User Login (Approved)
    response = client.post("/login", data={"username": username, "password": password}, follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/"
    assert "session" in response.cookies

    # 6. Access Protected Route (manage_counts requires login)
    response = client.get("/manage_counts")
    assert response.status_code == 200
    assert "Gestionar Conteos" in response.text

    # 7. Logout
    response = client.get("/logout", follow_redirects=False)
    assert response.status_code == 302
    
    # 8. Access Protected Route after Logout (Should Redirect)
    response = client.get("/manage_counts", follow_redirects=False)
    assert response.status_code == 302
    assert "/login" in response.headers["location"] or "login" in response.headers["location"]
