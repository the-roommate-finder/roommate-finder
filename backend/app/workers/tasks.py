"""
app/workers/tasks.py

Celery task definitions for background jobs.

Workers run in a separate process from the API server.
They share the same codebase but do NOT use async SQLAlchemy —
they use sync connections managed by Celery itself.

Tasks defined here:
  - send_otp_email
  - send_security_alert_email
  - send_password_reset_email
  - generate_thumbnail
  - cleanup_expired_tokens
  - cleanup_expired_otps
  - cleanup_stale_sessions
  - dispatch_notification
"""
from __future__ import annotations

import io
import logging
import structlog
from typing import Optional

import resend
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

logger = structlog.get_logger(__name__)

#  Celery Application 
celery_app = Celery(
    "roommate_finder",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.workers.tasks.send_otp_email": {"queue": "email"},
        "app.workers.tasks.send_email_change_code": {"queue": "email"},
        "app.workers.tasks.send_security_alert_email": {"queue": "email"},
        "app.workers.tasks.send_password_reset_email": {"queue": "email"},
        "app.workers.tasks.send_otp_sms": {"queue": "sms"},
        "app.workers.tasks.generate_thumbnail": {"queue": "media"},
        "app.workers.tasks.cleanup_expired_tokens": {"queue": "maintenance"},
        "app.workers.tasks.cleanup_expired_otps": {"queue": "maintenance"},
        "app.workers.tasks.cleanup_stale_sessions": {"queue": "maintenance"},
        "app.workers.tasks.dispatch_notification": {"queue": "notifications"},
    },
    beat_schedule={
        "cleanup-expired-tokens": {
            "task": "app.workers.tasks.cleanup_expired_tokens",
            "schedule": crontab(minute="0", hour="*/6"),  # Every 6 hours
        },
        "cleanup-expired-otps": {
            "task": "app.workers.tasks.cleanup_expired_otps",
            "schedule": crontab(minute="*/30"),  # Every 30 minutes
        },
        "cleanup-stale-sessions": {
            "task": "app.workers.tasks.cleanup_stale_sessions",
            "schedule": crontab(minute="0", hour="2"),  # Daily at 2am UTC
        },
    },
)


#  Email helpers 
def _send_email(*, to: str, subject: str, html: str) -> None:
    """
    Send an email via Resend API.
    Never called directly — always via a Celery task.
    """
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send({
            "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
            "to": [to],
            "subject": subject,
            "html": html,
        })
    except Exception as exc:
        logger.error("email_send_failed", exc_info=exc, to=to, subject=subject)
        raise


#  SMS helpers 
def _send_sms(*, to: str, message: str) -> None:
    """
    Send an SMS via the configured provider (Termii by default).
    Never called directly — always via a Celery task.
    """
    import httpx

    try:
        response = httpx.post(
            settings.SMS_BASE_URL,
            json={
                "to": to,
                "from": settings.SMS_SENDER_ID,
                "sms": message,
                "type": "plain",
                "channel": "generic",
                "api_key": settings.SMS_API_KEY,
            },
            timeout=10.0,
        )
        response.raise_for_status()
    except Exception as exc:
        logger.error("sms_send_failed", exc_info=exc, to=to)
        raise


#  Email Tasks
@celery_app.task(name="app.workers.tasks.send_email_change_code", bind=True,
    max_retries=3, default_retry_delay=10, autoretry_for=(Exception,))
def send_email_change_code(self, *, user_email: str, otp: str, mailbox: str) -> None:
    from html import escape
    label = "current" if mailbox == "current" else "new"
    _send_email(to=user_email, subject="Confirm your Roommate Finder email change", html=f"""
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Confirm your email change</h2>
        <p>Enter this code in the <strong>{label} email</strong> field on Roommate Finder.</p>
        <p style="font-size:32px;letter-spacing:8px">{escape(otp)}</p>
        <p>This code expires in 10 minutes. Your email will only change after both codes are confirmed.</p>
        <p>If you did not request this change, do not share this code.</p>
      </div>""")


