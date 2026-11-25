# VetCura Delivery Record

## Current state (2026-11-24)

- Branch `master`, clean tree. Last two features landed and are
  recorded in their ODD tasks: availability (vet schedules + slot
  booking, migration v3, `odd/tasks/vetcura-availability.md`) and
  clinical-plus (exam PDFs, owner/staff visibility split,
  prescriptions with professional id, pet color/sex, migrations v5-v6,
  `odd/tasks/vetcura-clinical-plus.md`).
- Backend suite re-run on this exact tree: **85/85 pass** (`npm test`,
  observed 2026-11-24). Web `npm run build` OK and `assembleDebug`
  BUILD SUCCESSFUL at the clinical-plus commit (evidence in the task
  files above).

### Pending — external, needs user action (nothing code-side blocks)

1. **Google Sign-In real e2e**: create OAuth clients in Google Cloud
   (Android SHA-1 + web audience) → backend env + `-PgoogleClientId`
   rebuild → run checks 1-5 of `docs/OAUTH.md`.
2. **Firebase project + `google-services.json`** → wire FCM token
   registration (code stays absent until then, by design).
3. **SMTP credentials** → first live mail delivery test (items stay
   `pending`, never fake-sent).
4. **Real Figma URL + access** → pixel-fidelity pass (mockups remain
   provisional visual truth).

### Pending — optional hardening (not defects)

5. Login rate-limit tuning.
6. Postgres migration path.

## v0.2.0 — Profile, Google, Security, Notifications (this phase)

Implemented + tested (63 backend tests green: 16 api + 18 auth-v2 +
10 profile + 8 pets + 11 notify; `npm test` observed):

- Google Sign-In reworked: crypto verification via `google-auth-library`
  (signature/issuer/expiry/audience), identity keyed by `sub`, NO
  email-coincidence auto-link (409 `link_verification_required`),
  session- or password-proof linking, staff roles immutable via Google.
  Verifier injectable → invalid/expired/audience/duplicates/role
  cases tested without network.
- Refresh rotation (SHA-256 stored, single-use, revocation, sessions
  list without hashes), 30m access tokens, auth rate limit (429 +
  `Retry-After`), uniform 401s, bcrypt retained + documented (existing
  hash compatibility), audit log without secrets.
- Owner profile/prefs/photo endpoints (strict whitelists, partial
  updates, magic-byte + dimension + 2MB photo checks, auth/ownership
  served files); staff owner PATCH + review data (verified flag, prefs).
- Pet self-edit with ownership-from-session, append-only weight
  measurements (consultations mirror too), pet photos, strict schema
  (unknown/clinical fields → 400, `owner_id` → 400).
- Notifications: prefs (4 toggles), caller-owned devices (409 on
  foreign tokens, invalid FCM purged), idempotent reconcile
  (appointments/vaccinations), clinic notices without clinical detail,
  bounded retries + backoff, prefs re-checked at send, placeholder
  emails never mailed, `notify:due` script + admin run endpoint.
- Migration v2 verified on clean DB (versions 1,2; 6/6 tables) and on a
  v1 data-bearing DB (all rows preserved + v2 tables).
- Web: Propietarios admin view (list + detail + prefs). Build OK.
- Android: Google button (Credential Manager, hidden unconfigured),
  editable profile + photo, pet editing + weight + photos, prefs
  switches, notifications inbox, EncryptedSharedPreferences tokens,
  silent refresh authenticator, logout revokes server-side,
  POST_NOTIFICATIONS permission. `assembleDebug` BUILD SUCCESSFUL.

Real-provider integration: NOT tested (no OAuth clients, no Firebase
project/`google-services.json`, no SMTP here). Providers refuse
honestly (501/`provider_unconfigured`/pending); tests use stubs only.
Exact setup + validation steps: `docs/OAUTH.md`. This phase is
therefore functionally complete but externally unblocked-pending —
not marked fully verified end-to-end.

## OAuth local configuration (2026-10-10, no secrets committed)

- `backend/.env` created from `.env.example` (verified gitignored):
  web audience configured, machine-local random `JWT_SECRET`
  (existing sessions were invalidated by the rotation — log in again),
  Firebase/SMTP intentionally left empty.
- Found while wiring: entry points never loaded `.env` (`dotenv`
  absent), so documented `.env` flow was inert — added `dotenv` to the
  four entry points (server/migrate/seed/send-due); suite still 63/63.
- Live check: `POST /auth/google` with a fake token → 401
  `invalid_google_token` (was 501) — audience configured, crypto path
  armed, no session minted.
