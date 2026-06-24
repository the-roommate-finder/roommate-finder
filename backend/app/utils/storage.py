from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import boto3
import structlog
from botocore.exceptions import ClientError

from app.core.config import settings

logger = structlog.get_logger(__name__)

_executor = ThreadPoolExecutor(max_workers=4)


class StorageClient:
    """
    Thin async wrapper around boto3 S3 client.
    Uses a thread pool to avoid blocking the event loop.
    """

    def __init__(self) -> None:
        self._s3 = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
        )

    async def upload(
        self,
        *,
        key: str,
        data: bytes,
        content_type: str,
        public: bool = True,
    ) -> str:
        """
        Upload bytes to S3 and return the CDN URL.
        """
        loop = asyncio.get_event_loop()

        extra_args: dict = {
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000" if public else "private",
        }
        if public:
            extra_args["ACL"] = "public-read"

        await loop.run_in_executor(
            _executor,
            lambda: self._s3.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=key,
                Body=data,
                **extra_args,
            ),
        )

        cdn_base = settings.S3_CDN_URL.rstrip("/") if settings.S3_CDN_URL else (
            f"{settings.S3_ENDPOINT_URL.rstrip('/')}/{settings.S3_BUCKET_NAME}"
        )
        return f"{cdn_base}/{key}"

    async def delete(self, key: str) -> None:
        """Delete an object from storage. Silently ignores missing objects."""
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                _executor,
                lambda: self._s3.delete_object(
                    Bucket=settings.S3_BUCKET_NAME, Key=key
                ),
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "NoSuchKey":
                logger.error("storage_delete_failed", key=key, exc_info=exc)
                raise

    async def generate_presigned_url(
        self, key: str, *, expires_in: int = 3600
    ) -> str:
        """Generate a pre-signed URL for private object access."""
        loop = asyncio.get_event_loop()
        url: str = await loop.run_in_executor(
            _executor,
            lambda: self._s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
                ExpiresIn=expires_in,
            ),
        )
        return url

    async def exists(self, key: str) -> bool:
        """Check if an object exists in storage."""
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                _executor,
                lambda: self._s3.head_object(
                    Bucket=settings.S3_BUCKET_NAME, Key=key
                ),
            )
            return True
        except ClientError:
            return False
