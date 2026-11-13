// S24 · PR 480 (Blueprint C7.13 "Occasion scenes — and the system grooms the owner, not the other way round",
// C7.22 item 37) — the occasion-scene suggester. C7.13 verbatim:
//
// "The owner's words: his head will not produce scene ideas on the spot, so the system must propose.
//  - Before generating, the system offers three scene options with small previews, each named and described in
//    one line: 'Winter morning — soft fog, park path, cool tones' · 'Eid evening — warm light, decorated
//    interior' · 'Match day — stadium tunnel, strong side light' · 'Summer — bright open street'.
//  - Suggestions are chosen from the product's category and the calendar, so winter items get winter scenes in
//    winter.
//  - The owner picks one, asks for more options, or says no scene (plain studio).
//  - A demo frame is always shown before the full set is generated — he approves the look first, then it runs.
//  - Approved scenes are saved to the scene library and reused, so the catalogue stays consistent within a
//    season."
//
// This PR's own honest scope is exactly the first three bullets — "the system must propose" — nothing more. The
// last two bullets are already built: `sceneLibrary.ts` (PR 476) already requires a real, approved demo frame
// before `recordSceneLibraryEntry` ever saves a scene ("a demo frame is always shown … he approves the look
// first"), and its own `SCENE_LIBRARY_PRESETS` already names the base catalogue every store starts with and
// `findLatestSceneLibraryEntry`/`listSceneLibrary` already reuse an approved entry ("saved to the scene library
// and reused"). `isSceneLibraryKey`'s own module comment already anticipated this exact PR: "a custom scene key
// the occasion suggester (PR 480 … ) will mint … once the owner approves its own demo frame" — this module is
// that suggester, and the four named occasions below are deliberately minted as `isSceneLibraryKey`'s own
// well-formed custom slugs (`winter_morning`/`eid_evening`/`match_day`/`summer`), never a second, parallel scene
// vocabulary. Saying "no scene" (plain studio) is simply choosing `sceneLibrary.ts`'s own pre-existing
// `studio_grey` preset — nothing new to build for that choice either.
//
// "Suggestions are chosen from the product's category and the calendar": pure, deterministic, no randomness, the
// same discipline every other engine's own `plan*`/`suggest*` function in this package already follows — fed by
// the caller's own facts (the current month, the product's own category hints), never a database query or a
// clock read this module performs itself. Each catalogue entry carries the months (1–12, Bangladesh's own
// seasons) and/or category hints C7.13's own description implies for it: `winter_morning` and `summer` are
// genuinely calendar-bound (Bangladesh's winter and summer); `eid_evening` (a lunar-calendar date that moves every
// year) and `match_day` (an event, not a season) carry no fixed months — they are always calendar-eligible and
// rely on the category hint alone, never a guessed Gregorian date range this module would get wrong most years.
//
// "Offers three": kept as a fixed default count, the same reasoning `MIN_COMBO_GIFT_SET_PIECES`/
// `MAX_COMBO_GIFT_SET_PIECES` already give — a plain descriptive fact of how many preview cards a screen shows,
// never a price or a policy the owner would be asked a number for. "Asks for more options" is `excludeKeys`
// below: a caller that already showed 3 keys asks again with those excluded, paging through the same fixed
// catalogue rather than this module keeping any session state of its own.
//
// Deliberately NOT here: a real calendar clock read (the caller supplies `month`, the same "fed by the caller's
// own facts" limit every other `plan*` function in this package already accepts); any new recorder (PR 476
// already owns saving and reusing a scene); wiring any admin screen or job orchestrator to actually call this
// module (no caller exists yet, the same honest gap every other S24 engine's own first PR leaves).
/** C7.13's own "offers three scene options" — a plain fixed fact of how many preview cards a screen shows, never
 * a setting (the same reasoning `MIN_COMBO_GIFT_SET_PIECES`/`MAX_COMBO_GIFT_SET_PIECES` already give). */
export const OCCASION_SCENE_SUGGESTION_COUNT = 3;

export interface OccasionSceneDef {
  /** A `sceneLibrary.ts`-own well-formed custom slug — this suggester's only vocabulary, never a second,
   * parallel one. */
  key: string;
  nameEn: string;
  nameBn: string;
  /** C7.13's own one-line description, verbatim. */
  descriptionEn: string;
  descriptionBn: string;
  /** The calendar months (1–12) this occasion genuinely belongs to in Bangladesh — empty when the occasion has
   * no fixed Gregorian months (a lunar date that moves every year, or an event rather than a season), so it is
   * never excluded by the calendar signal, only ever chosen by its own category hint. */
  months: readonly number[];
  /** Free category hints (a product's own category slug or garment-type hint) this occasion suits — the
   * caller's own vocabulary, matched as a plain case-insensitive string, never a second taxonomy this module
   * invents. */
  categoryHints: readonly string[];
}

/** C7.13's own four named occasion scenes, verbatim and in order — the whole catalogue this suggester ever draws
 * from; adding a fifth is a later change-note PR (CLAUDE.md "register first"), never a silent edit here. */
