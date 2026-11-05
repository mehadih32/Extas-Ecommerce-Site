// S13 · PR 270 (register "Ad creative briefs generated from the product and the campaign"; Blueprint C3.1 Tirondaj;
// demo 93-admin-ads.js `zd-brief`: "Tirondaj writes the brief from the product and the offer; the studio makes the
// pictures and video from it") — Marketing › Ad platforms › Creative briefs.
//
// - Writes: with `ads.creativeBrief` on (registry v176, off as it ships), a person with `marketing.campaigns.write` picks a
//   product (its cheapest live variant's price; one not live yet takes its cheapest) and, if he likes, a platform campaign — or starts from a growth-agent "refresh the creative" proposal the
//   owner approved (PR 269; one brief per proposal, its campaign's best delivered product picked first). The draft
//   (creative-brief-model.ts) holds the offer, the formats, a hook in Bengali and English, what the picture shows, the
//   landing address and what the ads optimise for, plus what the ads brought back for that product (delivered ROAS from
//   @extas/metrics over the growth agent's days). It is kept in CreativeBrief (answers.kind 'ad'; the PR 490 table, no
//   migration) as DRAFT.
// - Corrects and sends: the hooks and picture lines are corrected while DRAFT; "Send to the studio" (after a confirm)
//   makes it SENT, the kept record the studio (S24/S25) works from; "Set aside" makes it SET_ASIDE. Nothing is deleted;
//   no price, budget or campaign changes. Every step is audited (marketing.brief.*).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { adsCreativeBriefSchema, storeTarget, type AdsCreativeBriefSettings } from '@extas/settings';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import bnWords from '../../../messages/admin-ad-platforms.bn.json';
import enWords from '../../../messages/admin-ad-platforms.en.json';
import { AdPlatformsError, type AdPlatformsDeps, type AdPlatformsWho } from './ad-platforms';
import { BRIEF_TEXT_MAX, correctedBrief, draftBrief, type BriefAnswers, type BriefLang, type BriefWords } from './creative-brief-model';
import { GROWTH_KIND, growthFigures } from './growth-agent';

const S = MOTHER_STORE_ID;
export const BRIEF_KIND = 'ad';
export const BRIEF_STATUSES = ['DRAFT', 'SENT', 'SET_ASIDE'] as const;
/** The newest briefs the page lists. */
const RECENT = 50; // hardcode-ok: a list length on the page, not a business number
/** The most products and campaigns the pickers offer. */
export const PICK_MAX = 500; // hardcode-ok: a list length on the page, not a business number
/** The approved creative refreshes the page reads. */
const REFRESH_READ = 50; // hardcode-ok: a list length on the page, not a business number
/** The language tags the hooks' money is written in. */
const LOCALE: Record<BriefLang, string> = { en: 'en-GB', bn: 'bn-BD' }; // hardcode-ok: language tags, not words

const WORDS: Record<BriefLang, BriefWords> = { en: enWords.adp.brief.tpl, bn: bnWords.adp.brief.tpl };
const line = z.string().max(BRIEF_TEXT_MAX * 2); // hardcode-ok: a typed line is trimmed to BRIEF_TEXT_MAX after
const pair = z.object({ en: line.optional(), bn: line.optional() }).strict();
const createSchema = z.object({ action: z.literal('create'), productId: z.string().uuid(), adCampaignId: z.string().uuid().nullish(), proposalId: z.string().uuid().nullish() }).strict();
const editSchema = z.object({ action: z.literal('edit'), id: z.string().uuid(), hooks: pair, show: pair }).strict();
const stepSchema = z.object({ action: z.enum(['send', 'setAside']), id: z.string().uuid(), confirm: z.literal(true) }).strict();
const issues = (e: z.ZodError) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isAd = { answers: { path: ['kind'], equals: BRIEF_KIND } } satisfies Prisma.CreativeBriefWhereInput;

export type BriefDeps = Pick<AdPlatformsDeps, 'db' | 'resolver' | 'now'>;

