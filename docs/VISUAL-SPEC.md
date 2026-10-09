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