export const OCCASION_SCENE_CATALOGUE: readonly OccasionSceneDef[] = [
  {
    key: 'winter_morning',
    nameEn: 'Winter morning',
    nameBn: 'শীতের সকাল',
    descriptionEn: 'Soft fog, park path, cool tones.',
    descriptionBn: 'নরম কুয়াশা, পার্কের পথ, ঠান্ডা রঙ।',
    months: [11, 12, 1, 2],
    categoryHints: ['winter', 'jacket', 'hoodie', 'sweater', 'tracksuit'],
  },
  {
    key: 'eid_evening',
    nameEn: 'Eid evening',
    nameBn: 'ঈদের সন্ধ্যা',
    descriptionEn: 'Warm light, decorated interior.',
    descriptionBn: 'উষ্ণ আলো, সাজানো ঘর।',
    months: [],
    categoryHints: ['eid', 'panjabi', 'festive', 'gift_set'],
  },
  {
    key: 'match_day',
    nameEn: 'Match day',
    nameBn: 'ম্যাচ ডে',
    descriptionEn: 'Stadium tunnel, strong side light.',
    descriptionBn: 'স্টেডিয়ামের টানেল, জোরালো পাশের আলো।',
    months: [],
    categoryHints: ['sportswear', 'jersey', 'tracksuit'],
  },
  {
    key: 'summer',
    nameEn: 'Summer',
    nameBn: 'গরমকাল',
    descriptionEn: 'Bright open street.',
    descriptionBn: 'উজ্জ্বল খোলা রাস্তা।',
    months: [3, 4, 5, 6],
    categoryHints: ['summer', 'polo', 'short', 't_shirt'],
  },
] as const;

/** Every occasion-scene key this suggester may ever propose — always one of `sceneLibrary.ts`'s own accepted
 * custom slugs, cross-checked by a test in this module so the two never drift apart. */
export const isOccasionSceneKey = (v: unknown): v is string => OCCASION_SCENE_CATALOGUE.some((s) => s.key === v);

export interface OccasionSceneSuggestInput {
  /** The current calendar month, 1–12 — the caller's own clock read, never this module's. */
  month: number;
  /** The product's own category/garment-type hints, matched case-insensitively — optional; with none given,
   * only the calendar signal is used. */
  categoryHints?: readonly string[];
}

export interface OccasionSceneSuggestion extends OccasionSceneDef {
  /** How strongly this occasion matches the caller's own month and category hints — 0 (neither matched), 1
   * (one signal matched) or 2 (both matched). Exposed so a caller can show "picked for winter" style context,
   * never hidden. */
  score: 0 | 1 | 2;
}

function scoreOccasion(scene: OccasionSceneDef, input: OccasionSceneSuggestInput): 0 | 1 | 2 {
  const monthMatches = scene.months.length === 0 || scene.months.includes(input.month);
  const wanted = (input.categoryHints ?? []).map((h) => h.toLowerCase());
  const categoryMatches = wanted.length > 0 && scene.categoryHints.some((h) => wanted.includes(h.toLowerCase()));
  // A fixed-month occasion outside its own months still ranks low rather than being hidden outright — C7.13's own
  // "picks one, asks for more options" lets the owner see everything, calendar fit just orders the list.
  if (monthMatches && categoryMatches) return 2;
  if (monthMatches || categoryMatches) return 1;
  return 0;
}

/**
 * C7.13's own "the system offers three scene options … chosen from the product's category and the calendar" —
 * pure, deterministic: sorts the whole catalogue by how well each occasion fits the caller's own month and
 * category hints (highest first; ties keep the catalogue's own fixed order, never a random pick), then returns
 * the top `count`. `excludeKeys` is C7.13's own "asks for more options" — pass back the keys already shown to
 * page further into the same catalogue, never inventing new ones once it is exhausted.
 */
export function suggestOccasionScenes(input: OccasionSceneSuggestInput, opts: { count?: number; excludeKeys?: readonly string[] } = {}): OccasionSceneSuggestion[] {
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) throw new RangeError('month must be an integer from 1 to 12');
  const count = opts.count ?? OCCASION_SCENE_SUGGESTION_COUNT;
  const excluded = new Set(opts.excludeKeys ?? []);
  return OCCASION_SCENE_CATALOGUE.filter((s) => !excluded.has(s.key))
    .map((s) => ({ ...s, score: scoreOccasion(s, input) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

/** C7.13's own "says no scene (plain studio)" — simply `sceneLibrary.ts`'s own pre-existing `studio_grey`
 * preset, re-exported by name so a caller never has to spell out the string itself or guess that this is what
 * "no scene" means. Not a new vocabulary: `isSceneLibraryKey(OCCASION_SCENE_NONE_KEY)` is already `true` —
 * cross-checked by a test in `occasionSceneSuggester.test.ts`, the same drift guard `comboGiftSetStudio.test.ts`/
 * `sceneLibrary.test.ts` already run against their own sibling module's vocabulary. */
export const OCCASION_SCENE_NONE_KEY = 'studio_grey';
