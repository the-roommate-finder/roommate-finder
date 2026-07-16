# Roommate Finder — Frontend

Next.js 14 (App Router) + Tailwind CSS + TypeScript, built to match the
provided auth flow mockups (role selection → signup → email/phone OTP →
login → forgot/reset password).

## Setup

```bash
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_URL at your API
npm run dev
```

Requires Node 18+. The dev server runs on `http://localhost:3000`, which
already matches the backend's `CORS_ORIGINS` / `FRONTEND_URL` defaults.

## Pages built

| Route | Mockup |
|---|---|
| `/` | Landing page |
| `/role-selection` | "What brings you here?" |
| `/signup?role=seeker\|lister` | "Create Your Account" |
| `/verify-email?email=...` | Email OTP Confirmation |
| `/verify-phone?phone=...` | Phone OTP Confirmation |
| `/login` | "Welcome back!" |
| `/forgot-password` | Password Reset (request) |
| `/reset-password?token=...` | Password Reset (new password) |
| `/reset-password/success` | Reset success |
| `/dashboard` | Placeholder post-login landing spot |

## ⚠️ Backend contract gaps

The mockups need a few things the backend (`backend/app/api/v1/...`) doesn't
support yet. Everything below is written against an **assumed** contract so
the frontend needs zero changes once these land — see the `EXPECTED` comments
in `lib/api/types.ts` and `lib/api/auth.ts` for the exact shapes.

1. **`POST /auth/register`** currently only accepts `email` + `password`.
   The signup form also sends `display_name`, `phone_number`, and `role` —
   these are silently ignored by the backend today. `role` defaults to
   `SEEKER` server-side regardless of what the user picked on
   `/role-selection`.
2. **Phone number signup/login** has no backend support at all: no column
   population at registration, no login-by-phone, and —
3. **Phone OTP** has no send/verify routes. The frontend calls:
   - `POST /auth/send-phone-otp` `{ phone_number }`
   - `POST /auth/verify-phone-otp` `{ phone_number, otp }`

   These don't exist yet; add them following the same pattern as
   `/auth/verify-email` + `/auth/resend-otp`.
4. **`POST /auth/login`**'s `LoginRequest` is `email`-only. The login page
   detects a phone number client-side and shows "Login with phone number
   isn't available yet" rather than sending a request that will 422.

Everything else (email OTP verify/resend, forgot/reset password, login by
email) is wired directly against the real endpoints and should work as-is
once the backend is running.
