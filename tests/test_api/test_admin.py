import os

import pytest

from src.config import get_settings
from src.db.engine import get_db, init_db, reset_db_state
from src.db.models import User, UserRole
from src.services.auth_service import ensure_god_admin, hash_password


@pytest.fixture
def admin_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_admin.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    monkeypatch.setenv("ADMIN_GOD_EMAIL", "god@test.local")
    monkeypatch.setenv("ADMIN_GOD_PASSWORD", "GodAdmin123")
    get_settings.cache_clear()
    reset_db_state()
    init_db()
    with get_db() as db:
        ensure_god_admin(db)
        researcher = User(
            email="user@test.local",
            full_name="Researcher",
            password_hash=hash_password("UserPass123"),
            role=UserRole.RESEARCHER,
            is_active=True,
        )
        db.add(researcher)
    yield
    reset_db_state()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_admin_requires_god_admin(client, admin_db):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "user@test.local", "password": "UserPass123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    denied = await client.get(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_god_admin_can_list_users(client, admin_db):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "god@test.local", "password": "GodAdmin123"},
    )
    assert login.status_code == 200
    body = login.json()
    assert body["user"]["is_god_admin"] is True
    token = body["access_token"]

    users = await client.get(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert users.status_code == 200
    payload = users.json()
    assert payload["total"] >= 2


@pytest.mark.asyncio
async def test_admin_cost_report_endpoint(client, admin_db):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "god@test.local", "password": "GodAdmin123"},
    )
    token = login.json()["access_token"]
    report = await client.get(
        "/api/v1/admin/usage/cost-report?year=2026&month=6",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert report.status_code == 200
    data = report.json()
    assert data["month"] == "2026-06"
    assert "rows" in data
