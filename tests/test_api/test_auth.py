import os

import pytest

from src.config import get_settings
from src.db.engine import init_db, reset_db_state


@pytest.fixture
def auth_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_auth.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    get_settings.cache_clear()
    reset_db_state()
    init_db()
    yield
    reset_db_state()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_register_login_flow(client, auth_db):
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Dr. Test",
            "email": "test@university.edu",
            "password": "SecurePass1",
            "affiliation": "VNU",
        },
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    assert reg.json()["user"]["email"] == "test@university.edu"

    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200

    bad_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@university.edu", "password": "wrong"},
    )
    assert bad_login.status_code == 401

    good_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@university.edu", "password": "SecurePass1"},
    )
    assert good_login.status_code == 200


@pytest.mark.asyncio
async def test_forgot_reset_password(client, auth_db):
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Reset User", "email": "reset@uni.edu", "password": "OldPass123"},
    )

    forgot = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset@uni.edu"},
    )
    assert forgot.status_code == 200
    dev_url = forgot.json().get("dev_reset_url")
    assert dev_url
    token = dev_url.split("token=")[1]

    reset = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "password": "NewPass456"},
    )
    assert reset.status_code == 200

    login_old = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@uni.edu", "password": "OldPass123"},
    )
    assert login_old.status_code == 401

    login_new = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@uni.edu", "password": "NewPass456"},
    )
    assert login_new.status_code == 200


@pytest.mark.asyncio
async def test_forgot_password_no_enumeration(client, auth_db):
    res = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "nobody@example.com"},
    )
    assert res.status_code == 200
    assert "If that email is registered" in res.json()["message"]


@pytest.mark.asyncio
async def test_duplicate_register_rejected(client, auth_db):
    payload = {
        "name": "Dr. Test",
        "email": "dup@university.edu",
        "password": "SecurePass1",
    }
    first = await client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 200

    second = await client.post("/api/v1/auth/register", json=payload)
    assert second.status_code == 400
    assert "already exists" in second.json()["detail"]


@pytest.mark.asyncio
async def test_weak_password_rejected(client, auth_db):
    res = await client.post(
        "/api/v1/auth/register",
        json={"name": "Weak", "email": "weak@uni.edu", "password": "short"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reset_token_single_use(client, auth_db):
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Once", "email": "once@uni.edu", "password": "OldPass123"},
    )
    forgot = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "once@uni.edu"},
    )
    token = forgot.json()["dev_reset_url"].split("token=")[1]

    first = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "password": "NewPass456"},
    )
    assert first.status_code == 200

    second = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "password": "Another789"},
    )
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_me_rejects_invalid_token(client, auth_db):
    res = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_generic_error_no_user_leak(client, auth_db):
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@uni.edu", "password": "NoSuchUser1"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password."
