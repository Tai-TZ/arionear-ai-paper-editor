from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState


@dataclass
class ShareRoom:
    updates: list[bytes] = field(default_factory=list)
    clients: set[WebSocket] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_rooms: dict[str, ShareRoom] = {}


def get_share_room(token: str) -> ShareRoom:
    return _rooms.setdefault(token, ShareRoom())


def clear_share_room(token: str) -> None:
    _rooms.pop(token, None)


async def relay_share_websocket(websocket: WebSocket, token: str) -> None:
    room = get_share_room(token)
    await websocket.accept()
    room.clients.add(websocket)

    try:
        async with room.lock:
            for update in room.updates:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_bytes(update)

        while True:
            data = await websocket.receive_bytes()
            async with room.lock:
                room.updates.append(data)
                dead: list[WebSocket] = []
                for client in room.clients:
                    if client is websocket:
                        continue
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
        room.clients.discard(websocket)
