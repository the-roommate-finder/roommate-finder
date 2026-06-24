from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, EmailStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    #  Application 
    APP_NAME: str = "RoomMate Finder"
    APP_ENV: Literal["development", "staging", "production"] = "development"
    APP_VERSION: str = "1.0.0"
    APP_DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_HOSTS: list[str] = ["localhost", "127.0.0.1"]

    #  Server 
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4

    #  Security 
    SECRET_KEY: str = secrets.token_hex(64)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    LOGIN_MAX_ATTEMPTS: int = 3
    ACCOUNT_LOCKOUT_MINUTES: int = 60

    #  CORS 
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    CORS_ALLOW_CREDENTIALS: bool = True

    #  Database 
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/roommate_finder"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 3600

    #  Redis 
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CELERY_URL: str = "redis://localhost:6379/1"
    REDIS_CACHE_TTL: int = 3600

    #  Email 
    RESEND_API_KEY: str = ""
    EMAIL_FROM: EmailStr = "noreply@roommatefinder.com"  # type: ignore[assignment]
    EMAIL_FROM_NAME: str = "RoomMate Finder"

    #  Object Storage 
    S3_ENDPOINT_URL: str = "https://s3.amazonaws.com"
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = "roommate-finder-media"
    S3_REGION: str = "us-east-1"
    S3_CDN_URL: str = ""

    #  Rate Limiting 
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REGISTER: str = "3/minute"
    RATE_LIMIT_OTP_RESEND: str = "2/minute"
    RATE_LIMIT_API_DEFAULT: str = "100/minute"
    RATE_LIMIT_LISTING: str = "30/minute"
    RATE_LIMIT_CHAT: str = "60/minute"

    #  Celery 
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    #  WebRTC 
    TURN_SERVER_URL: str = "turn:turn.roommatefinder.com:3478"
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""
    STUN_SERVER_URL: str = "stun:stun.l.google.com:19302"

    #  GeoIP 
    GEOIP_DB_PATH: str = "/app/data/GeoLite2-City.mmdb"

    #  Uploads 
    MAX_UPLOAD_SIZE_MB: int = 10
    VOICE_NOTE_MAX_DURATION_SECONDS: int = 300
    ALLOWED_IMAGE_TYPES: list[str] = ["image/jpeg", "image/png", "image/webp"]
    ALLOWED_AUDIO_TYPES: list[str] = ["audio/aac", "audio/mpeg", "audio/ogg"]
    THUMBNAIL_SIZE: tuple[int, int] = (400, 300)

    #  Derived Properties 
    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def access_token_expire_seconds(self) -> int:
        return self.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    @property
    def refresh_token_expire_seconds(self) -> int:
        return self.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    @property
    def otp_expire_seconds(self) -> int:
        return self.OTP_EXPIRE_MINUTES * 60

    @property
    def lockout_expire_seconds(self) -> int:
        return self.ACCOUNT_LOCKOUT_MINUTES * 60

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.startswith("postgresql"):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string")
        return v

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.is_production:
            if self.SECRET_KEY == secrets.token_hex(64):
                raise ValueError("SECRET_KEY must be explicitly set in production")
            if not self.RESEND_API_KEY:
                raise ValueError("RESEND_API_KEY is required in production")
            if not self.S3_ACCESS_KEY_ID:
                raise ValueError("S3_ACCESS_KEY_ID is required in production")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance. Call once per process."""
    return Settings()


settings: Settings = get_settings()
