from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_me_without_token_is_401():
    res = client.get("/api/me")
    assert res.status_code == 401
    assert res.json()["detail"] == "Not logged in"


def test_me_with_garbage_token_is_401():
    res = client.get("/api/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401
