// S24 · PR 462 (Blueprint C7.19 "A/B test on-model vs flat-lay on the live site, measuring add-to-bag, conversion
// and return rate") — the live pilot's own bucketing and read-back, scoped to the owner's own cohort of 20–30 real
// products (`studio.photoshoot.styleAbTest`, registry-photoshoot-pilot.ts): which pilot products are in it, and
// what share of a product's visitors are shown ON_MODEL instead of the shop's own FLAT_LAY-first default.
//
// `assignStyleVariant` is deliberately NOT gated behind a staff `Who`/`allow()` the way every other function in
// this package is: it is meant to be called from the storefront's own visitor-facing code — the actual PDP route
// that decides which gallery image leads for a given visitor is a later PR's own honest scope (wiring it touches
// `apps/web`'s PdpGallery under the phone pixel-diff gate, not this one) — the same way the shop's own cart tables
// are written by visitor flows with no staff permission at all. It takes a plain `storeId`, never a `Who`.
//
// `styleTallies`/`twoProportionVerdict` ARE staff-facing (`photoshoot.read`) and duplicate, rather than import, the
// exact two-proportion z-test S02's own `apps/web/src/lib/experiments/model.ts` already built and tested for the
// generic word/eye-toggle A/B (PR 83, `verdict`/`phi`): `@extas/photoshoot` is a package and must not depend on
// `apps/web`, the same boundary `spendCap.ts`/`costLedger.ts` already draw at this exact edge. A dedicated table
// (`PhotoshootStyleTrial`, migration 0188) rather than the generic `AbTest`/`AbAssignment` pair (S02, PR 83): that
// engine's own `variants`/`goalEvent` shape is fixed to word/eye-toggle changes and a single addToBag-or-order
// goal, and the owner's Reports › Experiments screen lists every `AbTest` row as one of those — writing a row here
// in a different shape would show up there, broken, rather than staying the pilot's own thing.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@extas/db/client';
import { allow, checkStoreId, parse, type PhotoshootDeps, type Who } from './context';

/** The only two styles this pilot ever compares — reusing `ProductMediaRole`'s own two values (PdpGallery already
 * knows them) rather than inventing a parallel vocabulary for the same two photo kinds. */
export const STYLE_VARIANTS = ['ON_MODEL', 'FLAT_LAY'] as const;
export type StyleVariant = (typeof STYLE_VARIANTS)[number];

export interface PilotCohort {
  productIds: readonly string[];
  splitPercent: number;
}

/** Is this product actually in the pilot right now — the owner's own `studio.photoshoot.styleAbTest.productIds`? */
export const isPilotProduct = (cohort: PilotCohort, productId: string): boolean => cohort.productIds.includes(productId);

/**
 * Deterministic: the same product+visitor always lands on the same side, every time it is asked — a visitor's
 * variant never flickers between page loads, the same guarantee the generic Experiments module's own `bucket()`
 * (S02, PR 83) gives for a word/eye-toggle test. `splitPercent` is ON_MODEL's own share (1–99), mirroring that
 * module's `shareB` convention exactly: turning the pilot off (an empty cohort, never calling this at all) always
 * leaves every visitor on the shop's own plain FLAT_LAY-first behaviour, never the other way round.
 */
export function bucketStyleVariant(productId: string, visitorId: string, splitPercent: number): StyleVariant {
  const h = createHash('sha256').update(`${productId}:${visitorId}`).digest();
  const sharePct = (h.readUInt32BE(0) / 0x1_0000_0000) * 100;
  return sharePct < splitPercent ? 'ON_MODEL' : 'FLAT_LAY';
}

const assignInput = z
  .object({
    storeId: z.number().int().min(1),
    productId: z.string().uuid(),
    visitorId: z.string().trim().min(1).max(200),
  })
  .strict();

