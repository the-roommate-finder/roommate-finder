"""Shared in-app delivery policy for API and worker notification creation."""
from app.api.v1.models.models import NotificationType
from app.api.v1.schemas.schemas import NotificationPreferences


def notification_allowed(preferences: dict | None, notification_type: NotificationType, data: dict | None = None) -> bool:
    values = NotificationPreferences.model_validate(preferences or {}).model_dump()
    category = {
        NotificationType.NEW_MESSAGE: "new_messages",
        NotificationType.CALL_MISSED: "new_messages",
        NotificationType.LISTING_INQUIRY: "account_activity",
        NotificationType.SAVED_LISTING_UPDATE: "saved_listing_updates",
        NotificationType.SECURITY_ALERT: "login_alerts",
        NotificationType.VERIFICATION: "verification_updates",
        NotificationType.SYSTEM: "account_activity",
    }[notification_type]
    # Producers can distinguish new rooms, matches, marketing and unavailable
    # listings without changing the existing database notification enum.
    specific = (data or {}).get("preference_category")
    if notification_type == NotificationType.SYSTEM and isinstance(specific, str) and specific in values:
        category = specific
    elif notification_type == NotificationType.SAVED_LISTING_UPDATE and specific == "listing_unavailable":
        category = specific
    return values[category]