/** The campaign's product with the most delivered pieces (a count of pieces, not money); null when none was delivered. */
async function bestProductOf(db: BriefDeps['db'], adCampaignId: string): Promise<string | null> {
  const rows = await db.orderItem.groupBy({
    by: ['productId'],
    where: { storeId: S, productId: { not: null }, order: { storeId: S, adCampaignId, status: 'DELIVERED' } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 1,
  });
  return rows[0]?.productId ?? null;
}

/** POST {action: 'create', productId, adCampaignId?, proposalId?}: a new DRAFT brief (the switch on). */
export async function createBrief(deps: BriefDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string }> {
  const ok = createSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const at = { storeId: S };
  const [settings, currency, prefix] = await Promise.all([deps.resolver.value('ads.creativeBrief', at), deps.resolver.value('store.currency', at), deps.resolver.value('naming.productPathPrefix', at)]);
  if (!settings.on) throw new AdPlatformsError('OFF', 409);
  let adCampaignId = ok.data.adCampaignId ?? null;
  const proposalId = ok.data.proposalId ?? null;
  if (proposalId) {
    // only a "refresh the creative" proposal the owner approved, once
    const p = await deps.db.aiApprovalRequest.findFirst({ where: { id: proposalId, storeId: S, kind: GROWTH_KIND, status: 'APPROVED' }, select: { refId: true, payload: true } });
    if (!p || (p.payload as { type?: string } | null)?.type !== 'refreshCreative') throw new AdPlatformsError('NOT_FOUND', 404, ['proposalId']);
    if (adCampaignId && adCampaignId !== p.refId) throw new AdPlatformsError('INVALID_INPUT', 400, ['adCampaignId']);
    adCampaignId = p.refId;
    if (await deps.db.creativeBrief.count({ where: { storeId: S, AND: [isAd, { answers: { path: ['proposalId'], equals: proposalId } }] } })) throw new AdPlatformsError('TAKEN', 409);
  }
  const [product, campaign] = await Promise.all([
    deps.db.product.findFirst({
      where: { id: ok.data.productId, storeId: S, archivedAt: null },
      select: {
        id: true,
        nameEn: true,
        nameBn: true,
        slug: true,
        variants: { where: { archivedAt: null, priceMinor: { not: null } }, orderBy: { priceMinor: 'asc' }, select: { active: true, priceMinor: true, compareAtMinor: true } },
        colours: { where: { archivedAt: null }, orderBy: { sortOrder: 'asc' }, select: { colour: { select: { nameEn: true, nameBn: true } } } },
      },
    }),
    adCampaignId ? deps.db.adCampaign.findFirst({ where: { id: adCampaignId, storeId: S }, select: { id: true, campaignId: true } }) : null,
  ]);
  if (!product) throw new AdPlatformsError('NOT_FOUND', 404, ['productId']);
  if (adCampaignId && !campaign) throw new AdPlatformsError('NOT_FOUND', 404, ['adCampaignId']);
  // the cheapest live variant; a product not live yet (a brief ahead of its launch) takes its cheapest variant
  const v = product.variants.find((x) => x.active) ?? product.variants[0] ?? null;
  const f = await growthFigures(deps);
  const row = f.now.products.find((r) => r.key === product.id);
  const answers: BriefAnswers = draftBrief({
    product: { id: product.id, nameEn: product.nameEn, nameBn: product.nameBn, slug: product.slug, priceMinor: v?.priceMinor ?? null, compareAtMinor: v?.compareAtMinor ?? null, colours: product.colours.map((c) => c.colour) },
    settings,
    words: WORDS,
    money: (minor, lang) => formatMoney(minor, moneyOf(currency, LOCALE[lang])),
    pathPrefix: prefix,
    currency,
    figures: row && row.delivered > 0 ? { from: f.now.from, to: f.now.to, delivered: row.delivered, deliveredSalesMinor: row.deliveredSalesMinor, roasPercent: row.roasPercent } : null,
    adCampaignId,
    proposalId,
  });
  const made = await deps.db.creativeBrief.create({ data: { storeId: S, campaignId: campaign?.campaignId ?? null, answers: answers as unknown as Prisma.InputJsonValue, status: 'DRAFT' } });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.brief.create', entityType: 'CreativeBrief', entityId: made.id, after: { productId: product.id, adCampaignId, proposalId } }, who.ctx);
  return { id: made.id };
}

async function draftOf(db: BriefDeps['db'], id: string) {
  const row = await db.creativeBrief.findFirst({ where: { id, storeId: S, ...isAd } });
  if (!row) throw new AdPlatformsError('NOT_FOUND', 404);
  if (row.status !== 'DRAFT') throw new AdPlatformsError('DECIDED', 409);
  return row;
}

/** POST {action: 'edit', id, hooks, show}: a DRAFT brief's corrected hooks and picture lines. */
export async function editBrief(deps: BriefDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string }> {
  const ok = editSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const row = await draftOf(deps.db, ok.data.id);
  const before = row.answers as unknown as BriefAnswers;
  const after = correctedBrief(before, { hooks: ok.data.hooks, show: ok.data.show });
  const r = await deps.db.creativeBrief.updateMany({ where: { id: row.id, status: 'DRAFT', updatedAt: row.updatedAt }, data: { answers: after as unknown as Prisma.InputJsonValue } });
  if (r.count !== 1) throw new AdPlatformsError('STALE', 409);
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.brief.edit', entityType: 'CreativeBrief', entityId: row.id, before: { hooks: before.hooks, show: before.show }, after: { hooks: after.hooks, show: after.show } }, who.ctx);
  return { id: row.id };
}

/** POST {action: 'send' | 'setAside', id, confirm: true}: DRAFT → SENT (to the studio) or SET_ASIDE, once. */
export async function stepBrief(deps: BriefDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string; status: 'SENT' | 'SET_ASIDE' }> {
  const ok = stepSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const row = await draftOf(deps.db, ok.data.id);
  const status = ok.data.action === 'send' ? 'SENT' : 'SET_ASIDE';
  const now = deps.now ? deps.now() : new Date();
  const answers = status === 'SENT' ? { ...(row.answers as unknown as BriefAnswers), sentAt: now.toISOString() } : (row.answers as unknown as BriefAnswers);
  const r = await deps.db.creativeBrief.updateMany({ where: { id: row.id, status: 'DRAFT' }, data: { status, answers: answers as unknown as Prisma.InputJsonValue } });
  if (r.count !== 1) throw new AdPlatformsError('DECIDED', 409);
  await audit(deps.db, who.actor, { storeId: S, action: status === 'SENT' ? 'marketing.brief.send' : 'marketing.brief.setAside', entityType: 'CreativeBrief', entityId: row.id, after: { status } }, who.ctx);
  return { id: row.id, status };
}

export interface BriefView {
  id: string;
  status: string;
  createdAt: string;
  answers: BriefAnswers;
  product: string | null;
  campaign: string | null;
}

export interface RefreshView {
  proposalId: string;
  adCampaignId: string;
  campaign: string | null;
  decidedAt: string | null;
  /** The campaign's product with the most delivered pieces, picked first. */
  productId: string | null;
}

export interface BriefsOverview {
  card: { key: 'brief'; value: AdsCreativeBriefSettings; version: string };
  currency: string;
  products: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  /** Approved "refresh the creative" proposals with no brief yet. */
  refreshes: RefreshView[];
  briefs: BriefView[];
}

/** The page: the card, the pickers, the approved creative refreshes still without a brief, and the newest briefs. */
export async function briefsOverview(deps: BriefDeps, lang: BriefLang = 'en'): Promise<BriefsOverview> {
  const at = { storeId: S };
  const [settings, currency] = await Promise.all([deps.resolver.value('ads.creativeBrief', at), deps.resolver.value('store.currency', at)]);
  const [products, campaigns, approved, rows] = await Promise.all([
    deps.db.product.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { nameEn: 'asc' }, take: PICK_MAX, select: { id: true, nameEn: true, nameBn: true } }),
    deps.db.adCampaign.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { name: 'asc' }, take: PICK_MAX, select: { id: true, name: true } }),
    deps.db.aiApprovalRequest.findMany({ where: { storeId: S, kind: GROWTH_KIND, status: 'APPROVED', refType: 'AdCampaign' }, orderBy: { decidedAt: 'desc' }, take: REFRESH_READ, select: { id: true, refId: true, payload: true, decidedAt: true } }),
    deps.db.creativeBrief.findMany({ where: { storeId: S, ...isAd }, orderBy: { createdAt: 'desc' }, take: RECENT }),
  ]);
  const name = (p: { nameEn: string; nameBn: string | null }) => (lang === 'bn' && p.nameBn) || p.nameEn;
  const productName = new Map(products.map((p) => [p.id, name(p)]));
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const briefs = rows.map((r) => ({ r, a: r.answers as unknown as BriefAnswers }));
  // names of products and campaigns past the pickers' length (or archived since)
  const missP = [...new Set(briefs.map((b) => b.a.productId).filter((id) => !productName.has(id)))];
  const missC = [...new Set([...briefs.map((b) => b.a.adCampaignId), ...approved.map((p) => p.refId)].filter((id): id is string => !!id && !campaignName.has(id)))];
  const [moreP, moreC] = await Promise.all([
    missP.length ? deps.db.product.findMany({ where: { storeId: S, id: { in: missP } }, select: { id: true, nameEn: true, nameBn: true } }) : [],
    missC.length ? deps.db.adCampaign.findMany({ where: { storeId: S, id: { in: missC } }, select: { id: true, name: true } }) : [],
  ]);
  for (const p of moreP) productName.set(p.id, name(p));
  for (const c of moreC) campaignName.set(c.id, c.name);
  const takenRows = approved.length ? await deps.db.creativeBrief.findMany({ where: { storeId: S, ...isAd, OR: approved.map((p) => ({ answers: { path: ['proposalId'], equals: p.id } })) }, select: { answers: true } }) : [];
  const taken = new Set(takenRows.map((x) => (x.answers as unknown as BriefAnswers).proposalId));
  const open = approved.filter((p) => (p.payload as { type?: string } | null)?.type === 'refreshCreative' && p.refId && !taken.has(p.id));
  const refreshes: RefreshView[] = [];
  for (const p of open) refreshes.push({ proposalId: p.id, adCampaignId: p.refId!, campaign: campaignName.get(p.refId!) ?? null, decidedAt: p.decidedAt ? p.decidedAt.toISOString() : null, productId: await bestProductOf(deps.db, p.refId!) });
  return {
    card: { key: 'brief', value: settings, version: versionOf(settings) },
    currency,
    products: products.map((p) => ({ id: p.id, name: name(p) })),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
    refreshes,
    briefs: briefs.map(({ r, a }) => ({ id: r.id, status: r.status, createdAt: r.createdAt.toISOString(), answers: a, product: productName.get(a.productId) ?? null, campaign: a.adCampaignId ? (campaignName.get(a.adCampaignId) ?? null) : null })),
  };
}

