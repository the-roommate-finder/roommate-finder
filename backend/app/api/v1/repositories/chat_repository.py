from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, desc, func, or_, select, update
from sqlalchemy.orm import selectinload

from app.api.v1.models.models import (
    BlockedUser,
    ChatKey,
    Conversation,
    ConversationParticipant,
    Message,
    MessageReaction,
    VoiceMessage,
)
from app.api.v1.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):
    model = Conversation

    async def get_between_users(
        self, user_id_a: str, user_id_b: str
    ) -> Optional[Conversation]:
        """
        Find an existing DM conversation between exactly two users.
        Prevents duplicate conversations from being created.
        """
        result = await self.db.execute(
            select(Conversation)
            .join(
                ConversationParticipant,
                ConversationParticipant.conversation_id == Conversation.id,
            )
            .where(
                ConversationParticipant.user_id == user_id_a,
                Conversation.is_group == False,  # noqa: E712
            )
            .options(selectinload(Conversation.participants).selectinload(ConversationParticipant.user))
        )
        candidates = list(result.scalars().all())

        for conv in candidates:
            participant_ids = {p.user_id for p in conv.participants}
            if participant_ids == {user_id_a, user_id_b}:
                return conv

        return None

    async def get_user_conversations(
        self,
        user_id: str,
        *,
        include_archived: bool = False,
        offset: int = 0,
        limit: int = 20,
    ) -> list[Conversation]:
        filters = [ConversationParticipant.user_id == user_id]
        if not include_archived:
            filters.append(ConversationParticipant.is_archived == False)  # noqa: E712

        result = await self.db.execute(
            select(Conversation)
            .join(
                ConversationParticipant,
                ConversationParticipant.conversation_id == Conversation.id,
            )
            .where(and_(*filters))
            .options(
                selectinload(Conversation.participants).selectinload(ConversationParticipant.user)
            )
            .order_by(
                ConversationParticipant.is_pinned.desc(),
                desc(Conversation.last_message_at).nulls_last(),
                Conversation.id,
            )
            .offset(offset)
            .limit(limit)
        )
        return list(result.unique().scalars().all())

    async def count_user_conversations(self, user_id: str, include_archived: bool = False) -> int:
        filters = [ConversationParticipant.user_id == user_id]
        if not include_archived:
            filters.append(ConversationParticipant.is_archived.is_(False))
        return (await self.db.execute(select(func.count()).select_from(ConversationParticipant).where(*filters))).scalar_one()

    async def get_with_participants(self, conversation_id: str) -> Optional[Conversation]:
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(
                selectinload(Conversation.participants).selectinload(ConversationParticipant.user)
            )
        )
        return result.scalar_one_or_none()

    async def update_last_message_at(self, conversation_id: str) -> None:
        await self.db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(last_message_at=datetime.now(timezone.utc))
        )

    async def create_conversation(
        self, user_id_a: str, user_id_b: str
    ) -> Conversation:
        conversation = await self.create(is_group=False)
        # Create both participant records
        self.db.add(ConversationParticipant(
            conversation_id=conversation.id, user_id=user_id_a
        ))
        self.db.add(ConversationParticipant(
            conversation_id=conversation.id, user_id=user_id_b
        ))
        await self.db.flush()
        return await self.get_with_participants(conversation.id)  # type: ignore[return-value]


