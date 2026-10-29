// CN-029 §16 (PR 607) — one ERP link per store. One store = one ERP company: its own connection row (Integration with
// the store's id) whose API key, webhook secret and signing secret are in the vault under the store's id. In contract v6
// every ERP event, ledger entry, close and summary hangs on the store's open link (ErpStoreLink), never on a shared one;
// the database refuses a row on another store's link (composite foreign key linkId + storeId, migration 0049).
//
// - `openErpLink` is the store's open link: made (epoch 1) the first time a v6 store needs it, with the connection it
//   talks through and, once a pull has asked `GET /health`, the ERP company its key belongs to. A changed connection
//   of the same owner is noted on the same link; a key of another company is COMPANY_MISMATCH (a handover to a new owner
//   ends the link and starts the next epoch: PR 619 builds that step, with the owner's OK), so the old link's history is
//   never reached by the new keys.
// - Two stores' open links never hold one ERP company (SHARED_COMPANY): checked here, by the guard, by the company check
//   of every sync, and by the database (unique `openErpCompanyId`, kept by a trigger while the link is open).
// - `v6LinkFor` answers "may this connection speak v6 for this store?": only when the store speaks v6 and the
//   connection is the store's own one (the guard refuses a shared one, SHARED_LINK, or a shared company).
// No secret is read or stored here.
import type { InventoryDeps, Db } from './context';
import { InventoryError } from './errors';
import { isV6 } from './erp-model';
import { resolveErp } from './guard';

export interface OpenErpLink {
  id: string;
  storeId: number;
  epoch: number;
  integrationId: string | null;
  erpCompanyId: string | null;
}

const SELECT = { id: true, storeId: true, epoch: true, integrationId: true, erpCompanyId: true } as const;

/** The other store whose open link holds this ERP company, if any. */
export async function companyHeldElsewhere(db: Db, storeId: number, erpCompanyId: string | null | undefined): Promise<number | null> {
  if (!erpCompanyId) return null;
  const other = await db.erpStoreLink.findFirst({ where: { openErpCompanyId: erpCompanyId, storeId: { not: storeId } }, select: { storeId: true } });
  return other?.storeId ?? null;
}

const sharedCompany = (erpCompanyId: string, other: number) =>
  new InventoryError('SHARED_COMPANY', 'this ERP company is already linked to another store: one store = one ERP company (§16)', [`company: ${erpCompanyId}`, `store: ${other}`]);

/**
 * The store's open ERP link, made on first use. Safe to call at the same moment from two places (one row wins).
 * `erpCompanyId` (from `GET /health`) fills the link's company; it throws SHARED_COMPANY when another store's open link
 * holds that company, and COMPANY_MISMATCH when the link already holds another one.
 */
export async function openErpLink(db: Db, storeId: number, integrationId: string | null, opts: { erpCompanyId?: string | null } = {}): Promise<OpenErpLink> {
  const company = opts.erpCompanyId ?? null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const other = await companyHeldElsewhere(db, storeId, company);
    if (company && other != null) throw sharedCompany(company, other);
    const open = await db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: SELECT });
    try {
      if (open) {
        if (company && open.erpCompanyId && open.erpCompanyId !== company) {
          throw new InventoryError('COMPANY_MISMATCH', "the ERP key belongs to another company than this store's ERP link", [`link: ${open.erpCompanyId}`, `key: ${company}`]);
        }
        const data = {
          ...(integrationId && open.integrationId !== integrationId ? { integrationId } : {}),
          ...(company && !open.erpCompanyId ? { erpCompanyId: company } : {}),
        };
        return Object.keys(data).length ? await db.erpStoreLink.update({ where: { id: open.id }, data, select: SELECT }) : open;
      }
      const last = await db.erpStoreLink.findFirst({ where: { storeId }, orderBy: { epoch: 'desc' }, select: { epoch: true } });
      return await db.erpStoreLink.create({ data: { storeId, epoch: (last?.epoch ?? 0) + 1, integrationId, erpCompanyId: company }, select: SELECT });
    } catch (e) {
      // Made at the same moment by another caller, or the company taken at that moment: read again.
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  const other = await companyHeldElsewhere(db, storeId, company);
  if (company && other != null) throw sharedCompany(company, other);
  throw new Error(`the ERP link of store ${storeId} could not be opened`);
}

/**
 * The store's open link when `integrationId` is the store's own ERP connection and the store speaks v6; otherwise null
 * (v5, no ERP, a practice adapter, a connection that is not this store's own, or a company another store holds).
 */
export async function v6LinkFor(deps: InventoryDeps, storeId: number, integrationId: string): Promise<OpenErpLink | null> {
  if (!(await isV6(deps, storeId))) return null;
  const link = await resolveErp(deps, storeId);
  if (link.state !== 'connected' && link.state !== 'mock') return null;
  if (link.integrationId !== integrationId) return null;
  return openErpLink(deps.db, storeId, integrationId);
}
