from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, MappedColumn
from sqlalchemy.pool import NullPool

from app.core.config import settings


def _build_engine(url: str, *, testing: bool = False) -> AsyncEngine:
    """
    Create the async engine.
    NullPool is used during testing to prevent connection leaks across tests.
    """
    kwargs: dict[str, Any] = {
        "echo": settings.is_development,
        "pool_pre_ping": True,
    }

    if testing:
        kwargs["poolclass"] = NullPool
    else:
        kwargs.update(
            {
                "pool_size": settings.DATABASE_POOL_SIZE,
                "max_overflow": settings.DATABASE_MAX_OVERFLOW,
                "pool_timeout": settings.DATABASE_POOL_TIMEOUT,
                "pool_recycle": settings.DATABASE_POOL_RECYCLE,
            }
        )

    return create_async_engine(url, **kwargs)


engine: AsyncEngine = _build_engine(settings.DATABASE_URL)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """
    Shared declarative base for all ORM models.
    Provides __tablename__ auto-generation is NOT used — tables are named
    explicitly in each model for predictability.
    """

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a DB session per request.
    Rolls back on exception; always closes session.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_db_connection() -> bool:
    """
    Health-check helper.
    Returns True if the database is reachable, False otherwise.
    """
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
