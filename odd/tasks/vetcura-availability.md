# ODD Feature: vetcura-availability — Vet schedules, free slots, slot-based booking

## Objective

Appointments depend on real vet availability: staff define weekly
working ranges per vet; clients (web agenda + Android) pick a vet, see
free slots for a date, and book into one. The backend enforces it.

## Design (compatible extension, no breaking changes)

- New table `vet_availability(id, vet_user_id FK, weekday 0–6,
  start_min, end_min, CHECK end>start, UNIQUE(vet, weekday, start))`.
- `GET /vets/:id/availability` (staff) · `POST` (admin/staff) ·
  `DELETE /availability/:id` (admin/staff).
- `GET /vets/:id/slots?date=YYYY-MM-DD&slot_min=30` (any authenticated
  user): free slots = availability windows minus overlapping
  non-cancelled appointments, stepped by slot_min. Past times excluded
  for today.
- `POST /appointments` with `vet_user_id`: 409 `unavailable` when the
  requested range is not fully inside one availability window (overlap
  check stays). Without vet: unchanged (triage).
- Seed: Dr. Rivera Mon–Fri 08:00–17:00 so demo flows work.
- Web: agenda gains vet → date → free-slot chips (click fills the
  form); new Doctores view manages weekly ranges per vet.
- Android: booking gains vet dropdown → date → slot chips; books the
  chosen slot (no more manual datetimes).

## Acceptance criteria

1. Migration v3 applies clean + on data; suite green incl. new tests:
   CRUD guards, slots exclude booked, booking outside hours 409,
   unknown vet 404.
2. Web agenda books through slots; Doctores view edits ranges live.
3. Android books through vet + date + slots; APK assembles.
4. No changes to auth/billing/clinical contracts.

## Verification evidence

- `backend: npm test` → 71/71 (65 + 6 availability).
- `web: npm run build` OK (slots booking + Doctores view).
- `android: assembleDebug` BUILD SUCCESSFUL (vet/date/slot booking).
- `GET /vets` opened to owners (names only) so clients can choose a
  doctor; all other catalog writes stay restricted.

## Authorized scope

- `odd/tasks/vetcura-availability.md`, `docs/API.md`
- `backend/db/schema.js`, `backend/src/routes/appointments.js`,
  new `backend/src/routes/availability.js`, `backend/scripts/seed.js`,
  `backend/tests/availability.test.js`
- `web/src/views/agenda.js`, new `web/src/views/doctors.js`,
  `web/src/main.js`
- `android/.../data/Api.kt`, `.../ui/screens/Screens.kt`
