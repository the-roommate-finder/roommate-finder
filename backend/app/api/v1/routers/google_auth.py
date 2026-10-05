"""
app/api/v1/routers/google_auth.py
───────────────────────────────────
Google OAuth2 authentication endpoints.

Two supported flows:

Flow A — Server-side redirect (traditional):
  1. GET  /auth/google           → redirects browser to Google
  2. GET  /auth/google/callback  → Google redirects here with ?code=xxx

Flow B — Frontend code exchange (SPA/mobile):
  1. Frontend handles Google redirect, gets code
  2. POST /auth/google/callback  → sends code to backend, gets JWT
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.api.v1.dependencies import GoogleAuthServiceDep
from app.api.v1.schemas.schemas import (
    GoogleAuthURLResponse,
    GoogleCallbackRequest,
    SocialLoginResponse,
)
from app.api.v1.services.google_auth_service import OAUTH_COOKIE_PATH, OAUTH_STATE_COOKIE

router = APIRouter(prefix="/auth/google", tags=["Google OAuth"])


@router.get(
    "",
    response_model=GoogleAuthURLResponse,
    summary="Get Google OAuth authorization URL",
    description=(
        "Returns the Google consent screen URL. "
        "Redirect the user to this URL to begin the OAuth flow. "
        "A CSRF state token is generated and stored server-side."
    ),
)
async def get_google_auth_url(
    response: Response,
    google_service: GoogleAuthServiceDep,
) -> GoogleAuthURLResponse:
    auth_url = await google_service.get_auth_url(response)
    return GoogleAuthURLResponse(auth_url=auth_url)


@router.get(
    "/redirect",
    summary="Redirect browser directly to Google consent screen",
    description="Use this endpoint when you want to redirect the browser directly rather than returning a URL.",
    include_in_schema=False,
)
async def redirect_to_google(
    google_service: GoogleAuthServiceDep,
) -> RedirectResponse:
    response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    response.headers["location"] = await google_service.get_auth_url(response)
    return response


@router.get(
    "/callback",
    response_model=SocialLoginResponse,
    summary="Handle Google OAuth callback (server-side redirect)",
    description=(
        "Google redirects here after user grants permission. "
        "Exchanges the code for tokens and returns JWT access + refresh tokens."
    ),
    responses={
        400: {"description": "Invalid code or state"},
        403: {"description": "Account deactivated"},
    },
)
async def google_callback_redirect(
    request: Request,
    response: Response,
    google_service: GoogleAuthServiceDep,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> SocialLoginResponse:
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google OAuth error: {error}",
        )

    if not code:
        raise HTTPException(status_code=400, detail="Missing Google authorization code.")
    result = await google_service.handle_callback(
        code=code,
        state=state,
        request=request,
    )
    response.delete_cookie(OAUTH_STATE_COOKIE, path=OAUTH_COOKIE_PATH)
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post(
    "/callback",
    response_model=SocialLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Exchange Google auth code for JWT tokens (frontend flow)",
    description=(
        "Use this when your frontend handles the Google redirect and sends "
        "the authorization code to the backend. "
        "Returns access + refresh JWT tokens."
    ),
    responses={
        400: {"description": "Invalid code or state"},
        403: {"description": "Account deactivated"},
    },
)
async def google_callback_post(
    body: GoogleCallbackRequest,
    request: Request,
    response: Response,
    google_service: GoogleAuthServiceDep,
) -> SocialLoginResponse:
    result = await google_service.handle_callback(
        code=body.code,
        state=body.state,
        request=request,
    )
    response.delete_cookie(OAUTH_STATE_COOKIE, path=OAUTH_COOKIE_PATH)
    response.headers["Cache-Control"] = "no-store"
    return result
