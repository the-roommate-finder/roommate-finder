# Backend

From the repository root, start the local stack with:

```bash
docker compose up -d
```

The `migrate` service runs `alembic upgrade head` after PostgreSQL is healthy.
The API, worker, and scheduler wait for it to succeed. A migration failure
blocks those services from starting. Existing migration files create the
schema on a fresh database; subsequent runs apply only pending migrations.
Use `docker compose logs migrate` to inspect the result.

Migration files are not generated automatically at startup. After changing
SQLAlchemy models, generate a revision explicitly:

```bash
docker compose exec api alembic revision --autogenerate -m "describe schema change"
```

Review the generated file in `backend/alembic/versions`, then apply it:

```bash
docker compose exec api alembic upgrade head
```

Commit the revision alongside the model change. Autogeneration produces a
draft that may need manual edits, especially for renames or data migrations.

When running Uvicorn directly or using the Docker image outside Compose,
run `alembic upgrade head` from the backend directory before starting the API.
The FastAPI lifespan does not run migrations, avoiding repeated execution
in each Uvicorn worker. `docker compose restart` is not a migration workflow;
use `docker compose up -d` or explicitly run the upgrade command above.

## Google sign-in

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env`, and register
the exact `GOOGLE_REDIRECT_URI` with Google (locally,
`http://localhost:8000/api/v1/auth/google/callback`). Recreate the API container
after changing its environment with `docker compose up -d api`.

Without a frontend, open `http://localhost:8000/api/v1/auth/google/redirect` in
a browser and complete Google's consent screen. The callback returns the
login JSON. Missing credentials produce a 503 response at the start of the flow.

Both the JSON authorization URL endpoint and the redirect endpoint set an
HttpOnly, ten-minute state cookie. Callbacks must include the matching state
and cookie; Redis consumes the state atomically, so it cannot be reused.
This binds the response to the initiating browser, as described in
[Google's OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server).
Cookies require HTTPS outside development. Browser clients using the JSON
endpoints across origins must send `credentials: "include"` on both requests,
use an allowed CORS origin, and keep frontend/API on the same site for the
SameSite=Lax cookie. Native clients need a cookie jar for this flow; a separate
native PKCE flow is not implemented.

## Authentication tests

### Verification and onboarding contract

`POST /api/v1/auth/verify-email` and `POST /api/v1/auth/verify-phone-otp`
now return the same token-and-user response as login on successful verification:
`access_token`, `refresh_token`, `token_type`, `expires_in`, and `user`.
They no longer return only a message. A used OTP or already verified account
cannot obtain another session through verification; use login instead.

`user.is_profile_complete` is available in login, verification, Google login,
and `GET /api/v1/users/me` responses. The frontend should route a false value
to profile setup for `user.role` (seeker/lister), and a true value to the dashboard.
After refreshing tokens, fetch `/users/me` for the current onboarding status.

Authenticated clients finish onboarding with
`POST /api/v1/users/me/complete-profile`, submitting a nonblank `display_name`
and optionally `bio` and `gender`. The endpoint saves the profile and sets
`is_profile_complete=true` atomically. Ordinary `PATCH /users/me` updates can
save drafts without completing onboarding. Role-specific required fields can
be added once the profile designs are defined. This flag guides frontend
navigation; it does not currently restrict access to other protected APIs.

The profile-completion migration defaults existing and new users to false;
existing profiles are not assumed to have completed this new onboarding step.

### Running tests

With the local Compose stack running and migrated:

```bash
docker compose exec api pytest -q tests -o asyncio_default_fixture_loop_scope=function
```

These API tests use PostgreSQL and Redis, roll back test database rows, and
remove their own namespaced Redis keys. Database sequences may advance.
Email/SMS delivery and Google token/profile responses are mocked; no real
messages or Google authorization requests are sent. Tests disable request
rate limiting but exercise account lockout and OTP attempt limits.
Run against a local development database, not production.


### Public landing page listings

`GET /api/v1/listings/public` provides an anonymous, uncached listing feed. It
returns available, non-deleted listings from active, non-deleted owners, newest
first. Filters: `city`, `area` (literal substring of address), `property_type`,
`page`, and `page_size` (default 3, maximum 30). Public owner data contains only
`display_name`; account/contact data and storage keys are excluded. Existing
listing creation, private reads, updates and uploads retain authentication.

Rent continues to use integer minor units: for NGN, 30,000,000 kobo means
NGN300,000 monthly. The frontend converts minor units for display.

`tests/test_public_listings.py` verifies creation-to-public-feed visibility,
filtering, pagination, image metadata, privacy and unavailable/deleted records
using rollback transactions and mocked email delivery. No migration is needed.
