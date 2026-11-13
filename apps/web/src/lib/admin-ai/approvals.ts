// S15 · PR 317 (Blueprint C3.2 "the single approval queue") — everything an AI 360 agent wants to do but may not do
// alone (money movement, refunds, COD changes, prices, discounts, ad budget increases, blocking, deletion, skill
// imports, auto-fixes) lands in `AiApprovalRequest` (already in the full S00 schema, `@stage S15 · PR 317, 540, 583`,
// written for the first time here), and the owner clears it "in one pass" from `/admin/ai/approvals`.
//
// This table already has a real producer: S21 · PR 420 (`../admin-health/fixes.ts`, Reports › Site health › Fixes
// to approve) writes `health.fix`/`ai.skill` requests and decides them with its own `decideProposal` — its own
// permission (`health.fixes.approve`, not `ai.control`), its own "nobody decides their own proposal" rule, and its
// own side effects (a `SiteAuditFinding`/`AiSkill` row moves with the decision, an approved fix may later run). This
// file is a thin, *unifying* read layer on top of that same table, never a second way to decide a fix or a skill:
// `approvalsView` lists every kind together (so the owner sees everything waiting in one place, the Blueprint's own
// "in one pass"), but `decideApproval` below refuses a `GATE_KINDS` row outright — `approvals-api.ts` routes those
// straight to `fixes.ts`'s own `decideProposal` instead, so the side effects and the permission stay where they are
// owned. `expireStaleApprovals` is the same split: it only ever touches a kind nobody else owns, and
// `fixes.expireProposals` (already real) is called alongside it for its own kinds.
//
// Every *other* kind — money movement, refunds, COD, prices, discounts, ad budget increases, blocking, deletion —
// has no producer yet: no agent executes a real action (the job dispatcher PR 306/307/308/309/312/313/315/316
// already note), so nothing in the real codebase calls `requestApproval` for those kinds in production. The queue
// mechanics for them are still fully real and fully tested, ready for the first agent action that needs them (PR
// 583's chief-agent routing, the Photoshoot agent's mandatory per-image approval in S24, and so on).
//
// `kind` is a plain string, never a closed enum column (a future agent kind this PR did not foresee still writes a
// request; `KNOWN_KINDS` below is a *display* catalogue only, falling back to the raw kind for anything it does not
// recognise — never inventing a Bengali/English label for something it was not given).
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { expireProposals as expireGatedProposals, FIX_KIND, GATE_KINDS, SKILL_KIND } from '../admin-health/fixes';
import { AiError } from './errors';

/** The schema's own `ApprovalStatus` enum values, mirrored here as a literal union so this file needs no import
 * from the generated Prisma enum (string literals already satisfy it structurally). */
export type ApprovalStatusT = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

/** The Blueprint's own named categories (C3.2), for a readable label — not a restriction: `kindLabelOf` falls back
 * to the raw `kind` string for anything not listed here, so a kind this PR did not foresee is still shown, honestly,
 * rather than refused or mistranslated. */
export const KNOWN_KINDS = [
  { key: 'money', nameEn: 'Money movement', nameBn: 'টাকা স্থানান্তর' },
  { key: 'refund', nameEn: 'Refund', nameBn: 'রিফান্ড' },
  { key: 'cod', nameEn: 'COD change', nameBn: 'ক্যাশ অন ডেলিভারি বদল' },
  { key: 'price', nameEn: 'Price change', nameBn: 'দামের পরিবর্তন' },
  { key: 'discount', nameEn: 'Discount', nameBn: 'ছাড়' },
  { key: 'adBudget', nameEn: 'Ad budget increase', nameBn: 'বিজ্ঞাপনের বাজেট বাড়ানো' },
  { key: 'block', nameEn: 'Blocking', nameBn: 'ব্লক করা' },
  { key: 'delete', nameEn: 'Deletion', nameBn: 'মুছে ফেলা' },
  // PR 585: Tirondaj/Doot's own learning-engine proposal to buy a paid data tool (cost + reason) — decided the
  // same way as every other non-GATE_KINDS request, here only for a proper label (`../admin-ai/learning-engine.ts`).
  { key: 'ai.paidTool', nameEn: 'Paid data tool', nameBn: 'পেইড ডেটা টুল' },
  // The two kinds `fixes.ts` (PR 420) already owns and already writes — listed here only so this unifying view can
  // show them with a proper label too; this file never decides them (see `decideApproval` below).
  { key: FIX_KIND, nameEn: 'Site-health fix', nameBn: 'সাইট স্বাস্থ্যের সমাধান' },
  { key: SKILL_KIND, nameEn: 'New AI skill', nameBn: 'নতুন AI স্কিল' },
] as const;

