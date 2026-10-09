# Delivery Record (v0.1.0)

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
