# Architecture (ODD decision record)

## Decision

Monolith-first: one Express API (`backend/`) over SQLite (`node:sqlite`,
WAL), JWT auth with role claims, thin clients (web panel, Android app).
No microservices: a single deployable keeps transactions (e.g. invoice
totals, appointment booking) ACID without distributed machinery.

## Stack justification (via ODD explore)

- **Backend: Node 24 + Express + node:sqlite.** Installed toolchain is
  Node 24 / npm / Python / Docker; no JDK, no Ruby. `node:sqlite` is
  stdlib — zero native addons, migrations run anywhere Node runs.
  `zod` validates every input; `jsonwebtoken` + `bcryptjs` are pure-JS.
- **Web panel: Vite + vanilla JS.** Admin CRUD over tables needs no
  framework weight; Vite gives a real production build (`dist/`).
- **Android: Kotlin + Jetpack Compose + Retrofit + Hilt (planned).**
  Evaluated per brief: Compose is the current native UI standard,
  Retrofit fits the REST contract. Source is provided; compilation is
  BLOCKED (no JDK in this environment) — see `docs/DELIVERY.md`.
- **Auth:** email/password (bcrypt) for staff; Google Sign-In for owners
  verified against Google `tokeninfo` ONLY when `GOOGLE_CLIENT_ID` is set.
  Without credentials the endpoint returns 501 — never a fake session.

## Data model

`users(id, email unique, password_hash, role[admin|vet|staff|owner],
google_sub unique nullable, display_name)` →
`owners(user_id FK unique, phone, address)` →
`pets(owner_id FK, name, species, breed, birthdate, sex, weight_kg, photo_url)` →
`appointments(pet_id FK, vet_user_id FK nullable, starts_at, ends_at,
status[scheduled|checked_in|done|cancelled|no_show], reason)` with overlap
guard per vet; `consultations(appointment_id FK unique nullable, pet_id FK,
vet_user_id FK, weight_kg, diagnosis, treatment, notes, created_at)` →
`consultation_allergies`, `vaccinations(pet_id FK, vaccine, due_date,
given_date nullable, status)` with alert view `due_date <= today+30 AND
given_date IS NULL`; `medications(id, name, kind[drug|supply], price_cents,
stock)`; `invoices(pet_id FK, owner_id FK, status[draft|issued|paid|void],
subtotal_cents, tax_cents, total_cents)` + `invoice_items(invoice_id FK,
medication_id FK nullable, description, qty, unit_price_cents, line_total)`
— totals computed ONLY server-side in a transaction; invoices immutable
once `issued` except `void`.

## API contract (summary)

`POST /auth/login`, `POST /auth/google` (501 unconfigured),
`GET /me`, CRUD `/owners`, `/pets`, `/vets` (staff), `/appointments`
(overlap-checked, status machine), `/consultations`, `/vaccinations`
+ `GET /vaccinations/alerts`, `/medications`, `/invoices` (draft editable,
issue/pay/void transitions, totals server-side). All errors JSON
`{ error: { code, message } }`; validation 400, auth 401, forbidden 403,
not-found 404, conflict 409. Full reference: `docs/API.md`.

## Decisions log

1. SQLite over Postgres: single-file, zero-ops, sufficient for clinic
   scale; repository pattern isolates SQL for later migration.
2. Primary color `#00685F` as observed in Mockups (not brief `#0D9488`);
   discrepancy recorded in `docs/VISUAL-SPEC.md`.
3. Spanish UI copy (product requirement for local clinic users); code,
   comments, commit messages in English.
