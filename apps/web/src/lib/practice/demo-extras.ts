// PR 725 (15 Nov 2026) — the demo's combos and journal posts as practice data (the demo's `DB.combos` and `DB.journal`,
// demo-extras.json). Neither table has a practice flag (the schema is not changed here), so every row is practice-owned by
// its address ("practice-..."), and "Reset practice data" removes exactly those (reset.ts); the practice switch shows and
// hides them (combo RUNNING / DRAFT, post PUBLISHED / UNPUBLISHED; visibility.ts). Idempotent: ids come from the demo's own
// ids, and what exists is left alone.
import type { PrismaClient } from '@extas/db/client';
import { DEMO_EXTRAS, DEMO_PACK, PRACTICE_SLUG } from './data';
import { practiceId } from './ids';

type Db = PrismaClient;
const DAY = 86_400_000; // hardcode-ok: milliseconds in a day

const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export async function completeExtras(db: Db, storeId: number, minor: (taka: number) => number, now: Date): Promise<Record<string, number>> {
  const counts: Record<string, number> = { practiceCombos: 0, practicePosts: 0 };
  const productIdOf = (demoId: string) => practiceId(`product:${demoId}`);
  const priceOf = new Map(DEMO_PACK.products.map((p) => [p.id, minor(p.priceMinor / 100)]));
  const there = new Set((await db.product.findMany({ where: { storeId, isPractice: true, id: { in: DEMO_PACK.products.map((p) => productIdOf(p.id)) } }, select: { id: true } })).map((p) => p.id));

  // ---- combos (only those whose every product is there)
  for (const c of DEMO_EXTRAS.combos) {
    if (!c.items.every((i) => there.has(productIdOf(i)))) continue;
    const id = practiceId(`combo:${c.id}`);
    const unique = new Set(c.items).size;
    const made = await db.combo.createMany({
      data: [
        {
          id,
          storeId,
          slug: `${PRACTICE_SLUG}${c.id}`,
          nameEn: c.name,
          descriptionEn: c.blurb,
          type: unique === 1 ? 'COLOUR_PAIR' : 'FIXED_SET',
          pieceCount: c.items.length,
          pageTemplateKey: c.template,
          setPriceMinor: minor(c.priceMinor / 100),
          compareAtMinor: c.items.reduce((n, i) => n + (priceOf.get(i) ?? 0), 0),
          status: 'DRAFT',
          autoApply: c.autoApply,
          sameColour: c.sameColour,
        },
      ],
      skipDuplicates: true,
    });
    if (made.count)
      await db.comboItem.createMany({
        data: c.items.map((i, k) => ({ id: practiceId(`comboitem:${c.id}:${k}`), storeId, comboId: id, position: k, productId: productIdOf(i), quantity: 1, allowedColourIds: [], allowedSizeIds: [] })),
        skipDuplicates: true,
      });
    counts.practiceCombos += made.count;
  }

  // ---- journal posts, spread over the six months before now, each pointing at its product
  const categories = new Map<string, string>();
  for (const j of DEMO_EXTRAS.journal) {
    const kind = j.kicker.split('·')[0]!.trim();
    if (categories.has(kind)) continue;
    const row = await db.blogCategory.upsert({
      where: { storeId_slug: { storeId, slug: `${PRACTICE_SLUG}${kebab(kind)}` } },
      update: {},
      create: { storeId, slug: `${PRACTICE_SLUG}${kebab(kind)}`, nameEn: kind },
      select: { id: true },
    });
    categories.set(kind, row.id);
  }
  const n = DEMO_EXTRAS.journal.length;
  for (const [i, j] of DEMO_EXTRAS.journal.entries()) {
    const kind = j.kicker.split('·')[0]!.trim();
    const minutes = Number(/(\d+)\s*min/.exec(j.kicker)?.[1] ?? 3);
    const made = await db.blogPost.createMany({
      data: [
        {
          id: practiceId(`post:${i}`),
          storeId,
          categoryId: categories.get(kind) ?? null,
          locale: 'en',
          slug: `${PRACTICE_SLUG}${kebab(j.title)}`,
          title: j.title,
          excerpt: j.excerpt,
          body: j.excerpt,
          status: 'UNPUBLISHED',
          wordCount: j.excerpt.split(/\s+/).length,
          readingMinutes: minutes,
          productIds: there.has(productIdOf(j.product)) ? [productIdOf(j.product)] : [],
          publishedAt: new Date(now.getTime() - Math.round(((i + 1) * 170) / n) * DAY), // hardcode-ok: about six months of sample dates
        },
      ],
      skipDuplicates: true,
    });
    counts.practicePosts += made.count;
  }
  return counts;
}