/** The display label for a kind, in the given language — the known catalogue's own name, or the raw kind string
 * itself when it is not one of them (never a guessed translation). */
export function kindLabelOf(kind: string, lang: 'en' | 'bn'): string {
  const known = KNOWN_KINDS.find((k) => k.key === kind);
  if (!known) return kind;
  return lang === 'bn' ? known.nameBn : known.nameEn;
}

export interface RequestApprovalInput {
  storeId?: number | null;
  agentKey?: string | null;
  kind: string;
  title: string;
  summary?: string | null;
  /** Whatever the requesting agent needs the owner to see to decide — a JSON-serialisable snapshot, not a live
   * reference, so the owner's decision is made on the facts as they stood when it was asked, even if something
   * else changes in the meantime. */
  payload: unknown;
  channel?: string | null;
  refType?: string | null;
  refId?: string | null;
  expiresAt?: Date | null;
}

export interface ApprovalsDeps {
  db: PrismaClient;
  now?: () => Date;
}

/** Creates a pending request — or, when `refType`/`refId` are both given and a pending request already exists for
 * that exact reference, returns the existing one instead of a duplicate (the same reason a retried job should not
 * queue the same thing twice: a re-delivered job message or a double "ask the owner" call from an agent must not
 * pile up two cards for one real question). */
