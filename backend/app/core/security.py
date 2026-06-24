from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

#  Password hashing 
# Argon2id is the preferred algorithm (winner of PHC, resistant to GPU attacks).
# BCrypt is listed as a deprecated fallback to verify legacy hashes.
_pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto",
    argon2__memory_cost=65536,   # 64 MiB
    argon2__time_cost=3,
    argon2__parallelism=2,
)


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using Argon2id. Never store plain passwords."""
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Constant-time comparison. Returns True on match.
    Passlib automatically detects the scheme from the hash string.
    """
    return _pwd_context.verify(plain_password, hashed_password)


def password_needs_rehash(hashed_password: str) -> bool:
    """
    Returns True if the hash was produced with outdated parameters.
    Call this after a successful login to transparently upgrade old hashes.
    """
    return _pwd_context.needs_update(hashed_password)


#  JWT 
def create_access_token(
    subject: str,
    *,
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a signed JWT access token.

    Args:
        subject:      The token subject — typically the user UUID string.
        extra_claims: Additional claims merged into the payload (e.g. role).
        expires_delta: Override the default expiry from settings.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(tz=timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT access token.

    Raises:
        JWTError: on invalid signature, expired token, or wrong type.

    Returns:
        The decoded payload dict.
    """
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )
    if payload.get("type") != "access":
        raise JWTError("Token type mismatch")
    return payload


#  Refresh Tokens 
def generate_refresh_token() -> tuple[str, str]:
    """
    Generate a cryptographically secure refresh token.

    Returns:
        (raw_token, hashed_token) — store only the hash, send only the raw.
    """
    raw = secrets.token_urlsafe(64)
    hashed = _sha256_hex(raw)
    return raw, hashed


def hash_refresh_token(raw_token: str) -> str:
    """Hash a raw refresh token for storage/lookup."""
    return _sha256_hex(raw_token)


#  OTP 
def generate_otp() -> tuple[str, str]:
    """
    Generate a cryptographically secure 6-digit OTP.

    Uses os.urandom-based secrets.choice instead of random.randint to ensure
    cryptographic randomness.

    Returns:
        (plain_otp, hashed_otp) — store only the hash, email only the plain.
    """
    digits = string.digits
    otp = "".join(secrets.choice(digits) for _ in range(6))
    hashed = _sha256_hex(otp)
    return otp, hashed


def hash_otp(plain_otp: str) -> str:
    """Hash a plain OTP for storage comparison."""
    return _sha256_hex(plain_otp)


def verify_otp(plain_otp: str, hashed_otp: str) -> bool:
    """
    Constant-time OTP comparison.
    Prevents timing attacks by using hmac.compare_digest.
    """
    return hmac.compare_digest(
        _sha256_hex(plain_otp).encode(),
        hashed_otp.encode(),
    )


#  Symmetric Encryption (for chat message keys) 
def generate_secure_token(nbytes: int = 32) -> str:
    """Generate a URL-safe cryptographically secure random token."""
    return secrets.token_urlsafe(nbytes)


def generate_session_id() -> str:
    """Generate a unique session identifier."""
    return secrets.token_hex(32)


#  Internal helpers 
def _sha256_hex(value: str) -> str:
    """Return the hex-encoded SHA-256 hash of a UTF-8 string."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
