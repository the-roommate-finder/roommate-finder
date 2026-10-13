from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from fastapi import HTTPException, Request, status
from jose import JWTError
from redis.asyncio import Redis
from user_agents import parse as parse_ua
from sqlalchemy import select

from app.api.v1.models.models import (
    SecurityEventType,
    User,
    UserRole,
    Device,
    NotificationType,
)
from app.api.v1.repositories.auth_repository import (
    EmailVerificationRepository,
    PhoneVerificationRepository,
)
from app.api.v1.repositories.user_repository import (
    DeviceRepository,
    LoginAttemptRepository,
    RefreshTokenRepository,
    SecurityEventRepository,
    UserRepository,
    UserSessionRepository,
)
from app.api.v1.schemas.schemas import (
    LoginResponse,
    RefreshTokenResponse,
    RegisterResponse,
    UserPublicResponse,
)
from app.core.config import settings
from app.api.v1.services.notification_service import NotificationRepository, NotificationService
from app.core.security import (
    _sha256_hex,
    create_access_token,
    decode_access_token,
    generate_otp,
    generate_refresh_token,
    generate_secure_token,
    generate_session_id,
    hash_password,
    hash_refresh_token,
    password_needs_rehash,
    verify_otp,
    verify_password,
)
from app.workers.tasks import (
    send_otp_email,
    send_otp_sms,
    send_password_reset_email,
    send_security_alert_email,
)

logger = structlog.get_logger(__name__)

# Redis key prefixes
_LOCKOUT_PREFIX = "auth:lockout:"
_FAIL_COUNT_PREFIX = "auth:fails:"
_BLACKLIST_PREFIX = "auth:blacklist:"
_TOKEN_BLACKLIST_PREFIX = "auth:revoked:"


