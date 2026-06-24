from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def _get_client_identifier(request: Request) -> str:
    """
    Returns the best available client identifier for rate limiting.

    Priority:
      1. Authenticated user's UUID (prevents anonymous bypass via IP rotation)
      2. X-Forwarded-For header (when behind a trusted proxy/load balancer)
      3. Direct remote IP address
    """
    user = getattr(request.state, "user", None)
    if user is not None and hasattr(user, "id"):
        return f"user:{user.id}"

    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
        if client_ip:
            return f"ip:{client_ip}"

    return f"ip:{get_remote_address(request)}"


# Use in-memory backend during testing to avoid requiring Redis
_TESTING = os.getenv("TESTING", "false").lower() == "true"
_storage_uri = "memory://" if _TESTING else settings.REDIS_URL

# Shared limiter instance — imported by routers
limiter = Limiter(
    key_func=_get_client_identifier,
    storage_uri=_storage_uri,
    strategy="fixed-window",
    default_limits=[settings.RATE_LIMIT_API_DEFAULT],
    headers_enabled=True,
    swallow_errors=True,  # Degrade gracefully if Redis is unreachable
)


#  Named limit strings 
LOGIN_LIMIT = settings.RATE_LIMIT_LOGIN
REGISTER_LIMIT = settings.RATE_LIMIT_REGISTER
OTP_RESEND_LIMIT = settings.RATE_LIMIT_OTP_RESEND
LISTING_LIMIT = settings.RATE_LIMIT_LISTING
CHAT_LIMIT = settings.RATE_LIMIT_CHAT
