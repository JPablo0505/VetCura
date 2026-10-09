# Asset Inventory (Mockups/)

All files are full-screen Figma exports (text outlined, zero `<text>`
nodes), self-contained, reusable as reference/static render. DO NOT
overwrite. Derived assets live beside consumers, never here.

| File | Size | Canvas | `<image>` photos | Reuse |
| ---- | ---- | ------ | ---------------- | ----- |
| `Login.svg` | 330 KB | 390x620 mobile | 0 | Reference for Android login; Google-button colors sampled |
| `Movil.svg` | 720 KB | 414x1470 mobile | 3 JPEG (pet photos) | Reference for owner home/cards/alerts |
| `Dashboard.svg` | 1.86 MB | 1296x2009 web | 5 JPEG | Reference for staff dashboard KPIs |
| `Consulta.svg` | 1.98 MB | 1296x1666 web | 2 JPEG | Reference for clinical record form |
| `Trabajador.svg` | 1.66 MB | 1296x1475 web | 4 JPEG | Reference for sidebar + workers admin |

- Logos/icons/illustrations as separate files: NONE present — brand mark
  and icon set must be hand-derived from outlines if needed (documented
  per use; no duplicates, no emoji replacements).
- Compatibility: valid SVG 1.1, renders natively in browsers/Android
  `ImageVector` via import; embedded JPEGs need no external fetch.
- Final locations: web uses palette + layout from these files
  (`web/src/styles.css` tokens); Android `ui/theme` mirrors the same
  tokens. No converted copies committed (adapt in place when needed).
