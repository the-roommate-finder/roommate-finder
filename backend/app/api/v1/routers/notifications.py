from fastapi import APIRouter, Query, Response, status

from app.api.v1.dependencies import CurrentUser, DbDep, NotificationServiceDep
from app.api.v1.repositories.user_repository import UserRepository
from app.api.v1.schemas.schemas import (
    MarkNotificationsReadRequest,
    MessageResponse,
    NotificationResponse,
    PaginatedResponse,
    NotificationPreferences,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/preferences", response_model=NotificationPreferences)
async def get_preferences(current_user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return NotificationPreferences.model_validate(current_user.notification_preferences)


@router.put("/preferences", response_model=NotificationPreferences)
async def save_preferences(body: NotificationPreferences, current_user: CurrentUser, db: DbDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    # Save the complete screen in one transaction, scoped to the signed-in account.
    preferences = body.model_dump()
    await UserRepository(db).update(current_user, notification_preferences=preferences)
    return preferences


@router.get(
    "",
    response_model=PaginatedResponse[NotificationResponse],
    summary="List my notifications",
)
async def list_notifications(
    current_user: CurrentUser,
    notification_service: NotificationServiceDep,
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedResponse[NotificationResponse]:
    return await notification_service.list_notifications(
        current_user,
        unread_only=unread_only,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/unread-count",
    summary="Get unread notification count",
)
async def get_unread_count(
    current_user: CurrentUser,
    notification_service: NotificationServiceDep,
) -> dict:
    return await notification_service.get_unread_count(current_user)


@router.post(
    "/mark-read",
    response_model=dict,
    summary="Mark specific notifications as read",
)
async def mark_notifications_read(
    body: MarkNotificationsReadRequest,
    current_user: CurrentUser,
    notification_service: NotificationServiceDep,
) -> dict:
    return await notification_service.mark_read(current_user, body.notification_ids)


@router.post(
    "/mark-all-read",
    response_model=MessageResponse,
    summary="Mark all notifications as read",
)
async def mark_all_read(
    current_user: CurrentUser,
    notification_service: NotificationServiceDep,
) -> MessageResponse:
    result = await notification_service.mark_all_read(current_user)
    return MessageResponse(message=result["message"])
