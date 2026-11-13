// S25 · PR 490 (Blueprint C8.4, C8.6 item 10) — the creative brief and the three directions the AI proposes before
// anything is produced. The owner answers a few short questions (what this campaign is for, who it should reach,
// what the offer is and for how long, and which products) in `CreativeBrief.answers`; `proposeCreativeDirections`
// always returns Blueprint C8.4's own three fixed directions — "Urgency", "Festive", "Clean premium" — by their
// stable key only (the admin page's own messages hold each direction's name and one-line rationale, filled in with
// the brief's own words, never a word this build invented — the same practice-only shape PR 293's AI writer uses
// for its own draft versions). `chooseCreativeDirection` is the one gate: nothing downstream (a real creative, or
// PR 487/488's export, through `CreativeExport.briefId`) is ever produced before the owner has picked a direction
// he likes, or asked to see the three again (re-running `proposeCreativeDirections`). No live AI connection is used
// here yet — that is for AI 360 to add later, the same honest "practice" shape every writer draft uses until a key
// is entered (`practice: true` throughout this package and `@extas/adapters`'s mock providers).
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit } from '@extas/auth';
import { StudioError } from './errors';
import type { StudioDeps, Who } from './context';

/** Blueprint C8.4's own three examples, in this fixed order; the admin page's messages hold each one's text. */
export const CREATIVE_DIRECTION_KEYS = ['urgency', 'festive', 'clean_premium'] as const;
export type CreativeDirectionKey = (typeof CREATIVE_DIRECTION_KEYS)[number];

