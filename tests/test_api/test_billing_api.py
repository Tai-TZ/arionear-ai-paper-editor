"""/billing — demo QR checkout gating (BILLING_DEMO_CHECKOUT) and admin-only direct upgrade."""

from __future__ import annotations

import os

import pytest

from src.config import get_settings
from src.db.engine import get_db, init_db, reset_db_state
from src.services import billing_service
from src.services.auth_service import ensure_god_admin
from tests.test_api.auth_helpers import register_user_via_verification

GOD_EMAIL = "god@billing.test"
GOD_PASSWORD = "GodAdmin123"


@pytest.fixture
def billing_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_billing.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.delenv("BILLING_DEMO_CHECKOUT", raising=False)
    monkeypatch.setenv("ADMIN_GOD_EMAIL", GOD_EMAIL)
    monkeypatch.setenv("ADMIN_GOD_PASSWORD", GOD_PASSWORD)
    for name in ("SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"):
        monkeypatch.setenv(name, "")
    get_settings.cache_clear()
    reset_db_state()
    init_db()
    with get_db() as db:
        ensure_god_admin(db)
    billing_service._pending_checkouts.clear()
    yield
    billing_service._pending_checkouts.clear()
    reset_db_state()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


def _set_flag(monkeypatch, *, app_env: str = "test", flag: str | None = None) -> None:
    monkeypatch.setenv("APP_ENV", app_env)
    if flag is None:
        monkeypatch.delenv("BILLING_DEMO_CHECKOUT", raising=False)
    else:
        monkeypatch.setenv("BILLING_DEMO_CHECKOUT", flag)
    get_settings.cache_clear()


async def _register(client, email: str) -> dict[str, str]:
    body = await register_user_via_verification(client, name="Researcher", email=email, password="SecurePass1")
    return {"Authorization": f"Bearer {body['access_token']}"}


async def _god_headers(client) -> dict[str, str]:
    login = await client.post("/api/v1/auth/login", json={"email": GOD_EMAIL, "password": GOD_PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _tier(client, headers) -> str:
    res = await client.get("/api/v1/billing/status", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["tier"]


@pytest.mark.asyncio
async def test_demo_checkout_works_outside_production(client, billing_db):
    headers = await _register(client, "demo@uni.edu")

    checkout = await client.post("/api/v1/billing/checkout", headers=headers, json={})
    assert checkout.status_code == 200, checkout.text
    checkout_id = checkout.json()["checkout_id"]

    confirm = await client.get(f"/api/v1/billing/confirm/{checkout_id}")
    assert confirm.status_code == 200
    assert confirm.headers["content-type"].startswith("text/html")
    assert "Content-Security-Policy" not in confirm.headers  # inline styles/script must keep working
    assert await _tier(client, headers) == "pro"


@pytest.mark.asyncio
@pytest.mark.parametrize(("app_env", "flag"), [("production", None), ("test", "false")])
async def test_checkout_returns_503_when_demo_disabled(client, billing_db, monkeypatch, app_env, flag):
    headers = await _register(client, "nopay@uni.edu")
    _set_flag(monkeypatch, app_env=app_env, flag=flag)

    res = await client.post("/api/v1/billing/checkout", headers=headers, json={})

    assert res.status_code == 503
    detail = res.json()["detail"]
    assert detail["code"] == "BILLING_CHECKOUT_DISABLED"
    assert "administrator" in detail["message"]
    assert billing_service._pending_checkouts == {}
    assert await _tier(client, headers) == "free"


@pytest.mark.asyncio
async def test_confirm_refuses_when_demo_disabled(client, billing_db, monkeypatch):
    headers = await _register(client, "late@uni.edu")
    checkout = await client.post("/api/v1/billing/checkout", headers=headers, json={})
    assert checkout.status_code == 200, checkout.text
    checkout_id = checkout.json()["checkout_id"]

    _set_flag(monkeypatch, app_env="production")
    confirm = await client.get(f"/api/v1/billing/confirm/{checkout_id}")

    assert confirm.status_code == 403
    assert confirm.headers["content-type"].startswith("text/html")
    assert "Mã QR không dùng được" in confirm.text
    assert await _tier(client, headers) == "free"


@pytest.mark.asyncio
async def test_direct_upgrade_requires_god_admin(client, billing_db):
    headers = await _register(client, "self-upgrade@uni.edu")

    anonymous = await client.post("/api/v1/billing/upgrade", json={"plan": "pro"})
    assert anonymous.status_code == 401
    regular = await client.post("/api/v1/billing/upgrade", headers=headers, json={"plan": "pro"})
    assert regular.status_code == 403
    assert await _tier(client, headers) == "free"

    god = await _god_headers(client)
    upgraded = await client.post("/api/v1/billing/upgrade", headers=god, json={"plan": "pro"})
    assert upgraded.status_code == 200, upgraded.text
    assert upgraded.json()["billing"]["tier"] == "pro"


@pytest.mark.asyncio
async def test_direct_upgrade_admin_only_even_in_dev(client, billing_db, monkeypatch):
    _set_flag(monkeypatch, app_env="development", flag="true")
    headers = await _register(client, "dev-upgrade@uni.edu")
    res = await client.post("/api/v1/billing/upgrade", headers=headers, json={"plan": "pro"})
    assert res.status_code == 403
    assert await _tier(client, headers) == "free"
