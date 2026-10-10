# ODD Feature: vetcura-ui-fidelity — Mockup-faithful tabs & visuals (web + Android)

## Objective

Redesign navigation and screens on both clients to mirror the Mockups/
structure (sidebar/topbar/cards on web; bottom tabs/home on Android),
reusing the mockups' embedded photos, with CLP currency.

## Visual source (inspected 2026-10-10 via local render)

- Login.svg: portal chip, pet photo, ATENCIÓN 24/7 badge, VetCura
  wordmark, headline, Google button, "O CON TU CLÍNICA" divider,
  clinic-ID button, terms footer.
- Movil.svg: home tabs Mascotas/Historial/Citas/Perfil; greeting;
  URGENTE alert card (Confirmar/Ver detalle); pet cards (photo,
  Saludable badge, stats, Ver Carnet Clínico); services grid
  (Vacunas, Recetas, SOS, Laboratorio); upcoming appointments;
  Solicitar Cita button.
- Dashboard.svg: dark-teal sidebar (5 items), topbar (search, branch,
  triage pill, vet user), KPI cards, staff performance table,
  boxes occupancy, triage alerts, hourly chart.
- Consulta.svg: 3-phase cards (Anamnesis / Tratamiento+insumos /
  Liquidación), vitals, weight chart, allergies, totals + IVA 19%,
  "Guardar Ficha y Enviar a App Móvil".
- Trabajador.svg: agenda tabs Día/Semana/Mes, week grid with status
  legend, +Agendar Nueva Cita, check-in queue, boxes occupancy.

## Scope (IN)

- Web: dark-teal icon sidebar (Eficiencia, Consulta, Agenda, Pacientes,
  Farmacia, Facturación), topbar (live search, user chip, date),
  mockup-style login, KPI cards + staff table (real data), daily CSV
  report download (real data), week/day/month agenda grid with status
  colors + chip actions, pet photo cards, consultation 3-phase layout
  with weight sparkline (real data), CLP formatting, extracted photos.
- Android: 4 bottom tabs (Mascotas/Historial/Citas/Perfil) with icons,
  greeting, alert card (Ver detalle), photo pet cards, services tiles
  backed by real endpoints, upcoming appointment cards, styled login,
  extracted photos as drawables.
- Backend (minimal, contained): default TAX_RATE 0.10 → 0.19 (Chilean
  IVA per mockups); export taxRate for tests; seed/dashboard numbers
  updated; suite stays green.

## Documented cuts (no backend → not simulated)

- Boxes/quirófano occupancy, triage queue + priorities, check-in,
  chip registration, satisfaction stars, multi-branch, hourly
  chart, SOS 24/7, Laboratorio, SII e-invoicing, payment methods,
  vital signs (temp/FC/FR), "Confirmar Asistencia" (needs staff action
  endpoint — follow-up), mockup "ID de Mascota" anonymous login
  (conflicts with authorized-data rule → maps to clinic email login),
  satisfaction deltas (no history → no fake +14.2%).

## Acceptance criteria

1. Web build OK; every button calls the real API or is visibly absent
   (no dead buttons); sidebar/topbar/login mirror mockup structure.
2. Android assembles; 4 tabs with icons; photos render; booking flow
   from previous fix intact.
3. Backend suite green with 0.19 rate; no fake figures anywhere.
4. Photos are extracted originals (hash-deduped), originals untouched.

## Verification evidence (2026-10-10)

- `backend: npm test` → 16/16 (rate-aware assertions).
- `web: npm run build` OK; served `dist/` + temp backend and verified
  with real screenshots: login mirrors Login.svg; dashboard mirrors
  Dashboard.svg structure with real data; patient cards render
  extracted photos (re-mapped to pet-only shots after spotting vet
  portraits in the first pass).
- `android: assembleDebug` BUILD SUCCESSFUL (same `-PapiUrl`).
- Temp servers stopped and viewer file removed; repo holds no test
  artifacts. Commits: backend IVA, web overhaul, android tabs.

## Authorized scope

- `odd/tasks/vetcura-ui-fidelity.md`, `docs/*`
- `web/**/*`, `android/app/src/main/**/*` (no wrapper/Gradle changes)
- `backend/src/routes/invoices.js` (taxRate export only),
  `backend/scripts/seed.js`, `backend/tests/api.test.js`
