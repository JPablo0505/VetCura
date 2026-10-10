# Install, Run, Test

Prerequisites: Node 24+, npm, (Android only: JDK 17 + Android SDK —
currently missing, see `docs/DELIVERY.md`). No secrets in repo.

## Backend

```bash
cd backend
npm install
cp .env.example .env   # set JWT_SECRET; optional GOOGLE_CLIENT_ID, TAX_RATE
npm run migrate        # creates ./data/vetcura.db
npm run seed           # dev users (password: VetCura123!), pets, alerts, invoice
npm start              # http://localhost:3001
npm test               # 15 integration tests (in-memory DB)
```

Env (`backend/.env.example`): `PORT` (3001), `DATABASE_PATH`,
`UPLOAD_DIR` (`./data/uploads`), `JWT_SECRET` (required in production),
`JWT_EXPIRES_IN` (30m — short-lived access, renewed via refresh),
`REFRESH_TOKEN_DAYS` (30), `AUTH_RATE_LIMIT_MAX` (30/min/IP on auth),
`TAX_RATE` (0.19), `GOOGLE_CLIENT_ID` + `GOOGLE_ALLOWED_AUDIENCES`
(empty → `/auth/google` is 501; see `docs/OAUTH.md`),
`SMTP_*` (empty → mail stays pending, never fake-sent),
`FCM_*` (empty → push refuses honestly),
`CORS_ORIGIN` (empty in local dev allows the panel origin; set the real
panel URL in production).

Notifications scheduler (optional, every 30 min):
`DATABASE_PATH=./data/vetcura.db node scripts/send-due.js`
(or `npm run notify:due`). Prints a JSON summary; unconfigured
providers report errors per item without marking anything sent.

## Web panel

```bash
cd web
npm install
npm run build          # outputs web/dist (serve statically)
npm run dev            # dev server :5173, API at VITE_API_URL (default http://localhost:3001)
```

Login with a staff account from the seed
(`admin@vetcura.local` / `VetCura123!`). The Android app signs in as the
demo owner: `demo@vetcura.local` / `VetCura123!` (pet Firulais + one
upcoming vaccination alert).

Owner onboarding: staff create the owner with their REAL email
(`POST /owners {display_name, email}`); the owner then signs in with
Google using that same address and the backend links the Google identity
to the existing owner record. Placeholder emails (`...@placeholder.local`)
cannot be claimed until staff set a real address.

## Android

Full manual setup lives in `android/README.md` (JDK 17 + SDK +
`local.properties` + wrapper jar generation + `assembleDebug`).
Still blocked in this environment: no JDK/SDK/gradle present
(re-verified 2026-10-09). Emulator API URL is `http://10.0.2.2:3001`
(`API_URL` BuildConfig). No APK is provided with this delivery.

## Permissions & data safety

- RBAC is enforced per-request in the backend; UI hiding is cosmetic.
- Billing totals compute server-side; clients display them.
- Google Sign-In needs a real OAuth client id + SHA-1 registration;
  without it the app shows email login and the API answers 501.
