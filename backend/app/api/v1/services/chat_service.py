from __future__ import annotations

import structlog
from fastapi import HTTPException, status

from app.api.v1.models.models import User, UserRole
from sqlalchemy import select
from datetime import datetime, timezone
from app.api.v1.repositories.chat_repository import (
    BlockedUserRepository,
    ChatKeyRepository,
    ConversationParticipantRepository,
    ConversationRepository,
    MessageRepository,
)
from app.api.v1.schemas.schemas import (
    ChatKeyResponse,
    ConversationResponse,
    EditMessageRequest,
    ChatMessageResponse,
    PaginatedResponse,
    ReactionRequest,
    SendMessageRequest,
)

logger = structlog.get_logger(__name__)


class ChatService:
    def __init__(
        self,
        conv_repo: ConversationRepository,
        participant_repo: ConversationParticipantRepository,
        msg_repo: MessageRepository,
        chat_key_repo: ChatKeyRepository,
        blocked_repo: BlockedUserRepository,
    ) -> None:
        self._convs = conv_repo
        self._participants = participant_repo
        self._msgs = msg_repo
        self._keys = chat_key_repo
        self._blocked = blocked_repo

    #  Conversations 
    async def get_or_create_conversation(
        self, requesting_user: User, target_user_id: str
    ) -> ConversationResponse:
        if requesting_user.id == target_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create a conversation with yourself.",
            )

        target = (await self._convs.db.execute(select(User).where(User.id == target_user_id,
            User.is_active.is_(True), User.is_deleted.is_(False)))).scalar_one_or_none()
        if not target:
            raise HTTPException(404, "User not found.")

        # Check block status in both directions
        if await self._blocked.is_either_blocked(requesting_user.id, target_user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot message this user.",
            )

        # The same pair can open Messages simultaneously (including two tabs).
        await self._convs.db.execute(select(User.id).where(User.id.in_(
            [requesting_user.id, target_user_id])).order_by(User.id).with_for_update())
        existing = await self._convs.get_between_users(
            requesting_user.id, target_user_id
        )
        if existing:
            return ConversationResponse.model_validate(existing)

        conversation = await self._convs.create_conversation(
            requesting_user.id, target_user_id
        )
        logger.info(
            "conversation_created",
            conversation_id=conversation.id,
            user_a=requesting_user.id,
            user_b=target_user_id,
        )
        return ConversationResponse.model_validate(conversation)

    async def list_conversations(
        self,
        user: User,
        *,
        include_archived: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedResponse[ConversationResponse]:
        offset = (page - 1) * page_size
        conversations = await self._convs.get_user_conversations(
            user.id,
            include_archived=include_archived,
            offset=offset,
            limit=page_size,
        )
        latest = await self._msgs.latest_for_conversations([c.id for c in conversations])
        total = await self._convs.count_user_conversations(user.id, include_archived)
        items = []
        for conversation in conversations:
            item = ConversationResponse.model_validate(conversation)
            if conversation.id in latest:
                item.last_message = ChatMessageResponse.model_validate(latest[conversation.id])
            items.append(item)
        return PaginatedResponse(items=items, total=total, page=page,
            page_size=page_size, pages=(total + page_size - 1) // page_size)

    async def get_conversation(
        self, conversation_id: str, requesting_user: User
    ) -> ConversationResponse:
        conversation = await self._get_conversation_or_raise(
            conversation_id, requesting_user.id
        )
        return ConversationResponse.model_validate(conversation)

    async def update_conversation_settings(
        self,
        conversation_id: str,
        user: User,
        *,
        is_muted: bool | None = None,
        is_archived: bool | None = None,
        is_pinned: bool | None = None,
    ) -> None:
        participant = await self._participants.get_participant(
            conversation_id, user.id
        )
        if not participant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        updates = {
            k: v
            for k, v in {
                "is_muted": is_muted,
                "is_archived": is_archived,
                "is_pinned": is_pinned,
            }.items()
            if v is not None
        }
        if updates:
            await self._participants.update_settings(participant, **updates)

    #  Messages 
    async def send_message(
        self,
        conversation_id: str,
        data: SendMessageRequest,
        sender: User,
    ) -> ChatMessageResponse:
        conversation = await self._get_conversation_or_raise(conversation_id, sender.id)
        for participant in conversation.participants:
            if participant.user_id != sender.id and (
                not participant.user.is_active or participant.user.is_deleted or
                await self._blocked.is_either_blocked(sender.id, participant.user_id)
            ):
                raise HTTPException(403, "You cannot message this user.")

        # Validate reply target exists in same conversation
        if data.reply_to_id:
            reply_target = await self._msgs.get_by_id_in_conversation(
                data.reply_to_id, conversation_id
            )
            if not reply_target or reply_target.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Reply target message not found.",
                )

        message = await self._msgs.create(
            conversation_id=conversation_id,
            sender_id=sender.id,
            message_type=data.message_type,
            encrypted_content=data.encrypted_content,
            encryption_nonce=data.encryption_nonce,
            reply_to_id=data.reply_to_id,
        )

        # Update conversation timestamp + unread counts
        await self._convs.update_last_message_at(conversation_id)
        await self._participants.increment_unread(conversation_id, sender.id)

        return ChatMessageResponse.model_validate(message)

    async def get_messages(
        self,
        conversation_id: str,
        user: User,
        *,
        before_id: str | None = None,
        limit: int = 50,
    ) -> list[ChatMessageResponse]:
        await self._get_conversation_or_raise(conversation_id, user.id)

        messages = await self._msgs.get_conversation_messages(
            conversation_id, before_id=before_id, limit=min(limit, 100)
        )
        # Update only messages actually returned; loading older history does not
        # clear unread newer messages that the recipient has not fetched.
        if not before_id:
            await self._participants.mark_read(conversation_id, user.id)
        now = datetime.now(timezone.utc)
        for message in messages:
            if message.sender_id != user.id and message.seen_at is None:
                message.seen_at = now
                message.delivered_at = message.delivered_at or now
        await self._msgs.db.flush()

        return [ChatMessageResponse.model_validate(m) for m in messages]

    async def edit_message(
        self,
        conversation_id: str,
        message_id: str,
        data: EditMessageRequest,
        user: User,
    ) -> ChatMessageResponse:
        await self._get_conversation_or_raise(conversation_id, user.id)

        message = await self._msgs.get_by_id_in_conversation(
            message_id, conversation_id
        )
        if not message or message.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found.",
            )
        if message.sender_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only edit your own messages.",
            )

        updated = await self._msgs.edit_message(
            message, data.encrypted_content, data.encryption_nonce
        )
        return ChatMessageResponse.model_validate(updated)

    async def delete_message(
        self,
        conversation_id: str,
        message_id: str,
        user: User,
    ) -> None:
        await self._get_conversation_or_raise(conversation_id, user.id)

        message = await self._msgs.get_by_id_in_conversation(
            message_id, conversation_id
        )
        if not message or message.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found.",
            )
        if message.sender_id != user.id and user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own messages.",
            )

        await self._msgs.soft_delete(message)

    async def react_to_message(
        self,
        conversation_id: str,
        message_id: str,
        data: ReactionRequest,
        user: User,
    ) -> None:
        await self._get_conversation_or_raise(conversation_id, user.id)

        message = await self._msgs.get_by_id_in_conversation(
            message_id, conversation_id
        )
        if not message or message.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found.",
            )

        # Toggle: if reaction exists, remove it; otherwise add it
        from sqlalchemy import select
        from app.api.v1.models.models import MessageReaction
        existing = await self._msgs.db.execute(
            select(MessageReaction).where(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == user.id,
                MessageReaction.emoji == data.emoji,
            )
        )
        reaction = existing.scalar_one_or_none()
        if reaction:
            await self._msgs.db.delete(reaction)
        else:
            self._msgs.db.add(
                MessageReaction(
                    message_id=message_id,
                    user_id=user.id,
                    emoji=data.emoji,
                )
            )
        await self._msgs.db.flush()

    async def mark_delivered(self, message_id: str) -> None:
        await self._msgs.mark_delivered(message_id)

    async def mark_seen(self, message_id: str) -> None:
        await self._msgs.mark_seen(message_id)

    #  Chat Keys (E2EE) 
    async def upsert_chat_key(
        self, user: User, public_key: str
    ) -> ChatKeyResponse:
        # Serialize first publication across devices and never silently replace
        # a key that existing message history depends on.
        await self._keys.db.execute(select(User.id).where(User.id == user.id).with_for_update())
        existing = await self._keys.get_by_user_id(user.id)
        if existing:
            if existing.public_key != public_key:
                raise HTTPException(409, "A messaging key already exists. Use your original browser.")
            return ChatKeyResponse.model_validate(existing)
        key = await self._keys.upsert(user.id, public_key)
        return ChatKeyResponse.model_validate(key)

    async def get_chat_key(self, user_id: str) -> ChatKeyResponse:
        key = await self._keys.get_by_user_id(user_id)
        if not key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No public key found for this user.",
            )
        return ChatKeyResponse.model_validate(key)

    #  Block / Unblock 
    async def block_user(
        self, blocker: User, blocked_id: str, reason: str | None = None
    ) -> None:
        if blocker.id == blocked_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot block yourself.",
            )
        already_blocked = await self._blocked.is_blocked(blocker.id, blocked_id)
        if already_blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already blocked.",
            )
        await self._blocked.block(blocker.id, blocked_id, reason)

    async def unblock_user(self, blocker: User, blocked_id: str) -> None:
        removed = await self._blocked.unblock(blocker.id, blocked_id)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Block record not found.",
            )

    #  Internal 
    async def _get_conversation_or_raise(self, conversation_id: str, user_id: str):
        conversation = await self._convs.get_with_participants(conversation_id)
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        participant_ids = {p.user_id for p in conversation.participants}
        if user_id not in participant_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a participant in this conversation.",
            )
        return conversation