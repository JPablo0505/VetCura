# ODD Feature: vetcura-invoicing — Formal receipt flow (web issues, app pays)

## Objective

Invoices look and behave like the reference paper receipt: numbered,
dated, clinic header + NIT, itemized table, subtotal + IVA 19%, total,
thanks note. Staff issue from the web panel (which notifies the
owner); the owner sees it in the app and pays there.

## Design

- Migration v4: `invoices.number TEXT UNIQUE` (assigned at issue,
  `FV-0001` sequence, transactional), `payment_method TEXT`,
  `paid_at TEXT`.
- Issue transition assigns the next number and enqueues a minimal
  clinic notice for the owner (existing engine, no clinical detail).
- New owner endpoint `POST /invoices/:id/pay {payment_method}`:
  owner-scoped (own invoice, `issued` only) → `paid` + `paid_at`.
  Staff keep the PATCH machine.
- `GET /clinic` (auth): header data from env
  (`CLINIC_NAME/NIT/ADDRESS/CITY`, Colombian defaults) for the receipt.
- Invoice payloads include `number`, `owner_name`, `pet_name` for
  rendering; totals still server-computed only.
- Android: receipt screen mirroring the paper layout + method chips
  (Efectivo/Transferencia/Tarjeta) + pay confirm; web shows numbers.

## Acceptance criteria

1. Numbers unique/sequential; pay only own issued invoices; method + paid_at stored.
2. Issue notifies the owner (queue item, prefs-gated by engine).
3. Suite green incl. new invoicing tests; no billing-math changes.
4. Android receipt renders header/items/totals/thanks + pay works; APK assembles.

## Verification evidence

- `backend: npm test` → 78/78 (71 + 7 invoicing).
- Migration v4 verified on a v1 data DB (versions 1–4, rows intact,
  `number`/`payment_method`/`paid_at` present).
- `web: npm run build` OK (number column + "Emitir y enviar").
- `android: assembleDebug` BUILD SUCCESSFUL (receipt screen + pay
  confirm with method chips).

## Authorized scope

- `odd/tasks/vetcura-invoicing.md`, `docs/API.md`, `docs/DELIVERY.md`
- `backend/db/schema.js`, `backend/src/routes/invoices.js`,
  new `backend/src/routes/clinic.js`, `backend/scripts/seed.js`,
  `backend/tests/invoicing.test.js`, `backend/.env.example`
- `web/src/views/billing.js`
- `android/.../data/Api.kt`, `.../ui/screens/Screens.kt`
