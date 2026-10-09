# ODD Feature: vetcura-foundation — Discovery, Backend, Web Panel, Android Source, Integration

## Objective

Build the complete VetCura veterinary system from an empty repo (only
`Mockups/` SVGs): shared backend API + relational DB, staff web panel,
owner Android app source, integration and docs.

## Problem

No code, no git history, no backend, no DB. Figma link is a placeholder
(`[PEGA AQUÍ EL ENLACE DE FIGMA]`), so Figma inspection is BLOCKED.
Mockup SVGs are full-screen exports with outlined text. No JDK installed,
so an Android APK cannot be compiled in this environment.

## Why

User explicitly authorized full-cycle ODD implementation with verification.
Independent tasks proceed despite external blockers (Figma access, OAuth
credentials, JDK), each recorded with the exact intervention needed.

## Scope

IN: discovery inventory; requirements/architecture/visual-spec docs;
backend REST API + SQLite migrations + RBAC + billing totals server-side;
seed data; automated backend tests; web panel (dashboard, agenda, patients,
billing) built and served; Android Kotlin/Compose source; integration checks;
final docs and delivery record.
OUT OF THIS FEATURE: real Google OAuth credentials, Figma import, APK binary
(blocked — JDK missing), public deployment.

## Constraints

- No secrets in repo (`.env.example` only).
- RBAC enforced in backend, never only in UI.
- Billing totals computed server-side.
- Real system data in indicators/tables; no fake figures.
- Never claim unverified builds/passing tests; record commands + results.
- Reuse original SVGs; never overwrite them; no emoji icon replacements.

## Authorized scope (allowed edit surfaces)

- `odd/tasks/vetcura-foundation.md`
- `docs/*`, `README.md`
- `backend/**/*`
- `web/**/*`
- `android/**/*`
- `.gitignore`

## Acceptance criteria

1. `backend`: `npm test` passes; migrations apply on a clean DB; seed loads.
2. Auth: email/password login issues JWT; role checks enforced (401/403
   observed in tests); `POST /auth/google` without credentials returns 501,
   never a fake session.
3. Pets/appointments/clinical-history/vaccination-alerts/invoices flows
   covered by tests with real DB assertions (including server-side totals).
4. `web`: `npm run build` succeeds; panel calls the real API (no mocks).
5. `android`: Kotlin/Compose source present for login, pets dashboard,
   appointments, history, invoices; documents JDK blocker; no fake APK claim.
6. Integration script exercises backend through both clients' contracts.
7. Docs: install/run/test instructions reproducible; blockers listed.

## Applicable checks

- `backend`: `npm test` (node:test), migration-from-clean check.
- `web`: `npm run build`, static structural check.
- `android`: structural readback only (no runner available).

## Route declaration

- Delegation trigger evidence: mapping (5 SVGs), implementation (3
  packages), broad research — all fire Mandatory Delegation Triggers.
- Delegation mechanism (`task` subagents) is UNAVAILABLE in this runtime
  (free-tier restriction error observed). Deviation: parent works DIRECT
  INLINE and records it here + in memory, instead of stalling.
- Test-first policy: backend tests written alongside routes; RED observed
  via failing import before implementation where practical; exceptions for
  docs/panel explained in handoff.

## Checklist (observed outcomes)

- [x] 1. Repo baseline: git init, .gitignore, docs skeleton (commit 9f344db)
- [x] 2. Discovery docs: VISUAL-SPEC.md, ASSET-INVENTORY.md, ARCHITECTURE.md
- [x] 3. Backend scaffold + migrations + seed (clean-DB verified)
- [x] 4. Auth + RBAC (JWT, Google 501 without credentials; 15/15 tests)
- [x] 5. Domain routes: owners, pets, vets, appointments, consultations,
      vaccinations, medications, invoices (server-side totals)
- [x] 6. Backend tests green (15/15) + clean-DB migration check
- [x] 7. Web panel built (`web/dist`) against real API (live :3101 check)
- [x] 8. Android source + JDK blocker documented (NOT compiled, no APK)
- [x] 9. Integration verification + final docs + delivery record

## Verification evidence

- `backend: npm test` → 15 pass / 0 fail.
- Clean DB: migrate + seed → 5 users, 2 pets, 3 vaccinations, 1 issued
  invoice (5500/550/6050).
- Live :3101: admin login OK; dashboard revenue_cents=6050,
  attended=1, pending=0.
- `web: npm run build` → dist/index.html + assets, OK.
- Android: structural readback only (no JDK); no build claimed.
