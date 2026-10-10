# ODD Feature: vetcura-v02 — Profile, Google, Security, Notifications

## Objective

Owner profile + own-pet editing (with secure photos), real Google
Sign-In (crypto-verified, no email-only auto-link), refresh rotation +
rate limiting, and a notification system (prefs, queue, scheduler,
pluggable email/push providers) — without breaking v0.1.0 behavior.

## Key policy decisions (fixed upfront)

- Google linking NEVER by email coincidence alone: unknown sub +
  known email → 409 `link_verification_required`; linking requires an
  authenticated session (own JWT) or password proof, plus
  `email_verified` from Google. Staff/admin roles never change via Google.
- Token verification via `google-auth-library` (signature, issuer,
  expiry, audience list). Injectable verifier so tests cover
  invalid/expired/audience/duplicates without network.
- Refresh tokens: random 256-bit, SHA-256 hash stored, rotation +
  revocation; access tokens short-lived (30m default).
- Rate limit on `/auth/*`: 30 req/min/IP → 429; uniform 401 messages
  (no enumeration).
- Weight is append-only history (`pet_weight_measurements`); pet PATCH
  never rewrites history. Clinical records stay staff-only.
- Photos: multipart ≤2MB, magic-byte type check (jpeg/png/webp) +
  dimension cap via `image-size`, server-controlled filenames under
  `data/uploads/`, served only after auth + ownership check.
- Notifications: minimal payloads (no clinical data in subject/push);
  prefs gate queueing; unconfigured providers leave items `pending`
  with error (never fake-sent); idempotency keys prevent duplicates.

## Acceptance criteria

1. Google login/link flows work against the verifier contract; 501
   without OAuth config; role preservation tested.
2. Owners edit own profile/pets (partial updates preserve fields);
   cross-owner access 403; photos validated + served with checks.
3. Refresh rotation/logout/rate-limit tested; no plaintext secrets;
   no secrets in repo or logs.
4. Prefs persist; reminders scheduled/cancelled on booking/status
   change; no duplicates; provider failures recorded, retries bounded.
5. Web owners admin view; Android Google button, editable profile/pets,
   prefs screen, encrypted token storage, notification permission.
6. Migrations apply on clean AND data-bearing DBs.
7. Docs: OAUTH setup + validation, API reference, install, delivery
   table distinguishing implemented / real-provider-tested / blocked.

## External blockers (expected, not code defects)

- Real Google OAuth clients (Android + audience IDs), FCM project +
  `google-services.json`, SMTP credentials — none present here.
  Real-provider e2e stays documented-pending; tests use stubs only.

## Authorized scope

- `odd/tasks/vetcura-v02*`, `docs/*`
- `backend/**/*` (no stack change: +google-auth-library, multer, image-size)
- `web/src/**/*`
- `android/app/src/main/**/*`, `android/app/build.gradle.kts`

## Verification evidence

- `backend: npm test` → 65/65 (16 api + 20 auth-v2 + 10 profile + 8 pets + 11 notify).
- Closed registration (user-approved): unknown emails 403 without
  creating; pending accounts claimed on first verified touch; detected
  live when two self-registered Google accounts appeared in testing.
- Migration v2: clean DB versions 1,2 with 6/6 tables; v1 data DB
  migrated with all rows preserved + v2 tables.
- `web: npm run build` OK (owners view included).
- `android: assembleDebug` BUILD SUCCESSFUL (Google, profile, prefs,
  photos, encrypted store, permission).
- App follow-ups fixed: photo URLs versioned by filename (no stale
  avatars), Google errors surfaced by backend code
  (`registration_required` explained in-app).
- Real OAuth/FCM/SMTP e2e: blocked (no credentials) — documented in
  `docs/OAUTH.md` + `docs/DELIVERY.md`; providers refuse honestly.