@celery_app.task(
    name="app.workers.tasks.send_otp_email",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def send_otp_email(
    self,
    *,
    user_email: str,
    otp: str,
    expires_minutes: int,
) -> None:
    """
    Send OTP verification email.
    SECURITY: OTP value is passed as a task argument — ensure Celery result
    backend and broker are secured (Redis with AUTH, TLS).
    """
    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Verify your email</h2>
      <p>Use the code below to verify your RoomMate Finder account.
         This code expires in <strong>{expires_minutes} minutes</strong>.</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px;
                  padding: 24px; background: #f4f4f4; text-align: center;
                  border-radius: 8px; margin: 24px 0;">
        {otp}
      </div>
      <p style="color: #666; font-size: 14px;">
        If you did not create an account, you can safely ignore this email.
      </p>
    </div>
    """
    _send_email(
        to=user_email,
        subject="Your RoomMate Finder verification code",
        html=html,
    )


@celery_app.task(
    name="app.workers.tasks.send_otp_sms",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def send_otp_sms(
    self,
    *,
    phone_number: str,
    otp: str,
    expires_minutes: int,
) -> None:
    """
    Send OTP verification SMS.
    SECURITY: OTP value is passed as a task argument — ensure Celery result
    backend and broker are secured (Redis with AUTH, TLS).
    """
    message = (
        f"Your RoomMate Finder verification code is {otp}. "
        f"It expires in {expires_minutes} minutes. Never share this code."
    )
    _send_sms(to=phone_number, message=message)


@celery_app.task(
    name="app.workers.tasks.send_security_alert_email",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    autoretry_for=(Exception,),
)
def send_security_alert_email(
    self,
    *,
    user_email: str,
    event: str,
    ip_address: str,
    user_agent: str,
    location: str,
    lockout_minutes: int,
) -> None:
    """Send security alert email on account lockout."""
    from datetime import datetime, timezone

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Security Alert</h2>
      <p>Your RoomMate Finder account has been <strong>temporarily locked</strong>
         after multiple failed login attempts.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Time</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{timestamp}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">IP Address</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{ip_address}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Location</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{location}</td>
        </tr>
        <tr>
          <td style="padding: 8px; color: #6b7280;">Device</td>
          <td style="padding: 8px;">{user_agent[:100]}</td>
        </tr>
      </table>
      <p>The account will be unlocked automatically after
         <strong>{lockout_minutes} minutes</strong>.</p>
      <p style="color: #dc2626;">
        If this was not you, please change your password immediately after regaining access.
      </p>
    </div>
    """
    _send_email(
        to=user_email,
        subject="⚠️ Security Alert: RoomMate Finder account locked",
        html=html,
    )


#  Media Tasks 
@celery_app.task(
    name="app.workers.tasks.generate_thumbnail",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def generate_thumbnail(
    self,
    *,
    image_id: str,
    storage_key: str,
    listing_id: str,
) -> None:
    """
    Download an image from storage, generate a thumbnail, re-upload,
    and update the DB record with the thumbnail URL.
    """
    try:
        import boto3
        from PIL import Image

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
        )

        # Download original
        obj = s3.get_object(Bucket=settings.S3_BUCKET_NAME, Key=storage_key)
        image_data = obj["Body"].read()

        # Generate thumbnail
        with Image.open(io.BytesIO(image_data)) as img:
            img.thumbnail(settings.thumbnail_size, Image.LANCZOS)
            thumb_buffer = io.BytesIO()
            fmt = "JPEG" if img.mode == "RGB" else "PNG"
            img.save(thumb_buffer, format=fmt, quality=85, optimize=True)
            thumb_buffer.seek(0)

        # Upload thumbnail
        thumb_key = storage_key.replace("images/", "thumbnails/")
        content_type = "image/jpeg" if fmt == "JPEG" else "image/png"
        s3.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=thumb_key,
            Body=thumb_buffer,
            ContentType=content_type,
            CacheControl="public, max-age=31536000",
        )

        cdn_thumb_url = f"{settings.S3_CDN_URL}/{thumb_key}" if settings.S3_CDN_URL else None

        # Update DB (sync connection for Celery context)
        from sqlalchemy import create_engine, update as sa_update
        from app.api.v1.models.models import ListingImage

        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        engine = create_engine(sync_url)
        with engine.begin() as conn:
            conn.execute(
                sa_update(ListingImage)
                .where(ListingImage.id == image_id)
                .values(thumbnail_key=thumb_key, thumbnail_cdn_url=cdn_thumb_url)
            )

        logger.info("thumbnail_generated", image_id=image_id, thumb_key=thumb_key)

    except Exception as exc:
        logger.error("thumbnail_generation_failed", image_id=image_id, exc_info=exc)
        raise self.retry(exc=exc)


