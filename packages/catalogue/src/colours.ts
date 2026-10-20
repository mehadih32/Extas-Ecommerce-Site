// PR 30 — the colour library: real hex values, the colour name dictionary and the true-colour reference.
// - One stored hex form (#RRGGBB). A new colour whose shade is very close to an existing one gets a note (setting
//   `catalogue.colourSimilarDistance`), so "Navy" is not added twice; a visibly different navy is a new colour (B02 §5).
// - The name dictionary: key, English and Bengali names and synonyms. "Navy", "navy blue" and "NAVY" become one colour
//   (B01 rule 1); a name or synonym can only ever name one live colour, and `findColour` resolves free text to it.
// - The family (filters and feeds) comes from the `catalogue.colourFamilies` dictionary; the hex never goes to a feed.
// - The true-colour reference is a daylight photo (a MediaAsset of this store); a product colour can carry its own.
// - The key is fixed once made (it is in per-colour and combo links); the dictionary order is the key order.
// - Nothing is deleted: a colour is archived, and only when no live variant uses it.
import { z } from 'zod';
import { dictionaryKeySchema } from '@extas/settings';
import { allow, assertImage, changed, found, keyFrom, logChange, parse, setting, TX, type CatalogueDeps, type Db, type Who } from './context';
import { normalizeHex, relativeLuminance, rgbDistance } from './colour-math';
import { assertKeys } from './dictionaries';
import { CatalogueError } from './errors';
import { normalizeName } from './text';

const name = z.string().trim().min(1).max(60);
const fields = {
  nameEn: name,
  nameBn: name.nullable().optional(),
  hex: z.string().trim().max(9),
  family: dictionaryKeySchema.nullable().optional(),
  synonyms: z.array(name).max(30).optional(),
  erpColorCode: z.string().trim().min(1).max(40).nullable().optional(),
  trueColourAssetId: z.uuid().nullable().optional(),
};
export const colourInput = z.object({ key: dictionaryKeySchema.optional(), ...fields }).strict();
export const colourPatch = z
  .object({ ...fields, nameEn: name.optional(), hex: fields.hex.optional(), archived: z.boolean().optional() })
  .strict();
export type ColourInput = z.input<typeof colourInput>;
export type ColourPatch = z.input<typeof colourPatch>;

export interface ColourWarning {
  code: 'SIMILAR_SHADE';
  colourId: string;
  key: string;
  distance: number;
}

export interface ColourView {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  /** WCAG luminance of the swatch, so a screen can outline a near-white swatch. */
  luminance: number;
  family: string | null;
  synonyms: string[];
  erpColorCode: string | null;
  trueColourAssetId: string | null;
  archived: boolean;
  /** Live variants in this colour. */
  variants: number;
}

type ColourRow = { id: string; key: string; nameEn: string; nameBn: string | null; hex: string; family: string | null; synonyms: string[]; erpColorCode: string | null; trueColourAssetId: string | null; archivedAt: Date | null };

function view(c: ColourRow, variants = 0): ColourView {
  return {
    id: c.id,
    key: c.key,
    nameEn: c.nameEn,
    nameBn: c.nameBn,
    hex: c.hex,
    luminance: Math.round(relativeLuminance(c.hex) * 1000) / 1000,
    family: c.family,
    synonyms: c.synonyms,
    erpColorCode: c.erpColorCode,
    trueColourAssetId: c.trueColourAssetId,
    archived: c.archivedAt != null,
    variants,
  };
}

const namesOf = (c: { key: string; nameEn: string; nameBn: string | null; synonyms: string[] }) =>
  [c.key, c.nameEn, c.nameBn ?? '', ...c.synonyms].map(normalizeName).filter(Boolean);

function cleanSynonyms(list: string[] | undefined, own: string[]): string[] {
  const seen = new Set(own.map(normalizeName));
  const out: string[] = [];
  for (const s of list ?? []) {
    const n = normalizeName(s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(s.trim());
    }
  }
  return out;
}

async function liveVariants(db: Db, storeId: number, colourIds: string[]): Promise<Map<string, number>> {
  if (!colourIds.length) return new Map();
  const rows = await db.productVariant.groupBy({
    by: ['colourId'],
    where: { storeId, colourId: { in: colourIds }, archivedAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.colourId!, r._count._all]));
}

