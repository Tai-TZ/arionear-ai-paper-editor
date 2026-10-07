"""/ws/share/{token} — owner-only live sync (subprotocol auth, caps, cleanup) and share lookup."""

from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from src.config import get_settings
from src.db.engine import get_db, init_db, reset_db_state
from src.db.models import Paper, User, UserRole
from src.main import app
from src.services import share_room
from src.services.auth_service import create_access_token, hash_password
from src.services.paper_service import create_paper
from src.services.share_service import disable_paper_share, enable_paper_share, get_shared_paper


@pytest.fixture
def share_db(monkeypatch):
    db_path = os.path.join(os.path.dirname(__file__), "_test_share_ws.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-jwt-signing-32chars")
    get_settings.cache_clear()
    reset_db_state()
    init_db()
    share_room._rooms.clear()
    yield
    share_room._rooms.clear()
    reset_db_state()
    get_settings.cache_clear()
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


def _user(email: str) -> uuid.UUID:
    with get_db() as db:
        user = User(
            email=email,
            full_name=email.split("@")[0],
            password_hash=hash_password("SecurePass1"),
            role=UserRole.RESEARCHER,
            is_active=True,
        )
        db.add(user)
        db.flush()
        return user.id


def _shared_paper(owner_id: uuid.UUID, *, latex: str = "\\documentclass{article}") -> tuple[uuid.UUID, str]:
    with get_db() as db:
        paper = create_paper(db, owner_id, name="Shared", latex=latex)
        token = enable_paper_share(db, owner_id, paper.id)["token"]
        return paper.id, token


def _protocols(user_id: uuid.UUID | None, email: str = "x@test.local") -> list[str]:
    protocols = [share_room.SHARE_SUBPROTOCOL]
    if user_id is not None:
        protocols.append(f"bearer.{create_access_token(user_id=str(user_id), email=email)}")
    return protocols


def _reject_code(client: TestClient, path: str, subprotocols: list[str] | None) -> int:
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(path, subprotocols=subprotocols or []):
            pass
    return exc.value.code


@pytest.fixture
def owner_share(share_db):
    owner_id = _user("owner@share.test")
    _, token = _shared_paper(owner_id)
    return owner_id, token


# ─── auth ────────────────────────────────────────────────────────────────────


def test_ws_rejects_missing_token(owner_share):
    _, token = owner_share
    client = TestClient(app)
    assert _reject_code(client, f"/api/v1/ws/share/{token}", None) == share_room.CLOSE_UNAUTHENTICATED
    assert _reject_code(client, f"/api/v1/ws/share/{token}", [share_room.SHARE_SUBPROTOCOL]) == 4401


def test_ws_rejects_invalid_token(owner_share):
    _, token = owner_share
    client = TestClient(app)
    bad = [share_room.SHARE_SUBPROTOCOL, "bearer.not-a-jwt"]
    assert _reject_code(client, f"/api/v1/ws/share/{token}", bad) == share_room.CLOSE_UNAUTHENTICATED


def test_ws_requires_share_subprotocol_alongside_bearer(owner_share):
    owner_id, token = owner_share
    bearer_only = [p for p in _protocols(owner_id) if p.startswith("bearer.")]
    assert _reject_code(TestClient(app), f"/api/v1/ws/share/{token}", bearer_only) == 4401


def test_ws_rejects_non_owner(owner_share):
    _, token = owner_share
    stranger = _user("stranger@share.test")
    code = _reject_code(TestClient(app), f"/api/v1/ws/share/{token}", _protocols(stranger))
    assert code == share_room.CLOSE_FORBIDDEN


def test_ws_rejects_unknown_or_disabled_share(share_db):
    owner_id = _user("owner2@share.test")
    paper_id, token = _shared_paper(owner_id)
    client = TestClient(app)
    assert _reject_code(client, "/api/v1/ws/share/unknown-token", _protocols(owner_id)) == 4403
    with get_db() as db:
        disable_paper_share(db, owner_id, paper_id)
    assert _reject_code(client, f"/api/v1/ws/share/{token}", _protocols(owner_id)) == 4403


