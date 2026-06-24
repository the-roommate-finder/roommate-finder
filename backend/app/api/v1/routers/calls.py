from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.api.v1.models.models import CallLog, CallStatus, CallType
from app.api.v1.schemas.schemas import CallResponse, WebRTCConfig
from app.core.config import settings
from app.core.security import decode_access_token

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["Realtime / Calls"])


# Connection Manager
class ConnectionManager:
    """
    In-memory WebSocket registry.
    One user may have multiple open connections (tabs/devices).

    For horizontal scaling, replace in-memory dicts with a
    Redis pub/sub fan-out. This class exposes the same interface either way.
    """

    def __init__(self) -> None:
        # user_id → list of active WebSocket connections
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(user_id, []).append(ws)
        logger.debug("ws_connected", user_id=user_id, connections=len(self._connections[user_id]))

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._connections.pop(user_id, None)
        logger.debug("ws_disconnected", user_id=user_id)

    def is_online(self, user_id: str) -> bool:
        return bool(self._connections.get(user_id))

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> None:
        """Send a JSON payload to all connections of a user."""
        conns = self._connections.get(user_id, [])
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_to_conversation(
        self,
        participant_ids: list[str],
        payload: dict[str, Any],
        *,
        exclude_user: str | None = None,
    ) -> None:
        for uid in participant_ids:
            if uid == exclude_user:
                continue
            await self.send_to_user(uid, payload)


manager = ConnectionManager()


# WebSocket Endpoint
@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(..., description="JWT access token for authentication"),
) -> None:
    """
    Unified WebSocket endpoint.
    Handles chat events and WebRTC signaling.

    Message envelope shape:
    {
        "type": "chat.message" | "chat.typing" | "chat.read" |
                "call.invite" | "call.accept" | "call.reject" |
                "call.end" | "call.offer" | "call.answer" |
                "call.ice" | "presence.ping",
        "payload": { ... }
    }
    """
    #  Authenticate 
    try:
        payload = decode_access_token(token)
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        await ws.close(code=4001, reason="Unauthorized")
        return

    await manager.connect(user_id, ws)

    # Broadcast online presence to contacts
    await manager.send_to_user(
        user_id,
        {"type": "presence.connected", "payload": {"user_id": user_id}},
    )

    try:
        while True:
            raw = await ws.receive_text()

            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "payload": {"message": "Invalid JSON"}})
                continue

            event_type: str = event.get("type", "")
            event_payload: dict = event.get("payload", {})

            await _dispatch_event(ws, user_id, event_type, event_payload)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("ws_unhandled_error", user_id=user_id, exc=str(exc))
    finally:
        manager.disconnect(user_id, ws)
        logger.debug("ws_cleanup", user_id=user_id)


async def _dispatch_event(
    ws: WebSocket,
    user_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """Route incoming WebSocket events to their handlers."""

    match event_type:
        case "chat.typing":
            await _handle_typing(user_id, payload)

        case "chat.read":
            await _handle_read_receipt(user_id, payload)

        case "call.invite":
            await _handle_call_invite(user_id, payload)

        case "call.accept":
            await _handle_call_accept(user_id, payload)

        case "call.reject":
            await _handle_call_reject(user_id, payload)

        case "call.end":
            await _handle_call_end(user_id, payload)

        case "call.offer" | "call.answer" | "call.ice":
            # Forward WebRTC signaling payloads transparently
            await _forward_signal(user_id, event_type, payload)

        case "presence.ping":
            await ws.send_json({"type": "presence.pong"})

        case _:
            await ws.send_json({
                "type": "error",
                "payload": {"message": f"Unknown event type: {event_type}"},
            })


async def _handle_typing(user_id: str, payload: dict) -> None:
    conversation_id = payload.get("conversation_id")
    is_typing = bool(payload.get("is_typing"))
    recipient_id = payload.get("recipient_id")

    if not conversation_id or not recipient_id:
        return

    await manager.send_to_user(recipient_id, {
        "type": "chat.typing",
        "payload": {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "is_typing": is_typing,
        },
    })


async def _handle_read_receipt(user_id: str, payload: dict) -> None:
    message_id = payload.get("message_id")
    conversation_id = payload.get("conversation_id")
    recipient_id = payload.get("recipient_id")

    if not all([message_id, conversation_id, recipient_id]):
        return

    await manager.send_to_user(recipient_id, {
        "type": "chat.seen",
        "payload": {
            "message_id": message_id,
            "conversation_id": conversation_id,
            "seen_by": user_id,
            "seen_at": datetime.now(timezone.utc).isoformat(),
        },
    })


async def _handle_call_invite(user_id: str, payload: dict) -> None:
    callee_id = payload.get("callee_id")
    call_id = payload.get("call_id")
    call_type = payload.get("call_type", "audio")

    if not callee_id or not call_id:
        return

    await manager.send_to_user(callee_id, {
        "type": "call.incoming",
        "payload": {
            "call_id": call_id,
            "caller_id": user_id,
            "call_type": call_type,
        },
    })


async def _handle_call_accept(user_id: str, payload: dict) -> None:
    caller_id = payload.get("caller_id")
    call_id = payload.get("call_id")

    if not caller_id or not call_id:
        return

    await manager.send_to_user(caller_id, {
        "type": "call.accepted",
        "payload": {"call_id": call_id, "callee_id": user_id},
    })


async def _handle_call_reject(user_id: str, payload: dict) -> None:
    caller_id = payload.get("caller_id")
    call_id = payload.get("call_id")

    if not caller_id or not call_id:
        return

    await manager.send_to_user(caller_id, {
        "type": "call.rejected",
        "payload": {"call_id": call_id, "callee_id": user_id},
    })


async def _handle_call_end(user_id: str, payload: dict) -> None:
    peer_id = payload.get("peer_id")
    call_id = payload.get("call_id")

    if not peer_id or not call_id:
        return

    await manager.send_to_user(peer_id, {
        "type": "call.ended",
        "payload": {"call_id": call_id, "ended_by": user_id},
    })


async def _forward_signal(user_id: str, signal_type: str, payload: dict) -> None:
    """
    Forward WebRTC signaling messages (offer/answer/ICE) to the peer.
    Backend is opaque to the content — it's just a relay.
    """
    to_user = payload.get("to_user")
    if not to_user:
        return

    await manager.send_to_user(to_user, {
        "type": signal_type,
        "payload": {**payload, "from_user": user_id},
    })


# REST Endpoints for Calls
calls_router = APIRouter(prefix="/calls", tags=["Calls"])


@calls_router.get(
    "/webrtc-config",
    response_model=WebRTCConfig,
    summary="Get ICE server configuration",
    description=(
        "Returns STUN/TURN server credentials for WebRTC peer connection setup. "
        "Credentials are short-lived (1 hour TTL)."
    ),
)
async def get_webrtc_config() -> WebRTCConfig:
    """
    Return ICE server config for WebRTC peer connection.
    TURN credentials should be time-limited HMAC tokens in production.
    """
    ice_servers: list[dict] = [
        {"urls": settings.STUN_SERVER_URL},
    ]

    if settings.TURN_SERVER_URL and settings.TURN_USERNAME:
        ice_servers.append({
            "urls": settings.TURN_SERVER_URL,
            "username": settings.TURN_USERNAME,
            "credential": settings.TURN_CREDENTIAL,
        })

    return WebRTCConfig(ice_servers=ice_servers, ttl=3600)


# Export both routers
__all__ = ["router", "calls_router", "manager"]
