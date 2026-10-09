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
