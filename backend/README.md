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


### Seeker dashboard

Apply migration `0007_dashboard_activity.py` (`alembic upgrade head`, also run by
Compose's migration service). It adds account-owned bookmarks and recent searches.

- `GET /api/v1/dashboard`: seeker-only, uncached user data, paginated room/roommate
  feeds, saved IDs, two recent saved rooms, five recent searches and match count.
  Filters: `city`, `area`, `mode=all|saved|matches`, `room_page`, `roommate_page`,
  `page_size` (default 3, maximum 30). Roommates must be other active, verified,
  non-deleted seekers with completed preferences. Their response excludes email,
  phone, date of birth and credentials. Rooms use the safe public listing schema.
- `PUT/DELETE /api/v1/dashboard/saved/{room|roommate}/{id}`: idempotent, per-account
  saves; PUT validates a currently visible target. Unavailable records are excluded
  from saved feeds and recent saved cards. DELETE can also remove stale bookmarks.
- `POST /api/v1/dashboard/searches`: `{city, area, kind: "room" | "roommate"}`;
  deduplicates and retains the five most recent searches per account.

Roommates rank by supplied sleep/cleanliness choices, then profile update time.
The match count requires both choices to be supplied and equal; it is not an
invented or time-based "new matches" count. `tests/test_dashboard.py` verifies
privacy, access controls, filters, saved-record visibility and activity persistence.

Dashboard Browse also accepts `location` (literal, case-insensitive city/address/state
or preferred-location match), `min_rent`/`max_rent` (kobo), `property_type`,
`amenities` (comma-separated exact names, all required, case-insensitive), and
`available_by` (ISO date, inclusive; unspecified availability is immediately available).
Roommate filters are `min_budget`/`max_budget` (whole naira, overlapping ranges),
`sleep_schedule`, `cleanliness`, and `move_in_timeline`. Invalid enums, dates,
negative prices and inverted price ranges return 422. These filters need no new migration.

For `mode=saved`, `saved_sort=recent|oldest|price_low|price_high` controls ordering
(default `recent`). Date ordering uses this account's bookmark timestamp, not the
listing/profile timestamp. Price ordering uses monthly rent for rooms and minimum
monthly budget for roommates, with stable ID tie-breaking. Saved pages are clamped
to the last available page after removals; an empty feed returns page 1. Counts
include only currently visible saved records. No additional migration is needed.


### Dashboard messaging

Conversation responses include a last-message ciphertext preview and safe participant
fields (ID, display name, avatar, role, phone verification), excluding email and phone
numbers. Lists now return actual totals/pages. Message cursors use timestamp + ID,
scoped to the same conversation; reads update real delivery/read timestamps. Sending
checks both-direction blocks and participant availability. Concurrent DM creation is
serialized for the user pair. Public-key publication is idempotent; replacing an
existing key returns 409 until an explicit recovery/rotation flow is implemented.
No schema migration is needed for these changes. `tests/test_chat_api.py` covers
access/privacy, previews, cursor ties, settings, read receipts and key retention.


Chat participant profiles are exposed at `GET /api/v1/chat/conversations/{id}/profile`
only to members of the existing two-person conversation. Responses omit contact
information, date of birth and credentials. `PUT/DELETE .../profile/block` are
idempotent. `POST .../profile/report` accepts a reason and 10–2000 characters of
details, and stores one report per reporter/conversation in `user_reports` with
pending status. Repeated submissions do not overwrite the original report.
Migration `0008_user_reports` (`e10a8c345f7d`) adds this table. Reports are persisted
for moderation; a moderator review UI and notifications are not implemented.

### Dashboard profile settings

Migration `0009_profile_visibility` adds `users.is_profile_visible` (default true).
`GET /users/me/profile-summary` returns the authenticated user, calculated completion,
missing sections, age and account-scoped counts of available saved rooms/roommates,
unarchived conversations and stored recent searches. `PATCH /users/me/visibility`
accepts only a boolean `is_profile_visible`; hidden profiles are excluded from seeker
discovery and public user lookups but remain accessible within existing conversations.
`GET /users/me/blocked` returns IDs, display names, avatar URLs and block timestamps
for accounts this user blocked, newest first. `DELETE /chat/block/{user_id}` removes
only the caller's block and is safe to repeat. Either direction of blocking prevents
profile viewing, discovery, saving a roommate and messaging; existing conversation
history and basic identity remain available. Unblocking restores access subject to
the other person's privacy settings and any block they still have in place.
`tests/test_blocked_users.py` covers metadata, access restrictions and scoped unblocking.
The existing account soft-delete endpoint also deactivates sessions and revokes refresh
tokens. `tests/test_dashboard_profile.py` covers visibility, private counts, blocking
and account deletion with isolated test users.

### Notification preferences

Run `alembic upgrade head` for migration `0010_notification_preferences`. Authenticated
`GET` and `PUT /notifications/preferences` load/save ten strict boolean preferences
on the current account. Defaults are enabled, matching the supplied screen. Both the
API notification service and Celery dispatcher check these preferences before creating
new in-app alerts; previously received notifications remain in the inbox.

The existing notification enum maps to new messages, saved-listing updates, login
alerts, verification and account activity. SYSTEM producers can pass
`data.preference_category` as `new_rooms`, `new_matching_roommates`, `product_updates`
or `promotions`; SAVED_LISTING_UPDATE can specify `listing_unavailable`. This change
stores those preferences and enforces them at dispatch, but does not add new event
producers/campaigns, browser push, or alter OTP/password-reset/security email delivery.
Tests: `tests/test_notification_preferences.py` covers persistence, isolation, validation
and filtering in API/worker creation paths.

### Profile privacy

Migration `0011_privacy_preferences` stores audience and field visibility choices.
`GET/PUT /users/me/privacy` are authenticated, account-scoped and reject unknown keys
or non-boolean switch values. `profile_audience` accepts `everyone`, `matches`, or
`no_one`; everyone means authenticated members. Matching uses the existing sleep
schedule + cleanliness rule, requiring both values to be present and equal.

Browse, saved-roommate results/counts and public profile lookups enforce this audience.
The existing Profile Visibility switch synchronizes with the audience setting.
Public responses redact age, occupation, lifestyle, bio and activity timestamps when
hidden, while `/users/me` retains the owner’s complete details. Chat profiles hide
private sections and location for unauthorized viewers but retain basic identity and
conversation/report/block actions. Existing messages and read receipts remain available.
Authenticated listing owners now expose basic identity only, closing the old path
that exposed contact details/bio/activity through a listing. Recent-activity visibility
controls the public profile timestamp; this does not add a new online-status indicator.
Tests: `tests/test_privacy_preferences.py`, plus dashboard/chat/profile regressions.
