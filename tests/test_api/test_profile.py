import os

import pytest

from src.config import get_settings
from src.db.engine import init_db, reset_db_state
from tests.test_api.auth_helpers import register_user_via_verification


@pytest.fixture
def profile_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_profile.db")
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
async def test_get_profile_defaults(client, profile_db):
    reg_body = await register_user_via_verification(
        client,
        name="Dr. Profile",
        email="profile@university.edu",
        password="SecurePass1",
        affiliation="Example University",
    )
    token = reg_body["access_token"]

    res = await client.get(
        "/api/v1/users/me/profile",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Dr. Profile"
    assert body["email"] == "profile@university.edu"
    assert body["affiliation"] == "Example University"
    assert body["citation_style"] == "ieee"
    assert body["auto_save"] is True
    assert body["auto_compile"] is False


@pytest.mark.asyncio
async def test_patch_profile(client, profile_db):
    reg_body = await register_user_via_verification(
        client,
        name="Dr. Profile",
        email="profile@university.edu",
        password="SecurePass1",
        affiliation="Example University",
    )
    token = reg_body["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    patch = await client.patch(
        "/api/v1/users/me/profile",
        headers=headers,
        json={
            "research_field": "NLP",
            "orcid": "0000-0002-1825-0097",
            "auto_compile": True,
            "ui_language": "vi",
            "citation_style": "apa",
        },
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["research_field"] == "NLP"
    assert body["orcid"] == "0000-0002-1825-0097"
    assert body["auto_compile"] is True
    assert body["ui_language"] == "vi"
    assert body["citation_style"] == "apa"

    again = await client.get("/api/v1/users/me/profile", headers=headers)
    assert again.json()["research_field"] == "NLP"


@pytest.mark.asyncio
async def test_patch_profile_invalid_orcid(client, profile_db):
    reg_body = await register_user_via_verification(
        client,
        name="Dr. Profile",
        email="profile@university.edu",
        password="SecurePass1",
        affiliation="Example University",
    )
    token = reg_body["access_token"]

    bad = await client.patch(
        "/api/v1/users/me/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"orcid": "not-valid"},
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_patch_profile_empty_strings_coerced(client, profile_db):
    reg_body = await register_user_via_verification(
        client,
        name="Dr. Profile",
        email="profile@university.edu",
        password="SecurePass1",
        affiliation="Example University",
    )
    token = reg_body["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    patch = await client.patch(
        "/api/v1/users/me/profile",
        headers=headers,
        json={"department": "", "google_scholar_url": "", "affiliation": ""},
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["department"] is None
    assert body["google_scholar_url"] is None
    assert body["affiliation"] is None


@pytest.mark.asyncio
async def test_profile_requires_auth(client, profile_db):
    res = await client.get("/api/v1/users/me/profile")
    assert res.status_code == 401
