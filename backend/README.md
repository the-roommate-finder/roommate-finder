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
