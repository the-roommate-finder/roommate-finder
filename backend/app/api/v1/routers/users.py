from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, Response, status
from pydantic import BaseModel, ConfigDict, StrictBool, EmailStr, Field, field_validator
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from botocore.exceptions import BotoCoreError, ClientError
import structlog

from app.api.v1.dependencies import (
    AuthServiceDep,
    CurrentUser,
    DbDep,
    RedisDep,
    require_admin,
)
from app.api.v1.models.models import (UserRole, User, DashboardBookmark, DashboardSearch,
    Listing, ConversationParticipant, BlockedUser, UserSession, RefreshToken)
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
    UserUpdateRequest, PrivacyPreferences, MemberProfileResponse,
)
from app.core.config import settings
from app.utils.storage import StorageClient
from app.utils.profile_privacy import privacy, can_view_profile, member_profile
from app.api.v1.repositories.chat_repository import BlockedUserRepository
from app.api.v1.services.email_change_service import EmailChangeService
from app.api.v1.models.models import SecurityEvent, SecurityEventType
from app.api.v1.schemas.schemas import NotificationPreferences
from user_agents import parse as parse_user_agent

router = APIRouter(prefix="/users", tags=["Users"])


class VisibilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_profile_visible: StrictBool


class SecurityAlertsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    login_alerts: StrictBool