- APK rebuilt with the web audience as `googleClientId` (verified in
  generated `BuildConfig`); the Google button now appears in the app.
- Seed grown for demos: 5 vets with schedules, 8 owners, 12 pets,
  mixed appointments/consultations/vaccinations, numbered invoices
  with attending vet (15 users, 8 owners, 12 pets verified on clean seed).
- Google Sign-In is NOT marked verified: the five `docs/OAUTH.md`
  checks need a real Google account on the phone (steps below in the
  handoff).

## v0.1.0 record (kept below)

## Verified (commands executed, outputs observed)

- `backend: npm install` → 84 packages, OK.
- `backend: npm test` → **15 pass / 0 fail** (auth, RBAC 401/403,
  Google 501, owner scoping, appointment overlap 409 + status machine,
  consultations/allergies/weight, vaccination alerts, server-side
  invoice totals + immutability, real-data dashboard).
- Clean-DB check (temp `clean-check.db`): `npm run migrate` +
  `npm run seed` → users=5, owners=2, pets=2, vaccinations=3,
  medications=3, appointments=1, consultations=1, invoices=1 (issued,
  totals 5500/550/6050), items=2.
- `web: npm install && npm run build` → `dist/` (index.html + assets),
  OK.
- Live integration (temp `integ.db`, backend :3101): staff login OK,
  `GET /dashboard` → revenue_cents=6050, attended=1, pending=0 —
  matches seed arithmetic. Web panel calls these same endpoints (no
  mocks in `web/src`).
- `git log`: work-unit commits per ODD task on this branch.

## Not verified (blocked, nothing claimed)

- Android compilation/APK: **no JDK installed** (`java` unrecognized).
  Source provided (`android/`), build not executed, no APK delivered.
  Needs: JDK 17 + Android SDK, then `./gradlew assembleDebug`.
- Google Sign-In end-to-end: needs real `GOOGLE_CLIENT_ID` + Android
  OAuth client. API path returns honest 501; app falls back to email
  login.
- Figma fidelity: link was a placeholder, so visual truth = `Mockups/`
  + `docs/VISUAL-SPEC.md`. Needs: real Figma URL + access.

## Fixed during verification (no silent simulations)

- `node:sqlite` runs one statement per `exec` → per-statement splitter;
  `journal_mode=WAL` skipped for `:memory:`; missing parens in schema;
  non-deterministic `date('now')` CHECK removed (moved to zod);
  better-sqlite3-style `db.transaction()` replaced with explicit
  `BEGIN IMMEDIATE/COMMIT/ROLLBACK`; test aligned to documented
  staff-price-override contract (totals still server-computed).

## Visual & asset compliance

- Palette `#00685F/#006947/#FD761A/#111C2D/#6D7A77` sampled from
  Mockups (discrepancy vs brief `#0D9488/#0F766E/#1E293B` recorded in
  `docs/VISUAL-SPEC.md`, assets win). Nunito/Inter roles kept.
- Original SVGs untouched; no emoji icons; photos stay embedded.

## APK built (2026-10-10, this machine)

Toolchain installed without admin rights: Temurin JDK 17.0.20
(portable, `%LOCALAPPDATA%\Programs\jdk17`), Android SDK cmdline-tools +
`platforms;android-34` + `build-tools;34.0.0` + licenses
(`%LOCALAPPDATA%\Android\Sdk`), Gradle 8.7 (portable). Fixes needed to
compile: Compose compiler plugin (Kotlin 2.0 requirement),
`gradle.properties` with `android.useAndroidX=true`, `.gradle`→`.gradle.kts`
renames (files were Kotlin DSL syntax), `LazyColumn` named
`verticalArrangement` argument, exhaustive `when`, `Alert` import
qualification, `usesCleartextTraffic=true` for LAN HTTP backend.

- Command: `gradle assembleDebug -PapiUrl=http://192.168.1.32:3001`
  → **BUILD SUCCESSFUL**, `android/app/build/outputs/apk/debug/app-debug.apk`
  (9.6 MB, `BuildConfig.API_URL` verified as `http://192.168.1.32:3001`).
- The APK is a build artifact (`build/` is gitignored); sources + marker
  commit `b6c555b` are in git.

### Install on a physical phone (same Wi-Fi as the PC)

1. On the PC, run the backend: `cd backend && npm start`
   (listens on all interfaces :3001).
2. Allow Node through Windows Firewall if the phone cannot reach it
   (private network, port 3001), or test from the phone browser first:
   `http://192.168.1.32:3001/health` must answer `{"ok":true}`.
   If the PC IP changes, rebuild with `-PapiUrl=http://<new-ip>:3001`.
