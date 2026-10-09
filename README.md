# VetCura — Integrated Veterinary System

Monorepo: shared backend API, staff web panel, owner Android app.

| Package     | Stack                                  | Run / build               |
| ----------- | -------------------------------------- | ------------------------- |
| `backend/`  | Node 24, Express, node:sqlite, JWT     | `npm install && npm test` |
| `web/`      | Vite + vanilla JS, hash router         | `npm install && npm run build` |
| `android/`  | Kotlin, Jetpack Compose, Retrofit      | Requires JDK 17 (blocked, see docs) |
| `Mockups/`  | Original full-screen SVG exports (read-only reference) | — |

Docs: `docs/` (requirements, architecture, visual spec, asset inventory,
decisions, installation, delivery record).

Quickstart (backend + web):

```bash
cd backend && npm install && npm run migrate && npm run seed && npm start
cd ../web && npm install && npm run build
```

See `docs/INSTALL.md`. No secrets are stored in this repo; copy
`backend/.env.example` to `backend/.env` for local config.
