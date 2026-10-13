from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Generic, Literal, Optional, TypeVar

from pydantic import (
    AliasPath,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.api.v1.models.models import (
    CallStatus,
    CallType,
    GenderPreference,
    MessageType,
    NotificationType,
    PropertyType,
    SecurityEventType,
    UserGender,
    UserRole,
)

T = TypeVar("T")

#  Shared Config 
_orm_config = ConfigDict(from_attributes=True)


#  Generic wrappers 
class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    request_id: Optional[str] = None


#  AUTH SCHEMAS
_PASSWORD_PATTERN = re.compile(
    # ASCII punctuation ranges include underscores; whitespace does not qualify.
    r"(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!-/:-@\[-`{-~]).{6,50}"
)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=50)
    display_name: Optional[str] = Field(default=None, max_length=100)
    phone_number: Optional[str] = Field(default=None, max_length=20)
    role: UserRole = UserRole.SEEKER

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else None

    @field_validator("phone_number")
    @classmethod
    def strip_phone_number(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else None

    @field_validator("role")
    @classmethod
    def restrict_signup_role(cls, v: UserRole) -> UserRole:
        # Admin accounts are provisioned out-of-band, never through public signup.
        if v == UserRole.ADMIN:
            raise ValueError("role must be 'seeker' or 'lister'.")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not _PASSWORD_PATTERN.fullmatch(v):
            raise ValueError(
                "Password must be 6-50 characters and contain at least "
                "one uppercase letter, one lowercase letter, one number, and one special character."
            )
        return v


class RegisterResponse(BaseModel):
    model_config = _orm_config

    id: str
    email: str
    role: UserRole
    display_name: Optional[str] = None
    phone_number: Optional[str] = None
    is_email_verified: bool
    created_at: datetime
    message: str = "Registration successful. Please check your email for the verification OTP."


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class ResendOTPRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


_PHONE_PATTERN = re.compile(r"^\+?[0-9]{7,15}$")


class SendPhoneOTPRequest(BaseModel):
    phone_number: str = Field(min_length=7, max_length=20)

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = v.strip().replace(" ", "").replace("-", "")
        if not _PHONE_PATTERN.match(cleaned):
            raise ValueError("Enter a valid phone number.")
        return cleaned


class VerifyPhoneOTPRequest(BaseModel):
    phone_number: str = Field(min_length=7, max_length=20)
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = v.strip().replace(" ", "").replace("-", "")
        if not _PHONE_PATTERN.match(cleaned):
            raise ValueError("Enter a valid phone number.")
        return cleaned


class LoginRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    password: str
    device_name: Optional[str] = Field(default=None, max_length=200)

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().lower() if v else v

    @field_validator("phone_number")
    @classmethod
    def normalise_phone(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().replace(" ", "").replace("-", "") if v else v

    @model_validator(mode="after")
    def require_one_identifier(self) -> "LoginRequest":
        if not self.email and not self.phone_number:
            raise ValueError("Provide either an email address or a phone number.")
        if self.email and self.phone_number:
            raise ValueError("Provide only one of email or phone number, not both.")
        return self


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int  # seconds
    user: "UserPublicResponse"


class LoginFailedResponse(BaseModel):
    error: str = "authentication_failed"
    message: str
    attempts_remaining: Optional[int] = None
    locked_until: Optional[datetime] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class LogoutRequest(BaseModel):
    refresh_token: str
    all_devices: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=50)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not _PASSWORD_PATTERN.fullmatch(v):
            raise ValueError(
                "New password must be 6-50 characters and contain at least "
                "one uppercase letter, one lowercase letter, one number, and one special character."
            )
        return v

    @model_validator(mode="after")
    def passwords_must_differ(self) -> "ChangePasswordRequest":
        if self.current_password == self.new_password:
            raise ValueError("New password must differ from the current password.")
        return self


#  USER SCHEMAS
class UserPublicResponse(BaseModel):
    model_config = _orm_config
    is_profile_complete: bool

    id: str
    email: str
    role: UserRole
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    phone_number: Optional[str] = None
    is_phone_verified: bool = False
    gender: Optional[UserGender] = None
    is_active: bool
    is_email_verified: bool
    last_active_at: Optional[datetime] = None
    created_at: datetime


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=1000)
    phone_number: Optional[str] = Field(default=None, max_length=20)
    gender: Optional[UserGender] = None

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else None

    @field_validator("bio")
    @classmethod
    def strip_bio(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else None


class SeekerPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    occupation: str = Field(min_length=1, max_length=100)
    # Whole naira, as displayed in the profile form (not listing prices in kobo).
    budget_min: int = Field(ge=0, le=1_000_000_000, strict=True)
    budget_max: int = Field(ge=0, le=1_000_000_000, strict=True)
    preferred_location: str = Field(default="", max_length=200)
    move_in_timeline: Literal["within_1_month", "within_3_months", "within_6_months", "flexible"] = "within_1_month"
    sleep_schedule: Optional[Literal["early_bird", "night_owl", "flexible"]] = None
    cleanliness: Optional[Literal["very_tidy", "moderate", "relaxed"]] = None
    noise_level: Optional[Literal["quiet", "moderate", "lively"]] = None
    guests: Optional[Literal["rarely", "sometimes", "often"]] = None
    smoking: Optional[Literal["no", "yes", "outdoors_only"]] = None
    pets: Optional[Literal["no_pets", "have_pets", "pet_friendly"]] = None

    @model_validator(mode="after")
    def ordered_budget(self) -> "SeekerPreferences":
        if self.budget_max < self.budget_min:
            raise ValueError("Maximum budget must be at least the minimum budget.")
        return self


class PublicSeekerPreferences(SeekerPreferences):
    occupation: Optional[str] = None


class PrivacyPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    profile_audience: Literal["everyone", "matches", "no_one"] = "everyone"
    show_age: bool = True
    show_occupation: bool = True
    show_lifestyle: bool = True
    show_about_me: bool = True
    show_recently_active: bool = True
    show_profile_activity: bool = True


class MemberProfileResponse(BaseModel):
    id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole
    bio: Optional[str] = None
    age: Optional[int] = None
    preferences: Optional[PublicSeekerPreferences] = None
    is_email_verified: bool
    is_phone_verified: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None


class UserSelfResponse(UserPublicResponse):
    is_profile_visible: bool = True
    date_of_birth: Optional[datetime] = None
    seeker_preferences: Optional[SeekerPreferences] = None


class CompleteProfileRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=1000)
    gender: Optional[UserGender] = None
    phone_number: Optional[str] = Field(default=None, pattern=r"^\+[1-9][0-9]{7,14}$")
    date_of_birth: Optional[datetime] = None
    seeker_preferences: Optional[SeekerPreferences] = None

    @model_validator(mode="after")
    def validate_seeker_details(self) -> "CompleteProfileRequest":
        if self.date_of_birth:
            if self.date_of_birth.date() >= datetime.now(timezone.utc).date():
                raise ValueError("Date of birth must be in the past.")
            if self.date_of_birth.tzinfo is None:
                self.date_of_birth = self.date_of_birth.replace(tzinfo=timezone.utc)
        if self.seeker_preferences is not None:
            if not self.phone_number or not self.date_of_birth or self.gender is None:
                raise ValueError("Date of birth, gender and phone number are required.")
            if self.bio and len(self.bio) > 200:
                raise ValueError("Short bio must be at most 200 characters.")
        return self

    @field_validator("display_name", mode="before")
    @classmethod
    def require_display_name(cls, value: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Display name is required.")
        return value.strip()


class UserRoleUpdateRequest(BaseModel):
    """Admin-only role change."""
    role: UserRole


class DeviceResponse(BaseModel):
    model_config = _orm_config

    id: str
    name: Optional[str] = None
    browser: Optional[str] = None
    os: Optional[str] = None
    device_type: Optional[str] = None
    is_trusted: bool
    last_seen_at: datetime
    created_at: datetime


class SessionResponse(BaseModel):
    model_config = _orm_config

    id: str
    ip_address: str
    location: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_used_at: datetime


#  LISTING SCHEMAS
class ListingCreateRequest(BaseModel):
    title: str = Field(min_length=10, max_length=200)
    description: str = Field(min_length=20, max_length=5000)
    property_type: PropertyType
    address: str = Field(min_length=5, max_length=500)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    country: str = Field(min_length=2, max_length=100)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    monthly_rent: int = Field(gt=0, description="Monthly rent in cents")
    security_deposit: Optional[int] = Field(default=None, ge=0)
    utilities_included: bool = False
    gender_preference: GenderPreference = GenderPreference.ANY
    max_occupants: int = Field(default=1, ge=1, le=20)
    available_from: Optional[datetime] = None
    amenities: Optional[list[str]] = None

    @field_validator("title", "description", "address", "city", "state", "country", mode="before")
    @classmethod
    def strip_strings(cls, v: str) -> str:
        return v.strip()

    @field_validator("amenities")
    @classmethod
    def validate_amenities(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return None
        # Sanitise each amenity
        cleaned = [a.strip()[:100] for a in v if a.strip()]
        return cleaned[:30]  # Max 30 amenities


class ListingUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=10, max_length=200)
    description: Optional[str] = Field(default=None, min_length=20, max_length=5000)
    property_type: Optional[PropertyType] = None
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    monthly_rent: Optional[int] = Field(default=None, gt=0)
    security_deposit: Optional[int] = Field(default=None, ge=0)
    utilities_included: Optional[bool] = None
    gender_preference: Optional[GenderPreference] = None
    max_occupants: Optional[int] = Field(default=None, ge=1, le=20)
    available_from: Optional[datetime] = None
    amenities: Optional[list[str]] = None
    is_available: Optional[bool] = None


class ListingImageResponse(BaseModel):
    model_config = _orm_config

    id: str
    cdn_url: Optional[str] = None
    thumbnail_cdn_url: Optional[str] = None
    is_primary: bool
    sort_order: int


class ListingOwnerResponse(BaseModel):
    model_config = _orm_config
    id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole


class ListingResponse(BaseModel):
    model_config = _orm_config

    id: str
    owner_id: str
    owner: ListingOwnerResponse
    title: str
    description: str
    property_type: PropertyType
    address: str
    city: str
    state: str
    country: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    monthly_rent: int
    security_deposit: Optional[int] = None
    utilities_included: bool
    gender_preference: GenderPreference
    max_occupants: int
    available_from: Optional[datetime] = None
    amenities: Optional[list[str]] = None
    is_available: bool
    view_count: int
    images: list[ListingImageResponse] = []
    created_at: datetime
    updated_at: datetime

    @field_validator("amenities", mode="before")
    @classmethod
    def parse_amenities(cls, v: Any) -> Optional[list[str]]:
        if isinstance(v, str):
            return [a.strip() for a in v.split(",") if a.strip()]
        return v


class PublicListingOwner(BaseModel):
    model_config = _orm_config

    display_name: Optional[str] = None


class PublicListingResponse(BaseModel):
    """Published listing data only; never expose account/contact/session fields."""
    model_config = _orm_config

    id: str
    owner: PublicListingOwner
    title: str
    description: str
    property_type: PropertyType
    address: str
    city: str
    state: str
    country: str
    monthly_rent: int = Field(description="Monthly rent in minor units (kobo for NGN)")
    available_from: Optional[datetime] = None
    amenities: Optional[list[str]] = None
    is_available: bool
    images: list[ListingImageResponse] = []
    created_at: datetime

    @field_validator("amenities", mode="before")
    @classmethod
    def parse_amenities(cls, value: Any) -> Optional[list[str]]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


class ListingSearchParams(BaseModel):
    city: Optional[str] = None
    area: Optional[str] = Field(default=None, max_length=100)
    min_rent: Optional[int] = Field(default=None, ge=0)
    max_rent: Optional[int] = Field(default=None, ge=0)
    gender_preference: Optional[GenderPreference] = None
    property_type: Optional[PropertyType] = None
    amenities: Optional[list[str]] = None
    available_from: Optional[datetime] = None
    sort_by: str = Field(default="created_at", pattern=r"^(created_at|monthly_rent|view_count)$")
    sort_order: str = Field(default="desc", pattern=r"^(asc|desc)$")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def validate_rent_range(self) -> "ListingSearchParams":
        if self.min_rent is not None and self.max_rent is not None:
            if self.min_rent > self.max_rent:
                raise ValueError("min_rent must be less than or equal to max_rent")
        return self


#  CHAT SCHEMAS
class ConversationCreateRequest(BaseModel):
    participant_id: str = Field(pattern=r"^RMF-\d{6}$", description="Account ID of the other participant")


class ChatUserResponse(BaseModel):
    model_config = _orm_config
    id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    location: Optional[str] = Field(default=None, validation_alias=AliasPath("seeker_preferences", "preferred_location"))
    role: UserRole
    is_phone_verified: bool = False

    @model_validator(mode="before")
    @classmethod
    def respect_profile_audience(cls, value: Any, info: ValidationInfo):
        from app.api.v1.models.models import User
        from app.utils.profile_privacy import can_view_profile
        if isinstance(value, User):
            viewer = (info.context or {}).get("viewer")
            visible = viewer is not None and can_view_profile(value, viewer)
            return {"id": value.id, "display_name": value.display_name, "avatar_url": value.avatar_url,
                "role": value.role, "is_phone_verified": value.is_phone_verified,
                "seeker_preferences": value.seeker_preferences if visible else None}
        return value


class ConversationResponse(BaseModel):
    model_config = _orm_config

    id: str
    participants: list["ConversationParticipantResponse"] = []
    last_message: Optional["ChatMessageResponse"] = None
    last_message_at: Optional[datetime] = None
    created_at: datetime


class ConversationParticipantResponse(BaseModel):
    model_config = _orm_config

    id: str
    user: ChatUserResponse
    is_muted: bool
    is_archived: bool
    is_pinned: bool
    unread_count: int
    last_read_at: Optional[datetime] = None
    joined_at: datetime


class SendMessageRequest(BaseModel):
    encrypted_content: str = Field(min_length=1, max_length=65536)
    encryption_nonce: str = Field(min_length=1, max_length=100)
    message_type: MessageType = MessageType.TEXT
    reply_to_id: Optional[str] = None


class ChatMessageResponse(BaseModel):
    model_config = _orm_config

    id: str
    conversation_id: str
    sender_id: str
    message_type: MessageType
    encrypted_content: Optional[str] = None
    encryption_nonce: Optional[str] = None
    is_edited: bool
    is_deleted: bool
    reply_to_id: Optional[str] = None
    delivered_at: Optional[datetime] = None
    seen_at: Optional[datetime] = None
    created_at: datetime


class EditMessageRequest(BaseModel):
    encrypted_content: str = Field(min_length=1, max_length=65536)
    encryption_nonce: str = Field(min_length=1, max_length=100)


class ReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=10)


