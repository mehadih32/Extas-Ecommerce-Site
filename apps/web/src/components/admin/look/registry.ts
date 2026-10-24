// PR 12 (CN-025) — the admin look registry: every page that has designs, and its designs (demo V12.4 A3_PAGES and
// a3Design). Adding a design to a page is one render module (components/admin/look/<page>/<KEY>.tsx, exporting a
// LookDesign) plus its one line in the page's `designs` list below — `pnpm admin:design <page> <KEY>` writes both
// (docs/admin-guide/HOW-TO-ADD-A-DESIGN.md). Nothing else changes: Settings → Admin look, the "…" menu, the API's
// checks and the page's data loader all read this list.
//
// `standard` is the design a team sees until the owner picks one in Settings → Admin look (`admin.look.pages`). For launch
// (CN-027) every page has one design: the Dashboard its V12.4 default (A, "Calm overview"), Orders and Products their
// built page. The other V12.4 designs come after launch (PROGRESS.md follow-ups 380–389).
import { classicDesign } from './classic';
import { dashboardA } from './dashboard/A';
import type { LookPage } from './types';

export const LOOK_PAGES: readonly LookPage[] = [
  {
    id: 'dashboard',
    section: 'dashboard',
    icon: 'grid',
    preview: '/admin?home=1',
    standard: 'A',
    designs: [
      dashboardA,
      // admin:design dashboard
    ],
  },
  {
    id: 'orders',
    section: 'orders',
    icon: 'bag',
    preview: '/admin/orders',
    standard: 'A',
    designs: [
      classicDesign('orders'),
      // admin:design orders
    ],
  },
  {
    id: 'products',
    section: 'products',
    icon: 'shirt',
    preview: '/admin/products',
    standard: 'A',
    designs: [
      classicDesign('products'),
      // admin:design products
    ],
  },
];

export const lookPage = (id: string) => LOOK_PAGES.find((p) => p.id === id) ?? null;

/** Page id → its design keys (what the API accepts). */
export function lookCatalog(): Record<string, readonly string[]> {
  return Object.fromEntries(LOOK_PAGES.map((p) => [p.id, p.designs.map((d) => d.key)]));
}
