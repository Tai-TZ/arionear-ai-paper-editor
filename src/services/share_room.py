from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

# Browsers cannot set headers on WebSockets, so the client authenticates through subprotocols:
# new WebSocket(url, ["proofline-share", "bearer." + accessToken]); the server echoes only the first.
SHARE_SUBPROTOCOL = "proofline-share"
BEARER_SUBPROTOCOL_PREFIX = "bearer."

MAX_MESSAGE_BYTES = 1024 * 1024
MAX_CLIENTS_PER_ROOM = 8
MAX_ROOM_HISTORY_BYTES = 8 * 1024 * 1024

CLOSE_MESSAGE_TOO_BIG = 1009
CLOSE_UNAUTHENTICATED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_ROOM_FULL = 4429


@dataclass
class ShareRoom:
    updates: list[bytes] = field(default_factory=list)
    history_bytes: int = 0
    clients: set[WebSocket] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_rooms: dict[str, ShareRoom] = {}


def get_share_room(token: str) -> ShareRoom:
    return _rooms.setdefault(token, ShareRoom())


def clear_share_room(token: str) -> None:
    _rooms.pop(token, None)


def bearer_from_subprotocols(subprotocols: list[str] | None) -> str | None:
    """Access token offered as `bearer.<jwt>`, only alongside the share subprotocol."""
    offered = list(subprotocols or [])
    if SHARE_SUBPROTOCOL not in offered:
        return None
    for proto in offered:
        if proto.startswith(BEARER_SUBPROTOCOL_PREFIX):
            token = proto[len(BEARER_SUBPROTOCOL_PREFIX) :].strip()
            return token or None
    return None


def _remember_update(room: ShareRoom, data: bytes) -> None:
    room.updates.append(data)
    room.history_bytes += len(data)
    if room.history_bytes > MAX_ROOM_HISTORY_BYTES:
        # Late joiners then seed the doc from their own content (see useYjsShareSync).
        room.updates.clear()
        room.history_bytes = 0


def _release(token: str, room: ShareRoom, websocket: WebSocket) -> None:
    room.clients.discard(websocket)
    if not room.clients and _rooms.get(token) is room:
        del _rooms[token]


async def relay_share_websocket(websocket: WebSocket, token: str) -> None:
    """Relay Yjs updates between the (already authorised) clients of one share room."""
    room = get_share_room(token)
    if len(room.clients) >= MAX_CLIENTS_PER_ROOM:
        await websocket.close(code=CLOSE_ROOM_FULL)
        return
    room.clients.add(websocket)  # reserve the slot before awaiting accept()

    try:
        await websocket.accept(subprotocol=SHARE_SUBPROTOCOL)
        async with room.lock:
            for update in room.updates:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_bytes(update)

        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            data = message.get("bytes")
            if data is None:
                data = (message.get("text") or "").encode("utf-8")
            if len(data) > MAX_MESSAGE_BYTES:
                await websocket.close(code=CLOSE_MESSAGE_TOO_BIG)
                break
            async with room.lock:
                _remember_update(room, data)
                dead: list[WebSocket] = []
                for client in list(room.clients):  # snapshot: sends await, joins/leaves mutate the set
                    if client is websocket or client.client_state == WebSocketState.CONNECTING:
                        continue  # a joiner still accepting replays the history (incl. this update)
                    if client.client_state != WebSocketState.CONNECTED:
                        dead.append(client)
                        continue
                    try:
                        await client.send_bytes(data)
                    except Exception:
                        dead.append(client)
                for client in dead:
                    room.clients.discard(client)
    except WebSocketDisconnect:
        pass
    finally:
        _release(token, room, websocket)
