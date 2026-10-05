from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update

from app.api.v1.models.models import EmailVerification, PhoneVerification
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
            .with_for_update()
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


class PhoneVerificationRepository(BaseRepository[PhoneVerification]):
    model = PhoneVerification

    async def get_latest_unused(
        self, user_id: str, phone_number: str
    ) -> Optional[PhoneVerification]:
        """Return the most recent non-expired, non-used OTP for this user/phone pair."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(PhoneVerification)
            .where(
                PhoneVerification.user_id == user_id,
                PhoneVerification.phone_number == phone_number,
                PhoneVerification.is_used == False,  # noqa: E712
                PhoneVerification.expires_at > now,
            )
            .order_by(PhoneVerification.created_at.desc())
            .limit(1)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def create_otp(
        self,
        *,
        user_id: str,
        phone_number: str,
        otp_hash: str,
        expires_at: datetime,
    ) -> PhoneVerification:
        return await self.create(
            user_id=user_id,
            phone_number=phone_number,
            otp_hash=otp_hash,
            expires_at=expires_at,
            attempts=0,
            is_used=False,
        )

    async def invalidate_previous(self, user_id: str, phone_number: str) -> None:
        """Mark all previous unused OTPs for this user/phone as used before issuing a new one."""
        await self.db.execute(
            update(PhoneVerification)
            .where(
                PhoneVerification.user_id == user_id,
                PhoneVerification.phone_number == phone_number,
                PhoneVerification.is_used == False,  # noqa: E712
            )
            .values(is_used=True)
        )

    async def increment_attempts(self, record: PhoneVerification) -> PhoneVerification:
        return await self.update(record, attempts=record.attempts + 1)

    async def mark_used(self, record: PhoneVerification) -> PhoneVerification:
        return await self.update(
            record,
            is_used=True,
            used_at=datetime.now(timezone.utc),
        )

    async def count_recent_resends(
        self,
        user_id: str,
        phone_number: str,
        since: datetime,
    ) -> int:
        return await self.count(
            PhoneVerification.user_id == user_id,
            PhoneVerification.phone_number == phone_number,
            PhoneVerification.created_at >= since,
        )


class PasswordResetRepository(BaseRepository["PasswordReset"]):
    from app.api.v1.models.models import PasswordReset
    model = PasswordReset

    async def create_token(
        self,
        *,
        user_id: str,
        token_hash: str,
        expires_at: "datetime",
    ) -> "PasswordReset":
        # Invalidate any previous unused tokens for this user
        from sqlalchemy import update
        await self.db.execute(
            update(self.model)
            .where(
                self.model.user_id == user_id,
                self.model.is_used == False,  # noqa: E712
            )
            .values(is_used=True)
        )
        return await self.create(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_used=False,
        )

    async def get_valid_by_hash(self, token_hash: str) -> "Optional[PasswordReset]":
        from datetime import timezone
        from sqlalchemy import select
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(self.model).where(
                self.model.token_hash == token_hash,
                self.model.is_used == False,  # noqa: E712
                self.model.expires_at > now,
            )
        )
        return result.scalar_one_or_none()

    async def mark_used(self, record: "PasswordReset") -> "PasswordReset":
        from datetime import timezone
        return await self.update(
            record,
            is_used=True,
            used_at=datetime.now(timezone.utc),
        )
