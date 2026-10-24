// PR 508 — the general default pack: neutral, editable defaults for a store (garment types with their measurement
// fields, the category structure, the delivery-charge bands, the SMS / WhatsApp / e-mail template texts). The pack is
// data (data/default-pack.json); this file validates it and applies it.
//
// Applying a pack only ever adds what is missing — a row the owner already has (same key) is never touched, so his
// edits survive every re-run — and records the application once in DefaultPackApplication. Running it again changes
// nothing. A newer pack version adds its new rows the same way. PR 148: a template whose stored body is still an
// earlier default word for word (`replaces`, so never edited) takes the new default words.
//
// Money never travels in a pack: a band has no charge field (the schema below rejects one), ships switched off, and
// gets its charge from the owner (CLAUDE.md rule 6). Owner data never travels in a pack either (PR 509): the CI check
// (owner-data-check.ts) scans every value.
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@extas/db/client';
import packJson from '../data/default-pack.json';
import { lockSeed } from './lock';

/**
 * The `{tokens}` a notification template may use; the sender (@extas/messages) fills them in when the message goes out.
 * PR 148 (SIM-F-001): an amount is always the amount still due (total − paid) — `{amountDue}`, or `{amountLine}`, a
 * whole sentence that is left out for a fully paid order; `{total}` is kept for older templates and is read as the
 * amount due too. `{exactAmountLine}`: CN-014 idea 10. `{senderName}`: a gift's sender (PR 605). PR 546: `{cancelReason}`
 * (a cancellation's reason in plain words), `{keptOrderNumber}` and `{keptOrderLink}` (the order that goes ahead).
 */
export const TEMPLATE_TOKENS = ['storeName', 'customerName', 'orderNumber', 'total', 'trackingLink', 'orderLink', 'amountDue', 'amountLine', 'exactAmountLine', 'senderName', 'cancelReason', 'keptOrderNumber', 'keptOrderLink'] as const;

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'lower-case words joined by -' });
const dottedKey = z.string().regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/, { message: 'dotted camelCase key' });
const text = (max: number) => z.string().trim().min(1).max(max);
const tokens = (s: string) => [...s.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]!);
const onlyTemplateTokens = (s: string | undefined) =>
  !s || tokens(s).every((t) => (TEMPLATE_TOKENS as readonly string[]).includes(t));

const measurementField = z
  .object({ key: dottedKey, labelEn: text(60), labelBn: text(60), unit: z.enum(['inch', 'cm']) })
  .strict();

const garmentType = z
  .object({ key: slug, nameEn: text(80), nameBn: text(80), measurementFields: z.array(measurementField).max(12) })
  .strict();

const category = z
  .object({
    slug,
    nameEn: text(80),
    nameBn: text(80).optional(),
    introEn: text(500).optional(),
    introBn: text(500).optional(),
    garmentType: slug.optional(),
    parent: slug.optional(),
    sortOrder: z.int().min(0),
    templateKey: z.string().regex(/^T[1-9]$/).optional(),
    /** Shown on the site. A default-pack category ships hidden until it has products. */
    isVisible: z.boolean().optional(),
  })
  .strict();

const deliveryBand = z
  .object({
    key: slug,
    nameEn: text(80),
    nameBn: text(80).optional(),
    hoursMin: z.int().min(1).max(24 * 30).optional(),
    hoursMax: z.int().min(1).max(24 * 30).optional(),
    /** Sub-area mode (PR 550): own charge, folded into the city band, or folded into outside. */
    mode: z.enum(['own', 'city', 'outside']).optional(),
    sortOrder: z.int().min(0),
  })
  .strict()
  .refine((b) => b.hoursMin === undefined || b.hoursMax === undefined || b.hoursMin <= b.hoursMax, {
    message: 'hoursMin is above hoursMax',
  });