class ConversationParticipantRepository(BaseRepository[ConversationParticipant]):
    model = ConversationParticipant

    async def get_participant(
        self, conversation_id: str, user_id: str
    ) -> Optional[ConversationParticipant]:
        result = await self.db.execute(
            select(ConversationParticipant).where(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def update_settings(
        self,
        participant: ConversationParticipant,
        **kwargs: bool,
    ) -> ConversationParticipant:
        return await self.update(participant, **kwargs)

    async def mark_read(
        self, conversation_id: str, user_id: str
    ) -> None:
        await self.db.execute(
            update(ConversationParticipant)
            .where(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id == user_id,
            )
            .values(
                unread_count=0,
                last_read_at=datetime.now(timezone.utc),
            )
        )

    async def increment_unread(
        self, conversation_id: str, exclude_user_id: str
    ) -> None:
        await self.db.execute(
            update(ConversationParticipant)
            .where(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id != exclude_user_id,
            )
            .values(unread_count=ConversationParticipant.unread_count + 1)
        )


class MessageRepository(BaseRepository[Message]):
    model = Message

    async def get_conversation_messages(
        self,
        conversation_id: str,
        *,
        before_id: Optional[str] = None,
        limit: int = 50,
    ) -> list[Message]:
        filters = [
            Message.conversation_id == conversation_id,
            Message.is_deleted == False,  # noqa: E712
        ]

        if before_id:
            # Cursor-based pagination: messages before this ID
            anchor_result = await self.db.execute(
                select(Message).where(Message.id == before_id, Message.conversation_id == conversation_id)
            )
            anchor = anchor_result.scalar_one_or_none()
            if anchor:
                filters.append(or_(Message.created_at < anchor.created_at,
                    and_(Message.created_at == anchor.created_at, Message.id < anchor.id)))
            else:
                from fastapi import HTTPException
                raise HTTPException(404, "Message cursor not found.")

        result = await self.db.execute(
            select(Message)
            .options(
                selectinload(Message.reactions),
                selectinload(Message.attachments),
                selectinload(Message.voice_message),
            )
            .where(and_(*filters))
            .order_by(desc(Message.created_at), desc(Message.id))
            .limit(limit)
        )
        messages = list(result.scalars().all())
        messages.reverse()  # Return in ascending chronological order
        return messages

    async def latest_for_conversations(self, ids: list[str]) -> dict[str, Message]:
        if not ids:
            return {}
        rows = (await self.db.execute(select(Message).where(Message.conversation_id.in_(ids),
            Message.is_deleted.is_(False)).distinct(Message.conversation_id)
            .order_by(Message.conversation_id, Message.created_at.desc(), Message.id.desc()))).scalars().all()
        return {row.conversation_id: row for row in rows}

    async def get_by_id_in_conversation(
        self, message_id: str, conversation_id: str
    ) -> Optional[Message]:
        result = await self.db.execute(
            select(Message).where(
                Message.id == message_id,
                Message.conversation_id == conversation_id,
            )
        )
        return result.scalar_one_or_none()

    async def mark_delivered(self, message_id: str) -> None:
        await self.db.execute(
            update(Message)
            .where(Message.id == message_id, Message.delivered_at == None)  # noqa: E711
            .values(delivered_at=datetime.now(timezone.utc))
        )

    async def mark_seen(self, message_id: str) -> None:
        await self.db.execute(
            update(Message)
            .where(Message.id == message_id, Message.seen_at == None)  # noqa: E711
            .values(seen_at=datetime.now(timezone.utc))
        )

    async def soft_delete(self, message: Message) -> Message:
        return await self.update(
            message,
            is_deleted=True,
            encrypted_content=None,
            encryption_nonce=None,
            deleted_at=datetime.now(timezone.utc),
        )

    async def edit_message(
        self, message: Message, encrypted_content: str, encryption_nonce: str
    ) -> Message:
        return await self.update(
            message,
            encrypted_content=encrypted_content,
            encryption_nonce=encryption_nonce,
            is_edited=True,
            edited_at=datetime.now(timezone.utc),
        )


class ChatKeyRepository(BaseRepository[ChatKey]):
    model = ChatKey

    async def get_by_user_id(self, user_id: str) -> Optional[ChatKey]:
        result = await self.db.execute(
            select(ChatKey).where(ChatKey.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def upsert(self, user_id: str, public_key: str) -> ChatKey:
        existing = await self.get_by_user_id(user_id)
        if existing:
            return await self.update(
                existing,
                public_key=public_key,
                key_version=existing.key_version + 1,
            )
        return await self.create(user_id=user_id, public_key=public_key)


class BlockedUserRepository(BaseRepository[BlockedUser]):
    model = BlockedUser

    async def is_blocked(self, blocker_id: str, blocked_id: str) -> bool:
        return await self.exists(
            BlockedUser.blocker_id == blocker_id,
            BlockedUser.blocked_id == blocked_id,
        )

    async def is_either_blocked(self, user_a: str, user_b: str) -> bool:
        return await self.exists(
            or_(
                and_(
                    BlockedUser.blocker_id == user_a,
                    BlockedUser.blocked_id == user_b,
                ),
                and_(
                    BlockedUser.blocker_id == user_b,
                    BlockedUser.blocked_id == user_a,
                ),
            )
        )

    async def block(
        self, blocker_id: str, blocked_id: str, reason: Optional[str] = None
    ) -> BlockedUser:
        return await self.create(
            blocker_id=blocker_id,
            blocked_id=blocked_id,
            reason=reason,
        )

    async def unblock(self, blocker_id: str, blocked_id: str) -> bool:
        record = await self.db.execute(
            select(BlockedUser).where(
                BlockedUser.blocker_id == blocker_id,
                BlockedUser.blocked_id == blocked_id,
            )
        )
        instance = record.scalar_one_or_none()
        if not instance:
            return False
        await self.delete(instance)
        return True
