import os

import pytest

from src.config import get_settings
from src.db.engine import init_db, reset_db_state
from tests.test_api.auth_helpers import register_user_via_verification


@pytest.fixture
def auth_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_auth.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setenv("SMTP_USER", "")
    monkeypatch.setenv("SMTP_PASSWORD", "")
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
    reg_body = await register_user_via_verification(
        client,
        name="Dr. Test",
        email="test@university.edu",
        password="SecurePass1",
        affiliation="VNU",
    )
    token = reg_body["access_token"]
    assert reg_body["user"]["email"] == "test@university.edu"

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
    await register_user_via_verification(
        client,
        name="Reset User",
        email="reset@uni.edu",
        password="OldPass123",
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
    await register_user_via_verification(client, **payload)

    second = await client.post("/api/v1/auth/register/send-code", json=payload)
    assert second.status_code == 400
    assert "already exists" in second.json()["detail"]


@pytest.mark.asyncio
async def test_weak_password_rejected(client, auth_db):
    res = await client.post(
        "/api/v1/auth/register/send-code",
        json={"name": "Weak", "email": "weak@uni.edu", "password": "short"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reset_token_single_use(client, auth_db):
    await register_user_via_verification(
        client,
        name="Once",
        email="once@uni.edu",
        password="OldPass123",
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
async def test_login_rejects_disabled_account(client, auth_db):
    from src.db.engine import get_db
    from src.db.models import User, UserRole
    from src.services.auth_service import hash_password

    with get_db() as db:
        db.add(
            User(
                email="disabled@uni.edu",
                full_name="Disabled User",
                password_hash=hash_password("SecurePass1"),
                role=UserRole.RESEARCHER,
                is_active=False,
            )
        )

    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "disabled@uni.edu", "password": "SecurePass1"},
    )
    assert res.status_code == 403
    body = res.json()["detail"]
    assert body["code"] == "account_disabled"

    wrong_pw = await client.post(
        "/api/v1/auth/login",
        json={"email": "disabled@uni.edu", "password": "WrongPass1"},
    )
    assert wrong_pw.status_code == 401
    assert wrong_pw.json()["detail"] == "Invalid email or password."


@pytest.mark.asyncio
async def test_login_generic_error_no_user_leak(client, auth_db):
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@uni.edu", "password": "NoSuchUser1"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password."


@pytest.mark.asyncio
async def test_signup_verification_flow(client, auth_db):
    payload = {
        "name": "Verify User",
        "email": "verify@uni.edu",
        "password": "SecurePass1",
    }
    send = await client.post("/api/v1/auth/register/send-code", json=payload)
    assert send.status_code == 200
    assert "verification code" in send.json()["message"].lower()
    code = send.json()["dev_verification_code"]
    assert code and len(code) == 6

    bad = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": payload["email"], "code": "000000"},
    )
    assert bad.status_code == 400

    ok = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": payload["email"], "code": code},
    )
    assert ok.status_code == 200
    assert ok.json()["user"]["email"] == payload["email"]


@pytest.mark.asyncio
async def test_google_start_requires_configuration(client, auth_db, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "")
    get_settings.cache_clear()

    res = await client.get("/api/v1/auth/google/start", follow_redirects=False)
    assert res.status_code == 503


def test_find_or_create_google_user(auth_db):
    from src.db.engine import get_db
    from src.services.auth_service import find_or_create_google_user

    with get_db() as db:
        user, error = find_or_create_google_user(
            db,
            google_sub="google-sub-123",
            email="google@uni.edu",
            full_name="Google User",
            avatar_url="https://lh3.googleusercontent.com/a/example-photo",
        )
        assert error is None
        assert user is not None
        assert user.google_sub == "google-sub-123"
        assert user.email == "google@uni.edu"
        assert user.profile_settings.get("avatar_url") == "https://lh3.googleusercontent.com/a/example-photo"

        again, again_error = find_or_create_google_user(
            db,
            google_sub="google-sub-123",
            email="google@uni.edu",
            full_name="Google User",
            avatar_url="https://lh3.googleusercontent.com/a/other-photo",
        )
        assert again_error is None
        assert again.id == user.id
        assert again.profile_settings.get("avatar_url") == "https://lh3.googleusercontent.com/a/example-photo"


def test_find_or_create_google_user_links_existing_email(auth_db):
    from src.db.engine import get_db
    from src.services.auth_service import find_or_create_google_user, register_user

    with get_db() as db:
        existing, reg_error = register_user(
            db,
            name="Existing User",
            email="existing@uni.edu",
            password="SecurePass1",
        )
        assert reg_error is None
        assert existing is not None

        linked, link_error = find_or_create_google_user(
            db,
            google_sub="google-sub-456",
            email="existing@uni.edu",
            full_name="Existing User",
            avatar_url="https://lh3.googleusercontent.com/a/link-photo",
        )
        assert link_error is None
        assert linked is not None
        assert linked.id == existing.id
        assert linked.google_sub == "google-sub-456"
        assert linked.profile_settings.get("avatar_url") == "https://lh3.googleusercontent.com/a/link-photo"