const notificationTemplate = z
  .object({
    key: dottedKey,
    channel: z.enum(['SMS', 'WHATSAPP', 'EMAIL', 'TELEGRAM', 'PUSH', 'MESSENGER']),
    locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
    name: text(120),
    subject: text(200).optional(),
    body: text(2000),
    enabled: z.boolean(),
    /**
     * PR 148 — the bodies this default had in earlier pack versions. A store row that still holds one of them word for
     * word was never edited, so it takes the new default; a row the owner changed is never touched.
     */
    replaces: z.array(text(2000)).max(10).optional(),
  })
  .strict()
  .refine((t) => onlyTemplateTokens(t.body) && onlyTemplateTokens(t.subject), {
    message: `a template may only use these {tokens}: ${TEMPLATE_TOKENS.join(', ')}`,
  })
  .refine((t) => t.channel !== 'EMAIL' || t.subject !== undefined, { message: 'an e-mail template needs a subject' });

export const packSchema = z
  .object({
    $comment: z.string().optional(),
    key: slug,
    version: z.int().min(1),
    garmentTypes: z.array(garmentType),
    categories: z.array(category),
    deliveryBands: z.array(deliveryBand),
    notificationTemplates: z.array(notificationTemplate),
    /**
     * The address of the mother store a fresh installation starts with (mother-store.ts); never its name (PR 509).
     * Installation-level, so a store's exported structure (PR 509) has none.
     */
    motherStore: z.object({ slug }).strict().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const dup = (what: string, keys: string[]) => {
      const seen = new Set<string>();
      for (const k of keys) {
        if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `${what} "${k}" appears twice` });
        seen.add(k);
      }
    };
    dup('garment type', p.garmentTypes.map((g) => g.key));
    dup('category', p.categories.map((c) => c.slug));
    dup('delivery band', p.deliveryBands.map((b) => b.key));
    dup('template', p.notificationTemplates.map((t) => `${t.key}/${t.channel}/${t.locale}`));
    const garments = new Set(p.garmentTypes.map((g) => g.key));
    const before = new Set<string>();
    for (const c of p.categories) {
      if (c.garmentType && !garments.has(c.garmentType)) {
        ctx.addIssue({ code: 'custom', message: `category "${c.slug}": unknown garment type "${c.garmentType}"` });
      }
      if (c.parent && !before.has(c.parent)) {
        ctx.addIssue({ code: 'custom', message: `category "${c.slug}": parent "${c.parent}" must come before it` });
      }
      before.add(c.slug);
    }
  });

export type PackData = z.output<typeof packSchema>;

