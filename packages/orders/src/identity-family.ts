// S06 · PR 162, 163 — the identities that are one person now. When the identity graph (PR 519) finds two identities are
// the same person it moves the links to the older one and marks the newer one merged (`mergedIntoId`); nothing is
// deleted. A listing or a refuser's terms that noted an identity before such a merge still names the old one, so a
// look-up by the order's identity also takes every identity merged into it (and those merged into them).
import type { OrdersDeps } from './context';

/** The most merge steps followed (a chain longer than this is not built by the graph; the loop stops there). */
const MAX_DEPTH = 8;

/** The identity an order belongs to now (PR 519), when the graph has linked it. */
export async function clusterOfOrder(db: Pick<OrdersDeps['db'], 'identityLink'>, storeId: number, orderId: string): Promise<string | null> {
  const link = await db.identityLink.findFirst({ where: { storeId, orderId }, select: { clusterId: true } });
  return link?.clusterId ?? null;
}

/** The identity and every identity merged into it, directly or through others. */
export async function clusterFamily(db: Pick<OrdersDeps['db'], 'identityCluster'>, storeId: number, clusterId: string): Promise<string[]> {
  const all = new Set([clusterId]);
  let front = [clusterId];
  for (let i = 0; i < MAX_DEPTH && front.length; i++) {
    const rows = await db.identityCluster.findMany({ where: { storeId, mergedIntoId: { in: front } }, select: { id: true } });
    front = rows.map((r) => r.id).filter((id) => !all.has(id));
    for (const id of front) all.add(id);
  }
  return [...all];
}
