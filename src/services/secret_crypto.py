from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from src.config import get_settings


def _fernet() -> Fernet:
    secret = get_settings().auth_secret_key.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Could not decrypt stored secret (AUTH_SECRET_KEY may have changed).") from exc


def key_hint(api_key: str) -> str:
    key = api_key.strip()
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}…{key[-4:]}"
