// S12 · PR 593 (Blueprint C11.3; demo 94-admin-blog.js "author team" tab) — the five AI author sub-agents under Doot,
// pure model: which content section ("pillar") each one covers, and the writer-never-reviews-own-post rotation.
//
// - Suta (fabrics and fit), Jotno (care and washing), Rong (styling), Ritu (seasons and occasions), Bazar (brands and
//   products) — codes A360-08…12, names and bios owner-editable through the generic author shelf (PR 240); only the
//   section each one covers and its seed text are fixed here, matching the demo exactly.
// - A topic picks its section (`pillar`); when the owner leaves the author blank, the matching AI author writes it.
//   The reviewer is never the writer: among the other active AI authors, the one reviewing the fewest live posts
//   goes next, so the load stays even over time (no separate counter to keep in step with the database).
// - Honest gaps, left for later PRs: model choice per job and cost-when-used (PR 580's cost book, not built), the
//   full 360° profile in the AI Control Room (PR 577, S15) and the continuous-learning curriculum (PR 579, 585, S15).

/** The six content sections the journal's pillars/topics choose from (fixed; Blueprint C11.1, demo ZB_PILLARS_DEF). */
export const PILLARS = ['care', 'style', 'fabric', 'fit', 'season', 'brand'] as const;
export type Pillar = (typeof PILLARS)[number];
export const isPillarId = (v: unknown): v is Pillar => (PILLARS as readonly string[]).includes(String(v));

export interface AuthorSeed {
  slug: string;
  agentKey: string;
  displayName: string;
  pillars: readonly Pillar[];
  bioEn: string;
  bioBn: string;
}

const PILLAR_WORD_EN: Record<Pillar, string> = { care: 'care and washing', style: 'styling', fabric: 'fabrics', fit: 'fit and size', season: 'seasons and occasions', brand: 'our products and brand' };
const PILLAR_WORD_BN: Record<Pillar, string> = { care: 'যত্ন ও ধোয়া', style: 'স্টাইল', fabric: 'কাপড়', fit: 'ফিট ও সাইজ', season: 'উৎসব ও মৌসুম', brand: 'আমাদের প্রোডাক্ট আর ব্র্যান্ড' };

// The shop's own name never goes in this seed text (hard rule 1/4: it is a setting, read dynamically wherever a
// byline is shown — see journal/model.ts byline() and its callers); these bios speak of "our team" instead.
function bioEn(pillars: readonly Pillar[]): string {
  return `An AI writer on our content team. Writes about ${pillars.map((p) => PILLAR_WORD_EN[p]).join(' and ')} from our product data, size charts and our own photos. Every article is proofread by another writer and checked by our team before it goes live.`;
}
function bioBn(pillars: readonly Pillar[]): string {
  return `আমাদের কনটেন্ট টিমের একজন AI লেখক। ${pillars.map((p) => PILLAR_WORD_BN[p]).join(' আর ')} নিয়ে লেখে — আমাদের প্রোডাক্টের তথ্য, সাইজ চার্ট আর নিজেদের তোলা ছবি দেখে। প্রতিটা লেখা আরেকজন লেখক প্রুফ করে, তারপর আমাদের টিম দেখে প্রকাশ করে।`;
}

/** The fixed five-author team (owner may rename/re-bio any of them afterwards; this seeds them once, slug-keyed). */
export const AUTHOR_TEAM: readonly AuthorSeed[] = [
  { slug: 'suta', agentKey: 'A360-08', displayName: 'Suta', pillars: ['fabric', 'fit'], bioEn: bioEn(['fabric', 'fit']), bioBn: bioBn(['fabric', 'fit']) },
  { slug: 'jotno', agentKey: 'A360-09', displayName: 'Jotno', pillars: ['care'], bioEn: bioEn(['care']), bioBn: bioBn(['care']) },
  { slug: 'rong', agentKey: 'A360-10', displayName: 'Rong', pillars: ['style'], bioEn: bioEn(['style']), bioBn: bioBn(['style']) },
  { slug: 'ritu', agentKey: 'A360-11', displayName: 'Ritu', pillars: ['season'], bioEn: bioEn(['season']), bioBn: bioBn(['season']) },
  { slug: 'bazar', agentKey: 'A360-12', displayName: 'Bazar', pillars: ['brand'], bioEn: bioEn(['brand']), bioBn: bioBn(['brand']) },
] as const;

/** An active AI author, as read from the database (BlogAuthor), for the two pure pickers below. */
export interface AiAuthorRow {
  id: string;
  agentKey: string | null;
}

/** The author whose seed covers this section (null when the section is unknown or no seeded row is live yet). */
export function authorForPillar(pillar: string | null, authors: readonly AiAuthorRow[]): string | null {
  if (!pillar || !isPillarId(pillar)) return null;
  const seed = AUTHOR_TEAM.find((a) => (a.pillars as readonly string[]).includes(pillar));
  if (!seed) return null;
  const row = authors.find((a) => a.agentKey === seed.agentKey);
  return row?.id ?? null;
}

/**
 * The next proofreader: among the other active AI authors (never the writer), the one carrying the fewest of the
 * `loadOf` counts goes next, ties broken by list order — so the five share the queue evenly without a stored turn.
 */
export function pickReviewer(authors: readonly AiAuthorRow[], writerId: string | null, loadOf: ReadonlyMap<string, number>): string | null {
  const candidates = authors.filter((a) => a.id !== writerId);
  if (!candidates.length) return null;
  let best = candidates[0]!;
  let bestLoad = loadOf.get(best.id) ?? 0;
  for (const a of candidates.slice(1)) {
    const load = loadOf.get(a.id) ?? 0;
    if (load < bestLoad) {
      best = a;
      bestLoad = load;
    }
  }
  return best.id;
}
