// PR 509 — the "My own data" register: everything that is the owner's own and never ships to a new installation
// (CLAUDE.md hard rule 4). It is data, read by
// - the settings migration (sync.ts), which mirrors it into the OwnerDataEntry table on every deploy;
// - the owner-data check in CI (@extas/seed), which fails the build when a default, the general default pack or the
//   sample data carries a value of the owner's;
// - the installation export (@extas/seed), which leaves every listed value out.
//
// What counts as the owner's own data:
// - settings: every registry key with `isOwnerData: true` — the store name, logo, slogan, contact, legal and social
//   details, bank and wallet details, and the owner's business decisions (every money setting and every setting that
//   needs his written OK: real prices and charges are always owner data, Blueprint App. B.4 #13). They are listed
//   automatically; the prefixes below make sure a future key under them can only be declared as owner data;
// - tables: the vault, the owner's own Dhaka area list, accounts and connections, people, the brand voice, and the
//   shop's records (customers and orders). Everything else the shop records while it runs (payments, messages, logs)
//   is the owner's too: the export is an allow-list and never reads it;
// - columns: single columns of otherwise shippable tables (the store's name);
// - media: every uploaded file.
import type { RegistryShape } from './define';
import { pair, type SettingsMessages } from './messages';

export type OwnerDataReason =
  | 'contact'
  | 'legal'
  | 'social'
  | 'payment'
  | 'vault'
  | 'areaList'
  | 'connections'
  | 'people'
  | 'brand'
  | 'records'
  | 'media'
  /** S10 — the owner's business rules: charges, tier prices, discounts, coupons, policies and notices. */
  | 'rules';

export interface OwnerDataItem {
  /** Setting key prefix (ends with a dot), Prisma model name, `Model.column`, or media folder (`/` = all media). */
  target: string;
  /** Message key under `ownerData.reasons` in messages/settings.<lang>.json. */
  reason: OwnerDataReason;
}

export interface OwnerDataRegister {
  /** Bumped when the register changes (the sync mirrors whatever the current register says). */
  version: number;
  settingPrefixes: OwnerDataItem[];
  tables: OwnerDataItem[];
  columns: OwnerDataItem[];
  media: OwnerDataItem[];
}

const item = (target: string, reason: OwnerDataReason): OwnerDataItem => ({ target, reason });

export const ownerDataRegister: OwnerDataRegister = {
  version: 4,
  settingPrefixes: [
    item('contact.', 'contact'),
    item('legal.', 'legal'),
    item('social.', 'social'),
    item('payment.bank.', 'payment'),
    item('payment.wallet.', 'payment'),
  ],
  tables: [
    // Every API key: the vault (PR 493) — not even its ciphertext leaves the installation.
    item('VaultKey', 'vault'),
    item('InstallationSecret', 'vault'),
    item('StoreSecret', 'vault'),
    item('SecretAccessLog', 'vault'),
    // The owner's own Dhaka area list: which area sits in which delivery band (PR 550).
    item('AreaBand', 'areaList'),
    // Accounts and connections.
    item('Integration', 'connections'),
    item('IntegrationTestRun', 'connections'),
    item('CourierAccount', 'connections'),
    item('AdAccount', 'connections'),
    item('SocialAccount', 'connections'),
    item('YoutubeChannel', 'connections'),
    item('TelegramChat', 'connections'),
    item('SupportChannel', 'connections'),
    item('StoreDomain', 'connections'),
    item('StoreErpMapping', 'connections'),
    // People.
    item('StaffUser', 'people'),
    item('BlogAuthor', 'people'),
    item('StudioModel', 'people'),
    item('ModelConsent', 'people'),
    // The brand voice.
    item('StoreBrandProfile', 'brand'),
    // The shop's records.
    item('Customer', 'records'),
    item('CustomerAddress', 'records'),
    item('Order', 'records'),
    // PR 36 — who asked to be told when a product is back in stock: a customer's phone number or e-mail.
    item('BackInStockRequest', 'records'),
    // S10 · PR 208–219 — the owner's Smart Rules (his charges, tier prices, discounts and policies), their history,
    // clashes and simulations (built from his orders), his notices and coupons; a coupon's uses are order records.
    item('SmartRule', 'rules'),
    item('SmartRuleVersion', 'rules'),
    item('SmartRuleConflict', 'rules'),
    item('SmartRuleSimulation', 'rules'),
    item('Notice', 'rules'),
    item('Coupon', 'rules'),
    item('CouponRedemption', 'records'),
    // S03 · PR 89–104, 571 — the owner's combos and auto colour-pair rules (his set and pack prices) and how they sell.
    item('Combo', 'rules'),
    item('ComboItem', 'rules'),
    item('ComboAutoRule', 'rules'),
    item('PopularPair', 'records'),
    item('ComboDailyStat', 'records'),
  ],
  columns: [item('Store.name', 'brand'), item('Store.erpCompanyId', 'connections')],
  media: [item('/', 'media')],
};

/** True when a setting key falls under one of the register's prefixes. */
export function underOwnerPrefix(key: string, register: OwnerDataRegister = ownerDataRegister): boolean {
  return register.settingPrefixes.some((p) => key.startsWith(p.target));
}

/** Every setting key the register covers: flagged in the registry, or under an owner prefix. */
export function ownerSettingKeys(registry: RegistryShape, register: OwnerDataRegister = ownerDataRegister): string[] {
  return Object.keys(registry)
    .filter((k) => registry[k]!.isOwnerData || underOwnerPrefix(k, register))
    .sort();
}

/** True when the key's value is the owner's own and must never leave the installation. */
export function isOwnerSetting(
  key: string,
  registry: RegistryShape,
  register: OwnerDataRegister = ownerDataRegister,
): boolean {
  const spec = Object.prototype.hasOwnProperty.call(registry, key) ? registry[key] : undefined;
  // A key this code does not know may be a newer installation's owner setting: treat it as the owner's.
  if (!spec) return true;
  return spec.isOwnerData || underOwnerPrefix(key, register) || spec.valueType === 'SECRET_REF';
}

export type OwnerDataKindName = 'TABLE' | 'SETTING_PREFIX' | 'MEDIA_FOLDER';

export interface OwnerDataRow {
  kind: OwnerDataKindName;
  target: string;
  reasonEn: string;
  reasonBn: string;
}

/**
 * The register as OwnerDataEntry rows (the schema's OwnerDataKind): prefixes as SETTING_PREFIX, tables as TABLE, a
 * column as TABLE with a `Model.column` target, media as MEDIA_FOLDER. SETTING_KEY rows come from the registry
 * (sync.ts). Throws when a reason has no text in either language.
 */
export function ownerDataRows(messages: SettingsMessages, register: OwnerDataRegister = ownerDataRegister): OwnerDataRow[] {
  const row = (kind: OwnerDataKindName, i: OwnerDataItem): OwnerDataRow => {
    const reason = pair(messages, `ownerData.reasons.${i.reason}`);
    return { kind, target: i.target, reasonEn: reason.en, reasonBn: reason.bn };
  };
  return [
    ...register.settingPrefixes.map((i) => row('SETTING_PREFIX', i)),
    ...register.tables.map((i) => row('TABLE', i)),
    ...register.columns.map((i) => row('TABLE', i)),
    ...register.media.map((i) => row('MEDIA_FOLDER', i)),
  ];
}

/** `KIND:target`, the name a register row goes by in reports. */
export const ownerRowName = (r: { kind: string; target: string }) => `${r.kind}:${r.target}`;