@router.get("/me/security")
async def security_summary(current_user: CurrentUser, db: DbDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    changed_at = (await db.execute(select(func.max(SecurityEvent.created_at)).where(
        SecurityEvent.user_id == current_user.id,
        SecurityEvent.event_type == SecurityEventType.PASSWORD_CHANGED))).scalar_one()
    events = (await db.execute(select(SecurityEvent).where(
        SecurityEvent.user_id == current_user.id,
        SecurityEvent.event_type == SecurityEventType.LOGIN_SUCCESS,
    ).order_by(SecurityEvent.created_at.desc(), SecurityEvent.id).limit(5))).scalars().all()
    activity = []
    for event in events:
        agent = parse_user_agent(event.user_agent or "")
        activity.append({"id": event.id, "os": agent.os.family, "browser": agent.browser.family,
            "location": event.location, "created_at": event.created_at})
    return {"password_changed_at": changed_at, "login_activity": activity,
        "login_alerts": NotificationPreferences.model_validate(current_user.notification_preferences or {}).login_alerts,
        "two_factor_available": False}


@router.patch("/me/security")
async def save_security_alerts(body: SecurityAlertsRequest, current_user: CurrentUser, db: DbDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    user = (await db.execute(select(User).where(User.id == current_user.id).with_for_update()
        .execution_options(populate_existing=True))).scalar_one()
    preferences = NotificationPreferences.model_validate(user.notification_preferences or {}).model_dump()
    preferences["login_alerts"] = body.login_alerts
    await UserRepository(db).update(user, notification_preferences=preferences)
    return {"login_alerts": body.login_alerts}


class EmailChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class EmailChangeConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")
    new_code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")


@router.post("/me/email-change")
async def request_email_change(body: EmailChangeRequest, current_user: CurrentUser, db: DbDep, redis: RedisDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await EmailChangeService(db, redis).request(current_user.id, str(body.email))


@router.post("/me/email-change/confirm")
async def confirm_email_change(body: EmailChangeConfirm, current_user: CurrentUser, db: DbDep, redis: RedisDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await EmailChangeService(db, redis).confirm(current_user.id, body.current_code, body.new_code)


@router.get("/me/privacy", response_model=PrivacyPreferences)
async def get_privacy(current_user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return privacy(current_user)


@router.put("/me/privacy", response_model=PrivacyPreferences)
async def save_privacy(body: PrivacyPreferences, current_user: CurrentUser, db: DbDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    await UserRepository(db).update(current_user, privacy_preferences=body.model_dump(),
        is_profile_visible=body.profile_audience != "no_one")
    return body


@router.get("/me/profile-summary")
async def profile_summary(current_user: CurrentUser, db: DbDep, response: Response):
    from app.api.v1.routers.dashboard import visible_rooms, visible_roommates
    response.headers["Cache-Control"] = "no-store"
    uid = current_user.id
    async def count(statement):
        return (await db.execute(statement)).scalar_one()
    saved_rooms = await count(select(func.count()).select_from(DashboardBookmark).join(
        Listing, Listing.id == DashboardBookmark.target_id).where(
        DashboardBookmark.user_id == uid, DashboardBookmark.kind == "room", *visible_rooms()))
    saved_roommates = await count(select(func.count()).select_from(DashboardBookmark).join(
        User, User.id == DashboardBookmark.target_id).where(
        DashboardBookmark.user_id == uid, DashboardBookmark.kind == "roommate", *visible_roommates(current_user)))
    conversations = await count(select(func.count()).select_from(ConversationParticipant).where(
        ConversationParticipant.user_id == uid, ConversationParticipant.is_archived.is_(False)))
    searches = await count(select(func.count()).select_from(DashboardSearch).where(DashboardSearch.user_id == uid))
    prefs = current_user.seeker_preferences or {}
    sections = {
        "Personal details": all((current_user.display_name, current_user.date_of_birth, current_user.gender, current_user.phone_number, prefs.get("occupation"))),
        "Profile photo": bool(current_user.avatar_url),
        "Housing preferences": all(prefs.get(key) is not None and prefs.get(key) != "" for key in ("budget_min", "budget_max", "preferred_location", "move_in_timeline")),
        "Lifestyle preferences": all(prefs.get(key) for key in ("sleep_schedule", "cleanliness", "noise_level", "guests", "smoking", "pets")),
        "Personal bio": bool(current_user.bio and current_user.bio.strip()),
    }
    today = datetime.now(timezone.utc).date()
    dob = current_user.date_of_birth.date() if current_user.date_of_birth else None
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day)) if dob else None
    return {"user": UserSelfResponse.model_validate(current_user), "age": age,
        "completion": sum(bool(value) for value in sections.values()) * 20,
        "missing": [key for key, value in sections.items() if not value],
        "activity": {"saved_rooms": saved_rooms, "saved_roommates": saved_roommates,
                     "conversations": conversations, "recent_searches": searches}}


@router.patch("/me/visibility")
async def profile_visibility(body: VisibilityRequest, current_user: CurrentUser, db: DbDep):
    values = privacy(current_user).model_dump()
    if not body.is_profile_visible:
        values["profile_audience"] = "no_one"
    elif values["profile_audience"] == "no_one":
        values["profile_audience"] = "everyone"
    user = await UserRepository(db).update(current_user, is_profile_visible=body.is_profile_visible, privacy_preferences=values)
    return {"is_profile_visible": user.is_profile_visible}


@router.get("/me/blocked")
async def blocked_users(current_user: CurrentUser, db: DbDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    users = (await db.execute(select(User.id, User.display_name, User.avatar_url, BlockedUser.created_at.label("blocked_at")).join(
        BlockedUser, BlockedUser.blocked_id == User.id).where(
        BlockedUser.blocker_id == current_user.id).order_by(BlockedUser.created_at.desc(), User.id))).all()
    return [{"id": user.id, "display_name": user.display_name, "avatar_url": user.avatar_url,
             "blocked_at": user.blocked_at} for user in users]


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
    await db.execute(update(UserSession).where(UserSession.user_id == current_user.id).values(is_active=False))
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == current_user.id).values(
        is_revoked=True, revoked_at=datetime.now(timezone.utc)))
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


@router.get("/{user_id}", response_model=MemberProfileResponse, summary="Get visible member profile")
async def get_user_profile(user_id: str, db: DbDep, _current_user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    user = await UserRepository(db).get_by_id(user_id)
    if (not user or user.is_deleted or not user.is_active or not can_view_profile(user, _current_user)
            or await BlockedUserRepository(db).is_either_blocked(_current_user.id, user_id)):
        raise HTTPException(404, "User not found.")
    return member_profile(user)


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
