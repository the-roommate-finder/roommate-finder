# Roommate Finder frontend

Next.js 16 App Router, React 19, TypeScript, Tailwind 3, Lucide.
The installed Next.js patch is 16.3.8. Fonts are self-hosted through Fontsource:
Plus Jakarta Sans, Manrope, Inter, and DM Serif Text, matching the retrieved Figma screens.

## Run locally

```sh
npm install
cp .env.local.example .env.local
npm run dev -- --hostname 127.0.0.1
```

The FastAPI backend should be running at `http://127.0.0.1:8000`.
`BACKEND_API_URL` is server-only. No secret keys belong in browser variables.

## Implemented from retrieved designs

- `/role-selection`: frame 1072:6474, keyboard-accessible role selection.
- `/signup?role=seeker|lister`: frame 1072:6496, registration and password confirmation.
- `/login`: frame 1072:6592, login and password visibility.
- `/reset-password?token=…`: set and confirm a new password using the emailed reset link; styled to match the existing auth screens.
- `/create-profile`: seeker onboarding built from the supplied screenshot, with a reserved logo slot.
- `/preview/room-card`: frame 1226:11520, reusable room card with explicit sample content.
- `/`: landing page with navigation, live listing search/cards, how-it-works steps,
  and footer. Sample roommate profiles, reviews, pricing and user counts were removed.

Colours, fonts, dimensions and spacing come from `../design-reference/`.
The saved Figma output is reference material, not application source. Its
short-lived asset URLs are not used in the application.

Brand logos and decorative photographs remain reserved per the owner's request.
Listing photographs now come from actual uploaded listing images when available.
`data-asset-slot` marks their slots. Add the brand logo to `LogoSlot` in
`components/auth-shell.tsx` (177.37 × 98), and pass an image URL to `RoomCard`
(408 × 256 photo area). Role icons still have reserved slots. The Google button
uses the original Google SVG from Figma, stored locally at `public/icons/google.svg`.
The card uses the original Figma location SVG; password controls use Lucide icons.
Common spelling mistakes in button/account copy were corrected.

The landing page uses original Figma SVG icons stored in `public/icons/landing/`.
Its logo, hero, and footer avatar slots remain reserved. `RoomCard` retains the
408 × 705 desktop layout and 408 × 256 image slot, colours, fonts, spacing, and
amenity chips from frame `1226:11520`. Long titles, locations, owner names, and
amenities are truncated on the card; View Details shows their full values.
Missing/broken photos leave the reserved image area blank.

`components/landing-data.ts` contains only explanatory copy. No production
landing cards, reviews, profile records, user counts or pricing use sample data.
The separate `/preview/room-card` route is still an explicitly labelled design
preview; test fixtures and saved Figma references are not production data.

### Live public listings

The landing page requests `/api/listings`, which forwards only allowlisted query
parameters to FastAPI `GET /api/v1/listings/public`. This public feed does not
require login, returns only available/non-deleted listings from active,
non-deleted owners, and includes only the owner's display name. Existing private
listing APIs still require authentication. No migration is needed.

City, area (a case-insensitive substring of the listing address), property type,
and pagination are handled by the backend. All reads are uncached. The page
refreshes on focus and every 30 seconds while visible, so new listings appear
without rebuilding the frontend. An empty database displays an empty state;
network failures display a retry action, never sample cards.

Cards use the listing's actual title, address/city, monthly rent, creation date,
amenities, owner display name and primary uploaded image (then another image if
no primary image exists). Rent uses the existing backend minor-unit contract:
`30000000` kobo renders as `NGN300K/month`. View Details opens the selected
listing's actual description, location, full amenities and availability date.
Roommate browsing stays omitted because there is no public roommate-profile feed.

The 1440px design is adapted to smaller screens with stacked grids and a mobile
navigation menu. Desktop section styling follows the retrieved references;
the full-page vertical layout is still incomplete because the sections below
could not be retrieved. The full screenshot is saved in
`../design-reference/landing-reference.png` for comparison, never rendered in the app.

## API integration and current boundaries

Registration, login, email verification and password reset call
FastAPI through an allowlisted same-origin Next.js route. Access/refresh tokens
are stored in HttpOnly cookies, never returned to client JavaScript. Cookies
are Secure in production. The frontend rejects cross-origin auth POSTs.