3. Copy `app-debug.apk` to the phone (USB, Drive, WhatsApp to yourself…)
   and open it; allow “install unknown apps” for that source.
4. Log in with the demo owner: `demo@vetcura.local` / `VetCura123!`
   (pet Firulais + one upcoming vaccination alert; verified live
   against the API: role=owner, pets=Firulais, alerts=1).
   To get this account in your local DB, reset it once:
   delete `backend/data/vetcura.db*` and re-run `npm run migrate`
   + `npm run seed`.

## Closure validation (2026-10-09, repo at 6 work-unit commits + fixes)

Re-ran every applicable check from the current tree. No working
functionality was removed; no stack was changed; no secrets added
(`.env` search: none; only `backend/.env.example`).

| # | Verification | Command | Observed result | Final state |
| - | ------------ | ------- | --------------- | ----------- |
| 1 | Backend suite (incl. new owner-email 409 test) | `backend: npm test` | 16 pass / 0 fail | ✅ PASS |
| 2 | Web production build | `web: npm run build` | `dist/index.html` + assets, built in ~0.5 s | ✅ PASS |
| 3 | Git state | `git log`, `git status --short` | 9 commits, clean tree | ✅ PASS |
| 4 | No secrets in repo | recursive `.env` search | no matches; only `.env.example` | ✅ PASS |
| 5 | Android↔backend contract | readback `Api.kt` vs routes | paths match (`auth/login`, `pets`, `pets/{id}[/history]`, `appointments`, `vaccinations/alerts`, `invoices[/…]`); `pet_id` present in alerts payload (from `vaccinations.*`) | ✅ PASS (structural) |
| 6 | Endpoint/RBAC review | readback all routes | per-request enforcement intact; owner isolation on pets/appointments/invoices/alerts/history; staff-only mutations; billing server-side | ✅ PASS (2 fixes, see below) |
| 7 | JDK / SDK / Gradle presence | `java -version`, env vars, SDK dir, `gradle --version` | all absent | ⛔ EXTERNAL BLOCKER |
| 8 | `assembleDebug` / APK | — (not runnable without 7) | not executed, no APK claimed | ⛔ EXTERNAL BLOCKER |
| 9 | Gradle wrapper jar fetch | `Invoke-WebRequest` raw GitHub `gradle-wrapper.jar` | 404 — Gradle publishes no standalone jar URL | ⛔ EXTERNAL BLOCKER (manual step documented) |
| 10 | Google Sign-In e2e | — (needs OAuth client) | API 501 path covered by test; email login unaffected | ⛔ EXTERNAL BLOCKER |
| 11 | Figma fidelity | — (link was a placeholder) | Mockups kept as provisional reference; no URL invented | ⛔ EXTERNAL BLOCKER |

Code errors found and fixed in this phase (not blockers):
- Google linking attached `google_sub` to non-owner accounts before
  rejecting them (403 after write). Now rejects before any write
  (`backend/src/routes/auth.js`).
- Android matched vaccination alerts to pets by vaccination `id`
  instead of `pet_id` — wrong cards would show wrong alerts. Now
  matches `alert.pet_id == pet.id` (`Api.kt`, `Screens.kt`); also
  removed a dead `list` state variable.
- Owner onboarding gap: staff-created owners had placeholder emails
  only, so Google linking by address could never match. `POST /owners`
  now accepts an optional real `email` (409 on duplicate, 400 on
  invalid); covered by a new test.
- Missing CORS headers: the API rejected browser cross-origin calls
  from the Vite panel (`Failed to fetch` on login). Added the `cors`
  middleware (open origin in local dev via empty `CORS_ORIGIN`,
  restricted in production); verified live with an `Origin:
  http://localhost:5173` request returning
  `Access-Control-Allow-Origin`. Suite still 16/16 after the change.

Security notes (reviewed, no change required for v0.1.0): bcrypt-hashed
staff passwords; JWT 12 h expiry via `JWT_SECRET` env (dev default is
documented as non-production); `express.json({limit:'1mb'})`;
length-capped zod schemas on every input; invoice totals recomputed in
transactions; no billing math on clients. Hardening follow-ups (not
defects): login rate-limiting, refresh-token rotation, Postgres path.

Pending manual interventions (nothing else blocks delivery):

1. JDK 17 + Android SDK + wrapper jar → `./gradlew assembleDebug`
   (exact steps in `android/README.md`).
2. Real Figma URL + viewer access → pixel-fidelity pass.
3. `GOOGLE_CLIENT_ID` + Android OAuth client (SHA-1) → Google e2e.
