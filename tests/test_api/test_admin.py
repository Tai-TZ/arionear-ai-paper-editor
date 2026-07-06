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
async def test_admin_overview_endpoint(client, admin_db):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "god@test.local", "password": "GodAdmin123"},
    )
    token = login.json()["access_token"]
    overview = await client.get(
        "/api/v1/admin/overview",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert overview.status_code == 200
    data = overview.json()
    assert "summary" in data
    assert data["summary"]["total_users"] >= 2
    assert "new_users_1d" in data
    assert "new_users_7d" in data
    assert "recent_users" in data
    assert "session_model_usage" in data
    assert "user_model_preferences" in data


@pytest.mark.asyncio
async def test_admin_cost_report_excludes_unused_by_default(client, admin_db):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "god@test.local", "password": "GodAdmin123"},
    )
    token = login.json()["access_token"]
    report = await client.get(
        "/api/v1/admin/usage/cost-report?year=2099&month=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert report.status_code == 200
    data = report.json()
    assert data["rows"] == []
    assert data["active_users_with_usage"] == 0

    all_users = await client.get(
        "/api/v1/admin/usage/cost-report?year=2099&month=1&include_unused=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert all_users.status_code == 200
    assert len(all_users.json()["rows"]) >= 2


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


@pytest.mark.asyncio
async def test_admin_provider_keys_crud(client, admin_db, monkeypatch):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "god@test.local", "password": "GodAdmin123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    empty = await client.get("/api/v1/admin/llm/keys", headers=headers)
    assert empty.status_code == 200
    payload = empty.json()
    assert payload["keys"] == []
    assert "openrouter" in payload["env_fallback_configured"]
    assert len(payload["providers"]) == 5
    assert {p["id"] for p in payload["providers"]} == {
        "openai",
        "anthropic",
        "openrouter",
        "zai",
        "google",
    }

    saved = await client.put(
        "/api/v1/admin/llm/keys/openrouter",
        headers=headers,
        json={
            "api_key": "sk-or-v1-admin-test-key-123456",
            "priority": 0,
            "label": "primary",
        },
    )
    assert saved.status_code == 200
    row = saved.json()
    assert row["provider"] == "openrouter"
    assert row["priority"] == 0
    assert row["key_hint"]
    assert "sk-o" in row["key_hint"] or "…" in row["key_hint"]

    listed = await client.get("/api/v1/admin/llm/keys?provider=openrouter", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()["keys"]) == 1

    backup = await client.put(
        "/api/v1/admin/llm/keys/openrouter",
        headers=headers,
        json={
            "api_key": "sk-or-v1-admin-backup-key-7890",
            "priority": 1,
            "label": "backup",
        },
    )
    assert backup.status_code == 200

    async def _fake_test(provider, api_key, *, model=None, temperature=0.0):
        return True, "OK", 42

    monkeypatch.setattr(
        "src.services.admin_provider_keys.test_provider_api_key",
        _fake_test,
    )

    tested = await client.post(
        "/api/v1/admin/llm/keys/openrouter/test",
        headers=headers,
        json={"key_id": row["id"]},
    )
    assert tested.status_code == 200
    assert tested.json()["ok"] is True

    deleted = await client.delete(f"/api/v1/admin/llm/keys/{row['id']}", headers=headers)
    assert deleted.status_code == 204

    cleared = await client.delete(
        "/api/v1/admin/llm/keys/provider/openrouter",
        headers=headers,
    )
    assert cleared.status_code == 204
    assert (await client.get("/api/v1/admin/llm/keys?provider=openrouter", headers=headers)).json()[
        "keys"
    ] == []


@pytest.mark.asyncio
async def test_admin_provider_keys_rejects_short_key(client, admin_db):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "god@test.local", "password": "GodAdmin123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    bad = await client.put(
        "/api/v1/admin/llm/keys/openai",
        headers=headers,
        json={"api_key": "short"},
    )
    assert bad.status_code == 422 or bad.status_code == 400
