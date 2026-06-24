from __future__ import annotations

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from app.api.v1.dependencies import AuthServiceDep, CurrentUser
from app.api.v1.schemas.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    MessageResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    RegisterRequest,
    RegisterResponse,
    ResendOTPRequest,
    VerifyEmailRequest,
)
from app.core.rate_limit import LOGIN_LIMIT, OTP_RESEND_LIMIT, REGISTER_LIMIT, limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
    description=(
        "Creates a new user with email and password. "
        "Sends a 6-digit OTP to the provided email. "
        "The account is inactive until the OTP is verified."
    ),
    responses={
        409: {"description": "Email already registered"},
        422: {"description": "Validation error"},
        429: {"description": "Rate limit exceeded"},
    },
)
@limiter.limit(REGISTER_LIMIT)
async def register(
    request: Request,
    body: RegisterRequest,
    auth_service: AuthServiceDep,
) -> RegisterResponse:
    return await auth_service.register(email=body.email, password=body.password)


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify email with OTP",
    description=(
        "Verifies the email address using the 6-digit OTP sent during registration. "
        "The account is activated on success. Maximum 5 attempts per OTP."
    ),
    responses={
        400: {"description": "Invalid or expired OTP"},
        404: {"description": "User not found"},
        429: {"description": "Max attempts exceeded"},
    },
)
async def verify_email(
    body: VerifyEmailRequest,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    result = await auth_service.verify_email(email=body.email, otp=body.otp)
    return MessageResponse(message=result["message"])


@router.post(
    "/resend-otp",
    response_model=MessageResponse,
    summary="Resend email verification OTP",
    description=(
        "Issues a new OTP for an unverified account. "
        "Previous OTPs are invalidated. Limited to 2 requests per 10 minutes."
    ),
    responses={
        429: {"description": "Too many resend requests"},
    },
)
@limiter.limit(OTP_RESEND_LIMIT)
async def resend_otp(
    request: Request,
    body: ResendOTPRequest,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    result = await auth_service.resend_otp(email=body.email)
    return MessageResponse(message=result["message"])


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Authenticate and obtain tokens",
    description=(
        "Authenticate with email and password. "
        "Returns a JWT access token (15min) and a refresh token (7 days). "
        "Account is locked after 3 consecutive failures for 60 minutes. "
        "A security alert email is sent on lockout."
    ),
    responses={
        401: {"description": "Invalid credentials"},
        403: {"description": "Email not verified or account inactive"},
        423: {"description": "Account locked"},
        429: {"description": "Rate limit exceeded"},
    },
)
@limiter.limit(LOGIN_LIMIT)
async def login(
    request: Request,
    body: LoginRequest,
    auth_service: AuthServiceDep,
) -> LoginResponse:
    return await auth_service.login(
        email=body.email,
        password=body.password,
        request=request,
        device_name=body.device_name,
    )


@router.post(
    "/refresh",
    response_model=RefreshTokenResponse,
    summary="Rotate refresh token",
    description=(
        "Exchange a valid refresh token for a new access + refresh token pair. "
        "The old refresh token is immediately revoked (rotation)."
    ),
    responses={
        401: {"description": "Invalid or expired refresh token"},
    },
)
async def refresh_tokens(
    body: RefreshTokenRequest,
    auth_service: AuthServiceDep,
) -> RefreshTokenResponse:
    return await auth_service.refresh_tokens(body.refresh_token)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Revoke tokens and end session",
    description=(
        "Revokes the provided refresh token and blacklists the current access token. "
        "Set `all_devices=true` to revoke all sessions across all devices."
    ),
)
async def logout(
    body: LogoutRequest,
    request: Request,
    auth_service: AuthServiceDep,
    current_user: CurrentUser,
) -> MessageResponse:
    raw_access = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    await auth_service.logout(
        raw_refresh_token=body.refresh_token,
        all_devices=body.all_devices,
        user_id=current_user.id,
        access_token=raw_access,
    )
    return MessageResponse(
        message=(
            "Logged out from all devices."
            if body.all_devices
            else "Logged out successfully."
        )
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change account password",
    description=(
        "Change the authenticated user's password. "
        "All existing sessions are revoked after a successful change."
    ),
    responses={
        400: {"description": "Current password incorrect"},
        401: {"description": "Not authenticated"},
    },
)
async def change_password(
    body: ChangePasswordRequest,
    auth_service: AuthServiceDep,
    current_user: CurrentUser,
) -> MessageResponse:
    await auth_service.change_password(
        current_user,
        body.current_password,
        body.new_password,
    )
    return MessageResponse(
        message="Password changed successfully. Please log in again."
    )
