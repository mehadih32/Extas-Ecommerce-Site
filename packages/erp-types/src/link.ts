// CN-029 §16 (PR 607, 619) — one ERP link per store. One store = one ERP company with its own three secrets, typed by
// the owner in "Keys & connections" and kept only in the encrypted vault under the store's id (never in Git, a log, a
// test snapshot or this package). Every ERP call, webhook, ledger entry, day close, match result and summary carries
// the store and goes through the store guard. A handover to a new owner replaces the three secrets and starts a new
// link; the old link's history stays, unreachable from the new keys.

/** The vault fields of a store's ERP connection (`extasErp.<field>`, under the store's id). Names only: never values. */
export const ERP_LINK_SECRET_FIELDS = ['apiKey', 'webhookSecret', 'signingSecret'] as const;
export type ErpLinkSecretField = (typeof ERP_LINK_SECRET_FIELDS)[number];

/**
 * Why a v6 store has no usable ERP link: `SHARED_LINK` — only an installation-wide connection exists (one key for
 * several stores), which v6 refuses (§16); the store needs its own connection with its own keys. `SHARED_COMPANY` — the
 * key belongs to an ERP company another store's open link already holds (two stores on one company, §16): refused
 * before anything is read or learned. The database holds it too (one open link per ERP company, migration 0049).
 */
export const ERP_LINK_REFUSALS = ['SHARED_LINK', 'SHARED_COMPANY'] as const;
export type ErpLinkRefusal = (typeof ERP_LINK_REFUSALS)[number];

/** A store's ERP link as the admin and the lanes see it (ErpStoreLink, never a secret). Dates are YYYY-MM-DD. */
export interface ErpStoreLinkView {
  id: string;
  storeId: number;
  epoch: number;
  integrationId: string | null;
  erpCompanyId: string | null;
  switchDate: string | null;
  switchedAt: Date | null;
  dryRunAt: Date | null;
  /** BigInt in the database (`minorOf` turns it into an exact number). */
  openingBalanceMinor: number | null;
  openingBalanceDate: string | null;
  endedAt: Date | null;
}
