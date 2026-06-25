from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings

logger = structlog.get_logger(__name__)


#  1. Request ID 
class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Injects a unique X-Request-ID header on every request and response.
    Honors an existing header if the client (or upstream proxy) sets one.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


#  2. Request Logging 
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Structured access log for every HTTP request.
    Never logs request bodies (may contain passwords / PII).
    """

    # Paths excluded from logging to reduce noise
    _SKIP_PATHS: frozenset[str] = frozenset(
        {"/health", "/ready", "/favicon.ico", "/docs", "/openapi.json"}
    )

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.url.path in self._SKIP_PATHS:
            return await call_next(request)

        start = time.monotonic()
        request_id = getattr(request.state, "request_id", "-")
        client_ip = _get_client_ip(request)

        response = await call_next(request)

        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            "http_request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
            client_ip=client_ip,
            user_agent=request.headers.get("User-Agent", ""),
        )
        return response


#  3. Security Headers 
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds security-relevant HTTP response headers to every response.
    References: OWASP Secure Headers Project, MDN.
    """

    _CSP = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self'; "
        "connect-src 'self' wss:; "
        "media-src 'self' blob:; "
        "object-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )

    # Swagger UI / ReDoc load their JS+CSS from the jsDelivr CDN and use an
    # inline init script, so the docs routes need a relaxed CSP. These routes
    # are only mounted outside production (see app factory), so this never
    # loosens the policy for real API traffic.
    _DOCS_CSP = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src 'self' data: https:; "
        "font-src 'self' https://cdn.jsdelivr.net; "
        "worker-src 'self' blob:; "
        "object-src 'none'; "
        "base-uri 'self';"
    )

    # Paths whose responses serve the interactive API docs HTML.
    _DOCS_PATHS = frozenset({"/docs", "/redoc", "/docs/oauth2-redirect"})

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        h = response.headers

        # Prevent MIME-type sniffing
        h["X-Content-Type-Options"] = "nosniff"
        # Deny framing (clickjacking protection)
        h["X-Frame-Options"] = "DENY"
        # Disable legacy XSS filter (rely on CSP instead)
        h["X-XSS-Protection"] = "0"
        # Referrer policy
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions policy — disable dangerous browser features
        h["Permissions-Policy"] = (
            "geolocation=(), microphone=(self), camera=(self), "
            "payment=(), usb=(), magnetometer=(), gyroscope=()"
        )
        # Content Security Policy (relaxed for the CDN-backed docs pages)
        if request.url.path in self._DOCS_PATHS:
            h["Content-Security-Policy"] = self._DOCS_CSP
        else:
            h["Content-Security-Policy"] = self._CSP
        # HSTS — only in production (avoids breaking local HTTPS dev setups)
        if settings.is_production:
            h["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        # Remove server fingerprint header to avoid exposing implementation details
        if "server" in h:
            del h["server"]
        if "Server" in h:
            del h["Server"]
        if "x-powered-by" in h:
            del h["x-powered-by"]

        return response


#  4. Performance Timing 
class PerformanceTimingMiddleware(BaseHTTPMiddleware):
    """Attaches X-Process-Time (milliseconds) to every response."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        response.headers["X-Process-Time"] = f"{duration_ms:.2f}ms"
        return response


#  5. Error Handling 
class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """
    Catch-all for unhandled exceptions.
    Returns a consistent JSON error envelope instead of a 500 HTML page.
    Never exposes internal details in production.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            request_id = getattr(request.state, "request_id", "-")
            logger.exception(
                "unhandled_exception",
                request_id=request_id,
                path=request.url.path,
                method=request.method,
                exc_type=type(exc).__name__,
            )

            detail = (
                str(exc) if settings.is_development else "An unexpected error occurred"
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": "internal_server_error",
                    "message": detail,
                    "request_id": request_id,
                },
            )


#  Helpers 
def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, respecting proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"
