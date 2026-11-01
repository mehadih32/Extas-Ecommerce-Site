// PR 284 — one person in the shop (Blueprint B5.5: website, Messenger, WhatsApp and phone orders share one record keyed
// by phone): the profile a person stays under (the survivor) and the profiles merged into it, with every number they
// carry. A person's orders are the orders of any of his profiles, and the orders placed without an account (a guest's
// order while the automatic account is off) with one of his numbers — never a guest gift, whose number is the
// receiver's. The single view, the list and the lifetime value all read a person through this one rule
// (@extas/metrics `customerKpis` applies the same rule to the money).
import type { Prisma } from '@extas/db/client';
import type { CustomerRef } from '@extas/metrics';
import { phoneForms } from '@extas/orders';
import type { Db } from './context';

/** What a profile row gives the views. */
export const PROFILE_SELECT = {
  id: true,
  phone: true,
  name: true,
  email: true,
  whatsappNumber: true,
  gender: true,
  genderInferred: true,
  firstSource: true,
  firstCampaignRef: true,
  createdAt: true,
  mergedIntoId: true,
  mergedAt: true,
  erasedAt: true,
  archivedAt: true,
  verifiedAt: true,
  codPolicy: true,
  smsMarketingConsent: true,
  whatsappMarketingConsent: true,
  orderCount: true,
  lastOrderAt: true,
  credential: { select: { id: true } },
} as const satisfies Prisma.CustomerSelect;

export type ProfileRow = Prisma.CustomerGetPayload<{ select: typeof PROFILE_SELECT }>;

/** A person: the profile he stays under and the profiles merged into it (oldest merge first). */
export interface Family {
  root: ProfileRow;
  members: ProfileRow[];
}

/** How deep a merged profile's survivor is looked for (a merge always names a survivor that was not merged itself). */
const MAX_HOPS = 3;

/** The person a profile belongs to (`redirected`: the id asked for was merged into another one), or null. */
export async function familyOf(db: Db, storeId: number, id: string): Promise<{ family: Family; redirected: boolean } | null> {
  let row = await db.customer.findFirst({ where: { id, storeId }, select: PROFILE_SELECT });
  if (!row) return null;
  let redirected = false;
  for (let hop = 0; row.mergedIntoId && hop < MAX_HOPS; hop++) {
    const up: ProfileRow | null = await db.customer.findFirst({ where: { id: row.mergedIntoId, storeId }, select: PROFILE_SELECT });
    if (!up) break;
    row = up;
    redirected = true;
  }
  const members = await db.customer.findMany({ where: { storeId, mergedIntoId: row.id }, orderBy: [{ mergedAt: 'asc' }, { id: 'asc' }], select: PROFILE_SELECT });
  return { family: { root: row, members }, redirected };
}

/** Every profile of the person. */
export const profilesOf = (f: Family): ProfileRow[] => [f.root, ...f.members];

/** Every number the person's orders may carry, in every stored form. */
export function familyPhones(f: Family): string[] {
  return [...new Set(profilesOf(f).flatMap((p) => phoneForms(p.phone)))];
}

/** The person for @extas/metrics (his lifetime value). */
export function familyRef(f: Family): CustomerRef {
  return { key: f.root.id, customerIds: profilesOf(f).map((p) => p.id), phones: familyPhones(f) };
}

/** The person's orders: any of his profiles, or a guest order (never a gift) with one of his numbers. */
export function familyOrderWhere(storeId: number, f: Family): Prisma.OrderWhereInput {
  const ids = profilesOf(f).map((p) => p.id);
  const phones = familyPhones(f);
  return {
    storeId,
    archivedAt: null,
    status: { not: 'DRAFT' },
    OR: [{ customerId: { in: ids } }, ...(phones.length ? [{ customerId: null, isGift: false, phone: { in: phones } }] : [])],
  };
}
