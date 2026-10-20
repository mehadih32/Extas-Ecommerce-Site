// PR 31 — structured fabric and care content. A fabric is a row of the store's fabric library that products point at.
// Its structure lives in `composition` (JSON, no new columns): the fibres with their shares (they add up to the whole),
// the construction (piqué, jersey, oxford …), the care instructions and the features — every one a key of an
// owner-editable dictionary setting (`catalogue.fibres`, `catalogue.fabricConstructions`, `catalogue.careInstructions`,
// `catalogue.fabricFeatures`), so the text is bilingual and the same everywhere (PDP, filters, the AI's answers).
// Weight (GSM) is optional and never invented: empty until the owner or the ERP gives it. Free care text stays possible
// (`careEn`/`careBn`) for anything the dictionary does not say. Archived, never deleted.
import { z } from 'zod';
import { Prisma } from '@extas/db/client';
import { dictionaryKeySchema, type Dictionary } from '@extas/settings';
import { allow, changed, found, logChange, parse, setting, TX, type CatalogueDeps, type Who } from './context';
import { assertKeys, label, type Lang } from './dictionaries';
import { CatalogueError } from './errors';

/** The whole of a fabric, in shares (fibre shares add up to this). */
export const WHOLE = 100;

const fibreShare = z.object({ fibre: dictionaryKeySchema, share: z.int().min(1).max(WHOLE) }).strict();
export const compositionSchema = z
  .object({
    fibres: z
      .array(fibreShare)
      .max(8)
      .refine((l) => new Set(l.map((f) => f.fibre)).size === l.length, { message: 'each fibre once' })
      .refine((l) => l.length === 0 || l.reduce((s, f) => s + f.share, 0) === WHOLE, { message: `fibre shares add up to ${WHOLE}` }),
    construction: dictionaryKeySchema.nullable().optional(),
    care: z.array(dictionaryKeySchema).max(12).optional(),
    features: z.array(dictionaryKeySchema).max(12).optional(),
  })
  .strict();
export type Composition = z.output<typeof compositionSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);
const fields = {
  nameEn: text(80),
  nameBn: text(80).nullable().optional(),
  composition: compositionSchema.nullable().optional(),
  /** Grams per square metre; optional — never guessed. */
  gsm: z.int().min(20).max(2000).nullable().optional(),
  careEn: text(1000).nullable().optional(),
  careBn: text(1000).nullable().optional(),
};
export const fabricInput = z.object(fields).strict();
export const fabricPatch = z.object({ ...fields, nameEn: fields.nameEn.optional(), archived: z.boolean().optional() }).strict();
export type FabricInput = z.input<typeof fabricInput>;
export type FabricPatch = z.input<typeof fabricPatch>;

export interface FabricView {
  id: string;
  nameEn: string;
  nameBn: string | null;
  composition: Composition | null;
  gsm: number | null;
  careEn: string | null;
  careBn: string | null;
  archived: boolean;
  products: number;
}

type Row = { id: string; nameEn: string; nameBn: string | null; composition: Prisma.JsonValue; gsm: number | null; careEn: string | null; careBn: string | null; archivedAt: Date | null };

/** A stored composition read back; anything malformed (an old or hand-made row) reads as none. */
export function readComposition(json: Prisma.JsonValue | null | undefined): Composition | null {
  if (json == null) return null;
  const r = compositionSchema.safeParse(json);
  return r.success ? r.data : null;
}

const view = (f: Row, products = 0): FabricView => ({
  id: f.id,
  nameEn: f.nameEn,
  nameBn: f.nameBn,
  composition: readComposition(f.composition),
  gsm: f.gsm,
  careEn: f.careEn,
  careBn: f.careBn,
  archived: f.archivedAt != null,
  products,
});

export interface FabricDictionaries {
  fibres: Dictionary;
  constructions: Dictionary;
  care: Dictionary;
  features: Dictionary;
}

export async function fabricDictionaries(deps: CatalogueDeps, who: Who): Promise<FabricDictionaries> {
  const [fibres, constructions, care, features] = await Promise.all([
    setting(deps, who, 'catalogue.fibres'),
    setting(deps, who, 'catalogue.fabricConstructions'),
    setting(deps, who, 'catalogue.careInstructions'),
    setting(deps, who, 'catalogue.fabricFeatures'),
  ]);
  return { fibres, constructions, care, features };
}

/** Every key of a composition must be in its dictionary (UNKNOWN_KEY names the strangers). */
export function assertComposition(c: Composition | null | undefined, dicts: FabricDictionaries): void {
  if (!c) return;
  assertKeys(dicts.fibres, c.fibres.map((f) => f.fibre), 'fibres');
  if (c.construction) assertKeys(dicts.constructions, [c.construction], 'fabricConstructions');
  assertKeys(dicts.care, c.care ?? [], 'careInstructions');
  assertKeys(dicts.features, c.features ?? [], 'fabricFeatures');
}

