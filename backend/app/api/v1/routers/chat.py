from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.api.v1.dependencies import ChatServiceDep, CurrentUser
from app.api.v1.schemas.schemas import (
    ChatKeyRequest,
    ChatKeyResponse,
    ConversationCreateRequest,
    ConversationResponse,
    ConversationSettingsRequest,
    EditMessageRequest,
    MessageResponse,
    PaginatedResponse,
    ReactionRequest,
    SendMessageRequest,
)
from app.core.rate_limit import CHAT_LIMIT, limiter
from fastapi import Request

router = APIRouter(prefix="/chat", tags=["Chat"])


#  Conversations 
@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start or retrieve a DM conversation",
)
async def get_or_create_conversation(
    body: ConversationCreateRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> ConversationResponse:
    return await chat_service.get_or_create_conversation(
        current_user, body.participant_id
    )


@router.get(
    "/conversations",
    response_model=PaginatedResponse[ConversationResponse],
    summary="List my conversations",
)
async def list_conversations(
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
    include_archived: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
) -> PaginatedResponse[ConversationResponse]:
    return await chat_service.list_conversations(
        current_user,
        include_archived=include_archived,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    summary="Get conversation details",
)
async def get_conversation(
    conversation_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> ConversationResponse:
    return await chat_service.get_conversation(conversation_id, current_user)


@router.patch(
    "/conversations/{conversation_id}/settings",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Update conversation settings (mute, archive, pin)",
)
async def update_conversation_settings(
    conversation_id: str,
    body: ConversationSettingsRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> None:
    await chat_service.update_conversation_settings(
        conversation_id,
        current_user,
        is_muted=body.is_muted,
        is_archived=body.is_archived,
        is_pinned=body.is_pinned,
    )


#  Messages 
@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message",
    description="Message content must be client-side encrypted. Backend stores only ciphertext.",
)
@limiter.limit(CHAT_LIMIT)
async def send_message(
    request: Request,
    conversation_id: str,
    body: SendMessageRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> MessageResponse:
    return await chat_service.send_message(conversation_id, body, current_user)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
    summary="Get conversation messages",
    description="Cursor-based pagination via `before_id`. Returns up to 100 messages.",
)
async def get_messages(
    conversation_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
    before_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[MessageResponse]:
    return await chat_service.get_messages(
        conversation_id, current_user, before_id=before_id, limit=limit
    )


@router.patch(
    "/conversations/{conversation_id}/messages/{message_id}",
    response_model=MessageResponse,
    summary="Edit a message",
    description="Only the original sender may edit. New encrypted content required.",
)
async def edit_message(
    conversation_id: str,
    message_id: str,
    body: EditMessageRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> MessageResponse:
    return await chat_service.edit_message(
        conversation_id, message_id, body, current_user
    )


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a message (soft delete)",
)
async def delete_message(
    conversation_id: str,
    message_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> None:
    await chat_service.delete_message(conversation_id, message_id, current_user)


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/reactions",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Toggle emoji reaction on a message",
)
async def react_to_message(
    conversation_id: str,
    message_id: str,
    body: ReactionRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> None:
    await chat_service.react_to_message(
        conversation_id, message_id, body, current_user
    )


#  E2EE Key Exchange 
@router.put(
    "/keys/me",
    response_model=ChatKeyResponse,
    summary="Publish or update my public key",
    description="Upload your public key for E2E encrypted messaging.",
)
async def upsert_my_chat_key(
    body: ChatKeyRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> ChatKeyResponse:
    return await chat_service.upsert_chat_key(current_user, body.public_key)


@router.get(
    "/keys/{user_id}",
    response_model=ChatKeyResponse,
    summary="Get user's public key",
    description="Retrieve a user's public key for encrypting messages to them.",
)
async def get_user_chat_key(
    user_id: str,
    _current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> ChatKeyResponse:
    return await chat_service.get_chat_key(user_id)


#  Block / Unblock 
@router.post(
    "/block/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Block a user",
)
async def block_user(
    user_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
    reason: str | None = Query(default=None, max_length=500),
) -> None:
    await chat_service.block_user(current_user, user_id, reason)


@router.delete(
    "/block/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unblock a user",
)
async def unblock_user(
    user_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> None:
    await chat_service.unblock_user(current_user, user_id)
