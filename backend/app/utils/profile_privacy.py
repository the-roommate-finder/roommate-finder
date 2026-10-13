"""One privacy policy for profile serialization and discovery queries."""
from datetime import datetime, timezone
from sqlalchemy import and_, func, or_, select
from app.api.v1.models.models import User, BlockedUser
from app.api.v1.schemas.schemas import PrivacyPreferences, PublicSeekerPreferences, MemberProfileResponse

LIFESTYLE_FIELDS = ("sleep_schedule", "cleanliness", "noise_level", "guests", "smoking", "pets")
MATCH_FIELDS = ("sleep_schedule", "cleanliness")


def privacy(user: User) -> PrivacyPreferences:
    value = PrivacyPreferences.model_validate(user.privacy_preferences or {})
    if not user.is_profile_visible:
        value.profile_audience = "no_one"
    return value


def can_view_profile(target: User, viewer: User) -> bool:
    if target.id == viewer.id:
        return True
    audience = privacy(target).profile_audience
    if audience == "everyone":
        return True
    if audience == "no_one":
        return False
    own, other = target.seeker_preferences or {}, viewer.seeker_preferences or {}
    return all(own.get(key) and own.get(key) == other.get(key) for key in MATCH_FIELDS)


def audience_filter(viewer: User):
    audience = func.coalesce(User.privacy_preferences["profile_audience"].astext, "everyone")
    preferences = viewer.seeker_preferences or {}
    matching = and_(*(User.seeker_preferences[key].astext == preferences[key] for key in MATCH_FIELDS)) if all(preferences.get(key) for key in MATCH_FIELDS) else False
    blocked = select(BlockedUser.id).where(or_(
        and_(BlockedUser.blocker_id == viewer.id, BlockedUser.blocked_id == User.id),
        and_(BlockedUser.blocked_id == viewer.id, BlockedUser.blocker_id == User.id),
    )).correlate(User).exists()
    return and_(~blocked, User.is_profile_visible.is_(True), or_(audience == "everyone", and_(audience == "matches", matching)))


def public_preferences(user: User) -> PublicSeekerPreferences | None:
    if not user.seeker_preferences:
        return None
    values = dict(user.seeker_preferences)
    settings = privacy(user)
    if not settings.show_occupation:
        values["occupation"] = None
    if not settings.show_lifestyle:
        values.update({key: None for key in LIFESTYLE_FIELDS})
    return PublicSeekerPreferences.model_validate(values)


def member_profile(user: User) -> MemberProfileResponse:
    settings = privacy(user)
    today = datetime.now(timezone.utc).date()
    dob = user.date_of_birth.date() if user.date_of_birth and settings.show_age else None
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day)) if dob else None
    return MemberProfileResponse(id=user.id, display_name=user.display_name, avatar_url=user.avatar_url,
        role=user.role, bio=user.bio if settings.show_about_me else None, age=age,
        preferences=public_preferences(user), is_email_verified=user.is_email_verified,
        is_phone_verified=user.is_phone_verified,
        created_at=user.created_at if settings.show_profile_activity else None,
        updated_at=user.updated_at if settings.show_profile_activity else None,
        last_active_at=user.last_active_at if settings.show_recently_active else None)