class AuthService:
    def __init__(
        self,
        user_repo: UserRepository,
        ev_repo: EmailVerificationRepository,
        pv_repo: PhoneVerificationRepository,
        attempt_repo: LoginAttemptRepository,
        session_repo: UserSessionRepository,
        rt_repo: RefreshTokenRepository,
        device_repo: DeviceRepository,
        security_repo: SecurityEventRepository,
        redis: Redis,  # type: ignore[type-arg]
    ) -> None:
        self._users = user_repo
        self._ev = ev_repo
        self._pv = pv_repo
        self._attempts = attempt_repo
        self._sessions = session_repo
        self._rt = rt_repo
        self._devices = device_repo
        self._security = security_repo
        self._redis = redis

    #  Registration 
    async def register(
        self,
        email: str,
        password: str,
        *,
        display_name: Optional[str] = None,
        phone_number: Optional[str] = None,
        role: UserRole = UserRole.SEEKER,
    ) -> RegisterResponse:
        """
        Create a new user account and send OTP verification email.
        Raises 409 if email (or phone number, if provided) already exists.
        """
        if await self._users.email_exists(email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        if phone_number and await self._users.phone_exists(phone_number):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this phone number already exists.",
            )

        hashed = hash_password(password)
        user = await self._users.create_user(
            email=email,
            hashed_password=hashed,
            role=role,
            display_name=display_name,
            phone_number=phone_number,
        )

        await self._send_otp(user)

        logger.info("user_registered", user_id=user.id, email=email, role=role.value)

        return RegisterResponse(
            id=user.id,
            email=user.email,
            role=user.role,
            display_name=user.display_name,
            phone_number=user.phone_number,
            is_email_verified=user.is_email_verified,
            created_at=user.created_at,
        )

    #  Email Verification 
    async def verify_email(self, email: str, otp: str, request: Request) -> LoginResponse:
        """
        Validate the OTP and activate the user account.
        Enforces max-attempts and expiry.
        """
        user = await self._users.get_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this email.",
            )
        if user.is_email_verified:
            raise HTTPException(status_code=400, detail="Email is already verified. Please log in.")

        record = await self._ev.get_latest_unused(user.id)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active OTP found. Please request a new one.",
            )

        if record.attempts >= settings.OTP_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Maximum verification attempts reached. Please request a new OTP.",
            )

        await self._ev.increment_attempts(record)

        if not verify_otp(otp, record.otp_hash):
            remaining = max(0, settings.OTP_MAX_ATTEMPTS - record.attempts)
            # get_db rolls back HTTP errors; persist this security counter first.
            await self._ev.db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid OTP. {remaining} attempt(s) remaining.",
            )

        await self._ev.mark_used(record)
        await self._users.activate_user(user)

        await self._security.log(
            user_id=user.id,
            event_type=SecurityEventType.OTP_VERIFIED,
        )

        logger.info("email_verified", user_id=user.id)
        return await self._issue_session(user, request)

    async def resend_otp(self, email: str) -> dict:
        """
        Issue a new OTP for an unverified user.
        Enforces resend rate limit.
        """
        user = await self._users.get_by_email(email)
        if not user:
            # Don't reveal existence
            return {"message": "If the email exists, a new OTP has been sent."}
        if user.is_email_verified:
            return {"message": "Email is already verified."}

        # Resend rate-limit: max 2 per 10 minutes
        ten_min_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
        recent = await self._ev.count_recent_resends(user.id, since=ten_min_ago)
        if recent >= 2:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many OTP requests. Please wait before requesting another.",
            )

        await self._send_otp(user)
        return {"message": "A new OTP has been sent to your email."}

    #  Phone Verification 
    async def send_phone_otp(self, phone_number: str) -> dict:
        """
        Issue an OTP for a phone number captured at registration.
        Public endpoint, keyed by phone number — mirrors resend_otp for email.
        Enforces the same resend rate limit.
        """
        user = await self._users.get_by_phone(phone_number)
        if not user:
            # Don't reveal existence
            return {"message": "If that phone number is on an account, a code has been sent."}
        if user.is_phone_verified:
            return {"message": "Phone number is already verified."}

        ten_min_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
        recent = await self._pv.count_recent_resends(user.id, phone_number, since=ten_min_ago)
        if recent >= 2:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many OTP requests. Please wait before requesting another.",
            )

        await self._pv.invalidate_previous(user.id, phone_number)

        plain_otp, otp_hash = generate_otp()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
        await self._pv.create_otp(
            user_id=user.id,
            phone_number=phone_number,
            otp_hash=otp_hash,
            expires_at=expires_at,
        )

        send_otp_sms.delay(
            phone_number=phone_number,
            otp=plain_otp,
            expires_minutes=settings.OTP_EXPIRE_MINUTES,
        )

        return {"message": "A verification code has been sent to your phone number."}

    async def verify_phone_otp(self, phone_number: str, otp: str, request: Request) -> LoginResponse:
        """
        Validate the OTP and mark the phone number as verified.
        Enforces max-attempts and expiry, same as email verification.
        """
        user = await self._users.get_by_phone(phone_number)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this phone number.",
            )
        if user.is_phone_verified:
            raise HTTPException(status_code=400, detail="Phone number is already verified. Please log in.")

        record = await self._pv.get_latest_unused(user.id, phone_number)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active OTP found. Please request a new one.",
            )

        if record.attempts >= settings.OTP_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Maximum verification attempts reached. Please request a new OTP.",
            )

        await self._pv.increment_attempts(record)

        if not verify_otp(otp, record.otp_hash):
            remaining = max(0, settings.OTP_MAX_ATTEMPTS - record.attempts)
            await self._pv.db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid OTP. {remaining} attempt(s) remaining.",
            )

        await self._pv.mark_used(record)
        await self._users.activate_phone(user)

        await self._security.log(
            user_id=user.id,
            event_type=SecurityEventType.OTP_VERIFIED,
        )

        logger.info("phone_verified", user_id=user.id)
        return await self._issue_session(user, request)

    #  Login 
    async def login(
        self,
        password: str,
        *,
        email: Optional[str] = None,
        phone_number: Optional[str] = None,
        request: Request,
        device_name: Optional[str] = None,
    ) -> LoginResponse:
        """
        Authenticate a user by email or phone number, and issue access +
        refresh tokens. Tracks attempts, enforces lockout, records device.
        """
        identifier = email or phone_number
        assert identifier, "login() requires either email or phone_number"

        ip = _get_client_ip(request)
        ua_string = request.headers.get("User-Agent", "")
        ua = parse_ua(ua_string)
        location = await self._resolve_location(ip)
        device_fp = _device_fingerprint(ip, ua_string)

        #  Check lockout 
        lockout_key = f"{_LOCKOUT_PREFIX}{identifier}"
        is_locked = await self._redis.get(lockout_key)
        if is_locked:
            ttl = await self._redis.ttl(lockout_key)
            locked_until = datetime.now(timezone.utc) + timedelta(seconds=max(ttl, 0))
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "error": "account_locked",
                    "message": (
                        "Account is temporarily locked due to repeated failed attempts. "
                        f"Try again in {ttl // 60} minute(s)."
                    ),
                    "locked_until": locked_until.isoformat(),
                },
            )

        #  Validate credentials 
        user = (
            await self._users.get_by_email(email)
            if email
            else await self._users.get_by_phone(phone_number)  # type: ignore[arg-type]
        )

        if not user or not verify_password(password, user.hashed_password):
            await self._handle_failed_login(
                user=user,
                email=identifier,
                ip=ip,
                ua_string=ua_string,
                device_fp=device_fp,
                location=location,
                reason="invalid_credentials",
            )
            # Fail count for user-facing message
            fail_key = f"{_FAIL_COUNT_PREFIX}{identifier}"
            fail_count = int(await self._redis.get(fail_key) or 0)
            remaining = max(0, settings.LOGIN_MAX_ATTEMPTS - fail_count)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "authentication_failed",
                    "message": "Invalid credentials.",
                    "attempts_remaining": remaining,
                },
            )

        if not user.is_email_verified and not user.is_phone_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please verify your account before logging in.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated.",
            )

        #  Transparent password rehash 
        if password_needs_rehash(user.hashed_password):
            await self._users.rehash_password(user, hash_password(password))

        #  Clear failure counters 
        await self._redis.delete(
            f"{_FAIL_COUNT_PREFIX}{identifier}",
            f"{_LOCKOUT_PREFIX}{identifier}",
        )

        return await self._issue_session(user, request, device_name)

    async def _issue_session(
        self, user: User, request: Request, device_name: Optional[str] = None
    ) -> LoginResponse:
        """Issue tokens and record a session after credentials or a fresh OTP pass."""
        ip = _get_client_ip(request)
        ua_string = request.headers.get("User-Agent", "")
        ua = parse_ua(ua_string)
        location = await self._resolve_location(ip)
        device_fp = _device_fingerprint(ip, ua_string)
        identifier = user.email

        #  Record device 
        await self._notify_unfamiliar_login(user, device_fp, location, successful=True)
        device = await self._devices.upsert_device(
            user_id=user.id,
            fingerprint=device_fp,
            name=device_name or _build_device_name(ua),
            browser=ua.browser.family,
            os=ua.os.family,
            device_type="mobile" if ua.is_mobile else "tablet" if ua.is_tablet else "desktop",
        )

        #  Issue tokens 
        access_token = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role.value, "email": user.email},
        )
        raw_refresh, refresh_hash = generate_refresh_token()

        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
        await self._rt.create_token(
            user_id=user.id,
            token_hash=refresh_hash,
            device_id=device.id,
            expires_at=expires_at,
        )

        #  Session 
        session_id = generate_session_id()
        await self._sessions.create(
            user_id=user.id,
            device_id=device.id,
            session_token_hash=session_id,
            ip_address=ip,
            user_agent=ua_string[:500],
            location=location,
            expires_at=expires_at,
        )

        #  Record success 
        await self._attempts.create_attempt(
            user_id=user.id,
            email=identifier,
            ip_address=ip,
            user_agent=ua_string,
            device_fingerprint=device_fp,
            is_success=True,
            location=location,
        )
        await self._security.log(
            user_id=user.id,
            event_type=SecurityEventType.LOGIN_SUCCESS,
            ip_address=ip,
            user_agent=ua_string,
            location=location,
        )
        await self._users.update_last_active(user.id)

        logger.info("user_logged_in", user_id=user.id, ip=ip)

        return LoginResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
            expires_in=settings.access_token_expire_seconds,
            user=UserPublicResponse.model_validate(user),
        )

    #  Token Refresh 
    async def refresh_tokens(self, raw_refresh_token: str) -> RefreshTokenResponse:
        """
        Rotate the refresh token: revoke old, issue new access + refresh pair.
        """
        token_hash = hash_refresh_token(raw_refresh_token)
        record = await self._rt.get_active_by_hash(token_hash)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token.",
            )

        # Revoke old token (rotation)
        await self._rt.revoke(record)

        user = await self._users.get_by_id(record.user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is no longer active.",
            )

        # Issue new tokens
        access_token = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role.value, "email": user.email},
        )
        new_raw, new_hash = generate_refresh_token()
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
        await self._rt.create_token(
            user_id=user.id,
            token_hash=new_hash,
            device_id=record.device_id,
            expires_at=expires_at,
        )

        return RefreshTokenResponse(
            access_token=access_token,
            refresh_token=new_raw,
            expires_in=settings.access_token_expire_seconds,
        )

    #  Logout 
    async def logout(
        self,
        *,
        raw_refresh_token: str,
        all_devices: bool,
        user_id: str,
        access_token: str,
    ) -> None:
        """
        Revoke the refresh token (and optionally all tokens for the user).
        Blacklist the current access token in Redis until it expires.
        """
        # Blacklist current access token
        try:
            payload = decode_access_token(access_token)
            exp = payload.get("exp", 0)
            ttl = max(0, exp - int(datetime.now(timezone.utc).timestamp()))
            if ttl > 0:
                blacklist_key = f"{_TOKEN_BLACKLIST_PREFIX}{access_token}"
                await self._redis.setex(blacklist_key, ttl, "1")
        except JWTError:
            pass  # Token already invalid — nothing to blacklist

        if all_devices:
            await self._rt.revoke_all_for_user(user_id)
            await self._sessions.deactivate_user_sessions(user_id)
        else:
            token_hash = hash_refresh_token(raw_refresh_token)
            record = await self._rt.get_active_by_hash(token_hash)
            if record:
                await self._rt.revoke(record)

        await self._security.log(
            user_id=user_id,
            event_type=SecurityEventType.LOGOUT,
        )

    async def is_token_blacklisted(self, raw_access_token: str) -> bool:
        key = f"{_TOKEN_BLACKLIST_PREFIX}{raw_access_token}"
        return bool(await self._redis.exists(key))

    #  Password Change 
    async def change_password(
        self, user: User, current_password: str, new_password: str
    ) -> None:
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )

        await self._users.rehash_password(user, hash_password(new_password))

        # Revoke all sessions — force re-login on all devices
        await self._rt.revoke_all_for_user(user.id)
        await self._sessions.deactivate_user_sessions(user.id)

        await self._security.log(
            user_id=user.id,
            event_type=SecurityEventType.PASSWORD_CHANGED,
        )

        logger.info("password_changed", user_id=user.id)

    #  Internal helpers 
    async def _send_otp(self, user: User) -> None:
        """Generate and dispatch a new OTP for email verification."""
        await self._ev.invalidate_previous(user.id)

        plain_otp, otp_hash = generate_otp()
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.OTP_EXPIRE_MINUTES
        )
        await self._ev.create_otp(
            user_id=user.id,
            otp_hash=otp_hash,
            expires_at=expires_at,
        )

        # Dispatch via Celery worker — never log the OTP itself
        send_otp_email.delay(
            user_email=user.email,
            otp=plain_otp,
            expires_minutes=settings.OTP_EXPIRE_MINUTES,
        )

    async def _handle_failed_login(
        self,
        *,
        user: Optional[User],
        email: str,
        ip: str,
        ua_string: str,
        device_fp: str,
        location: Optional[str],
        reason: str,
    ) -> None:
        await self._attempts.create_attempt(
            user_id=user.id if user else None,
            email=email,
            ip_address=ip,
            user_agent=ua_string,
            device_fingerprint=device_fp,
            is_success=False,
            failure_reason=reason,
            location=location,
        )

        if user:
            await self._security.log(
                user_id=user.id,
                event_type=SecurityEventType.LOGIN_FAILED,
                ip_address=ip,
                user_agent=ua_string,
                location=location,
            )

        # Increment failure counter
        fail_key = f"{_FAIL_COUNT_PREFIX}{email}"
        fail_count = await self._redis.incr(fail_key)
        await self._redis.expire(fail_key, settings.lockout_expire_seconds)
        if user and fail_count == 1:
            await self._notify_unfamiliar_login(user, device_fp, location, successful=False)

        if fail_count >= settings.LOGIN_MAX_ATTEMPTS:
            # Lock account
            lockout_key = f"{_LOCKOUT_PREFIX}{email}"
            await self._redis.setex(
                lockout_key, settings.lockout_expire_seconds, "1"
            )
            if user:
                await self._security.log(
                    user_id=user.id,
                    event_type=SecurityEventType.ACCOUNT_LOCKED,
                    ip_address=ip,
                    user_agent=ua_string,
                    location=location,
                )
                send_security_alert_email.delay(
                    user_email=email,
                    event="account_locked",
                    ip_address=ip,
                    user_agent=ua_string,
                    location=location or "Unknown",
                    lockout_minutes=settings.ACCOUNT_LOCKOUT_MINUTES,
                )
            logger.warning("account_locked", email=email, ip=ip)

        # The caller returns HTTP 401; preserve the attempt, audit and alert first.
        await self._users.db.commit()

    async def _notify_unfamiliar_login(self, user, fingerprint, location, *, successful):
        known = (await self._users.db.execute(select(Device.fingerprint).where(Device.user_id == user.id))).scalars().all()
        if not known or fingerprint in known:
            return
        await NotificationService(NotificationRepository(self._users.db)).create_notification(
            user_id=user.id, notification_type=NotificationType.SECURITY_ALERT,
            title="New device signed in" if successful else "Unfamiliar login attempt",
            body=("Your account was signed into from an unfamiliar device." if successful
                  else "An unsuccessful login attempt was made from an unfamiliar device.")
                 + (f" Location: {location}." if location else ""),
        )

    async def _resolve_location(self, ip: str) -> Optional[str]:
        """Attempt to resolve a human-readable location from IP. Never raises."""
        try:
            import geoip2.database

            with geoip2.database.Reader(settings.GEOIP_DB_PATH) as reader:
                response = reader.city(ip)
                parts = [
                    response.city.name,
                    response.subdivisions.most_specific.name,
                    response.country.name,
                ]
                return ", ".join(p for p in parts if p)
        except Exception:
            return None



    #  Forgot Password 
    async def forgot_password(self, email: str) -> dict:
        """
        Generate a password reset token and email it to the user.
        Always returns the same response to prevent email enumeration.
        """
        from app.api.v1.repositories.auth_repository import PasswordResetRepository
        from app.workers.tasks import send_password_reset_email

        user = await self._users.get_by_email(email)

        if user and user.is_active and user.is_email_verified:
            raw_token = generate_secure_token(32)
            token_hash = _sha256_hex(raw_token)

            expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

            pr_repo = PasswordResetRepository(self._users.db)
            await pr_repo.create_token(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires_at,
            )

            send_password_reset_email.delay(
                user_email=email,
                token=raw_token,
                expires_minutes=30,
            )

            logger.info("password_reset_requested", user_id=user.id)

        # Always return same message — never reveal if email exists
        return {
            "message": (
                "If an account with that email exists, "
                "a password reset link has been sent."
            )
        }

    async def reset_password(self, token: str, new_password: str) -> dict:
        """
        Validate the reset token and set the new password.
        Revokes all sessions after a successful reset.
        """
        from app.api.v1.repositories.auth_repository import PasswordResetRepository

        token_hash = _sha256_hex(token)
        pr_repo = PasswordResetRepository(self._users.db)
        record = await pr_repo.get_valid_by_hash(token_hash)

        if not record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token.",
            )

        user = await self._users.get_by_id(record.user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token.",
            )

        # Set new password
        await self._users.rehash_password(user, hash_password(new_password))

        # Mark token as used
        await pr_repo.mark_used(record)

        # Revoke all sessions — force re-login everywhere
        await self._rt.revoke_all_for_user(user.id)
        await self._sessions.deactivate_user_sessions(user.id)

        await self._security.log(
            user_id=user.id,
            event_type=SecurityEventType.PASSWORD_CHANGED,
        )

        logger.info("password_reset_completed", user_id=user.id)

        return {"message": "Password reset successful. Please log in with your new password."}


#  Standalone helpers 
def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _device_fingerprint(ip: str, ua_string: str) -> str:
    """Simple deterministic fingerprint from IP + UA. Not a tracking cookie."""
    import hashlib
    raw = f"{ip}|{ua_string}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


def _build_device_name(ua: any) -> str:  # type: ignore[valid-type]
    parts = []
    if ua.browser.family:
        parts.append(ua.browser.family)
    if ua.os.family:
        parts.append(f"on {ua.os.family}")
    return " ".join(parts) or "Unknown Device"
