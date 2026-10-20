# PR 28 — measurements (sample data, Chromium, 2026-10-20)

| Check | Phone 390 | Desktop 1366 |
|---|---|---|
| Horizontal overflow (bn, en) | 0, 0 | 0, 0 |
| Console errors | 0 | 0 |
| Measurement cell width (demo / app) | 54 / 54 px | 76 / 76 px |
| Chart list width (demo / app) | full / full | 340 / 340 px |
| Tap targets under 24 px | the "Show cm" checkbox (18 px) inside its 36 px label, as in the demo | same |

Lighthouse (devtools throttling, median of 3), `lighthouserc.json`:

| Page | Performance | Accessibility | LCP | TBT | CLS |
|---|---|---|---|---|---|
| `/admin/size-charts` as CI runs it (no database) | 0.95 | 1.00 | 2.21 s | 119 ms | 0 |
| `/admin/size-charts` signed in, sample catalogue | 0.94 | 1.00 | 2.18 s | 186 ms | 0 |

The screen's styles are imported by `admin.css`, so the admin still loads one stylesheet (a separate file cost ~350 ms of LCP).

Flow checked in the browser (390 px): edit a cell → "Unsaved" in the list and the editor; a 0 is refused; Save → "Saved — 5
products updated"; copy for a relaxed fit; set the copy as the Polos default, the "When you add a product" panel picks it for
the relaxed fit; take the default off; archive (kept, can be brought back); paste rows (an unknown size is named and left out);
Discard.
