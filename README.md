# VetCura — Integrated Veterinary System

VetCura is a complete veterinary clinic system for the Colombian market
(COP, IVA 19%, es-CO dates): one shared backend, a staff web panel, and
an owner Android app. Owners book appointments against real vet
availability, see their pets' records, receive prescriptions and exam
PDFs, and pay invoices from the phone.

**Status: implemented and verified.** Backend suite **85/85 pass**,
web production build OK, Android debug APK assembled. Remaining gaps are
external credentials only (Google OAuth, Firebase, SMTP, Figma) and are
listed in [`docs/DELIVERY.md`](docs/DELIVERY.md).

## Repository layout

| Path         | What it is                                              |
| ------------ | ------------------------------------------------------- |
| `backend/`   | Express API + SQLite (`node:sqlite`), migrations, seed, tests |
| `web/`       | Staff panel — Vite + vanilla JS, hash router             |
| `android/`   | Owner app — Kotlin, Jetpack Compose, Retrofit            |
| `Mockups/`   | Original full-screen SVG exports (read-only visual truth) |
| `odd/`       | ODD task records — one file per feature, with evidence   |
| `docs/`      | API, architecture, install, OAuth, visual spec, delivery |

## Quick start

```bash
# Terminal 1 — backend: creates ./data/vetcura.db, seeds demo data, serves :3001
cd backend
npm install
cp .env.example .env      # set JWT_SECRET; everything else optional
npm run migrate && npm run seed
npm start
```

```bash
# Verify (any other terminal)
curl http://localhost:3001/health        # {"ok":true}
```

```bash
# Terminal 2 — web staff panel, dev server :5173
cd web
npm install
npm run dev                # or: npm run build  →  web/dist
```

### Demo accounts (from `npm run seed`)

| Role  | Email                   | Password      | Opens                          |
| ----- | ----------------------- | ------------- | ------------------------------ |
| Staff | `admin@vetcura.local`   | `VetCura123!` | Web panel: agenda, patients, billing |
| Owner | `demo@vetcura.local`    | `VetCura123!` | Android app: Firulais + vaccination alert |

### Tests

```bash
cd backend && npm test      # 85 integration tests, in-memory DB
```

## Features

| Area          | What works                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| Scheduling    | Vet weekly availability → free-slot chips → slot booking; backend rejects out-of-hours bookings with 409 and guards per-vet overlap |
| Clinical      | Consultations with **internal notes (vet-only)** vs **client summary (owner-visible)**, allergies, weight history |
| Exams & prescriptions | Lab **PDF attachments** served only to the owning client; formal prescriptions with computed units, Roman-numeral numbering, vet professional id (`MPxxxxx`) |
| Pets          | Owner self-service editing, photos, color/sex everywhere, append-only weight history |
| Vaccinations  | Due-date alerts (30-day window) on both clients                            |
| Billing       | Numbered receipts, IVA 19%, **totals computed server-side**, staff issue → owner pays in app |
| Auth          | JWT + refresh-token rotation, auth rate limiting, RBAC (`admin|vet|staff|owner`) enforced per request, Google Sign-In with crypto verification and proof-based account linking |
| Notifications | Per-category preferences, idempotent queue + scheduler, pluggable email/FCM providers that refuse honestly when unconfigured (never fake-sent) |
| Dashboard     | Real data: revenue, attended/pending appointments, staff performance       |

## Android app

Owner app builds to a debug APK (toolchain steps in
[`android/README.md`](android/README.md)):

```powershell
gradle assembleDebug "-PapiUrl=http://<pc-lan-ip>:3001"
# → android/app/build/outputs/apk/debug/app-debug.apk
```

The API URL is baked in at build time (emulator default
`http://10.0.2.2:3001`). Install the backend first; the phone must reach
it on the same network.

## Documentation map

| Doc                                          | Read it for                                    |
| -------------------------------------------- | ---------------------------------------------- |
| [`docs/INSTALL.md`](docs/INSTALL.md)         | Full setup, env reference, permissions          |
| [`docs/API.md`](docs/API.md)                 | Endpoint contract and payloads                  |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Design decisions and data model               |
| [`docs/OAUTH.md`](docs/OAUTH.md)             | Google Sign-In setup + validation checklist     |
| [`docs/VISUAL-SPEC.md`](docs/VISUAL-SPEC.md) | Palette, typography, mockup mapping             |
| [`docs/DELIVERY.md`](docs/DELIVERY.md)       | What is verified, what is pending, evidence     |

## Configuration

No secrets live in this repo. Copy `backend/.env.example` to
`backend/.env` and set at least `JWT_SECRET`. Providers left empty
behave honestly: Google returns 501, mail stays `pending`, push refuses —
nothing is ever simulated as sent.

## Pending

External items that need credentials or accounts, tracked in
[`docs/DELIVERY.md`](docs/DELIVERY.md):

- [ ] Google Cloud OAuth clients → real Google Sign-In e2e (`docs/OAUTH.md` checks 1-5)
- [ ] Firebase `google-services.json` → FCM push registration
- [ ] SMTP credentials → first live email delivery test
- [ ] Real Figma URL → pixel-fidelity pass (mockups are provisional truth)
- [ ] Optional hardening: login rate-limit tuning, Postgres path
