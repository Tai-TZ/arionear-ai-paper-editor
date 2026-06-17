"""Shared helpers for auth-related API tests."""

from httpx import AsyncClient


async def register_user_via_verification(
    client: AsyncClient,
    *,
    name: str,
    email: str,
    password: str,
    affiliation: str | None = None,
) -> dict:
    payload = {
        "name": name,
        "email": email,
        "password": password,
    }
    if affiliation is not None:
        payload["affiliation"] = affiliation

    send = await client.post("/api/v1/auth/register/send-code", json=payload)
    assert send.status_code == 200, send.text
    dev_code = send.json().get("dev_verification_code")
    assert dev_code, "Expected dev_verification_code in test environment"

    verify = await client.post(
        "/api/v1/auth/register/verify",
        json={"email": email, "code": dev_code},
    )
    assert verify.status_code == 200, verify.text
    return verify.json()