export async function requestApproval(deps: ApprovalsDeps, input: RequestApprovalInput): Promise<{ id: string; created: boolean }> {
  if (!input.kind.trim()) throw new AiError(422, 'INVALID_INPUT', ['kind']);
  if (!input.title.trim()) throw new AiError(422, 'INVALID_INPUT', ['title']);
  // A health-fix or new-skill proposal only ever comes from `fixes.ts`'s own `proposeFix`/`proposeSkill` — they also
  // move a `SiteAuditFinding`/`AiSkill` row in the same transaction, which creating one here directly would skip.
  if ((GATE_KINDS as readonly string[]).includes(input.kind)) throw new AiError(409, 'USE_FIX_GATE', [input.kind]);
  if (input.refType && input.refId) {
    const existing = await deps.db.aiApprovalRequest.findFirst({
      where: { kind: input.kind, refType: input.refType, refId: input.refId, status: 'PENDING' },
    });
    if (existing) return { id: existing.id, created: false };
  }
  const row = await deps.db.aiApprovalRequest.create({
    data: {
      storeId: input.storeId ?? null,
      agentKey: input.agentKey ?? null,
      kind: input.kind,
      title: input.title,
      summary: input.summary ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      channel: input.channel ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return { id: row.id, created: true };
}

/** Flips every pending request whose own `expiresAt` has passed to `EXPIRED` — called at the top of every list, the
 * same "fresh on every read" pattern the Cost Book's own seeding and the spend-cap alerts already use, so a stale
 * card never sits in the owner's queue claiming to still be actionable. Never touches a `GATE_KINDS` row: those
 * expire through `fixes.expireProposals`, which also moves the `SiteAuditFinding`/`AiSkill` it belongs to — doing it
 * here too would flip the approval row without that second move, leaving the two out of step. Returns how many it
 * just flipped (this file's own kinds only). */
export async function expireStaleApprovals(deps: ApprovalsDeps): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const res = await deps.db.aiApprovalRequest.updateMany({
    where: { status: 'PENDING', expiresAt: { lt: now }, kind: { notIn: [...GATE_KINDS] } },
    data: { status: 'EXPIRED' },
  });
  return res.count;
}

export interface ApprovalRow {
  id: string;
  storeId: number | null;
  agentKey: string | null;
  kind: string;
  title: string;
  summary: string | null;
  payload: unknown;
  status: ApprovalStatusT;
  channel: string | null;
  refType: string | null;
  refId: string | null;
  decidedById: string | null;
  /** The deciding staff member's own display name, looked up once per view — null until decided, or if that staff
   * row is gone (never invented). */
  decidedByName: string | null;
  decisionNote: string | null;
  decidedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/** How many decided/expired/cancelled rows the history keeps on screen — a display row count, not a retention
 * policy (every row stays in the database either way). */
const DECIDED_HISTORY_LIMIT = 20; // hardcode-ok: a display row count, not a business number

export interface ApprovalsView {
  pending: ApprovalRow[];
  decided: ApprovalRow[];
}

const toRow = (
  r: {
    id: string;
    storeId: number | null;
    agentKey: string | null;
    kind: string;
    title: string;
    summary: string | null;
    payload: unknown;
    status: string;
    channel: string | null;
    refType: string | null;
    refId: string | null;
    decidedById: string | null;
    decisionNote: string | null;
    decidedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  },
  namesById: Map<string, string>,
): ApprovalRow => ({ ...r, status: r.status as ApprovalStatusT, decidedByName: r.decidedById ? namesById.get(r.decidedById) ?? null : null });

/** The owner's own queue: every `PENDING` request (oldest first, so "clear it in one pass" works top to bottom),
 * plus a short recent history of what was already decided, expired or cancelled. Covers both this store's own
 * requests and installation-wide ones (`storeId: null` — skill and fix approvals, per the schema's own comment).
 * Freshens both this file's own kinds (`expireStaleApprovals`) and `fixes.ts`'s own (`expireGatedProposals`) before
 * reading, so nothing stale shows as still waiting no matter which module wrote it. */
export async function approvalsView(deps: ApprovalsDeps, storeId: number): Promise<ApprovalsView> {
  const now = deps.now?.() ?? new Date();
  await Promise.all([expireStaleApprovals(deps), expireGatedProposals(deps.db, now)]);
  const scope = { OR: [{ storeId }, { storeId: null }] };
  const [pendingRows, decidedRows] = await Promise.all([
    deps.db.aiApprovalRequest.findMany({ where: { ...scope, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    deps.db.aiApprovalRequest.findMany({ where: { ...scope, status: { not: 'PENDING' } }, orderBy: { updatedAt: 'desc' }, take: DECIDED_HISTORY_LIMIT }),
  ]);
  const deciderIds = [...new Set(decidedRows.map((r) => r.decidedById).filter((x): x is string => !!x))];
  const deciders = deciderIds.length ? await deps.db.staffUser.findMany({ where: { id: { in: deciderIds } }, select: { id: true, displayName: true } }) : [];
  const namesById = new Map(deciders.map((s) => [s.id, s.displayName]));
  return { pending: pendingRows.map((r) => toRow(r, namesById)), decided: decidedRows.map((r) => toRow(r, namesById)) };
}

export type Decision = 'approve' | 'reject';

/** The owner's own decision on one request *that this file owns* (anything outside `GATE_KINDS`) — approve or
 * reject, with an optional note (why, for the record). A second tap with the *same* decision is a no-op (idempotent:
 * the common double-click, not an error); a second tap with the *other* decision, or on anything already
 * expired/cancelled, is refused with the status it actually carries, never silently overwritten. Refuses a
 * `GATE_KINDS` row outright (`USE_FIX_GATE`) — `approvals-api.ts` must route those to `fixes.decideProposal`
 * instead, which is why this is checked here too, as a safety net, not only in the API layer. */
export async function decideApproval(
  deps: ApprovalsDeps,
  who: { actor: Actor; ctx?: RequestContext },
  id: string,
  decision: Decision,
  note?: string | null,
): Promise<ApprovalRow> {
  const row = await deps.db.aiApprovalRequest.findUnique({ where: { id } });
  if (!row) throw new AiError(404, 'NOT_FOUND', ['id']);
  if ((GATE_KINDS as readonly string[]).includes(row.kind)) throw new AiError(409, 'USE_FIX_GATE', [row.kind]);
  const nextStatus: ApprovalStatusT = decision === 'approve' ? 'APPROVED' : 'REJECTED';
  const nameOf = async (staffUserId: string | null): Promise<Map<string, string>> => {
    if (!staffUserId) return new Map();
    const s = await deps.db.staffUser.findUnique({ where: { id: staffUserId }, select: { id: true, displayName: true } });
    return s ? new Map([[s.id, s.displayName]]) : new Map();
  };
  if (row.status !== 'PENDING') {
    if (row.status === nextStatus) return toRow(row, await nameOf(row.decidedById));
    throw new AiError(409, 'ALREADY_DECIDED', [row.status]);
  }
  const now = deps.now?.() ?? new Date();
  const cleanNote = note?.trim() ? note.trim() : null;
  const updated = await deps.db.aiApprovalRequest.update({
    where: { id },
    data: { status: nextStatus, decidedById: who.actor.staffUserId, decisionNote: cleanNote, decidedAt: now },
  });
  await audit(
    deps.db,
    who.actor,
    {
      action: decision === 'approve' ? 'ai.approval.approved' : 'ai.approval.rejected',
      entityType: 'AiApprovalRequest',
      entityId: id,
      before: { status: row.status },
      after: { status: nextStatus, note: cleanNote },
    },
    who.ctx ?? {},
  );
  return toRow(updated, await nameOf(updated.decidedById));
}