/** Validates pack data; the message lists every problem. */
export function parsePack(data: unknown, label = 'pack'): PackData {
  const parsed = packSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${label} is not valid: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(pack)'}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

/** The general default pack shipped with this code. */
export const defaultPack: PackData = parsePack(packJson, 'data/default-pack.json');

/** The tables a pack writes, in the order it writes them. */
export const PACK_TABLES = ['GarmentType', 'Category', 'DeliveryBand', 'NotificationTemplate'] as const;
export type PackTable = (typeof PACK_TABLES)[number];

export interface PackReport {
  status: 'applied' | 'unchanged';
  storeId: number;
  packKey: string;
  version: number;
  created: Record<PackTable, number>;
  /** Rows the store already had (left exactly as they are). */
  kept: Record<PackTable, number>;
  /** PR 148: rows that still held an earlier default word for word and took the new one (templates only). */
  updated: Record<PackTable, number>;
  /** The DefaultPackApplication row was written now. */
  recorded: boolean;
}

export interface ApplyOptions {
  storeId: number;
  /** Who applied it (StaffUser id); null for the system. */
  actorId?: string | null;
}

/**
 * A band's charge until the owner sets it. The schema needs a number; the band ships switched off (`enabled: false`)
 * and checkout never charges an unresolved band (PR 553), so this is "not set", not a price.
 */
const NO_CHARGE_SET = 0; // hardcode-ok: "not set" for a required column on a band that ships switched off, not a price

/** Applies a pack to one store inside an open transaction. */
export async function applyPackTx(tx: Prisma.TransactionClient, pack: PackData, opts: ApplyOptions): Promise<PackReport> {
  const { storeId } = opts;
  const tally = () => Object.fromEntries(PACK_TABLES.map((t) => [t, 0])) as Record<PackTable, number>;
  const created = tally();
  const kept = tally();
  const updated = tally();

  const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw new Error(`store ${storeId} does not exist`);

  const garmentIds = new Map<string, string>();
  for (const g of pack.garmentTypes) {
    const row = await tx.garmentType.findUnique({ where: { storeId_key: { storeId, key: g.key } }, select: { id: true } });
    if (row) {
      kept.GarmentType++;
      garmentIds.set(g.key, row.id);
      continue;
    }
    const made = await tx.garmentType.create({
      data: { storeId, key: g.key, nameEn: g.nameEn, nameBn: g.nameBn, measurementFields: g.measurementFields },
      select: { id: true },
    });
    created.GarmentType++;
    garmentIds.set(g.key, made.id);
  }

  const categoryIds = new Map<string, string>();
  const garmentId = async (key: string | undefined) => {
    if (!key) return null;
    if (garmentIds.has(key)) return garmentIds.get(key)!;
    const row = await tx.garmentType.findUnique({ where: { storeId_key: { storeId, key } }, select: { id: true } });
    return row?.id ?? null;
  };
  for (const c of pack.categories) {
    const row = await tx.category.findUnique({ where: { storeId_slug: { storeId, slug: c.slug } }, select: { id: true } });
    if (row) {
      kept.Category++;
      categoryIds.set(c.slug, row.id);
      continue;
    }
    const made = await tx.category.create({
      data: {
        storeId,
        slug: c.slug,
        nameEn: c.nameEn,
        nameBn: c.nameBn ?? null,
        introEn: c.introEn ?? null,
        introBn: c.introBn ?? null,
        garmentTypeId: await garmentId(c.garmentType),
        parentId: c.parent ? (categoryIds.get(c.parent) ?? null) : null,
        sortOrder: c.sortOrder,
        templateKey: c.templateKey ?? null,
        isVisible: c.isVisible ?? false,
      },
      select: { id: true },
    });
    created.Category++;
    categoryIds.set(c.slug, made.id);
  }

  for (const b of pack.deliveryBands) {
    const row = await tx.deliveryBand.findUnique({ where: { storeId_key: { storeId, key: b.key } }, select: { id: true } });
    if (row) {
      kept.DeliveryBand++;
      continue;
    }
    await tx.deliveryBand.create({
      data: {
        storeId,
        key: b.key,
        nameEn: b.nameEn,
        nameBn: b.nameBn ?? null,
        chargeMinor: NO_CHARGE_SET,
        codLimitMinor: null,
        hoursMin: b.hoursMin ?? null,
        hoursMax: b.hoursMax ?? null,
        mode: b.mode ?? null,
        enabled: false,
        sortOrder: b.sortOrder,
      },
    });
    created.DeliveryBand++;
  }

  for (const t of pack.notificationTemplates) {
    const row = await tx.notificationTemplate.findUnique({
      where: { storeId_key_channel_locale: { storeId, key: t.key, channel: t.channel, locale: t.locale } },
      select: { id: true, body: true },
    });
    if (row) {
      // PR 148: an untouched earlier default (its body word for word) takes the new words; an edited row stays.
      if (t.replaces?.includes(row.body)) {
        await tx.notificationTemplate.update({ where: { id: row.id }, data: { name: t.name, subject: t.subject ?? null, body: t.body, enabled: t.enabled } });
        updated.NotificationTemplate++;
      } else kept.NotificationTemplate++;
      continue;
    }
    await tx.notificationTemplate.create({
      data: {
        storeId,
        key: t.key,
        channel: t.channel,
        locale: t.locale,
        name: t.name,
        subject: t.subject ?? null,
        body: t.body,
        enabled: t.enabled,
      },
    });
    created.NotificationTemplate++;
  }

  const recordedBefore = await tx.defaultPackApplication.findFirst({
    where: { storeId, packKey: pack.key, version: pack.version },
    select: { id: true },
  });
  if (!recordedBefore) {
    await tx.defaultPackApplication.create({
      data: { storeId, packKey: pack.key, version: pack.version, summary: { created, kept, updated }, appliedById: opts.actorId ?? null },
    });
  }
  const createdAny = Object.values(created).some((n) => n > 0) || Object.values(updated).some((n) => n > 0);
  return {
    status: createdAny || !recordedBefore ? 'applied' : 'unchanged',
    storeId,
    packKey: pack.key,
    version: pack.version,
    created,
    kept,
    updated,
    recorded: !recordedBefore,
  };
}

/** Applies a pack to one store, in its own transaction, serialised with every other seed job. */
export async function applyPack(prisma: PrismaClient, pack: PackData, opts: ApplyOptions): Promise<PackReport> {
  return prisma.$transaction(
    async (tx) => {
      await lockSeed(tx);
      return applyPackTx(tx, pack, opts);
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

/** Applies a pack to every store that is not archived. */
export async function applyPackToAllStores(prisma: PrismaClient, pack: PackData, actorId?: string | null): Promise<PackReport[]> {
  const stores = await prisma.store.findMany({ where: { archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const reports: PackReport[] = [];
  for (const s of stores) reports.push(await applyPack(prisma, pack, { storeId: s.id, actorId }));
  return reports;
}

/**
 * A store's current structure in pack form (the installation export, PR 509): garment types, categories, bands without
 * their charge, templates. Archived rows are left out. Nothing here is owner data; the export still checks every value.
 */
export async function packFromStore(tx: Prisma.TransactionClient, storeId: number, key: string, version: number): Promise<PackData> {
  const garments = await tx.garmentType.findMany({ where: { storeId, archivedAt: null }, orderBy: { key: 'asc' } });
  const garmentKey = new Map(garments.map((g) => [g.id, g.key]));
  const cats = await tx.category.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] });
  const slugOf = new Map(cats.map((c) => [c.id, c.slug]));
  // Parents before children.
  const ordered: typeof cats = [];
  const placed = new Set<string>();
  let pending = cats;
  while (pending.length) {
    const next = pending.filter((c) => !c.parentId || placed.has(c.parentId) || !slugOf.has(c.parentId));
    if (!next.length) break; // a cycle cannot be written as a pack; the rest is left out
    for (const c of next) {
      ordered.push(c);
      placed.add(c.id);
    }
    pending = pending.filter((c) => !placed.has(c.id));
  }
  const bands = await tx.deliveryBand.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
  const templates = await tx.notificationTemplate.findMany({
    where: { storeId, archivedAt: null },
    orderBy: [{ key: 'asc' }, { channel: 'asc' }, { locale: 'asc' }],
  });
  const opt = <T>(v: T | null | undefined) => (v === null || v === undefined ? undefined : v);
  return parsePack(
    {
      key,
      version,
      garmentTypes: garments.map((g) => ({ key: g.key, nameEn: g.nameEn, nameBn: g.nameBn, measurementFields: g.measurementFields })),
      categories: ordered.map((c) => ({
        slug: c.slug,
        nameEn: c.nameEn,
        nameBn: opt(c.nameBn),
        introEn: opt(c.introEn),
        introBn: opt(c.introBn),
        garmentType: c.garmentTypeId ? opt(garmentKey.get(c.garmentTypeId)) : undefined,
        parent: c.parentId ? opt(slugOf.get(c.parentId)) : undefined,
        sortOrder: c.sortOrder,
        templateKey: opt(c.templateKey),
        isVisible: c.isVisible,
      })),
      deliveryBands: bands.map((b) => ({
        key: b.key,
        nameEn: b.nameEn,
        nameBn: opt(b.nameBn),
        hoursMin: opt(b.hoursMin),
        hoursMax: opt(b.hoursMax),
        mode: opt(b.mode),
        sortOrder: b.sortOrder,
      })),
      notificationTemplates: templates.map((t) => ({
        key: t.key,
        channel: t.channel,
        locale: t.locale,
        name: t.name,
        subject: opt(t.subject),
        body: t.body,
        enabled: t.enabled,
      })),
    },
    `store ${storeId} structure`,
  );
}
