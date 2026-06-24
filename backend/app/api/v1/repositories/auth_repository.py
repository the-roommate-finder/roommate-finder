from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update

from app.api.v1.models.models import EmailVerification
from app.api.v1.repositories.base import BaseRepository


class EmailVerificationRepository(BaseRepository[EmailVerification]):
    model = EmailVerification

    async def get_latest_unused(self, user_id: str) -> Optional[EmailVerification]:
        """Return the most recent non-expired, non-used OTP record for this user."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(EmailVerification)
            .where(
                EmailVerification.user_id == user_id,
                EmailVerification.is_used == False,  # noqa: E712
                EmailVerification.expires_at > now,
            )
            .order_by(EmailVerification.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create_otp(
        self,
        *,
        user_id: str,
        otp_hash: str,
        expires_at: datetime,
    ) -> EmailVerification:
        return await self.create(
            user_id=user_id,
            otp_hash=otp_hash,
            expires_at=expires_at,
            attempts=0,
            is_used=False,
        )

    async def invalidate_previous(self, user_id: str) -> None:
        """Mark all previous unused OTPs as used before issuing a new one."""
        await self.db.execute(
            update(EmailVerification)
            .where(
                EmailVerification.user_id == user_id,
                EmailVerification.is_used == False,  # noqa: E712
            )
            .values(is_used=True)
        )

    async def increment_attempts(self, record: EmailVerification) -> EmailVerification:
        return await self.update(record, attempts=record.attempts + 1)

    async def mark_used(self, record: EmailVerification) -> EmailVerification:
        return await self.update(
            record,
            is_used=True,
            used_at=datetime.now(timezone.utc),
        )

    async def count_recent_resends(
        self,
        user_id: str,
        since: datetime,
    ) -> int:
        return await self.count(
            EmailVerification.user_id == user_id,
            EmailVerification.created_at >= since,
        )
