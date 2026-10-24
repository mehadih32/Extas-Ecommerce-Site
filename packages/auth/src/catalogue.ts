// PR 16, 495 — the permission catalogue. Every action the admin can take is checked on the server against one of
// these keys (B6.5: "permission checks on every action, not only on the page"). The catalogue is code, because code
// does the checking; roles are data: the owner builds them in the role builder from these permissions. The `owner`
// role is seeded and always holds every permission in this list, including ones added later.
//
// Adding a permission = one line here + its labels in messages/auth.<lang>.json. The deploy's `auth sync` writes it to
// the Permission table and grants it to the owner role. A key removed from here stays in the table (nothing is
// deleted) but can no longer be granted or checked.
//
// Each later PR adds the keys of its own screens (orders, catalogue, customers, refunds …) when it builds them.
export const PERMISSIONS = {
  'settings.read': { group: 'settings' },
  'settings.write': { group: 'settings' },
  'vault.read': { group: 'settings' },
  'vault.write': { group: 'settings' },
  'roles.read': { group: 'staff' },
  'roles.manage': { group: 'staff' },
  'staff.read': { group: 'staff' },
  'staff.manage': { group: 'staff' },
  'audit.read': { group: 'security' },
  'security.read': { group: 'security' },
  // PR 12 (CN-022) — the admin shell: open the Dashboard (the "Needs you now" queues of the sections the person can
  // see), see the money tiles (Sales and Ordered value, from @extas/metrics) and open the admin guides.
  'dashboard.read': { group: 'admin' },
  'metrics.read': { group: 'admin' },
  'help.read': { group: 'admin' },
  // PR 22, 25, 37 — the media library: see it; upload, describe and place photos; archive, restore and clean up.
  'media.read': { group: 'media' },
  'media.upload': { group: 'media' },
  'media.manage': { group: 'media' },
  // S01 · PR 19, 20, 30, 31, 590 — the catalogue: products, variants, colours, sizes, categories, garment types,
  // fabrics, brands, names and links. Publishing and bulk actions (PR 21) add their own keys.
  'catalogue.read': { group: 'catalogue' },
  'catalogue.write': { group: 'catalogue' },
  // Prices are the owner's decision (CLAUDE.md rule 6): setting a variant's sale or compare-at price is its own key.
  'catalogue.prices': { group: 'catalogue' },
  // S02 · PR 59 — Find My Size learning: train a version from the recorded answers and switch one on or off. It only
  // ever proposes an ease for a garment type and fit; a size chart is the owner's and is never changed by it.
  'catalogue.sizeAdvice': { group: 'catalogue' },
  // S02 · PR 65 — product reviews: see every review with its moderation state (`reviews.read`); approve, hide, reject
  // or mark a review verified (`reviews.moderate`); write or import a review the shop itself collected
  // (`reviews.write`, D3.16). Paying the photo-review reward is part of approving, and only while the owner has
  // switched that perk on with his own amount (`reviews.photoReward`); nobody can move money with another key.
  'reviews.read': { group: 'catalogue' },
  'reviews.moderate': { group: 'catalogue' },
  'reviews.write': { group: 'catalogue' },
  // PR 21, 35 — put a product on the shop or take it off (one by one or in bulk). Publishing always runs the publish
  // checklist first (PR 26, 29, 35); there is no way around it.
  'catalogue.publish': { group: 'catalogue' },
  // PR 34 — the catalogue CSV: bring in a file (preview, then apply; prices inside it still need catalogue.prices) and
  // take the catalogue out as a file.
  'catalogue.import': { group: 'catalogue' },
  'catalogue.export': { group: 'catalogue' },
  // PR 36 — the back-in-stock list: who asked to be told when a product is back (their phone or e-mail is the owner's
  // data, PR 509). Counts per product need only catalogue.read; seeing the contacts and marking them needs this key.
  'catalogue.interest': { group: 'catalogue' },
  // S09 · PR 195, 196, 201, 497 — stock and the ERP: see stock, locations and the ERP status; add, rename and archive
  // warehouses and locations (the damaged bin among them) and link them to ERP warehouses; switch a store's ERP mode
  // and set its ERP company and warehouse. Stock numbers themselves come from the ERP and are never typed in.
  'inventory.read': { group: 'inventory' },
  'inventory.locations': { group: 'inventory' },
  'inventory.erp': { group: 'inventory' },
  // S09 · PR 205, 206, 207 — run a stock re-sync now (all, or one product), send waiting or failed ERP documents again,
  // check all stock against the ERP. Nothing here types a stock number in: the ERP stays the master.
  'inventory.sync': { group: 'inventory' },
  // S09 · PR 203 — count a location by barcode and give a reason for each difference. Counting never changes stock:
  // the counted differences are corrected in the ERP.
  'inventory.audit': { group: 'inventory' },
  // S10 · PR 208–219 — Smart Rules: see the rules, their history, clashes and simulations; write and save drafts of
  // rules, notices and coupons; publish a rule or switch a notice on; and give the owner's OK for a rule that moves
  // money (a charge, a price, a discount, COD — CLAUDE.md rule 6). Only the owner role has `rules.approve` until the
  // owner hands it to someone in the role builder.
  'rules.read': { group: 'rules' },
  'rules.write': { group: 'rules' },
  'rules.publish': { group: 'rules' },
  'rules.approve': { group: 'rules' },
  // S03 · PR 89–104, 571, 575 — combos and sets: see the combos, their pages and the combo report; make and change combos
  // and auto colour-pair rules (names, pieces, pairing, templates); switch a combo or rule on or off, archive it or
  // bring it back; and set or change a set price (a price is the owner's decision, CLAUDE.md rule 6: only the owner
  // role has `combos.prices` until he hands it to someone in the role builder).
  'combos.read': { group: 'combos' },
  'combos.write': { group: 'combos' },
  'combos.publish': { group: 'combos' },
  'combos.prices': { group: 'combos' },
  // S06 · PR 550 — the delivery bands and the sub-area list (owner data): see them; set a band's charge, hours and COD
  // limit, switch it on (only with its charge) or off and choose the sub-area mode (charges are the owner's figures,
  // CLAUDE.md rule 6); put places on the sub-area list or take them off (archived, never deleted).
  'delivery.read': { group: 'delivery' },
  'delivery.charges': { group: 'delivery' },
  'delivery.areas': { group: 'delivery' },
  // S0A · PR 6 — the Server page: whether the background worker is alive, which one leads the scheduler, and the jobs
  // that failed with their reason and next try. Seeing only; nothing here changes anything.
  'system.read': { group: 'system' },
  // S04 · PR 136 — open the invoice of any order of the store (its customer's name, phone and address are on it), to
  // print or send it. Not a `.read` key on purpose: the read-only smoke check account never gets customers' details.
  // The order screens of S05 add their own keys.
  'orders.invoice': { group: 'orders' },
  // S05 · PR 138, 144, 145, 147, 153 — orders (BACKEND-ARCHITECTURE §5.3, §9.10): see orders and their timeline; confirm
  // a new order; put an order on hold and release it (with a reason); cancel an order before a courier is booked (with
  // a reason; a paid order's cancel only records a refund request, never a payout); cancel after booking and record the
  // courier's answer (D5); approve or refuse a customer's cancel request; write notes and internal flags; see and decide
  // the duplicate-order review queue; put two orders of one customer in one parcel. No key here moves money, changes a
  // price, a discount or COD, or blocks anyone (CLAUDE.md rule 6). A key is never the start of another key (labels nest).
  'orders.read': { group: 'orders' },
  'orders.confirm': { group: 'orders' },
  'orders.hold': { group: 'orders' },
  'orders.cancel': { group: 'orders' },
  'orders.cancelAfterBooking': { group: 'orders' },
  'orders.cancelRequests': { group: 'orders' },
  'orders.notes': { group: 'orders' },
  'orders.risk.read': { group: 'orders' },
  'orders.risk.decide': { group: 'orders' },
  'orders.merge': { group: 'orders' },
  // S04 · PR 127 — add a line to an order not yet with the courier, or take out a line added after placing ("Add to
  // this parcel"): priced as its product page prices it, the order's COD amount grows by exactly that line.
  'orders.lines': { group: 'orders' },
} as const satisfies Record<string, { group: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, key);
}

/** The seeded role that always holds every permission. Its key is structural, its names are labels. */
export const OWNER_ROLE_KEY = 'owner';

/** Label keys in messages/auth.<lang>.json. */
export const permissionLabelKey = (key: PermissionKey) => `permissions.${key}`;
export const permissionGroupLabelKey = (group: string) => `permissionGroups.${group}`;