export const creativeBriefAnswersSchema = z
  .object({
    /** "what is this campaign for". */
    purpose: z.string().trim().min(1).max(500),
    /** "who should it reach". */
    audience: z.string().trim().min(1).max(500),
    /** "what is the offer". */
    offer: z.string().trim().min(1).max(500),
    /** "for how long" — whole days. */
    durationDays: z.number().int().min(1).max(365),
    /** "which products" — optional; a brief may name none yet. */
    productIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict();
export type CreativeBriefAnswers = z.infer<typeof creativeBriefAnswersSchema>;

export const draftCreativeBriefInput = z
  .object({
    /** Optional — a brief may be drafted ahead of any campaign existing, same as PR 487's export. */
    campaignId: z.string().uuid().nullish(),
  })
  .merge(creativeBriefAnswersSchema)
  .strict();
export type DraftCreativeBriefInput = z.infer<typeof draftCreativeBriefInput>;

export interface CreativeDirectionView {
  key: CreativeDirectionKey;
  /** The same selection's first already-approved live photo, honestly reused — never a composed, styled image. */
  previewAssetId: string | null;
}

export interface CreativeBriefView {
  id: string;
  campaignId: string | null;
  answers: CreativeBriefAnswers;
  directions: CreativeDirectionView[] | null;
  chosenDirection: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  campaignId: string | null;
  answers: unknown;
  directions: unknown;
  chosenDirection: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function view(r: Row): CreativeBriefView {
  return {
    id: r.id,
    campaignId: r.campaignId,
    answers: r.answers as CreativeBriefAnswers,
    directions: (r.directions as CreativeDirectionView[] | null) ?? null,
    chosenDirection: r.chosenDirection,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function findOwnBrief(db: PrismaClient, storeId: number, briefId: string) {
  const brief = await db.creativeBrief.findFirst({ where: { id: briefId, storeId } });
  if (!brief) throw new StudioError('NOT_FOUND', 'no such creative brief', ['briefId']);
  return brief;
}

/** The first already-approved live photo among these products, or `null` when none has one yet. */
async function firstApprovedAssetId(db: PrismaClient, storeId: number, productIds: string[]): Promise<string | null> {
  if (!productIds.length) return null;
  const m = await db.productMedia.findFirst({
    where: { storeId, productId: { in: productIds }, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: { assetId: true },
  });
  return m?.assetId ?? null;
}

/** Every creative brief of the store, newest first (`marketing.studio.read`, checked by the caller). */
export async function listCreativeBriefs(deps: StudioDeps, storeId: number): Promise<CreativeBriefView[]> {
  const rows = await deps.db.creativeBrief.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(view);
}

/**
 * Saves the owner's answers to the brief's short questionnaire (`marketing.studio.write`, checked by the caller):
 * refuses `OFF` while `studio.creativeBrief.enabled` is off, `NOT_FOUND` for a `campaignId` or a `productId` naming
 * nothing of this store. The row sits `DRAFTING` with no direction proposed yet.
 */
export async function draftCreativeBrief(deps: StudioDeps, who: Who, input: unknown): Promise<CreativeBriefView> {
  const ok = draftCreativeBriefInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'a brief needs its purpose, audience, offer and duration', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  if (!deps.settings) throw new StudioError('OFF', 'the creative brief is off');
  const brief = await deps.settings.value('studio.creativeBrief', { storeId: who.storeId });
  if (!brief.enabled) throw new StudioError('OFF', 'the creative brief is off — turn it on in Settings first');

  if (d.campaignId) {
    const campaign = await deps.db.campaign.findFirst({ where: { id: d.campaignId, storeId: who.storeId }, select: { id: true } });
    if (!campaign) throw new StudioError('NOT_FOUND', 'no such campaign', ['campaignId']);
  }
  if (d.productIds.length) {
    const found = await deps.db.product.findMany({ where: { id: { in: d.productIds }, storeId: who.storeId, archivedAt: null }, select: { id: true } });
    if (found.length !== new Set(d.productIds).size) throw new StudioError('NOT_FOUND', 'one of these products was not found', ['productIds']);
  }

  const answers: CreativeBriefAnswers = { purpose: d.purpose, audience: d.audience, offer: d.offer, durationDays: d.durationDays, productIds: d.productIds };
  const row = await deps.db.creativeBrief.create({ data: { storeId: who.storeId, campaignId: d.campaignId ?? null, answers, status: 'DRAFTING' } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.brief.draft', entityType: 'CreativeBrief', entityId: row.id, after: { campaignId: d.campaignId ?? null } }, who.ctx);
  return view(row);
}

/**
 * Proposes (or, asked again, re-proposes — "asks for more") the three fixed directions from the brief's own answers
 * (`marketing.studio.write`): refuses `WRONG_STATE` once a direction has already been chosen (nothing is silently
 * swapped out from under a decision already made). Nothing is produced here — only the three stable keys and, when
 * the brief names products, the same one honestly-reused preview photo for all three (never a composed image).
 */
export async function proposeCreativeDirections(deps: StudioDeps, who: Who, briefId: string): Promise<CreativeBriefView> {
  const brief = await findOwnBrief(deps.db, who.storeId, briefId);
  if (brief.status !== 'DRAFTING' && brief.status !== 'PROPOSED') throw new StudioError('WRONG_STATE', 'a chosen or set-aside brief cannot be re-proposed', ['status']);
  const answers = brief.answers as CreativeBriefAnswers;
  const previewAssetId = await firstApprovedAssetId(deps.db, who.storeId, answers.productIds);
  const directions: CreativeDirectionView[] = CREATIVE_DIRECTION_KEYS.map((key) => ({ key, previewAssetId }));
  const row = await deps.db.creativeBrief.update({ where: { id: brief.id }, data: { directions: directions as unknown as Prisma.InputJsonValue, status: 'PROPOSED' } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.brief.propose', entityType: 'CreativeBrief', entityId: brief.id, before: { status: brief.status }, after: { status: row.status } }, who.ctx);
  return view(row);
}

/**
 * The owner picks one of the three proposed directions (`marketing.studio.write`): refuses `WRONG_STATE` before
 * directions exist or once one is already chosen, `INVALID_INPUT` for an index outside the proposed list. Nothing
 * downstream is produced by this call itself — it only records which direction the owner liked (Blueprint C8.4:
 * "nothing is produced until he has seen a direction he likes").
 */
export async function chooseCreativeDirection(deps: StudioDeps, who: Who, briefId: string, directionIndex: number): Promise<CreativeBriefView> {
  const brief = await findOwnBrief(deps.db, who.storeId, briefId);
  if (brief.status !== 'PROPOSED') throw new StudioError('WRONG_STATE', 'propose the directions before choosing one', ['status']);
  const directions = (brief.directions as CreativeDirectionView[] | null) ?? [];
  if (!Number.isInteger(directionIndex) || directionIndex < 0 || directionIndex >= directions.length) throw new StudioError('INVALID_INPUT', 'pick one of the proposed directions', ['directionIndex']);
  const row = await deps.db.creativeBrief.update({ where: { id: brief.id }, data: { chosenDirection: directionIndex, status: 'CHOSEN' } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.brief.choose', entityType: 'CreativeBrief', entityId: brief.id, before: { status: brief.status }, after: { status: row.status, chosenDirection: directionIndex } }, who.ctx);
  return view(row);
}

/** Sets a brief aside, from any state but already-archived (`marketing.studio.write`); never deleted. */
export async function archiveCreativeBrief(deps: StudioDeps, who: Who, briefId: string): Promise<CreativeBriefView> {
  const brief = await findOwnBrief(deps.db, who.storeId, briefId);
  if (brief.status === 'ARCHIVED') throw new StudioError('WRONG_STATE', 'this brief is already set aside', ['status']);
  const row = await deps.db.creativeBrief.update({ where: { id: brief.id }, data: { status: 'ARCHIVED' } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.brief.archive', entityType: 'CreativeBrief', entityId: brief.id, before: { status: brief.status }, after: { status: row.status } }, who.ctx);
  return view(row);
}