/** PUT {key: 'brief', value, version}: the brief settings (audited when they change). */
export async function saveBriefCard(deps: BriefDeps, who: AdPlatformsWho, input: unknown): Promise<BriefsOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'brief') throw new AdPlatformsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.creativeBrief', { storeId: S });
  if (o.version !== versionOf(before)) throw new AdPlatformsError('STALE', 409);
  const ok = adsCreativeBriefSchema.safeParse(o.value);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.creativeBrief', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Ad platforms › Creative briefs' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.brief.settings', entityType: 'Setting', entityId: 'ads.creativeBrief', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'brief', value: ok.data, version: versionOf(ok.data) };
}

const answer = (e: unknown): Response => (e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/ad-platforms/briefs — GET the page (`marketing.campaigns.read`); POST {action: 'create' | 'edit' |
 * 'send' | 'setAside'} (`marketing.campaigns.write`); PUT the settings card (`marketing.ads.control`).
 */
export async function creativeBriefHandler(request: Request, deps: AdminDeps | null, extra: Partial<BriefDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.campaigns.read' : method === 'PUT' ? 'marketing.ads.control' : 'marketing.campaigns.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const d: BriefDeps = { db: deps!.db, resolver: deps!.resolver, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await briefsOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { brief: await saveBriefCard(d, who, b) } });
    if (b.action === 'create') return json({ ok: true, ...(await createBrief(d, who, b)) });
    if (b.action === 'edit') return json({ ok: true, ...(await editBrief(d, who, b)) });
    if (b.action === 'send' || b.action === 'setAside') return json({ ok: true, ...(await stepBrief(d, who, b)) });
    throw new AdPlatformsError('INVALID_INPUT', 400, ['action']);
  } catch (e) {
    return answer(e);
  }
}

