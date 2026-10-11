from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from botocore.exceptions import BotoCoreError, ClientError
import structlog

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
    CompleteProfileRequest,
    DeviceResponse,
    MessageResponse,
    SessionResponse,
    UserPublicResponse,
    UserSelfResponse,
    UserRoleUpdateRequest,
    UserUpdateRequest,
)
from app.core.config import settings
from app.utils.storage import StorageClient

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/me",
    response_model=UserSelfResponse,
    summary="Get current user profile",
)
async def get_my_profile(current_user: CurrentUser) -> UserSelfResponse:
    return UserSelfResponse.model_validate(current_user)


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


@router.post("/me/complete-profile", response_model=UserSelfResponse)
async def complete_profile(
    body: CompleteProfileRequest, current_user: CurrentUser, db: DbDep,
) -> UserSelfResponse:
    if body.seeker_preferences is not None and current_user.role != UserRole.SEEKER:
        raise HTTPException(status_code=403, detail="This form is for seeker accounts.")
    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    if body.phone_number and body.phone_number != current_user.phone_number:
        updates["is_phone_verified"] = False
    try:
        updated = await UserRepository(db).update(
            current_user, **updates, is_profile_complete=True,
        )
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="That phone number is already in use.")
    return UserSelfResponse.model_validate(updated)


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
    if content_type not in settings.allowed_image_types_list:
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

    try:
        storage = StorageClient()
        key = f"avatars/{current_user.id}/{file.filename}"
        cdn_url = await storage.upload(key=key, data=contents, content_type=content_type)
    except (BotoCoreError, ClientError) as exc:
        code = exc.response.get("Error", {}).get("Code", "unknown") if isinstance(exc, ClientError) else type(exc).__name__
        structlog.get_logger(__name__).warning("avatar_upload_unavailable", storage_error_code=code)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo upload is unavailable. Please try again later or save your profile without a photo.",
        ) from exc

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
