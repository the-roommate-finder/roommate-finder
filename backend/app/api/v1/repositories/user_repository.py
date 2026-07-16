from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, select, update

from app.api.v1.models.models import (
    Device,
    LoginAttempt,
    RefreshToken,
    SecurityEvent,
    SecurityEventType,
    User,
    UserRole,
    UserSession,
)
from app.api.v1.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    #  Lookups 
    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email, User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def get_active_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(
                User.email == email,
                User.is_active == True,  # noqa: E712
                User.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def email_exists(self, email: str) -> bool:
        result = await self.db.execute(
            select(User.id).where(User.email == email, User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none() is not None

    async def get_by_phone(self, phone_number: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.phone_number == phone_number, User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def phone_exists(self, phone_number: str) -> bool:
        result = await self.db.execute(
            select(User.id).where(User.phone_number == phone_number, User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none() is not None

    #  Mutations 
    async def create_user(
        self,
        *,
        email: str,
        hashed_password: str,
        role: UserRole = UserRole.SEEKER,
        display_name: Optional[str] = None,
        phone_number: Optional[str] = None,
    ) -> User:
        return await self.create(
            email=email,
            hashed_password=hashed_password,
            role=role,
            display_name=display_name,
            phone_number=phone_number,
            is_active=False,
            is_email_verified=False,
        )

    async def activate_user(self, user: User) -> User:
        return await self.update(
            user,
            is_active=True,
            is_email_verified=True,
        )

    async def activate_phone(self, user: User) -> User:
        return await self.update(user, is_phone_verified=True, is_active=True)

    async def update_last_active(self, user_id: str) -> None:
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(last_active_at=datetime.now(timezone.utc))
        )

    async def soft_delete(self, user: User) -> User:
        return await self.update(
            user,
            is_deleted=True,
            is_active=False,
            deleted_at=datetime.now(timezone.utc),
        )

    async def rehash_password(self, user: User, new_hash: str) -> User:
        return await self.update(user, hashed_password=new_hash)


class DeviceRepository(BaseRepository[Device]):
    model = Device

    async def get_by_fingerprint(
        self, user_id: str, fingerprint: str
    ) -> Optional[Device]:
        result = await self.db.execute(
            select(Device).where(
                Device.user_id == user_id,
                Device.fingerprint == fingerprint,
            )
        )
        return result.scalar_one_or_none()

    async def get_user_devices(self, user_id: str) -> list[Device]:
        result = await self.db.execute(
            select(Device)
            .where(Device.user_id == user_id)
            .order_by(Device.last_seen_at.desc())
        )
        return list(result.scalars().all())

    async def upsert_device(
        self,
        *,
        user_id: str,
        fingerprint: str,
        name: Optional[str] = None,
        browser: Optional[str] = None,
        os: Optional[str] = None,
        device_type: Optional[str] = None,
    ) -> Device:
        existing = await self.get_by_fingerprint(user_id, fingerprint)
        if existing:
            return await self.update(
                existing,
                name=name or existing.name,
                browser=browser or existing.browser,
                os=os or existing.os,
                device_type=device_type or existing.device_type,
                last_seen_at=datetime.now(timezone.utc),
            )
        return await self.create(
            user_id=user_id,
            fingerprint=fingerprint,
            name=name,
            browser=browser,
            os=os,
            device_type=device_type,
        )


class LoginAttemptRepository(BaseRepository[LoginAttempt]):
    model = LoginAttempt

    async def create_attempt(
        self,
        *,
        user_id: Optional[str],
        email: str,
        ip_address: str,
        user_agent: Optional[str],
        device_fingerprint: Optional[str],
        is_success: bool,
        failure_reason: Optional[str] = None,
        location: Optional[str] = None,
    ) -> LoginAttempt:
        return await self.create(
            user_id=user_id,
            email=email,
            ip_address=ip_address,
            user_agent=user_agent,
            device_fingerprint=device_fingerprint,
            is_success=is_success,
            failure_reason=failure_reason,
            location=location,
        )

    async def count_recent_failures(
        self,
        email: str,
        since: datetime,
    ) -> int:
        return await self.count(
            LoginAttempt.email == email,
            LoginAttempt.is_success == False,  # noqa: E712
            LoginAttempt.created_at >= since,
        )

    async def get_recent_attempts(
        self,
        email: str,
        since: datetime,
        limit: int = 10,
    ) -> list[LoginAttempt]:
        result = await self.db.execute(
            select(LoginAttempt)
            .where(
                LoginAttempt.email == email,
                LoginAttempt.created_at >= since,
            )
            .order_by(LoginAttempt.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


class UserSessionRepository(BaseRepository[UserSession]):
    model = UserSession

    async def get_active_by_token_hash(self, token_hash: str) -> Optional[UserSession]:
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.session_token_hash == token_hash,
                UserSession.is_active == True,  # noqa: E712
                UserSession.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    async def deactivate_user_sessions(self, user_id: str) -> None:
        await self.db.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.is_active == True)  # noqa: E712
            .values(is_active=False)
        )

    async def touch(self, session: UserSession) -> None:
        session.last_used_at = datetime.now(timezone.utc)
        await self.db.flush()


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    model = RefreshToken

    async def get_active_by_hash(self, token_hash: str) -> Optional[RefreshToken]:
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.is_revoked == False,  # noqa: E712
                RefreshToken.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    async def revoke(self, token: RefreshToken) -> RefreshToken:
        return await self.update(
            token,
            is_revoked=True,
            revoked_at=datetime.now(timezone.utc),
        )

    async def revoke_all_for_user(self, user_id: str) -> None:
        await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked == False)  # noqa: E712
            .values(is_revoked=True, revoked_at=datetime.now(timezone.utc))
        )

    async def create_token(
        self,
        *,
        user_id: str,
        token_hash: str,
        device_id: Optional[str],
        expires_at: datetime,
    ) -> RefreshToken:
        return await self.create(
            user_id=user_id,
            token_hash=token_hash,
            device_id=device_id,
            expires_at=expires_at,
        )


class SecurityEventRepository(BaseRepository[SecurityEvent]):
    model = SecurityEvent

    async def log(
        self,
        *,
        user_id: Optional[str],
        event_type: SecurityEventType,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        location: Optional[str] = None,
        metadata: Optional[str] = None,
    ) -> SecurityEvent:
        return await self.create(
            user_id=user_id,
            event_type=event_type,
            ip_address=ip_address,
            user_agent=user_agent,
            location=location,
            metadata_=metadata,
        )

    async def get_user_events(
        self,
        user_id: str,
        *,
        limit: int = 50,
    ) -> list[SecurityEvent]:
        result = await self.db.execute(
            select(SecurityEvent)
            .where(SecurityEvent.user_id == user_id)
            .order_by(SecurityEvent.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())