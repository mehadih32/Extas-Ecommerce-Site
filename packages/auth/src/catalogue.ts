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
  // PR 21, 35 — put a product on the shop or take it off (one by one or in bulk). Publishing always runs the publish
  // checklist first (PR 26, 29, 35); there is no way around it.
  'catalogue.publish': { group: 'catalogue' },
  // PR 34 — the catalogue CSV: bring in a file (preview, then apply; prices inside it still need catalogue.prices) and
  // take the catalogue out as a file.
  'catalogue.import': { group: 'catalogue' },
  'catalogue.export': { group: 'catalogue' },
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
