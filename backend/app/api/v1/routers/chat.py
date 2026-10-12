from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from app.api.v1.dependencies import ChatServiceDep, CurrentUser, DbDep
from app.api.v1.models.models import BlockedUser, ConversationParticipant, DashboardBookmark, User, UserReport, UserRole


from app.api.v1.schemas.schemas import (
    ChatKeyRequest,
    ChatKeyResponse,
    ConversationCreateRequest,
    ConversationResponse,
    ConversationSettingsRequest,
    EditMessageRequest,
    ChatMessageResponse,
    PaginatedResponse,
    ReactionRequest,
    SendMessageRequest,
    SeekerPreferences,
)
from app.core.rate_limit import CHAT_LIMIT, limiter

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
    status_code=status.HTTP_200_OK,
    summary="Update conversation settings (mute, archive, pin)",
)
async def update_conversation_settings(
    conversation_id: str,
    body: ConversationSettingsRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> dict:
    await chat_service.update_conversation_settings(
        conversation_id,
        current_user,
        is_muted=body.is_muted,
        is_archived=body.is_archived,
        is_pinned=body.is_pinned,
    )
    return {"message": "Settings updated."}


#  Messages 
@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message",
    description="Message content must be client-side encrypted. Backend stores only ciphertext.",
)
@limiter.limit(CHAT_LIMIT)
async def send_message(
    request: Request,
    response: Response,
    conversation_id: str,
    body: SendMessageRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> ChatMessageResponse:
    return await chat_service.send_message(conversation_id, body, current_user)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[ChatMessageResponse],
    summary="Get conversation messages",
    description="Cursor-based pagination via `before_id`. Returns up to 100 messages.",
)
async def get_messages(
    conversation_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
    before_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[ChatMessageResponse]:
    return await chat_service.get_messages(
        conversation_id, current_user, before_id=before_id, limit=limit
    )


@router.patch(
    "/conversations/{conversation_id}/messages/{message_id}",
    response_model=ChatMessageResponse,
    summary="Edit a message",
    description="Only the original sender may edit. New encrypted content required.",
)
async def edit_message(
    conversation_id: str,
    message_id: str,
    body: EditMessageRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> ChatMessageResponse:
    return await chat_service.edit_message(
        conversation_id, message_id, body, current_user
    )


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a message (soft delete)",
)
async def delete_message(
    conversation_id: str,
    message_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> dict:
    await chat_service.delete_message(conversation_id, message_id, current_user)
    return {"message": "Message deleted."}


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/reactions",
    status_code=status.HTTP_200_OK,
    summary="Toggle emoji reaction on a message",
)
async def react_to_message(
    conversation_id: str,
    message_id: str,
    body: ReactionRequest,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> dict:
    await chat_service.react_to_message(
        conversation_id, message_id, body, current_user
    )
    return {"message": "Reaction toggled."}


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
    status_code=status.HTTP_200_OK,
    summary="Block a user",
)
async def block_user(
    user_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
    reason: str | None = Query(default=None, max_length=500),
) -> dict:
    await chat_service.block_user(current_user, user_id, reason)
    return {"message": "User blocked."}


@router.delete(
    "/block/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Unblock a user",
)
async def unblock_user(
    user_id: str,
    current_user: CurrentUser,
    chat_service: ChatServiceDep,
) -> dict:
    await chat_service.unblock_user(current_user, user_id)
    return {"message": "User unblocked."}

# Profile actions are scoped to an existing DM; no arbitrary user lookup or
# disclosure of private account/contact data is needed by this screen.


class ParticipantProfile(BaseModel):
    id: str
    conversation_id: str
    display_name: str | None
    avatar_url: str | None
    bio: str | None
    role: UserRole
    preferences: SeekerPreferences | None
    is_email_verified: bool
    is_phone_verified: bool
    created_at: datetime
    updated_at: datetime
    is_saved: bool
    can_save: bool
    is_blocked: bool
    is_reported: bool


class ReportParticipantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: Literal["spam", "scam", "harassment", "inappropriate_content", "other"]
    details: str = Field(min_length=10, max_length=2000)


async def profile_target(conversation_id: UUID, user: User, db):
    ids = list((await db.execute(select(ConversationParticipant.user_id).where(
        ConversationParticipant.conversation_id == str(conversation_id)))).scalars())
    if user.id not in ids or len(ids) != 2:
        raise HTTPException(404, "Conversation not found.")
    target = await db.get(User, next(value for value in ids if value != user.id))
    if not target or not target.is_active or target.is_deleted:
        raise HTTPException(404, "This profile is no longer available.")
    return target


@router.get("/conversations/{conversation_id}/profile", response_model=ParticipantProfile)
async def participant_profile(conversation_id: UUID, db: DbDep, current_user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    target = await profile_target(conversation_id, current_user, db)
    saved = await db.get(DashboardBookmark, (current_user.id, "roommate", target.id))
    blocked = (await db.execute(select(BlockedUser.id).where(BlockedUser.blocker_id == current_user.id,
        BlockedUser.blocked_id == target.id))).scalar_one_or_none()
    reported = (await db.execute(select(UserReport.id).where(UserReport.reporter_id == current_user.id,
        UserReport.conversation_id == str(conversation_id)))).scalar_one_or_none()
    return ParticipantProfile(id=target.id, conversation_id=str(conversation_id), display_name=target.display_name,
        avatar_url=target.avatar_url, bio=target.bio, role=target.role,
        preferences=SeekerPreferences.model_validate(target.seeker_preferences) if target.seeker_preferences else None,
        is_email_verified=target.is_email_verified, is_phone_verified=target.is_phone_verified,
        created_at=target.created_at, updated_at=target.updated_at, is_saved=bool(saved),
        can_save=current_user.role == UserRole.SEEKER and target.role == UserRole.SEEKER
            and target.is_profile_complete and target.is_email_verified and target.is_profile_visible,
        is_blocked=blocked is not None, is_reported=reported is not None)


@router.put("/conversations/{conversation_id}/profile/block")
async def block_participant(conversation_id: UUID, db: DbDep, current_user: CurrentUser):
    target = await profile_target(conversation_id, current_user, db)
    await db.execute(insert(BlockedUser).values(id=str(uuid4()), blocker_id=current_user.id, blocked_id=target.id)
        .on_conflict_do_nothing(constraint="uq_blocked_user"))
    return {"is_blocked": True}


@router.delete("/conversations/{conversation_id}/profile/block")
async def unblock_participant(conversation_id: UUID, db: DbDep, current_user: CurrentUser):
    target = await profile_target(conversation_id, current_user, db)
    await db.execute(delete(BlockedUser).where(BlockedUser.blocker_id == current_user.id, BlockedUser.blocked_id == target.id))
    return {"is_blocked": False}


@router.post("/conversations/{conversation_id}/profile/report", status_code=201)
async def report_participant(conversation_id: UUID, body: ReportParticipantRequest, db: DbDep, current_user: CurrentUser):
    target = await profile_target(conversation_id, current_user, db)
    await db.execute(insert(UserReport).values(id=str(uuid4()), reporter_id=current_user.id, reported_id=target.id,
        conversation_id=str(conversation_id), reason=body.reason, details=body.details)
        .on_conflict_do_nothing(constraint="uq_reporter_conversation"))
    return {"message": "Your report has been submitted.", "is_reported": True}
