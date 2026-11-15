// PR 840 — practice customers get a grade, so the Customers report and Home render with grades filled. The owner's own grades are used
// when the shop has any (a customer takes the highest grade whose rule his delivered and refused parcels meet); a shop with none gets
// three sample grades (key "practice-…", removed by the reset once no customer holds them). Nothing of the owner's is changed.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { practiceId } from './ids';

export interface Level {
  id: string;
  minDelivered: number;
  minRefused: number;
  maxRefused: number | null;
}

/** The three sample grades of a shop that has none (names and counts are sample data, not the owner's policy). */
export const SAMPLE_GRADES = [
  { key: 'practice-regular', nameEn: 'Regular (practice)', nameBn: 'রেগুলার (প্র্যাকটিস)', criteria: { minDelivered: 0, maxRefused: null, minRefused: 0 }, sortOrder: 1 },
  { key: 'practice-silver', nameEn: 'Silver (practice)', nameBn: 'সিলভার (প্র্যাকটিস)', criteria: { minDelivered: 2, maxRefused: 1, minRefused: 0 }, sortOrder: 2 }, // hardcode-ok: sample grade
  { key: 'practice-gold', nameEn: 'Gold (practice)', nameBn: 'গোল্ড (প্র্যাকটিস)', criteria: { minDelivered: 4, maxRefused: 0, minRefused: 0 }, sortOrder: 3 }, // hardcode-ok: sample grade
] as const;

const asLevel = (id: string, c: unknown): Level | null => {
  const x = c as { minDelivered?: unknown; minRefused?: unknown; maxRefused?: unknown } | null;
  if (!x || typeof x.minDelivered !== 'number') return null;
  return { id, minDelivered: x.minDelivered, minRefused: typeof x.minRefused === 'number' ? x.minRefused : 0, maxRefused: typeof x.maxRefused === 'number' ? x.maxRefused : null };
};

/** The grade a customer with `delivered` and `refused` parcels earns: the one with the most delivered needed whose rule he meets; null when none. */
export function pickGrade(levels: readonly Level[], delivered: number, refused: number): string | null {
  const ok = levels.filter((l) => delivered >= l.minDelivered && refused >= l.minRefused && (l.maxRefused === null || refused <= l.maxRefused));
  ok.sort((a, b) => b.minDelivered - a.minDelivered || b.minRefused - a.minRefused);
  return ok[0]?.id ?? null;
}

/** The shop's live grades, or (when it has no grade at all) the sample ones, made once from fixed ids. */
export async function practiceLevels(db: PrismaClient, storeId: number): Promise<Level[]> {
  const mine = await db.customerGrade.findMany({ where: { storeId, archivedAt: null }, select: { id: true, key: true, criteria: true } });
  const real = mine.filter((g) => !g.key.startsWith('practice-'));
  const rows = real.length ? real : mine;
  if (rows.length === 0 && (await db.customerGrade.count({ where: { storeId } })) === 0) {
    const data: Prisma.CustomerGradeCreateManyInput[] = SAMPLE_GRADES.map((g) => ({ id: practiceId(`grade:${g.key}`), storeId, key: g.key, nameEn: g.nameEn, nameBn: g.nameBn, criteria: g.criteria, sortOrder: g.sortOrder }));
    await db.customerGrade.createMany({ data, skipDuplicates: true });
    return data.map((d) => asLevel(String(d.id), d.criteria)).filter((l): l is Level => l !== null);
  }
  return rows.map((g) => asLevel(g.id, g.criteria)).filter((l): l is Level => l !== null);
}
