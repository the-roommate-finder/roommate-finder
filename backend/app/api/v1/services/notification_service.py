from __future__ import annotations

import json

import structlog
from fastapi import HTTPException, status

from app.api.v1.models.models import Notification, NotificationType, User
from app.api.v1.repositories.base import BaseRepository
from app.api.v1.schemas.schemas import NotificationResponse, PaginatedResponse

logger = structlog.get_logger(__name__)


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    async def get_user_notifications(
        self,
        user_id: str,
        *,
        unread_only: bool = False,
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[list[Notification], int]:
        from sqlalchemy import and_, desc, func, select

        filters = [Notification.user_id == user_id]
        if unread_only:
            filters.append(Notification.is_read == False)  # noqa: E712

        total = (
            await self.db.execute(
                select(func.count())
                .select_from(Notification)
                .where(and_(*filters))
            )
        ).scalar_one()

        result = await self.db.execute(
            select(Notification)
            .where(and_(*filters))
            .order_by(desc(Notification.created_at))
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def mark_read_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        from datetime import datetime, timezone

        from sqlalchemy import update

        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.id.in_(notification_ids),
                Notification.is_read == False,  # noqa: E712
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        return result.rowcount  # type: ignore[return-value]

    async def mark_all_read(self, user_id: str) -> None:
        from datetime import datetime, timezone

        from sqlalchemy import update

        await self.db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read == False,  # noqa: E712
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )

    async def unread_count(self, user_id: str) -> int:
        return await self.count(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )


class NotificationService:
    def __init__(self, notification_repo: NotificationRepository) -> None:
        self._repo = notification_repo

    async def create_notification(
        self,
        *,
        user_id: str,
        notification_type: NotificationType,
        title: str,
        body: str,
        data: dict | None = None,
    ) -> Notification:
        return await self._repo.create(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            body=body,
            data=json.dumps(data) if data else None,
        )

    async def list_notifications(
        self,
        user: User,
        *,
        unread_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedResponse[NotificationResponse]:
        offset = (page - 1) * page_size
        items, total = await self._repo.get_user_notifications(
            user.id,
            unread_only=unread_only,
            offset=offset,
            limit=page_size,
        )
        pages = max(1, -(-total // page_size))
        return PaginatedResponse(
            items=[NotificationResponse.model_validate(n) for n in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
        )

    async def mark_read(
        self, user: User, notification_ids: list[str]
    ) -> dict:
        updated = await self._repo.mark_read_bulk(user.id, notification_ids)
        return {"updated": updated}

    async def mark_all_read(self, user: User) -> dict:
        await self._repo.mark_all_read(user.id)
        return {"message": "All notifications marked as read."}

    async def get_unread_count(self, user: User) -> dict:
        count = await self._repo.unread_count(user.id)
        return {"unread_count": count}
