"""
app/api/v1/services/google_auth_service.py
Google OAuth2 authentication service.

Flow:
  1. Frontend calls GET /auth/google → gets auth URL
  2. User is redirected to Google consent screen
  3. Google redirects to /auth/google/callback?code=xxx
  4. Backend exchanges code for tokens, fetches profile
  5. User is created or found, JWT tokens returned

No password is stored for social-login users.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
import structlog

from fastapi import HTTPException, Request, Response, status

from app.api.v1.models.models import SecurityEventType, User, UserRole
from app.api.v1.repositories.user_repository import (
    DeviceRepository,
    RefreshTokenRepository,
    SecurityEventRepository,
    UserRepository,
    UserSessionRepository,
)
from app.api.v1.schemas.schemas import SocialLoginResponse, UserPublicResponse
from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
)

logger = structlog.get_logger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_SCOPES = "openid email profile"
OAUTH_STATE_COOKIE = "rmf_google_state"
OAUTH_COOKIE_PATH = f"{settings.API_V1_PREFIX}/auth/google"


class GoogleAuthService:
    def __init__(
        self,
        user_repo: UserRepository,
        rt_repo: RefreshTokenRepository,
        session_repo: UserSessionRepository,
        device_repo: DeviceRepository,
        security_repo: SecurityEventRepository,
        redis,
    ) -> None:
        self._users = user_repo
        self._rt = rt_repo
        self._sessions = session_repo
        self._devices = device_repo
        self._security = security_repo
        self._redis = redis

    # Step 1: Generate Auth URL
    async def get_auth_url(self, response: Response) -> str:
        """
        Generate the Google OAuth2 authorization URL.
        A random state token is stored in Redis to prevent CSRF.
        """
        if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
            raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
        state = secrets.token_urlsafe(32)

        # Store state in Redis for 10 minutes
        await self._redis.setex(f"oauth:state:{state}", 600, "1")
        response.set_cookie(
            OAUTH_STATE_COOKIE, state, max_age=600, httponly=True,
            secure=not settings.is_development, samesite="lax", path=OAUTH_COOKIE_PATH,
        )
        response.headers["Cache-Control"] = "no-store"

        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": GOOGLE_SCOPES,
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }

        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    # ── Step 2: Handle Callback
    async def handle_callback(
        self,
        code: str,
        state: Optional[str],
        request: Request,
    ) -> SocialLoginResponse:
        """
        Exchange the auth code for tokens, fetch Google profile,
        and return our own JWT tokens.
        """
        # Bind the callback to the initiating browser, then atomically consume
        # its state so concurrent callbacks cannot reuse it.
        cookie_state = request.cookies.get(OAUTH_STATE_COOKIE)
        if (
            not state or not cookie_state
            or not secrets.compare_digest(state.encode(), cookie_state.encode())
        ):
            raise HTTPException(status_code=400, detail="Invalid or missing OAuth state.")
        if not await self._redis.getdel(f"oauth:state:{state}"):
            raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

        # Exchange code for Google tokens
        google_tokens = await self._exchange_code(code)

        # Fetch user profile from Google
        profile = await self._fetch_profile(google_tokens["access_token"])

        email = profile.get("email", "").lower().strip()
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not retrieve email from Google account.",
            )

        if not profile.get("email_verified", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google account email is not verified.",
            )

        # Find or create user
        user, is_new = await self._get_or_create_user(email, profile)

        # Issue our JWT tokens
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
            device_id=None,
            expires_at=expires_at,
        )

        # Log security event
        ip = _get_client_ip(request)
        await self._security.log(
            user_id=user.id,
            event_type=SecurityEventType.LOGIN_SUCCESS,
            ip_address=ip,
            user_agent=request.headers.get("User-Agent", ""),
        )
        await self._users.update_last_active(user.id)

        logger.info(
            "google_login",
            user_id=user.id,
            is_new=is_new,
        )

        return SocialLoginResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
            expires_in=settings.access_token_expire_seconds,
            user=UserPublicResponse.model_validate(user),
            is_new_user=is_new,
        )

    # ── Internal helpers ──────────────────────────────────────────────────────
    async def _exchange_code(self, code: str) -> dict:
        """Exchange OAuth code for Google access token."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
                timeout=15,
            )

        if response.status_code != 200:
            logger.error("google_token_exchange_failed", status=response.status_code, body=response.text)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange Google authorization code.",
            )

        return response.json()

    async def _fetch_profile(self, access_token: str) -> dict:
        """Fetch user profile from Google using the access token."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to fetch Google profile.",
            )

        return response.json()

    async def _get_or_create_user(
        self, email: str, profile: dict
    ) -> tuple[User, bool]:
        """
        Find existing user by email or create a new one.
        Social login users are auto-verified and active.
        Returns (user, is_new_user).
        """
        existing = await self._users.get_by_email(email)

        if existing:
            if existing.is_deleted or not existing.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This account has been deactivated.",
                )
            # Update avatar if not set
            if not existing.avatar_url and profile.get("picture"):
                await self._users.update(
                    existing, avatar_url=profile["picture"]
                )
            return existing, False

        # Create new user — no password for social login users
        # A valid hash of an unknown random password keeps password verification
        # safe without providing a usable password for social-login accounts.
        fake_hash = hash_password(secrets.token_urlsafe(64))

        user = await self._users.create_user(
            email=email,
            hashed_password=fake_hash,
            role=UserRole.SEEKER,
        )

        # Auto-activate — Google already verified the email
        await self._users.update(
            user,
            is_active=True,
            is_email_verified=True,
            display_name=profile.get("name"),
            avatar_url=profile.get("picture"),
        )

        # Refresh to get updated fields
        user = await self._users.get_by_id(user.id)

        logger.info("google_user_created", user_id=user.id, email=email)
        return user, True


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
