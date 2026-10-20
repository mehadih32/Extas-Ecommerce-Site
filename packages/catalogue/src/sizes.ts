// PR 19 — sizes: S … 5XL, waist sizes, footwear, one size. The ERP holds the size labels (D3.7); `erpSizeCode` maps
// the ERP's code to the shop's size. The key is fixed once made (variant links and filters use it); the order is the
// owner's (`sortOrder`). Nothing is deleted: a size is archived, and only when no live variant uses it.
import { z } from 'zod';
import { dictionaryKeySchema } from '@extas/settings';
import { allow, changed, found, keyFrom, logChange, parse, TX, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';

const fields = {
  label: z.string().trim().min(1).max(20),
  sortOrder: z.int().min(0).max(100_000).optional(),
  erpSizeCode: z.string().trim().min(1).max(40).nullable().optional(),
};
export const sizeInput = z.object({ key: dictionaryKeySchema.optional(), ...fields }).strict();
export const sizePatch = z.object({ ...fields, label: fields.label.optional(), archived: z.boolean().optional() }).strict();
export type SizeInput = z.input<typeof sizeInput>;
export type SizePatch = z.input<typeof sizePatch>;

export interface SizeView {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  erpSizeCode: string | null;
  archived: boolean;
}

const view = (s: { id: string; key: string; label: string; sortOrder: number; erpSizeCode: string | null; archivedAt: Date | null }): SizeView => ({
  id: s.id,
  key: s.key,
  label: s.label,
  sortOrder: s.sortOrder,
  erpSizeCode: s.erpSizeCode,
  archived: s.archivedAt != null,
});

export async function listSizes(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<SizeView[]> {
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.size.findMany({
    where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
  });
  return rows.map(view);
}

export async function createSize(deps: CatalogueDeps, who: Who, input: SizeInput): Promise<SizeView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(sizeInput, input, 'size');
  const key = d.key ?? (await keyFrom(deps, who, d.label));
  if (!key) throw new CatalogueError('INVALID_INPUT', 'give the size a key', ['key']);
  return deps.db.$transaction(async (tx) => {
    if (await tx.size.findUnique({ where: { storeId_key: { storeId: who.storeId, key } } })) {
      throw new CatalogueError('CONFLICT', 'a size with this key exists (archived sizes keep their key)', ['key']);
    }
    let sortOrder = d.sortOrder;
    if (sortOrder === undefined) {
      const last = await tx.size.findFirst({ where: { storeId: who.storeId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
      sortOrder = last ? last.sortOrder + 1 : 0;
    }
    const row = await tx.size.create({ data: { storeId: who.storeId, key, label: d.label, sortOrder, erpSizeCode: d.erpSizeCode ?? null } });
    await logChange(tx, who, 'size.create', 'Size', row.id, null, view(row));
    return view(row);
  }, TX);
}

export async function updateSize(deps: CatalogueDeps, who: Who, id: string, patch: SizePatch): Promise<SizeView> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(sizePatch, patch, 'size');
  return deps.db.$transaction(async (tx) => {
    const cur = found(await tx.size.findFirst({ where: { id, storeId: who.storeId } }), 'size');
    const next = {
      label: d.label ?? cur.label,
      sortOrder: d.sortOrder ?? cur.sortOrder,
      erpSizeCode: d.erpSizeCode === undefined ? cur.erpSizeCode : d.erpSizeCode,
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? deps.now?.() ?? new Date()) : null,
    };
    if (archived === true && !cur.archivedAt) {
      const used = await tx.productVariant.count({ where: { storeId: who.storeId, sizeId: cur.id, archivedAt: null } });
      if (used) throw new CatalogueError('CONFLICT', 'live variants use this size', [`variants: ${used}`]);
    }
    const diff = changed(cur as unknown as Record<string, unknown>, next);
    if (!Object.keys(diff.after).length) return view(cur);
    const row = await tx.size.update({ where: { id: cur.id }, data: next });
    await logChange(tx, who, archived === true ? 'size.archive' : 'size.update', 'Size', row.id, diff.before, diff.after);
    return view(row);
  }, TX);
}