class ChatKeyRequest(BaseModel):
    public_key: str = Field(min_length=10, max_length=10000)


class ChatKeyResponse(BaseModel):
    model_config = _orm_config

    user_id: str
    public_key: str
    key_version: int
    updated_at: datetime


class TypingIndicatorPayload(BaseModel):
    conversation_id: str
    is_typing: bool


class ConversationSettingsRequest(BaseModel):
    is_muted: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_pinned: Optional[bool] = None


#  CALL SCHEMAS
class InitiateCallRequest(BaseModel):
    callee_id: str
    call_type: CallType
    conversation_id: Optional[str] = None


class CallResponse(BaseModel):
    model_config = _orm_config

    id: str
    caller_id: str
    callee_id: str
    call_type: CallType
    status: CallStatus
    duration_seconds: Optional[int] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime


class WebRTCConfig(BaseModel):
    """ICE server configuration returned to authenticated clients."""
    ice_servers: list[dict[str, Any]]
    ttl: int = 3600


# WebSocket signal types
class WebSocketSignal(BaseModel):
    type: str  # offer | answer | ice-candidate | call-invite | call-accept | call-reject | call-end
    call_id: str
    payload: Optional[dict[str, Any]] = None
    from_user: Optional[str] = None
    to_user: Optional[str] = None


