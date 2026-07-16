from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.models.models import User, UserRole
from app.api.v1.repositories.auth_repository import (
    EmailVerificationRepository,
    PhoneVerificationRepository,
)
from app.api.v1.repositories.chat_repository import (
    BlockedUserRepository,
    ChatKeyRepository,
    ConversationParticipantRepository,
    ConversationRepository,
    MessageRepository,
)
from app.api.v1.repositories.listing_repository import (
    ListingImageRepository,
    ListingRepository,
)
from app.api.v1.repositories.user_repository import (
    DeviceRepository,
    LoginAttemptRepository,
    RefreshTokenRepository,
    SecurityEventRepository,
    UserRepository,
    UserSessionRepository,
)
from app.api.v1.services.auth_service import AuthService
from app.api.v1.services.chat_service import ChatService
from app.api.v1.services.listing_service import ListingService
from app.api.v1.services.notification_service import (
    NotificationRepository,
    NotificationService,
)
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import decode_access_token
from app.utils.storage import StorageClient

logger = structlog.get_logger(__name__)
_bearer = HTTPBearer(auto_error=True)


#  Database session 
DbDep = Annotated[AsyncSession, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]  # type: ignore[type-arg]


#  Service factories 
def get_auth_service(db: DbDep, redis: RedisDep) -> AuthService:
    return AuthService(
        user_repo=UserRepository(db),
        ev_repo=EmailVerificationRepository(db),
        pv_repo=PhoneVerificationRepository(db),
        attempt_repo=LoginAttemptRepository(db),
        session_repo=UserSessionRepository(db),
        rt_repo=RefreshTokenRepository(db),
        device_repo=DeviceRepository(db),
        security_repo=SecurityEventRepository(db),
        redis=redis,
    )


def get_listing_service(db: DbDep) -> ListingService:
    return ListingService(
        listing_repo=ListingRepository(db),
        image_repo=ListingImageRepository(db),
        storage=StorageClient(),
    )


def get_chat_service(db: DbDep) -> ChatService:
    return ChatService(
        conv_repo=ConversationRepository(db),
        participant_repo=ConversationParticipantRepository(db),
        msg_repo=MessageRepository(db),
        chat_key_repo=ChatKeyRepository(db),
        blocked_repo=BlockedUserRepository(db),
    )


def get_notification_service(db: DbDep) -> NotificationService:
    return NotificationService(notification_repo=NotificationRepository(db))


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
ListingServiceDep = Annotated[ListingService, Depends(get_listing_service)]
ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]


#  Authentication 
async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    db: DbDep,
    redis: RedisDep,
    auth_service: AuthServiceDep,
) -> User:
    """
    Validate Bearer token and return the authenticated User.
    Also checks if the token has been explicitly revoked (logout).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    raw_token = credentials.credentials

    # Check blacklist (tokens revoked on logout)
    if await auth_service.is_token_blacklisted(raw_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(raw_token)
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    if not user or not user.is_active or user.is_deleted:
        raise credentials_exception

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


#  Role Guards 
def require_role(*roles: UserRole):
    """Factory: returns a dependency that enforces one of the given roles."""

    async def _check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return user

    return Depends(_check)


def require_admin() -> Depends:
    return require_role(UserRole.ADMIN)


def require_lister_or_admin() -> Depends:
    return require_role(UserRole.LISTER, UserRole.ADMIN)