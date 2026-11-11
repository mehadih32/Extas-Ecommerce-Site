// S25 · PR 489 (Blueprint C8.3, layer a) — the campaign overlay system: a page-level, time-bound decoration drawn on
// top of the product card, the listing, the search result and the product page at display time. "It is a page
// element drawn on top at display time, not part of the stored image" and "appears when the campaign starts and
// disappears when it ends, with nothing regenerated and no image replaced" (C8.3). An overlay is a decorative label
// only — it never changes the price a customer sees (CLAUDE.md rule 6: no price or discount change without the
// owner's written OK). That holds even for the `struckPrice` template: it sits beside the shop's own honesty-rule
// struck price (PR 38, `wasPriceFor`), never instead of it, and never computes one itself.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { audit } from '@extas/auth';
import { StudioError } from './errors';
import type { StudioDeps, Who } from './context';

/** The small set of templates C8.3 names, matched to the theme by the owner's own accent colour and words. */
export const OVERLAY_TEMPLATES = ['cornerRibbon', 'bottomStrip', 'struckPrice', 'badge'] as const;
export type OverlayTemplateKey = (typeof OVERLAY_TEMPLATES)[number];

const hexColour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'a 6-digit colour like #C81E3A');

export const overlayDesignSchema = z
  .object({
    labelEn: z.string().trim().min(1).max(40),
    labelBn: z.string().trim().min(1).max(40),
    accent: hexColour,
  })
  .strict();
export type OverlayDesign = z.infer<typeof overlayDesignSchema>;

/** A product or category is named by its own slug (the owner types a slug, never a raw id). */
const slug = z.string().trim().min(1).max(140);

export const overlayAppliesToSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('products'), slugs: z.array(slug).min(1).max(500) }).strict(),
  z.object({ kind: z.literal('categories'), slugs: z.array(slug).min(1).max(100) }).strict(),
]);
export type OverlayAppliesTo = z.infer<typeof overlayAppliesToSchema>;

const isoAt = z.string().datetime().nullish();

export const overlayInput = z
  .object({
    campaignId: z.string().uuid().nullish(),
    templateKey: z.enum(OVERLAY_TEMPLATES),
    design: overlayDesignSchema,
    appliesTo: overlayAppliesToSchema,
    startsAt: isoAt,
    endsAt: isoAt,
  })
  .strict();
export type OverlayInput = z.infer<typeof overlayInput>;

export const overlayPatch = z
  .object({
    campaignId: z.string().uuid().nullish(),
    templateKey: z.enum(OVERLAY_TEMPLATES).optional(),
    design: overlayDesignSchema.optional(),
    appliesTo: overlayAppliesToSchema.optional(),
    startsAt: isoAt,
    endsAt: isoAt,
  })
  .strict();
export type OverlayPatch = z.infer<typeof overlayPatch>;

