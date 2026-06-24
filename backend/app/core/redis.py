from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Optional

import redis.asyncio as aioredis
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.config import settings

_redis_pool: Optional[Redis] = None  # type: ignore[type-arg]


def create_redis_pool() -> Redis:  # type: ignore[type-arg]
    return aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        health_check_interval=30,
    )


async def init_redis() -> None:
    """Called on application startup."""
    global _redis_pool
    _redis_pool = create_redis_pool()


async def close_redis() -> None:
    """Called on application shutdown."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.aclose()
        _redis_pool = None


async def get_redis() -> AsyncGenerator[Redis, None]:  # type: ignore[type-arg]
    """FastAPI dependency that yields the shared Redis client."""
    if _redis_pool is None:
        raise RuntimeError("Redis pool has not been initialised. Call init_redis() first.")
    yield _redis_pool


async def check_redis_connection() -> bool:
    """Health-check helper. Returns True if Redis is reachable."""
    try:
        if _redis_pool is None:
            return False
        return await _redis_pool.ping()  # type: ignore[return-value]
    except RedisConnectionError:
        return False
