// PR 20, 27 — garment types (polo, tee, panjabi, trouser, accessory …) with their measurement fields. A category
// carries its garment type; the size charts (PR 27) and the size help use its fields. The general default pack (PR 508)
// seeds the starting set; the owner adds more. The key is fixed once made. Archived, never deleted.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { dictionaryKeySchema } from '@extas/settings';
import { allow, changed, found, keyFrom, logChange, parse, TX, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';

/** One measurement column, the same shape as the default pack's (packages/seed/src/pack.ts). */
export const measurementField = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/),
    labelEn: z.string().trim().min(1).max(60),
    labelBn: z.string().trim().min(1).max(60),
    unit: z.enum(['inch', 'cm']),
  })
  .strict();
const measurementFields = z
  .array(measurementField)
  .max(12)
  .refine((l) => new Set(l.map((f) => f.key)).size === l.length, { message: 'every measurement key must be unique' });

const fields = { nameEn: z.string().trim().min(1).max(80), nameBn: z.string().trim().min(1).max(80), measurementFields };
export const garmentTypeInput = z.object({ key: dictionaryKeySchema.optional(), ...fields }).strict();
export const garmentTypePatch = z
  .object({ nameEn: fields.nameEn.optional(), nameBn: fields.nameBn.optional(), measurementFields: measurementFields.optional(), archived: z.boolean().optional() })
  .strict();
export type GarmentTypeInput = z.input<typeof garmentTypeInput>;
export type GarmentTypePatch = z.input<typeof garmentTypePatch>;
export type MeasurementField = z.output<typeof measurementField>;

export interface GarmentTypeView {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string;
  measurementFields: MeasurementField[];
  archived: boolean;
}

type Row = { id: string; key: string; nameEn: string; nameBn: string; measurementFields: Prisma.JsonValue; archivedAt: Date | null };
const view = (g: Row): GarmentTypeView => ({
  id: g.id,
  key: g.key,
  nameEn: g.nameEn,
  nameBn: g.nameBn,
  measurementFields: (Array.isArray(g.measurementFields) ? g.measurementFields : []) as MeasurementField[],
  archived: g.archivedAt != null,
});

export async function listGarmentTypes(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<GarmentTypeView[]> {
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.garmentType.findMany({ where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, orderBy: { key: 'asc' } });
  return rows.map(view);
}

export async function createGarmentType(deps: CatalogueDeps, who: Who, input: GarmentTypeInput): Promise<GarmentTypeView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(garmentTypeInput, input, 'garment type');
  const key = d.key ?? (await keyFrom(deps, who, d.nameEn));
  if (!key) throw new CatalogueError('INVALID_INPUT', 'give the garment type a key', ['key']);
  return deps.db.$transaction(async (tx) => {
    if (await tx.garmentType.findUnique({ where: { storeId_key: { storeId: who.storeId, key } } })) throw new CatalogueError('CONFLICT', 'a garment type with this key exists', ['key']);
    const row = await tx.garmentType.create({ data: { storeId: who.storeId, key, nameEn: d.nameEn, nameBn: d.nameBn, measurementFields: d.measurementFields } });
    await logChange(tx, who, 'garmentType.create', 'GarmentType', row.id, null, view(row));
    return view(row);
  }, TX);
}

export async function updateGarmentType(deps: CatalogueDeps, who: Who, id: string, patch: GarmentTypePatch): Promise<GarmentTypeView> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(garmentTypePatch, patch, 'garment type');
  return deps.db.$transaction(async (tx) => {
    const cur = found(await tx.garmentType.findFirst({ where: { id, storeId: who.storeId } }), 'garment type');
    if (archived === true && !cur.archivedAt) {
      const used = await tx.category.count({ where: { storeId: who.storeId, garmentTypeId: cur.id, archivedAt: null } });
      if (used) throw new CatalogueError('CONFLICT', 'live categories use this garment type', [`categories: ${used}`]);
    }
    const next = {
      nameEn: d.nameEn ?? cur.nameEn,
      nameBn: d.nameBn ?? cur.nameBn,
      measurementFields: (d.measurementFields ?? cur.measurementFields) as Prisma.InputJsonValue,
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? deps.now?.() ?? new Date()) : null,
    };
    const diff = changed(cur as unknown as Record<string, unknown>, next);
    if (!Object.keys(diff.after).length) return view(cur);
    const row = await tx.garmentType.update({ where: { id: cur.id }, data: next });
    await logChange(tx, who, archived === true ? 'garmentType.archive' : 'garmentType.update', 'GarmentType', row.id, diff.before, diff.after);
    return view(row);
  }, TX);
}
