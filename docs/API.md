# API Reference (v0.1.0)

Base URL: `http://localhost:3001`. Auth: `Authorization: Bearer <JWT>`.
Errors: `{ error: { code, message } }` with 400 validation_error,
401 unauthorized/invalid_credentials, 403 forbidden, 404 not_found,
409 conflict/invalid_transition, 501 google_unconfigured.

## Auth

- `POST /auth/login {email, password}` → `{token, user}`.
- `POST /auth/google {id_token}` → `{token, user}` (owner only). 501
  without `GOOGLE_CLIENT_ID`; never mints a session otherwise.
- `GET /auth/me` → `{user}`.

## Owners & pets

- `GET /owners` (staff) · `POST /owners {display_name, email?,
  phone?, address?}` (admin/staff; real email enables later Google
  linking by address, 409 on duplicate) ·
  `GET /owners/:id` (self or staff, includes pets).
- `GET /pets` (owners: own only) · `POST /pets` (staff) ·
  `GET /pets/:id` (+ vaccinations) · `PATCH /pets/:id` (staff).

## Appointments

- `GET /appointments[?from&to]` (owners scoped) · `POST /appointments
  {pet_id, vet_user_id?, starts_at, ends_at, reason?}` — 409 on vet
  overlap; owners may book their own pets.
- `PATCH /appointments/:id/status {status}` (staff) — machine:
  scheduled→checked_in|cancelled|no_show,
  checked_in→done|cancelled|no_show (terminal otherwise).

## Clinical

- `POST /consultations {appointment_id?, pet_id, weight_kg?,
  diagnosis, treatment?, notes?, allergies[]}` (admin/vet; unique
  appointment; syncs pet weight).
- `GET /pets/:id/history` → `{consultations[] (with allergies,
  vet_name, newest first), vaccinations[]}`.
- `GET /pets/:id/weight-history` → `{history: [{date, weight_kg}]}`.
- `POST /vaccinations {pet_id, vaccine, due_date, given_date?}`
  (staff; given_date not in future) · `PATCH /vaccinations/:id`.
- `GET /vaccinations/alerts` → overdue + due within 30 days, ungiven
  (`overdue` flag; owners scoped).

## Catalog

- `GET /vets` (staff) · `GET /medications[?q]` ·
  `POST /medications {name, kind: drug|supply, price_cents, stock}`
  (admin/vet).

## Invoices (totals always server-side)

- `GET /invoices` (owners scoped) · `GET /invoices/:id` (with items).
- `POST /invoices {pet_id}` → draft (staff; owner derived from pet).
- `POST /invoices/:id/items {medication_id?, description, qty,
  unit_price_cents?}` — draft only; catalog price resolves when omitted;
  `line_total = qty × unit_price`, `subtotal = Σ lines`,
  `tax = round(subtotal × TAX_RATE)` (default 0.10), `total = subtotal +
  tax`. 409 once issued.
- `DELETE /invoices/:id/items/:itemId` (draft only) ·
  `PATCH /invoices/:id/status` — draft→issued|void, issued→paid|void.

## Dashboard (staff, real data)

- `GET /dashboard` → `{revenue_cents (issued+paid), attended, pending,
  staff_performance[]}`.
