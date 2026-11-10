// S19 · PR 362 follow-up (go-live day) — the one row of "Settings → Stores" (PR 362, S17) a single-store launch needs
// before the day: the main domain registered as the mother store's primary StoreDomain row (RUNBOOK.md §0; the shop
// reads it for canonical links, hreflang and whether a request counts as "on the primary domain" at all — lib/seo/
// site.ts, lib/seo/indexing.ts's robotsOf). S17's own Stores admin page stays closed (CN-039); this is the smallest
// correct piece of it, run once at go-live through a server workflow (never a browser) — the application-data half
// of the switch, beside the Caddy half (tools/golive-switch.mjs).
import { MOTHER_STORE_ID } from './client';
import type { PrismaClient } from '@prisma/client';

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export interface PrimaryDomainResult {
  hostname: string;
  storeId: number;
  created: boolean;
  /** Other hostnames of the same store that were primary and are not any more (A4.5: one primary per store). */
  demoted: string[];
}

/**
 * Registers `hostname` as the mother store's primary domain: updates or creates its StoreDomain row, and demotes
 * any other row of the same store that was marked primary. Refuses a hostname already registered to another store.
 */
export async function setPrimaryDomain(prisma: PrismaClient, hostname: string): Promise<PrimaryDomainResult> {
  const h = String(hostname ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!HOST.test(h)) throw new Error(`not a plain host name: ${hostname}`);
  const [existing, others] = await Promise.all([
    prisma.storeDomain.findUnique({ where: { hostname: h } }),
    prisma.storeDomain.findMany({ where: { storeId: MOTHER_STORE_ID, isPrimaryHost: true, hostname: { not: h } }, select: { hostname: true } }),
  ]);
  if (existing && existing.storeId !== MOTHER_STORE_ID) throw new Error(`${h} already belongs to another store`);
  await prisma.$transaction([
    ...(others.length ? [prisma.storeDomain.updateMany({ where: { storeId: MOTHER_STORE_ID, isPrimaryHost: true, hostname: { not: h } }, data: { isPrimaryHost: false } })] : []),
    existing
      ? prisma.storeDomain.update({ where: { hostname: h }, data: { storeId: MOTHER_STORE_ID, isPrimaryHost: true, status: 'ACTIVE', archivedAt: null } })
      : prisma.storeDomain.create({ data: { storeId: MOTHER_STORE_ID, hostname: h, isPrimaryHost: true, status: 'ACTIVE' } }),
  ]);
  return { hostname: h, storeId: MOTHER_STORE_ID, created: !existing, demoted: others.map((o) => o.hostname) };
}