/** The fabric as plain facts in one language — for the PDP's fabric block and the AI's grounded answers (B6.8). */
export interface FabricFacts {
  name: string;
  /** e.g. "60% cotton, 40% polyester" pieces: [{ fibre: "cotton", label: "Cotton", share: 60 }]. */
  fibres: { fibre: string; label: string; share: number }[];
  construction: string | null;
  gsm: number | null;
  care: string[];
  careNote: string | null;
  features: string[];
}

export function fabricFacts(f: FabricView, dicts: FabricDictionaries, lang: Lang): FabricFacts {
  const c = f.composition;
  return {
    name: (lang === 'bn' ? f.nameBn : null) ?? f.nameEn,
    fibres: (c?.fibres ?? []).map((x) => ({ fibre: x.fibre, label: label(dicts.fibres, x.fibre, lang), share: x.share })),
    construction: c?.construction ? label(dicts.constructions, c.construction, lang) : null,
    gsm: f.gsm,
    care: (c?.care ?? []).map((k) => label(dicts.care, k, lang)),
    careNote: (lang === 'bn' ? f.careBn : null) ?? f.careEn,
    features: (c?.features ?? []).map((k) => label(dicts.features, k, lang)),
  };
}

export async function listFabrics(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<FabricView[]> {
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.fabric.findMany({
    where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { nameEn: 'asc' },
    include: { _count: { select: { products: { where: { archivedAt: null } } } } },
  });
  return rows.map((r) => view(r, r._count.products));
}

export async function getFabric(deps: CatalogueDeps, who: Who, id: string): Promise<FabricView> {
  await allow(deps, who, 'catalogue.read');
  const r = found(
    await deps.db.fabric.findFirst({ where: { id, storeId: who.storeId }, include: { _count: { select: { products: { where: { archivedAt: null } } } } } }),
    'fabric',
  );
  return view(r, r._count.products);
}

const json = (c: Composition | null | undefined) => (c ? (JSON.parse(JSON.stringify(c)) as Prisma.InputJsonValue) : Prisma.DbNull);

export async function createFabric(deps: CatalogueDeps, who: Who, input: FabricInput): Promise<FabricView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(fabricInput, input, 'fabric');
  assertComposition(d.composition, await fabricDictionaries(deps, who));
  return deps.db.$transaction(async (tx) => {
    const same = await tx.fabric.findFirst({ where: { storeId: who.storeId, nameEn: { equals: d.nameEn, mode: 'insensitive' }, archivedAt: null } });
    if (same) throw new CatalogueError('NAME_TAKEN', 'a fabric with this name exists', ['nameEn']);
    const row = await tx.fabric.create({
      data: { storeId: who.storeId, nameEn: d.nameEn, nameBn: d.nameBn ?? null, composition: json(d.composition), gsm: d.gsm ?? null, careEn: d.careEn ?? null, careBn: d.careBn ?? null },
    });
    await logChange(tx, who, 'fabric.create', 'Fabric', row.id, null, view(row));
    return view(row);
  }, TX);
}

export async function updateFabric(deps: CatalogueDeps, who: Who, id: string, patch: FabricPatch): Promise<FabricView> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(fabricPatch, patch, 'fabric');
  if (d.composition !== undefined) assertComposition(d.composition, await fabricDictionaries(deps, who));
  return deps.db.$transaction(async (tx) => {
    const cur = found(await tx.fabric.findFirst({ where: { id, storeId: who.storeId } }), 'fabric');
    const live = await tx.product.count({ where: { storeId: who.storeId, fabricId: cur.id, archivedAt: null } });
    if (archived === true && !cur.archivedAt && live) throw new CatalogueError('CONFLICT', 'live products use this fabric', [`products: ${live}`]);
    if (d.nameEn && d.nameEn.toLowerCase() !== cur.nameEn.toLowerCase()) {
      const same = await tx.fabric.findFirst({ where: { storeId: who.storeId, id: { not: cur.id }, nameEn: { equals: d.nameEn, mode: 'insensitive' }, archivedAt: null } });
      if (same) throw new CatalogueError('NAME_TAKEN', 'a fabric with this name exists', ['nameEn']);
    }
    const before = { nameEn: cur.nameEn, nameBn: cur.nameBn, composition: readComposition(cur.composition), gsm: cur.gsm, careEn: cur.careEn, careBn: cur.careBn, archivedAt: cur.archivedAt };
    const next = {
      nameEn: d.nameEn ?? cur.nameEn,
      nameBn: d.nameBn === undefined ? cur.nameBn : d.nameBn,
      composition: d.composition === undefined ? before.composition : d.composition,
      gsm: d.gsm === undefined ? cur.gsm : d.gsm,
      careEn: d.careEn === undefined ? cur.careEn : d.careEn,
      careBn: d.careBn === undefined ? cur.careBn : d.careBn,
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? deps.now?.() ?? new Date()) : null,
    };
    const diff = changed(before, next);
    if (!Object.keys(diff.after).length) return view(cur, live);
    const row = await tx.fabric.update({ where: { id: cur.id }, data: { ...next, composition: json(next.composition) } });
    await logChange(tx, who, archived === true ? 'fabric.archive' : archived === false && cur.archivedAt ? 'fabric.restore' : 'fabric.update', 'Fabric', row.id, diff.before, diff.after);
    return view(row, live);
  }, TX);
}
