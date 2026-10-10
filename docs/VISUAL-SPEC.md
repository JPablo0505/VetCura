# Visual Spec (source: Mockups/ + brief; Figma BLOCKED)

Figma access is blocked: the provided link is the literal placeholder
`[PEGA AQUÍ EL ENLACE DE FIGMA]` (no URL). The visual source of truth
used is `Mockups/` (5 self-contained SVG exports, text outlined to
paths, photos embedded as base64 JPEG). Intervention needed for exact
Figma fidelity: a real Figma file URL + viewer access.

## Screen inventory (observed)

| File | Canvas | Platform | Content |
| ---- | ------ | -------- | ------- |
| `Login.svg` | 390x620 | Android | Owner login, VetCura wordmark, Google button (G colors #4285F4/#34A853/#EA4335 present) |
| `Movil.svg` | 414x1470 | Android | Owner scrolling home: pet cards, vaccination alerts, appointments |
| `Dashboard.svg` | 1296x2009 | Web | Staff dashboard: revenue, attended/pending appointments, staff performance, 5 photos |
| `Consulta.svg` | 1296x1666 | Web | Clinical record: consultation form, history, 2 photos |
| `Trabajador.svg` | 1296x1475 | Web | Staff/worker management + sidebar (Dashboard, Agenda, Pacientes, Facturación), 4 photos |

Figma↔feature mapping: Login→owner Google login; Movil→pets dashboard,
alerts, appointment request/track, history, invoices; Dashboard→income,
attended/pending counts, staff performance (real data); Consulta→clinical
file, weight/allergy history, consultation+diagnosis, medication picker;
Trabajador→owners/pets/workers admin; billing screens→invoice items with
server totals.

## Tokens (observed in assets; take precedence over brief where confirmed)

- Primary: `#00685F` (28–38 fills/file) with dark variant `#006947`.
  Brief proposed `#0D9488`/`#0F766E` — DISCREPANCY: assets win, `#00685F`
  is definitive until Figma says otherwise.
- Secondary: `#FD761A` (brief `#F97316` — close; assets win: `#FD761A`).
- Ink: `#111C2D` (brief `#1E293B` — assets win for headings).
- Muted: `#6D7A77` (most frequent fill — body/secondary text).
- Surfaces: `#F9F9FF` app bg, `#F0F3FF` chips, `#E7EEFF` info.
- Danger: `#BA1A1A`, success greens `#006947`/`#008378`/`#6FFBBE`.
- Type: no live `<text>` in SVGs (all outlined) — brief fonts stand:
  Nunito headings, Inter body/clinical data. Radius 12–16px, subtle
  shadows, light mode, Clean Material style per brief.

## Reuse rule

SVGs render as-is in web (`<img>`); photos stay embedded. Icons must be
hand-extracted (outlines carry no semantics) — only where needed; no
emoji substitutions. Originals never overwritten.

## UI fidelity pass (2026-10-10, feature `vetcura-ui-fidelity`)

All five mockups were rendered and inspected pixel by pixel. Tabs and
structure mirror them on both clients; every screen without backend
support was cut instead of simulated:

| Mockup element | Implementation | Evidence |
| -------------- | -------------- | -------- |
| Web dark-teal sidebar + 5 items | Real nav (Eficiencia, Consulta, Agenda, Pacientes, Farmacia) + Facturación (superset, documented) | `web/src/main.js` |
| Web topbar search/user/date | Live patient search, `/auth/me` chip, real date | `web/src/main.js` |
| Login screen | Mirrored; clinic-ID anonymous access → email login | `web/src/main.js` LoginView |
| Dashboard KPIs + staff table | Real data only; CSV daily report from real endpoints | `web/src/views/dashboard.js` |
| Agenda week/day/month + legend | Real ranges; chip click advances status via PATCH | `web/src/views/agenda.js` |
| Pet cards + clinical 3 phases | Extracted pet-only photos; weight sparkline from real history | `web/src/views/patients.js` |
| Totals + IVA 19% + COP | `TAX_RATE` default 0.19 (Colombia); `cop()` formatting | backend + `web/src/api.js` |
| Android 4 tabs + home + login | Mascotas/Historial/Citas/Perfil with icons; greeting, alert card, photo cards, service tiles (real endpoints only) | `android/…/MainActivity.kt`, `Screens.kt` |
| Cut (no backend): boxes, triage/check-in, chip, satisfaction, branches, charts, SOS, Laboratorio, SII, payment methods, vitals, Confirmar Asistencia, anonymous pet-ID login, fake deltas | Absent from UI; listed in `odd/tasks/vetcura-ui-fidelity.md` | — |
| Photos | 11 unique JPEGs extracted hash-deduped to `web/public/img/pet-N.jpg`; pet-only subset (1/7/8/11, cats→siamese) on web cards and Android drawables; staff portraits never used as patients | `web/public/img/`, `android/…/res/drawable/` |