/** Every colour of the store in dictionary order (by key). */
export async function listColours(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<ColourView[]> {
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.colour.findMany({
    where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { key: 'asc' },
  });
  const used = await liveVariants(deps.db, who.storeId, rows.map((r) => r.id));
  return rows.map((r) => view(r, used.get(r.id) ?? 0));
}

/** Resolves free text ("navy blue", "নেভি", "NVY" as an ERP code) to the live colour it names, or null. */
export async function findColour(deps: CatalogueDeps, who: Who, text: string): Promise<ColourView | null> {
  await allow(deps, who, 'catalogue.read');
  const n = normalizeName(text);
  if (!n) return null;
  const rows = await deps.db.colour.findMany({ where: { storeId: who.storeId, archivedAt: null } });
  const hit = rows.find((r) => namesOf(r).includes(n)) ?? rows.find((r) => r.erpColorCode && normalizeName(r.erpColorCode) === n);
  return hit ? view(hit) : null;
}

async function checkNames(db: Db, storeId: number, candidate: { key: string; nameEn: string; nameBn: string | null; synonyms: string[] }, exceptId?: string) {
  const others = await db.colour.findMany({ where: { storeId, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  const mine = new Set(namesOf(candidate));
  const clashes = others.flatMap((o) => namesOf(o).filter((n) => mine.has(n)).map((n) => `${n} → ${o.key}`));
  if (clashes.length) throw new CatalogueError('NAME_TAKEN', 'a name or synonym already names another colour', [...new Set(clashes)]);
  return others;
}

async function similar(deps: CatalogueDeps, who: Who, hex: string, others: { id: string; key: string; hex: string }[]): Promise<ColourWarning[]> {
  const limit = await setting(deps, who, 'catalogue.colourSimilarDistance');
  if (!limit) return [];
  return others
    .map((o) => ({ code: 'SIMILAR_SHADE' as const, colourId: o.id, key: o.key, distance: Math.round(rgbDistance(hex, o.hex) * 10) / 10 }))
    .filter((w) => w.distance <= limit)
    .sort((a, b) => a.distance - b.distance);
}

function hexOrThrow(input: string): string {
  const hex = normalizeHex(input);
  if (!hex) throw new CatalogueError('INVALID_INPUT', 'not a colour like #1F2A44', ['hex']);
  return hex;
}

export async function createColour(deps: CatalogueDeps, who: Who, input: ColourInput): Promise<{ colour: ColourView; warnings: ColourWarning[] }> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(colourInput, input, 'colour');
  const hex = hexOrThrow(d.hex);
  const key = d.key ?? (await keyFrom(deps, who, d.nameEn));
  if (!key) throw new CatalogueError('INVALID_INPUT', 'give the colour an English name or a key', ['key']);
  if (d.family) assertKeys(await setting(deps, who, 'catalogue.colourFamilies'), [d.family], 'family');
  await assertImage(deps.db, who.storeId, d.trueColourAssetId, 'trueColourAssetId');
  return deps.db.$transaction(async (tx) => {
    if (await tx.colour.findUnique({ where: { storeId_key: { storeId: who.storeId, key } } })) {
      throw new CatalogueError('CONFLICT', 'a colour with this key exists (archived colours keep their key)', ['key']);
    }
    const base = { key, nameEn: d.nameEn, nameBn: d.nameBn ?? null, synonyms: [] as string[] };
    base.synonyms = cleanSynonyms(d.synonyms, namesOf(base));
    const others = await checkNames(tx, who.storeId, base);
    const row = await tx.colour.create({
      data: { storeId: who.storeId, ...base, hex, family: d.family ?? null, erpColorCode: d.erpColorCode ?? null, trueColourAssetId: d.trueColourAssetId ?? null },
    });
    await logChange(tx, who, 'colour.create', 'Colour', row.id, null, view(row));
    return { colour: view(row), warnings: await similar(deps, who, hex, others) };
  }, TX);
}

export async function updateColour(deps: CatalogueDeps, who: Who, id: string, patch: ColourPatch): Promise<{ colour: ColourView; warnings: ColourWarning[] }> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(colourPatch, patch, 'colour');
  const hex = d.hex === undefined ? undefined : hexOrThrow(d.hex);
  if (d.family) assertKeys(await setting(deps, who, 'catalogue.colourFamilies'), [d.family], 'family');
  await assertImage(deps.db, who.storeId, d.trueColourAssetId, 'trueColourAssetId');
  return deps.db.$transaction(async (tx) => {
    const cur = found(await tx.colour.findFirst({ where: { id, storeId: who.storeId } }), 'colour');
    const next = {
      nameEn: d.nameEn ?? cur.nameEn,
      nameBn: d.nameBn === undefined ? cur.nameBn : d.nameBn,
      hex: hex ?? cur.hex,
      family: d.family === undefined ? cur.family : d.family,
      erpColorCode: d.erpColorCode === undefined ? cur.erpColorCode : d.erpColorCode,
      trueColourAssetId: d.trueColourAssetId === undefined ? cur.trueColourAssetId : d.trueColourAssetId,
      synonyms: cur.synonyms,
      archivedAt: cur.archivedAt,
    };
    next.synonyms = cleanSynonyms(d.synonyms ?? cur.synonyms, namesOf({ key: cur.key, nameEn: next.nameEn, nameBn: next.nameBn, synonyms: [] }));
    if (archived === true && !cur.archivedAt) {
      const used = (await liveVariants(tx, who.storeId, [cur.id])).get(cur.id) ?? 0;
      if (used) throw new CatalogueError('COLOUR_IN_USE', 'live variants use this colour', [`variants: ${used}`]);
      next.archivedAt = deps.now?.() ?? new Date();
    }
    if (archived === false) next.archivedAt = null;
    const others = next.archivedAt ? [] : await checkNames(tx, who.storeId, { key: cur.key, ...next }, cur.id);
    const diff = changed(cur as unknown as Record<string, unknown>, next);
    if (!Object.keys(diff.after).length) return { colour: view(cur, (await liveVariants(tx, who.storeId, [cur.id])).get(cur.id) ?? 0), warnings: [] };
    const row = await tx.colour.update({ where: { id: cur.id }, data: next });
    const action = archived === true ? 'colour.archive' : archived === false && cur.archivedAt ? 'colour.restore' : 'colour.update';
    await logChange(tx, who, action, 'Colour', row.id, diff.before, diff.after);
    const warnings = hex && hex !== cur.hex && !row.archivedAt ? await similar(deps, who, hex, others) : [];
    return { colour: view(row, (await liveVariants(tx, who.storeId, [row.id])).get(row.id) ?? 0), warnings };
  }, TX);
}