export interface StyleAssignment {
  /** False for any product outside the cohort — the caller falls back to the shop's own ordinary gallery order
   * (PR 461's `withOnModelOrder`), byte for byte, exactly as every non-pilot product already does. */
  inTest: boolean;
  variant: StyleVariant | null;
}

/**
 * The visitor-facing entry point (no `Who` — see the file header). Not in the pilot cohort, this writes nothing
 * and answers `{inTest:false, variant:null}`. In the cohort, buckets the visitor once (`bucketStyleVariant`) and
 * finds-or-creates the one `PhotoshootStyleTrial` row this visitor+product will ever get (its own unique index):
 * the same visitor asking twice for the same product always gets back the variant he was first shown, never
 * re-bucketed. A race between two requests for the very first page view is resolved by retrying once on the
 * unique-index conflict (the same `P2002`-retry `@extas/customers`'s `addNoteOrTag` already uses at this exact
 * kind of edge) — never a thrown error back to a real visitor over an ordinary double click.
 */
export async function assignStyleVariant(deps: Pick<PhotoshootDeps, 'db'>, cohort: PilotCohort, input: unknown): Promise<StyleAssignment> {
  const d = parse(assignInput, input, 'style assignment');
  checkStoreId(d.storeId);
  if (!isPilotProduct(cohort, d.productId)) return { inTest: false, variant: null };

  const existing = await deps.db.photoshootStyleTrial.findFirst({ where: { storeId: d.storeId, productId: d.productId, visitorId: d.visitorId } });
  if (existing) return { inTest: true, variant: existing.variant as StyleVariant };

  const variant = bucketStyleVariant(d.productId, d.visitorId, cohort.splitPercent);
  try {
    const row = await deps.db.photoshootStyleTrial.create({ data: { storeId: d.storeId, productId: d.productId, visitorId: d.visitorId, variant } });
    return { inTest: true, variant: row.variant as StyleVariant };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return assignStyleVariant(deps, cohort, input); // someone else's request won the race; read it back
    throw e;
  }
}

export interface StyleTally {
  /** Visitors bucketed into this variant for the product(s) asked about. */
  n: number;
  /** Of them, who added the product to the bag after being shown that variant. */
  addedToBag: number;
  /** Of them, who placed an order containing the product after being shown that variant. */
  ordered: number;
  /** Of the ones who ordered, how many of those orders later had a return recorded against this product's line. */
  returned: number;
}

export interface StyleTallies {
  onModel: StyleTally;
  flatLay: StyleTally;
}

const EMPTY_TALLY: StyleTally = { n: 0, addedToBag: 0, ordered: 0, returned: 0 };

const talliesInput = z.object({ productIds: z.array(z.string().uuid()).min(1).max(50) }).strict();

/**
 * Per-variant tallies for one or more pilot products (`photoshoot.read`): how many visitors were shown each style,
 * and of them, who added to the bag, who ordered, and — of those orders — how many came back as a return. Counts
 * only activity after the trial's own `createdAt` (the same "after he was first counted" rule the generic
 * Experiments module's own `tallies()` applies), and only ever the trial's own product, never the whole bag or
 * order. `n` double-counts nothing: one visitor's trial for one product is exactly one row (the table's own unique
 * index), so this is a plain `GROUP BY variant`.
 */
