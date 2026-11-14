// PR 718 — what the shop reads from Website › Policies: the live words of the four pages this tab added
// (cancellation, wallet, reviews, cookies) and which of them are live (the sitemap lists only those). The five pages the
// shop already had keep reading `pages.text` (published words are mirrored there), so their public pages did not change.
import type { PrismaClient } from '@extas/db/client';
import { NEW_POLICIES, REVISION_TYPE, wordsOfPayload, type NewPolicySlug, type PolicyWords } from './model';

type Db = Pick<PrismaClient, 'contentRevision'>;

const livePolicyTexts = (payload: unknown): boolean => {
  const w = wordsOfPayload(payload);
  return !!(w.body && w.title);
};

/** The live words of a new policy page, or null while it has none (the shop then says "Coming soon"). */
export async function livePolicyWords(db: Db, storeId: number, slug: NewPolicySlug): Promise<PolicyWords | null> {
  const r = await db.contentRevision.findFirst({ where: { storeId, entityType: REVISION_TYPE, entityId: slug, status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
  if (!r) return null;
  const w = wordsOfPayload(r.payload);
  return w.body && w.title ? w : null;
}

/** The new pages that are live now, in the tab's order. */
export async function liveNewPolicies(db: Db, storeId: number): Promise<NewPolicySlug[]> {
  const rows = await db.contentRevision.findMany({ where: { storeId, entityType: REVISION_TYPE, entityId: { in: [...NEW_POLICIES] }, status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
  const live = new Set(rows.filter((r) => livePolicyTexts(r.payload)).map((r) => r.entityId));
  return NEW_POLICIES.filter((s) => live.has(s));
}
