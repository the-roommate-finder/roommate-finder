"""API tests use the migrated local database with an outer rollback transaction.

Redis keys are namespaced per test; no real email/SMS tasks are dispatched.
"""
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import httpx
import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core import database
from app.core.config import settings
from app.core.redis import get_redis
from app.main import create_app
from app.workers import tasks


class TestRedis(Redis):
    __test__ = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.namespace = f"test:{uuid4().hex}:"
        self.test_keys = set()

    async def execute_command(self, *args, **kwargs):
        # Only the Redis commands used by authentication are allowed here.
        command = str(args[0]).upper()
        if command in {"GET", "GETDEL", "SETEX", "INCRBY", "EXPIRE", "TTL"}:
            key = self.namespace + str(args[1])
            self.test_keys.add(key)
            args = (args[0], key, *args[2:])
        elif command in {"DEL", "EXISTS"}:
            keys = tuple(self.namespace + str(key) for key in args[1:])
            self.test_keys.update(keys)
            args = (args[0], *keys)
        else:
            raise AssertionError(f"Unexpected Redis command in auth test: {command}")
        return await super().execute_command(*args, **kwargs)


@pytest_asyncio.fixture
async def api(monkeypatch):
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    redis = TestRedis.from_url(
        settings.REDIS_URL, decode_responses=True,
    )
    deliveries = {}
    for name in ("send_email_change_code", "send_otp_email", "send_otp_sms", "send_password_reset_email", "send_security_alert_email"):
        deliveries[name] = Mock()
        monkeypatch.setattr(getattr(tasks, name), "delay", deliveries[name])
    app = create_app()
    monkeypatch.setattr(app.state.limiter, "enabled", False)

    async def test_redis():
        yield redis

    app.dependency_overrides[get_redis] = test_redis
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            sessions = async_sessionmaker(
                connection, expire_on_commit=False, autoflush=False,
                join_transaction_mode="create_savepoint",
            )
            # Keep the real get_db commit/rollback behavior on every request.
            monkeypatch.setattr(database, "AsyncSessionLocal", sessions)
            try:
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app), base_url="http://testserver"
                ) as client:
                    yield SimpleNamespace(
                        client=client, redis=redis, sessions=sessions,
                        deliveries=deliveries, email=f"auth-{uuid4().hex}@example.com",
                    )
            finally:
                await transaction.rollback()
    finally:
        if redis.test_keys:
            await Redis.execute_command(redis, "DEL", *redis.test_keys)
        await redis.aclose()
        await engine.dispose()