def test_ws_accepts_owner_and_relays_between_owner_tabs(owner_share):
    owner_id, token = owner_share
    client = TestClient(app)
    path = f"/api/v1/ws/share/{token}"
    with client.websocket_connect(path, subprotocols=_protocols(owner_id)) as tab_a:
        assert tab_a.accepted_subprotocol == share_room.SHARE_SUBPROTOCOL
        with client.websocket_connect(path, subprotocols=_protocols(owner_id)) as tab_b:
            tab_a.send_bytes(b"yjs-update-1")
            assert tab_b.receive_bytes() == b"yjs-update-1"
        # A late joiner is seeded from the room history.
        with client.websocket_connect(path, subprotocols=_protocols(owner_id)) as tab_c:
            assert tab_c.receive_bytes() == b"yjs-update-1"


# ─── caps & cleanup ──────────────────────────────────────────────────────────


def test_ws_oversized_message_closes_with_1009(owner_share):
    owner_id, token = owner_share
    with TestClient(app).websocket_connect(f"/api/v1/ws/share/{token}", subprotocols=_protocols(owner_id)) as ws:
        ws.send_bytes(b"x" * (share_room.MAX_MESSAGE_BYTES + 1))
        message = ws.receive()
    assert message["type"] == "websocket.close"
    assert message["code"] == share_room.CLOSE_MESSAGE_TOO_BIG
    assert token not in share_room._rooms


def test_ws_room_is_removed_when_last_client_leaves(owner_share):
    owner_id, token = owner_share
    client = TestClient(app)
    path = f"/api/v1/ws/share/{token}"
    with client.websocket_connect(path, subprotocols=_protocols(owner_id)) as tab_a:
        with client.websocket_connect(path, subprotocols=_protocols(owner_id)) as tab_b:
            tab_a.send_bytes(b"update")
            assert tab_b.receive_bytes() == b"update"
        assert token in share_room._rooms  # one tab still connected
    # Leaving the context waits for the server handler, which drops the empty room and its history.
    assert token not in share_room._rooms


def test_ws_room_full_rejects_extra_clients(owner_share, monkeypatch):
    owner_id, token = owner_share
    monkeypatch.setattr(share_room, "MAX_CLIENTS_PER_ROOM", 1)
    client = TestClient(app)
    path = f"/api/v1/ws/share/{token}"
    with client.websocket_connect(path, subprotocols=_protocols(owner_id)):
        assert _reject_code(client, path, _protocols(owner_id)) == share_room.CLOSE_ROOM_FULL


def test_room_history_is_dropped_above_cap(monkeypatch):
    monkeypatch.setattr(share_room, "MAX_ROOM_HISTORY_BYTES", 10)
    room = share_room.ShareRoom()
    share_room._remember_update(room, b"12345")
    share_room._remember_update(room, b"12345")
    assert room.updates == [b"12345", b"12345"]
    share_room._remember_update(room, b"1")
    assert room.updates == []
    assert room.history_bytes == 0


def test_bearer_from_subprotocols():
    assert share_room.bearer_from_subprotocols(["edico-share", "bearer.abc"]) == "abc"
    assert share_room.bearer_from_subprotocols(["bearer.abc"]) is None
    assert share_room.bearer_from_subprotocols(["edico-share", "bearer."]) is None
    assert share_room.bearer_from_subprotocols(None) is None


# ─── share lookup ────────────────────────────────────────────────────────────


def test_get_shared_paper_matches_token_in_database(share_db):
    owner_id = _user("lookup@share.test")
    paper_a, token_a = _shared_paper(owner_id, latex="A")
    paper_b, token_b = _shared_paper(owner_id, latex="B")
    with get_db() as db:
        create_paper(db, owner_id, name="Not shared")
        create_paper(db, owner_id, name="Odd metadata", metadata={"share": "not-a-dict"})
    assert token_a != token_b

    with get_db() as db:
        assert get_shared_paper(db, token_a).id == paper_a
        assert get_shared_paper(db, token_b).id == paper_b
        assert get_shared_paper(db, "unknown-token") is None
        assert get_shared_paper(db, "") is None
        disable_paper_share(db, owner_id, paper_a)
    with get_db() as db:
        assert get_shared_paper(db, token_a) is None


def test_get_shared_paper_filter_compiles_for_postgres():
    stmt = select(Paper.id).where(Paper.metadata_["share"]["token"].as_string() == "tok")
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "->" in sql and "->>" in sql