#  Maintenance Tasks 
@celery_app.task(name="app.workers.tasks.cleanup_expired_tokens")
def cleanup_expired_tokens() -> dict:
    """Delete expired refresh tokens from the database."""
    from datetime import datetime, timezone

    from sqlalchemy import create_engine, delete

    from app.api.v1.models.models import RefreshToken

    now = datetime.now(timezone.utc)
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_url)

    with engine.begin() as conn:
        result = conn.execute(
            delete(RefreshToken).where(RefreshToken.expires_at < now)
        )

    deleted = result.rowcount
    logger.info("expired_tokens_cleaned", deleted=deleted)
    return {"deleted": deleted}


@celery_app.task(name="app.workers.tasks.cleanup_expired_otps")
def cleanup_expired_otps() -> dict:
    """Delete expired OTP records."""
    from datetime import datetime, timezone

    from sqlalchemy import create_engine, delete

    from app.api.v1.models.models import EmailVerification

    now = datetime.now(timezone.utc)
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_url)

    with engine.begin() as conn:
        result = conn.execute(
            delete(EmailVerification).where(EmailVerification.expires_at < now)
        )

    deleted = result.rowcount
    logger.info("expired_otps_cleaned", deleted=deleted)
    return {"deleted": deleted}


@celery_app.task(name="app.workers.tasks.cleanup_stale_sessions")
def cleanup_stale_sessions() -> dict:
    """Deactivate expired user sessions."""
    from datetime import datetime, timezone

    from sqlalchemy import create_engine, update

    from app.api.v1.models.models import UserSession

    now = datetime.now(timezone.utc)
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_url)

    with engine.begin() as conn:
        result = conn.execute(
            update(UserSession)
            .where(UserSession.expires_at < now, UserSession.is_active == True)  # noqa: E712
            .values(is_active=False)
        )

    updated = result.rowcount
    logger.info("stale_sessions_cleaned", updated=updated)
    return {"updated": updated}


@celery_app.task(
    name="app.workers.tasks.dispatch_notification",
    bind=True,
    max_retries=3,
)
def dispatch_notification(
    self,
    *,
    user_id: str,
    notification_type: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    """
    Create an in-app notification record.
    Future: add push notification dispatch here (FCM / APNs).
    """
    import json

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.api.v1.models.models import Notification, NotificationType, User
    from app.utils.notification_preferences import notification_allowed

    sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_url)

    try:
        with Session(engine) as session:
            recipient = session.get(User, user_id)
            if not recipient or not recipient.is_active or recipient.is_deleted:
                return
            if not notification_allowed(recipient.notification_preferences, NotificationType(notification_type), data):
                return
            notification = Notification(
                user_id=user_id,
                notification_type=NotificationType(notification_type),
                title=title,
                body=body,
                data=json.dumps(data) if data else None,
            )
            session.add(notification)
            session.commit()
    finally:
        engine.dispose()

    logger.info(
        "notification_dispatched",
        user_id=user_id,
        notification_type=notification_type,
    )


@celery_app.task(
    name="app.workers.tasks.send_password_reset_email",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def send_password_reset_email(
    self,
    *,
    user_email: str,
    token: str,
    expires_minutes: int,
) -> None:
    """Send password reset email with a tokenised link."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Reset your password</h2>
      <p>We received a request to reset your RoomMate Finder password.
         This link expires in <strong>{expires_minutes} minutes</strong>.</p>
      <a href="{reset_url}"
         style="display: inline-block; padding: 14px 28px; background: #2563eb;
                color: #fff; text-decoration: none; border-radius: 8px;
                font-weight: bold; margin: 24px 0;">
        Reset Password
      </a>
      <p style="color: #666; font-size: 14px;">
        If you did not request a password reset, you can safely ignore this email.
        Your password will not be changed.
      </p>
      <p style="color: #999; font-size: 12px;">
        Or copy this link: {reset_url}
      </p>
    </div>
    """
    _send_email(
        to=user_email,
        subject="Reset your RoomMate Finder password",
        html=html,
    )