Registration now opens `/verify-email`, implemented from the supplied OTP screenshot.
It has six code boxes, automatic verification, paste/autofill support, resend,
and backend error messages. The brand logo remains a reserved space. A short-lived
HttpOnly cookie remembers the pending email across refreshes; OTPs are not stored.
Successful verification establishes the session and shows a confirmation with a
link to `/create-profile` for seekers who have not completed their profile, or home
for other accounts. Visiting without a pending registration email redirects to signup.
`/forgot-password` requests the existing backend reset link. `/reset-password`
reads its token, validates the new password and confirmation, then sends
`token` and `new_password` to the backend. Missing, expired and used links offer
a fresh reset email. Success clears stale session cookies and links to login;
the backend revokes sessions. Reset pages use no-referrer and noindex metadata.
Dashboard/lister-profile routing and session refresh/logout are still
pending the remaining screens. Google login is explicitly unavailable in this
UI; its browser-to-backend-to-frontend callback integration is not yet implemented.
The backend rate limiter currently sees this Next.js server's IP for these
requests; deployment needs a trusted proxy/client-IP policy before production use.

### Profile and chat API preparation

`/api/member/[...path]` adds authenticated, same-origin transport for the seeker
profile and future chat screens. The browser sends its existing HttpOnly access cookie;
the server forwards only the access token as a Bearer header to FastAPI. It does
not forward the refresh cookie, client Authorization, or forwarded-IP headers.
All replies are `no-store`. Writes require a matching Origin; cross-site reads
are also rejected because fetching messages marks them read in FastAPI.

Supported paths (after `/api/member/`) are:

| Path | Methods |
| --- | --- |
| `users/me` | GET, PATCH |
| `users/me/complete-profile` | POST |
| `users/me/avatar` | POST (multipart PNG/JPG, up to 5 MB) |
| `chat/conversations` | GET, POST |
| `chat/conversations/:uuid` | GET |
| `chat/conversations/:uuid/settings` | PATCH |
| `chat/conversations/:uuid/messages` | GET, POST |
| `chat/conversations/:uuid/messages/:uuid` | PATCH, DELETE |
| `chat/conversations/:uuid/messages/:uuid/reactions` | POST |
| `chat/keys/me` | PUT |
| `chat/keys/:uuid` | GET |

Paths, methods, query parameters, and JSON field names are allowlisted. FastAPI
still validates field values and enforces conversation membership/ownership.
Malformed JSON returns 400, an expired/missing access session returns 401, and
upstream outages return 502 without exposing internal errors. Redirects are not
followed. Automatic session refresh and block/unblock transport
are not included in this preparation.

Chat transport accepts the backend's `encrypted_content` and `encryption_nonce`
contract; it does **not** implement or verify encryption. Browser key generation,
private-key storage, encryption/decryption, recovery, and the chat UI still need
implementation before users can send messages. The tests use mocked backend
responses and send no messages or profile changes to real users.

The seeker profile now uses the supplied screenshot because Figma MCP remains
quota-limited. It loads the signed-in user's details, uploads an optional photo
through the existing storage endpoint, and saves personal details plus typed
`seeker_preferences`. Budgets are whole naira; bio is limited to 200 characters.
Lifestyle choices are optional and start unselected; only selected choices turn
blue. Unanswered choices remain unset in storage. Invalid required details show
a message beside Save & Continue and focus the affected input.
Birth date and preferences are returned only by self-profile endpoints. Apply
backend migrations through `0006_user_gender.py` before using this screen.
Profile gender accepts only Male or Female in the form, API and database.
Migration 0006 clears any legacy unsupported gender and marks that profile
incomplete so its owner can choose again; existing Male/Female values are retained.
Save & Continue returns home after a successful save; Skip for now returns home
without marking the profile complete. The dashboard destination remains pending.
Actual photo delivery requires the backend's S3 storage configuration; automated
tests mock storage delivery. When photo upload fails, form entries are retained
and an explicit Save without photo action lets the user complete their profile;
the UI never claims a failed photo was uploaded. Chat (`1325:9535`) still awaits its exact design.

Figma access worked on October 8, 2026, then reached its Starter MCP quota during
the landing-page reads. The following landing sections are omitted pending their
full design context: repeated verification strip (`1226:11379`), About
(`1226:11608`), communities (`1226:11635`), safety (`1226:11686`), FAQ
(`1226:11904`), and closing CTA (`1226:11939`). Room cards reuse the previously
retrieved component (`1226:11520`); the full room-grid context (`1226:11519`)
could not be retrieved. Available references and the structure are saved under
`../design-reference/landing-*` so they do not need to be fetched again.

Lister profile setup, dashboard, browse, saved, messages and settings
also remain pending. These missing sections/screens are not claimed as matched.
Only the standalone design preview uses sample listing content.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
node --test tests/auth-route.test.cjs
node --test tests/member-route.test.cjs
node --test tests/listings-route.test.cjs
npx playwright test
```

Browser tests require the local frontend on port 3000 and Google Chrome at
`/usr/bin/google-chrome` (adjust `playwright.config.ts` on another machine).
API responses are mocked in browser tests; tests send no real email.