export interface CampaignOverlayView {
  id: string;
  campaignId: string | null;
  templateKey: OverlayTemplateKey;
  design: OverlayDesign;
  appliesTo: OverlayAppliesTo;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  campaignId: string | null;
  templateKey: string;
  design: Prisma.JsonValue;
  appliesTo: Prisma.JsonValue;
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function view(r: Row): CampaignOverlayView {
  return {
    id: r.id,
    campaignId: r.campaignId,
    templateKey: r.templateKey as OverlayTemplateKey,
    design: r.design as OverlayDesign,
    appliesTo: r.appliesTo as OverlayAppliesTo,
    enabled: r.enabled,
    startsAt: r.startsAt ? r.startsAt.toISOString() : null,
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    archived: r.archivedAt != null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function checkWindow(startsAt: string | null, endsAt: string | null): void {
  if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
    throw new StudioError('WINDOW_INVALID', 'the end must not be before the start', ['endsAt']);
  }
}

/** Every overlay of the store, newest first (archived ones last unless asked for separately). */
export async function listCampaignOverlays(deps: StudioDeps, storeId: number, opts: { includeArchived?: boolean } = {}): Promise<CampaignOverlayView[]> {
  const rows = await deps.db.campaignOverlay.findMany({
    where: { storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(view);
}

/** New overlays start disabled (CLAUDE.md rule 1: off by default) — the owner turns one on once he has checked it. */
export async function createCampaignOverlay(deps: StudioDeps, who: Who, input: unknown): Promise<CampaignOverlayView> {
  const ok = overlayInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'an overlay needs its template, design and reach', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  checkWindow(d.startsAt ?? null, d.endsAt ?? null);
  const row = await deps.db.campaignOverlay.create({
    data: {
      storeId: who.storeId,
      campaignId: d.campaignId ?? null,
      templateKey: d.templateKey,
      design: d.design as unknown as Prisma.InputJsonValue,
      appliesTo: d.appliesTo as unknown as Prisma.InputJsonValue,
      enabled: false,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
    },
  });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.overlay.create', entityType: 'CampaignOverlay', entityId: row.id, after: d }, who.ctx);
  return view(row);
}

export async function updateCampaignOverlay(deps: StudioDeps, who: Who, id: string, patch: unknown): Promise<CampaignOverlayView> {
  const ok = overlayPatch.safeParse(patch);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'invalid change', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const before = await deps.db.campaignOverlay.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new StudioError('NOT_FOUND', 'no such overlay');
  const d = ok.data;
  const startsAt = d.startsAt !== undefined ? d.startsAt : (before.startsAt?.toISOString() ?? null);
  const endsAt = d.endsAt !== undefined ? d.endsAt : (before.endsAt?.toISOString() ?? null);
  checkWindow(startsAt ?? null, endsAt ?? null);
  const row = await deps.db.campaignOverlay.update({
    where: { id },
    data: {
      ...(d.campaignId !== undefined ? { campaignId: d.campaignId ?? null } : {}),
      ...(d.templateKey !== undefined ? { templateKey: d.templateKey } : {}),
      ...(d.design !== undefined ? { design: d.design as unknown as Prisma.InputJsonValue } : {}),
      ...(d.appliesTo !== undefined ? { appliesTo: d.appliesTo as unknown as Prisma.InputJsonValue } : {}),
      ...(d.startsAt !== undefined ? { startsAt: d.startsAt ? new Date(d.startsAt) : null } : {}),
      ...(d.endsAt !== undefined ? { endsAt: d.endsAt ? new Date(d.endsAt) : null } : {}),
    },
  });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.overlay.update', entityType: 'CampaignOverlay', entityId: id, before: view(before as Row), after: d }, who.ctx);
  return view(row);
}

/** The owner's own on/off (independent of the window: a disabled overlay never shows even inside its dates). */
export async function setCampaignOverlayEnabled(deps: StudioDeps, who: Who, id: string, enabled: boolean): Promise<CampaignOverlayView> {
  const before = await deps.db.campaignOverlay.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new StudioError('NOT_FOUND', 'no such overlay');
  const row = await deps.db.campaignOverlay.update({ where: { id }, data: { enabled } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: enabled ? 'studio.overlay.enable' : 'studio.overlay.disable', entityType: 'CampaignOverlay', entityId: id }, who.ctx);
  return view(row);
}

export async function setCampaignOverlayArchived(deps: StudioDeps, who: Who, id: string, archived: boolean): Promise<CampaignOverlayView> {
  const before = await deps.db.campaignOverlay.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new StudioError('NOT_FOUND', 'no such overlay');
  const row = await deps.db.campaignOverlay.update({ where: { id }, data: { archivedAt: archived ? (deps.now?.() ?? new Date()) : null } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: archived ? 'studio.overlay.archive' : 'studio.overlay.restore', entityType: 'CampaignOverlay', entityId: id }, who.ctx);
  return view(row);
}

/** Whether `o` is live right now: enabled, not archived, inside its window (an unset edge is open-ended). */
export function isOverlayActive(o: Pick<CampaignOverlayView, 'enabled' | 'archived' | 'startsAt' | 'endsAt'>, now: Date = new Date()): boolean {
  if (!o.enabled || o.archived) return false;
  if (o.startsAt && now.getTime() < new Date(o.startsAt).getTime()) return false;
  if (o.endsAt && now.getTime() > new Date(o.endsAt).getTime()) return false;
  return true;
}

/** Whether `o`'s reach covers this product, by its own slug or its category's slug (C8.5: a product/SKU or a whole category/sub-category). */
export function overlayReaches(o: Pick<CampaignOverlayView, 'appliesTo'>, target: { slug: string; categorySlug: string | null }): boolean {
  const a = o.appliesTo;
  if (a.kind === 'all') return true;
  if (a.kind === 'products') return a.slugs.includes(target.slug);
  return target.categorySlug != null && a.slugs.includes(target.categorySlug);
}

/** What the storefront actually draws: the chosen template and the owner's own bilingual words and colour. */
export interface OverlayBadge {
  templateKey: OverlayTemplateKey;
  labelEn: string;
  labelBn: string;
  accent: string;
}

/**
 * The one overlay to show for a product right now, or null when none reaches it. A product-specific overlay beats a
 * category one, which beats a store-wide one; ties go to the most recently created (C8.3: "default, attached to the
 * campaign" — the owner's newest choice wins over an older, broader one).
 */
export function activeOverlayFor(overlays: readonly CampaignOverlayView[], target: { slug: string; categorySlug: string | null }, now: Date = new Date()): OverlayBadge | null {
  const rank: Record<OverlayAppliesTo['kind'], number> = { products: 0, categories: 1, all: 2 };
  const live = overlays.filter((o) => isOverlayActive(o, now) && overlayReaches(o, target));
  if (!live.length) return null;
  live.sort((a, b) => rank[a.appliesTo.kind] - rank[b.appliesTo.kind] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const top = live[0]!;
  return { templateKey: top.templateKey, labelEn: top.design.labelEn, labelBn: top.design.labelBn, accent: top.design.accent };
}
