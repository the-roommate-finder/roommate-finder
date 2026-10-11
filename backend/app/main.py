from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.routers import dashboard, auth, calls, chat, google_auth, listings, notifications, users
from app.core.config import settings
from app.core.middleware import (
    ErrorHandlingMiddleware,
    PerformanceTimingMiddleware,
    RequestIDMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.rate_limit import limiter
from app.core.redis import check_redis_connection, close_redis, init_redis
from app.core.database import check_db_connection
from app.utils.logging import configure_logging

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application startup and shutdown lifecycle."""
    configure_logging()
    logger.info(
        "starting_up",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
    )

    await init_redis()

    if not await check_redis_connection():
        logger.warning("redis_not_reachable_on_startup")

    yield

    logger.info("shutting_down")
    await close_redis()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "PropTech marketplace backend for discovering compatible "
            "roommates and affordable shared living spaces."
        ),
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=_lifespan,
    )

    #  Rate limiter state 
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    #  CORS 
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time", "X-RateLimit-Limit"],
    )

    #  Custom middleware stack (registered in reverse — last = outermost) 
    app.add_middleware(ErrorHandlingMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(PerformanceTimingMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(SlowAPIMiddleware)

    #  Exception handlers 
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = []
        for error in exc.errors():
            errors.append({
                "field": ".".join(str(loc) for loc in error["loc"][1:]),
                "message": error["msg"],
                "type": error["type"],
            })
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": "validation_error", "details": errors},
        )

    #  Health endpoints (no auth, no rate limit) 
    @app.get("/health", tags=["Health"], include_in_schema=False)
    async def health() -> dict:
        return {
            "status": "ok",
            "version": settings.APP_VERSION,
            "environment": settings.APP_ENV,
        }

    @app.get("/ready", tags=["Health"], include_in_schema=False)
    async def readiness() -> JSONResponse:
        db_ok = await check_db_connection()
        redis_ok = await check_redis_connection()
        all_ok = db_ok and redis_ok
        return JSONResponse(
            status_code=status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "ready" if all_ok else "not_ready",
                "database": db_ok,
                "redis": redis_ok,
                "version": settings.APP_VERSION,
            },
        )

    # API Routers 
    # Routers carry their own resource prefix (/auth, /users, etc.).
    # We prepend the API version prefix at inclusion time.
    v1 = settings.API_V1_PREFIX

    app.include_router(auth.router, prefix=v1)
    app.include_router(google_auth.router, prefix=v1)
    app.include_router(users.router, prefix=v1)
    app.include_router(dashboard.router, prefix=v1)
    app.include_router(listings.router, prefix=v1)
    app.include_router(chat.router, prefix=v1)
    app.include_router(notifications.router, prefix=v1)
    app.include_router(calls.calls_router, prefix=v1)

    # WebSocket lives at /ws — no versioned prefix (clients hold a persistent connection)
    app.include_router(calls.router)

    return app


app = create_app()