export async function styleTallies(deps: Pick<PhotoshootDeps, 'db'>, who: Who, input: unknown): Promise<StyleTallies> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const d = parse(talliesInput, input, 'style tallies');
  const rows = await deps.db.$queryRaw<{ variant: string; n: number; addedToBag: number; ordered: number; returned: number }[]>`
    SELECT t."variant",
      COUNT(*)::int AS "n",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "CartItem" ci JOIN "Cart" c ON c."id" = ci."cartId" JOIN "ProductVariant" pv ON pv."id" = ci."variantId"
        WHERE c."storeId" = t."storeId" AND c."visitorId" = t."visitorId" AND pv."productId" = t."productId" AND NOT ci."savedForLater"
          AND ((ci."createdAt" >= t."createdAt") OR (ci."raisedAt" >= t."createdAt"))
      ))::int AS "addedToBag",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o."id"
        WHERE o."storeId" = t."storeId" AND o."visitorId" = t."visitorId" AND oi."productId" = t."productId"
          AND o."placedAt" >= t."createdAt" AND o."status"::text != 'DRAFT'
      ))::int AS "ordered",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o."id" JOIN "ReturnItem" ri ON ri."orderItemId" = oi."id" JOIN "ReturnRecord" r ON r."id" = ri."returnId"
        WHERE o."storeId" = t."storeId" AND o."visitorId" = t."visitorId" AND oi."productId" = t."productId"
          AND o."placedAt" >= t."createdAt" AND o."status"::text != 'DRAFT'
      ))::int AS "returned"
    FROM "PhotoshootStyleTrial" t
    WHERE t."storeId" = ${who.storeId} AND t."productId" = ANY(${d.productIds}::uuid[])
    GROUP BY t."variant"`;
  const out: StyleTallies = { onModel: { ...EMPTY_TALLY }, flatLay: { ...EMPTY_TALLY } };
  for (const r of rows) {
    if (r.variant === 'ON_MODEL') out.onModel = { n: r.n, addedToBag: r.addedToBag, ordered: r.ordered, returned: r.returned };
    else if (r.variant === 'FLAT_LAY') out.flatLay = { n: r.n, addedToBag: r.addedToBag, ordered: r.ordered, returned: r.returned };
  }
  return out;
}

export interface TwoProportionVerdict {
  rateOnModel: number | null;
  rateFlatLay: number | null;
  /** (rateOnModel − rateFlatLay) / rateFlatLay, or null without a rate for flat-lay. */
  lift: number | null;
  /** How sure the difference is not chance (0–1, two-sided), or null before each side has enough visitors. */
  confidence: number | null;
  /** Each side has at least `minVisitors`. */
  enough: boolean;
}

/** The normal distribution's cumulative value (Abramowitz–Stegun 26.2.17) — the exact same approximation S02's
 * own `apps/web/src/lib/experiments/model.ts` uses for its word/eye-toggle A/B, duplicated rather than imported
 * (see the file header): both copies are kept honest by matching the textbook formula, not each other. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Of a rate drawn from `n` visitors and `c` of them reaching some goal (added to the bag, ordered, returned —
 * whichever count the caller passes), is on-model's rate really different from flat-lay's, by chance alone? No
 * "winner" field: unlike the generic Experiments module's own single addToBag/order goal (always "higher is
 * better"), C7.19 asks for three outcomes at once, and a LOWER rate is the good result for returns — the caller
 * decides which direction it wanted, this only ever answers "how sure is the gap."
 */
export function twoProportionVerdict(onModel: { n: number; c: number }, flatLay: { n: number; c: number }, minVisitors: number): TwoProportionVerdict {
  const rateOnModel = onModel.n ? onModel.c / onModel.n : null;
  const rateFlatLay = flatLay.n ? flatLay.c / flatLay.n : null;
  const lift = rateFlatLay && rateOnModel !== null ? (rateOnModel - rateFlatLay) / rateFlatLay : null;
  const enough = onModel.n >= minVisitors && flatLay.n >= minVisitors;
  if (!enough || rateOnModel === null || rateFlatLay === null) return { rateOnModel, rateFlatLay, lift, confidence: null, enough };
  const p = (onModel.c + flatLay.c) / (onModel.n + flatLay.n);
  const se = Math.sqrt(p * (1 - p) * (1 / onModel.n + 1 / flatLay.n));
  const zScore = se ? (rateOnModel - rateFlatLay) / se : 0;
  const confidence = se ? Math.max(0, 2 * phi(Math.abs(zScore)) - 1) : 0;
  return { rateOnModel, rateFlatLay, lift, confidence, enough };
}
