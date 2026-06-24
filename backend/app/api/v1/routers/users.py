from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile, status

from app.api.v1.dependencies import (
    AuthServiceDep,
    CurrentUser,
    DbDep,
    require_admin,
)
from app.api.v1.models.models import UserRole
from app.api.v1.repositories.user_repository import (
    DeviceRepository,
    SecurityEventRepository,
    UserRepository,
    UserSessionRepository,
)
from app.api.v1.schemas.schemas import (
    DeviceResponse,
    MessageResponse,
    SessionResponse,
    UserPublicResponse,
    UserRoleUpdateRequest,
    UserUpdateRequest,
)
from app.core.config import settings
from app.utils.storage import StorageClient

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/me",
    response_model=UserPublicResponse,
    summary="Get current user profile",
)
async def get_my_profile(current_user: CurrentUser) -> UserPublicResponse:
    return UserPublicResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserPublicResponse,
    summary="Update current user profile",
)
async def update_my_profile(
    body: UserUpdateRequest,
    current_user: CurrentUser,
    db: DbDep,
) -> UserPublicResponse:
    user_repo = UserRepository(db)
    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    updated = await user_repo.update(current_user, **updates)
    return UserPublicResponse.model_validate(updated)


@router.post(
    "/me/avatar",
    response_model=UserPublicResponse,
    summary="Upload profile avatar",
)
async def upload_avatar(
    file: UploadFile,
    current_user: CurrentUser,
    db: DbDep,
) -> UserPublicResponse:
    content_type = file.content_type or ""
    if content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image type.",
        )

    contents = await file.read()
    if len(contents) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    storage = StorageClient()
    key = f"avatars/{current_user.id}/{file.filename}"
    cdn_url = await storage.upload(key=key, data=contents, content_type=content_type)

    user_repo = UserRepository(db)
    updated = await user_repo.update(current_user, avatar_url=cdn_url)
    return UserPublicResponse.model_validate(updated)


@router.delete(
    "/me",
    response_model=MessageResponse,
    summary="Delete own account (soft delete)",
)
async def delete_my_account(
    current_user: CurrentUser,
    db: DbDep,
) -> MessageResponse:
    user_repo = UserRepository(db)
    await user_repo.soft_delete(current_user)
    return MessageResponse(message="Account scheduled for deletion.")


@router.get(
    "/me/sessions",
    response_model=list[SessionResponse],
    summary="List active sessions",
)
async def list_my_sessions(
    current_user: CurrentUser,
    db: DbDep,
) -> list[SessionResponse]:
    from sqlalchemy import select
    from app.api.v1.models.models import UserSession

    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == current_user.id,
            UserSession.is_active == True,  # noqa: E712
        )
        .order_by(UserSession.last_used_at.desc())
    )
    sessions = result.scalars().all()
    return [SessionResponse.model_validate(s) for s in sessions]


@router.get(
    "/me/devices",
    response_model=list[DeviceResponse],
    summary="List known devices",
)
async def list_my_devices(
    current_user: CurrentUser,
    db: DbDep,
) -> list[DeviceResponse]:
    device_repo = DeviceRepository(db)
    devices = await device_repo.get_user_devices(current_user.id)
    return [DeviceResponse.model_validate(d) for d in devices]


@router.get(
    "/{user_id}",
    response_model=UserPublicResponse,
    summary="Get public user profile",
)
async def get_user_profile(
    user_id: str,
    db: DbDep,
    _current_user: CurrentUser,  # require authentication
) -> UserPublicResponse:
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    if not user or user.is_deleted or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return UserPublicResponse.model_validate(user)


#  Admin-only 
@router.patch(
    "/{user_id}/role",
    response_model=UserPublicResponse,
    summary="Change user role (Admin only)",
    dependencies=[require_admin()],
)
async def update_user_role(
    user_id: str,
    body: UserRoleUpdateRequest,
    db: DbDep,
) -> UserPublicResponse:
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    updated = await user_repo.update(user, role=body.role)
    return UserPublicResponse.model_validate(updated)


@router.post(
    "/{user_id}/deactivate",
    response_model=MessageResponse,
    summary="Deactivate user account (Admin only)",
    dependencies=[require_admin()],
)
async def deactivate_user(
    user_id: str,
    db: DbDep,
) -> MessageResponse:
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    await user_repo.update(user, is_active=False)
    return MessageResponse(message="User deactivated.")
