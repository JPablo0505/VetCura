# API Reference (v0.1.0)

Base URL: `http://localhost:3001`. Auth: `Authorization: Bearer <JWT>`.
Errors: `{ error: { code, message } }` with 400 validation_error,
401 unauthorized/invalid_credentials, 403 forbidden, 404 not_found,
409 conflict/invalid_transition, 501 google_unconfigured.

## Auth

- `POST /auth/login {email, password}` → `{token, refreshToken, user}`
  (30/min/IP rate limit → 429 + `Retry-After`).
- `POST /auth/google {id_token}` → session (owner only). 501
  unconfigured; 409 `link_verification_required` for known emails
  without a linked `sub` — never auto-linked.
- `PUT /auth/google/link {id_token}` (own Bearer session) and
  `POST /auth/google/link {email, password, id_token}` (password
  proof) → link a Google identity after email match + verified mail.
- `POST /auth/refresh {refresh_token}` → rotated pair (old dies).
- `POST /auth/logout [{refresh_token}]` → revokes one or all-own.
- `GET /auth/sessions` (own active, no hashes) ·
  `DELETE /auth/sessions/:id` (revoke own).
- `GET /auth/me` → `{user}`.

## Owners & pets

- `GET /owners` (staff, with `email_verified`) · `POST /owners {display_name, email?,
  phone?, address?}` (admin/staff; real email enables later Google
  linking by address, 409 on duplicate) ·
  `GET /owners/:id` (self or staff, includes pets + preferences) ·
  `PATCH /owners/:id` (admin/staff; strict whitelist, audited).
- `GET /me/profile` · `PATCH /me/profile` (owner; strict whitelist,
  partial updates preserve fields; role/email/ids never writable) ·
  `GET/PATCH /me/preferences` (4 independent toggles) ·
  `POST /me/photo` + `GET /me/photo` (JPEG/PNG/WebP ≤ 2 MB,
  magic-byte + dimension checked, auth + ownership enforced).
- `GET /pets` (owners: own only) · `POST /pets` (staff) ·
  `GET /pets/:id` (+ vaccinations + weight measurements) ·
  `PATCH /pets/:id` (owner-if-owns or staff; `weight_kg` appends a
  dated measurement, `owner_id` rejected with 400) ·
  `GET /pets/:id/measurements` ·
  `POST/GET /pets/:id/photo` (same photo rules + ownership).

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
  `tax = round(subtotal × TAX_RATE)` (default 0.19), `total = subtotal +
  tax`. 409 once issued.
- `DELETE /invoices/:id/items/:itemId` (draft only) ·
  `PATCH /invoices/:id/status` — draft→issued|void, issued→paid|void.

## Notifications (prefs-gated, minimal payloads, no clinical detail)

- `GET/PATCH /me/preferences` — push/email/appointment/vaccination.
- `GET /me/devices` · `POST /me/devices {fcm_token}` (caller-owned;
  409 if another account holds it) · `DELETE /me/devices/:id` (own).
- `GET /me/notifications[?status]` (own queue history).
- `GET /admin/notifications[?status]` (staff) ·
  `POST /admin/notifications/run` (admin; reconcile + send now).
- Scheduler: `npm run notify:due` (cron every 15–60 min). Unconfigured
  providers leave items pending/failed — never fake-sent.

## Dashboard (staff, real data)

- `GET /dashboard` → `{revenue_cents (issued+paid), attended, pending,
  staff_performance[]}`.