#  NOTIFICATION SCHEMAS
class NotificationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    new_messages: bool = True
    new_rooms: bool = True
    new_matching_roommates: bool = True
    listing_unavailable: bool = True
    saved_listing_updates: bool = True
    login_alerts: bool = True
    verification_updates: bool = True
    account_activity: bool = True
    product_updates: bool = True
    promotions: bool = True


class NotificationResponse(BaseModel):
    model_config = _orm_config

    id: str
    notification_type: NotificationType
    title: str
    body: str
    data: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime


class MarkNotificationsReadRequest(BaseModel):
    notification_ids: list[str] = Field(min_length=1, max_length=100)


#  HEALTH SCHEMAS
class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str


class ReadinessResponse(BaseModel):
    status: str
    database: bool
    redis: bool
    version: str


#  PASSWORD RESET SCHEMAS
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=6, max_length=50)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not _PASSWORD_PATTERN.fullmatch(v):
            raise ValueError(
                "Password must be 6-50 characters and contain at least "
                "one uppercase letter, one lowercase letter, one number, and one special character."
            )
        return v

# GOOGLE OAUTH SCHEMAS

class GoogleAuthURLResponse(BaseModel):
    auth_url: str


class GoogleCallbackRequest(BaseModel):
    """Code exchange using state and the cookie from the authorization request."""
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


class SocialLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: "UserPublicResponse"
    is_new_user: bool = False
