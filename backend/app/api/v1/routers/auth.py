from fastapi import APIRouter, Request, Response, status

from app.api.v1.dependencies import AuthServiceDep, CurrentUser
from app.api.v1.schemas.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    MessageResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    RegisterRequest,
    RegisterResponse,
    ResendOTPRequest,
    ResetPasswordRequest,
    SendPhoneOTPRequest,
    VerifyEmailRequest,
    VerifyPhoneOTPRequest,
)
from app.core.rate_limit import LOGIN_LIMIT, OTP_RESEND_LIMIT, REGISTER_LIMIT, limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
@limiter.limit(REGISTER_LIMIT)
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    auth_service: AuthServiceDep,
) -> RegisterResponse:
    return await auth_service.register(
        email=body.email,
        password=body.password,
        date_of_birth=body.date_of_birth,
        display_name=body.display_name,
        phone_number=body.phone_number,
        role=body.role,
    )


@router.post(
    "/verify-email",
    response_model=LoginResponse,
    summary="Verify email with OTP",
)
async def verify_email(
    body: VerifyEmailRequest,
    request: Request,
    auth_service: AuthServiceDep,
) -> LoginResponse:
    return await auth_service.verify_email(email=body.email, otp=body.otp, request=request)


@router.post(
    "/resend-otp",
    response_model=MessageResponse,
    summary="Resend email verification OTP",
)
@limiter.limit(OTP_RESEND_LIMIT)
async def resend_otp(
    request: Request,
    response: Response,
    body: ResendOTPRequest,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    result = await auth_service.resend_otp(email=body.email)
    return MessageResponse(message=result["message"])


@router.post(
    "/send-phone-otp",
    response_model=MessageResponse,
    summary="Send/resend phone verification OTP",
)
@limiter.limit(OTP_RESEND_LIMIT)
async def send_phone_otp(
    request: Request,
    response: Response,
    body: SendPhoneOTPRequest,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    result = await auth_service.send_phone_otp(phone_number=body.phone_number)
    return MessageResponse(message=result["message"])


@router.post(
    "/verify-phone-otp",
    response_model=LoginResponse,
    summary="Verify phone number with OTP",
)
async def verify_phone_otp(
    body: VerifyPhoneOTPRequest,
    request: Request,
    auth_service: AuthServiceDep,
) -> LoginResponse:
    return await auth_service.verify_phone_otp(phone_number=body.phone_number, otp=body.otp, request=request)


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Authenticate and obtain tokens",
)
@limiter.limit(LOGIN_LIMIT)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    auth_service: AuthServiceDep,
) -> LoginResponse:
    return await auth_service.login(
        password=body.password,
        email=body.email,
        phone_number=body.phone_number,
        request=request,
        device_name=body.device_name,
    )


@router.post(
    "/refresh",
    response_model=RefreshTokenResponse,
    summary="Rotate refresh token",
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
        message="Logged out from all devices." if body.all_devices else "Logged out successfully."
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change account password",
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
    return MessageResponse(message="Password changed successfully. Please log in again.")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request password reset",
    description="Sends a reset link to the email if an active account exists. Token expires in 30 minutes.",
)
@limiter.limit(REGISTER_LIMIT)
async def forgot_password(
    request: Request,
    response: Response,
    body: ForgotPasswordRequest,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    result = await auth_service.forgot_password(email=body.email)
    return MessageResponse(message=result["message"])


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password using token",
    responses={400: {"description": "Invalid or expired token"}},
)
async def reset_password(
    body: ResetPasswordRequest,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    result = await auth_service.reset_password(
        token=body.token,
        new_password=body.new_password,
    )
    return MessageResponse(message=result["message"])
