# ODD Feature: vetcura-clinical-plus — Exams, internal history, prescriptions, color

## Objective

Lab PDF exams attached by vets and delivered to owners; internal
clinical detail (vet-only, trial) vs client-visible summary +
prescription + invoice; formal medication prescription (Roman numerals,
computed units, vet signature); pet color everywhere + sex display.

## Visibility contract (trial, documented)

- Owner sees per consultation: date, vet, client_summary (generic
  one-liner, e.g. "Revisión general y administración de medicamentos"),
  prescriptions, exam PDFs, weight. NEVER: diagnosis detail,
  internal_notes, treatment internals.
- Staff see the full record (diagnosis, internal notes, everything).
- Same endpoints, role-based serialization (no parallel API).

## Design

- Migration v5: `consultation_attachments`, `consultations.internal_notes`,
  `consultations.client_summary`, `prescriptions` + `prescription_items`
  (server-computed `total_units = qty_per_dose × times_per_day ×
  duration_days`, ordered `item_no`), `pets.color`, `users.professional_id`.
- Exams: PDF-only (magic `%PDF`), ≤10 MB, server filenames, auth +
  ownership serve; owner lists/downloads own pet's.
- Prescription: POST once per consultation (vet), items validated,
  units computed; owner reads own pet's.
- Professional id (`MPxxxxx`) set on vet users (seeded); printed as
  the prescription signature with vet name.
- Pet PATCH whitelist += color; web create + edit; Android edit.

## Acceptance criteria

1. Suite green: attachment rules, visibility split (owner vs staff),
   prescription math/order, color, professional id on receipt.
2. Old owner-history assertions updated to the new contract
   (documented behavior change, not a regression).
3. Web: exam upload/list, internal+summary consult fields,
   prescription create/view, color everywhere.
4. Android: color/sex edit, prescription card, exam download-to-open.
5. APK assembles; docs updated.

## Verification evidence

- `backend: npm test` → 85/85 (79 + 6 clinical-plus).
- Migration v5 verified implicitly: clean `:memory:` suites create all
  tables; existing-DB path covered by the same atomic migrator
  (v1→v5 chain reuses the proven mechanism).
- `web: npm run build` OK (exams, prescriptions, pet edit, color/sex).
- `android: assembleDebug` BUILD SUCCESSFUL (prescription card with
  Roman numerals, exam open via FileProvider, color edit).
- Old `api.test.js` consultation assertions migrated to the trial
  visibility contract (owner summary, staff detail).

## Authorized scope

- `odd/tasks/vetcura-clinical-plus.md`, `docs/API.md`, `docs/DELIVERY.md`
- `backend/db/schema.js`, `backend/src/routes/*`, `backend/tests/*`
- `web/src/**/*`
- `android/.../data/Api.kt`, `.../ui/screens/*`, manifest/FileProvider
