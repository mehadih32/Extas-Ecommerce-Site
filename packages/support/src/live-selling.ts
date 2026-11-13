// S28 · PR 694 (CN-048; prototype v5 Inbox › Comments › Live selling; gap I11, N3) — live selling. A person starts a live
// session for a Page (Facebook or Instagram) with the product codes said on air (P1 = a product, P2 = another); while it
// runs, every public comment of that Page is read ("P1 L 2 pcs": code, size, quantity — live-pure.ts) and kept as a
// capture. "Make draft" puts the piece in that person's chat bag (the chat-order path: the same bag "Create order" in a
// chat uses), and "Make all" does it for every ready capture. Nothing becomes an order here: staff always confirm by a
// call, then press "Create order" in the chat, with the shop's own price, checks and gate (PR 430). Mock until the Page's
// keys: until then comments arrive only by hand ("Add a comment"), marked practice. Off as shipped (`support.liveSelling`).
import { z } from 'zod';
import { changeChatBag, type ChatOrderDeps } from './chat-cart';
import { allow, logChange, nowOf, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { liveCodesInput, parseLiveComment, type LiveCode, type LiveParse } from './live-pure';

const KINDS = ['messenger', 'instagram'] as const;

async function rules(deps: Pick<SupportDeps, 'settings'>, storeId: number) {
  const r = await setting(deps, storeId, 'support.liveSelling');
  if (!r.enabled) throw new SupportError('LIVE_OFF', 'live selling is switched off');
  return r;
}

const asCodes = (j: unknown): LiveCode[] => (Array.isArray(j) ? (j as LiveCode[]) : []);
const asParse = (j: unknown): LiveParse => j as LiveParse;

const startInput = z.object({ title: z.string().trim().min(1).max(120), channelKind: z.enum(KINDS), codes: liveCodesInput }).strict();

/** Starts a live session (`support.reply`). One runs at a time per shop; the codes must be products of this shop. */
export async function startLiveSession(deps: SupportDeps, who: Who, input: unknown): Promise<{ id: string }> {
  await allow(deps, who, 'support.reply');
  await rules(deps, who.storeId);
  const d = parse(startInput, input, 'live session');
  const found = await deps.db.product.count({ where: { storeId: who.storeId, id: { in: d.codes.map((c) => c.productId) } } });
  if (found !== new Set(d.codes.map((c) => c.productId)).size) throw new SupportError('NOT_FOUND', 'a product is not of this shop', ['codes']);
  return deps.db.$transaction(async (tx) => {
    if (await tx.liveSession.findFirst({ where: { storeId: who.storeId, status: 'LIVE' }, select: { id: true } })) throw new SupportError('LIVE_RUNNING', 'a live session is already running');
    const s = await tx.liveSession.create({ data: { storeId: who.storeId, title: d.title, channelKind: d.channelKind, codes: d.codes, startedAt: nowOf(deps), createdById: who.actor.staffUserId ?? null }, select: { id: true } });
    await logChange(tx, who, { action: 'support.live.start', entityType: 'LiveSession', entityId: s.id, before: null, after: { title: d.title, channelKind: d.channelKind, codes: d.codes.length } });
    return s;
  });
}

/** Ends the running session (`support.reply`). Its captures stay for good. */
export async function endLiveSession(deps: SupportDeps, who: Who): Promise<void> {
  await allow(deps, who, 'support.reply');
  await rules(deps, who.storeId);
  await deps.db.$transaction(async (tx) => {
    const s = await tx.liveSession.findFirst({ where: { storeId: who.storeId, status: 'LIVE' }, select: { id: true } });
    if (!s) throw new SupportError('NO_LIVE', 'no live session is running');
    await tx.liveSession.update({ where: { id: s.id }, data: { status: 'ENDED', endedAt: nowOf(deps) } });
    await logChange(tx, who, { action: 'support.live.end', entityType: 'LiveSession', entityId: s.id, before: { status: 'LIVE' }, after: { status: 'ENDED' } });
  });
}

export interface LiveCaptureInput {
  kind: string;
  commentId: string | null;
  commenter: string;
  name: string | null;
  text: string;
  conversationId: string | null;
  practice?: boolean;
}

/**
 * One comment of the running session's Page (the inbound path calls this for a public comment; a person can add one by
 * hand, marked practice). Nothing is kept when live selling is off or no session of that Page runs. Safe to call twice
 * for the same comment. Returns the capture's id or null.
 */
export async function captureLiveComment(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, storeId: number, i: LiveCaptureInput): Promise<string | null> {
  const r = await setting(deps, storeId, 'support.liveSelling');
  if (!r.enabled) return null;
  const s = await deps.db.liveSession.findFirst({ where: { storeId, status: 'LIVE', channelKind: i.kind }, select: { id: true, codes: true } });
  if (!s) return null;
  if (i.commentId) {
    const old = await deps.db.liveCapture.findUnique({ where: { sessionId_commentId: { sessionId: s.id, commentId: i.commentId } }, select: { id: true } });
    if (old) return old.id;
  }
  const parsed = parseLiveComment(i.text, asCodes(s.codes), r.maxQty);
  const row = await deps.db.liveCapture.create({ data: { storeId, sessionId: s.id, commentId: i.commentId, commenterId: i.commenter, name: i.name, text: i.text.slice(0, 500), parsed, conversationId: i.conversationId, practice: i.practice ?? false, createdAt: nowOf(deps) }, select: { id: true } });
  return row.id;
}

const handInput = z.object({ name: z.string().trim().max(120).optional(), text: z.string().trim().min(1).max(500) }).strict();

/** "Add a comment" by hand (practice, until the Page's keys are in) — to the running session (`support.reply`). */
export async function addLiveCommentByHand(deps: SupportDeps, who: Who, input: unknown): Promise<{ id: string }> {
  await allow(deps, who, 'support.reply');
  await rules(deps, who.storeId);
  const d = parse(handInput, input, 'comment');
  const s = await deps.db.liveSession.findFirst({ where: { storeId: who.storeId, status: 'LIVE' }, select: { channelKind: true } });
  if (!s) throw new SupportError('NO_LIVE', 'no live session is running');
  const id = await captureLiveComment(deps, who.storeId, { kind: s.channelKind, commentId: null, commenter: `hand-${who.actor.staffUserId ?? 'system'}`, name: d.name ?? null, text: d.text, conversationId: null, practice: true });
  if (!id) throw new SupportError('NO_LIVE', 'no live session is running');
  return { id };
}

export type CaptureState = 'READY' | 'IN_BAG' | 'SKIPPED' | 'SOLD_OUT' | 'NOT_ORDER' | 'NO_CHAT';

export interface LiveCaptureRow {
  id: string;
  name: string | null;
  text: string;
  at: Date;
  practice: boolean;
  state: CaptureState;
  /** Why it is not an order (NOT_AN_ORDER, UNKNOWN_CODE, TOO_MANY, NO_CODES). */
  reason: string | null;
  conversationId: string | null;
  product: { nameEn: string; nameBn: string | null } | null;
  size: string | null;
  qty: number | null;
  guessedCode: boolean;
  /** More than one colour is on sale for this size: staff confirm the colour on the call. */
  colourToConfirm: boolean;
}

export interface LiveBoard {
  enabled: boolean;
  maxQty: number;
  session: { id: string; title: string; channelKind: string; status: string; startedAt: Date; endedAt: Date | null; codes: { code: string; product: { nameEn: string; nameBn: string | null } | null }[] } | null;
  captures: LiveCaptureRow[];
  ready: number;
  drafted: number;
}

type Resolved = { variantId: string; colours: number } | null;

async function resolveVariant(deps: Pick<SupportDeps, 'db'>, storeId: number, productId: string, size: string): Promise<Resolved> {
  const vs = await deps.db.productVariant.findMany({
    where: { productId, product: { storeId, status: 'PUBLISHED', archivedAt: null }, archivedAt: null, active: true, inStock: true, size: { is: { OR: [{ key: { equals: size, mode: 'insensitive' } }, { label: { equals: size, mode: 'insensitive' } }] } } },
    orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }],
    select: { id: true, colourId: true },
  });
  const first = vs[0];
  return first ? { variantId: first.id, colours: new Set(vs.map((v) => v.colourId)).size } : null;
}

/** The live board (`support.read`): the running session, else the last one, with its captures read against today's stock. */
export async function liveBoard(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who): Promise<LiveBoard> {
  await allow(deps, who, 'support.read');
  const r = await setting(deps, who.storeId, 'support.liveSelling');
  if (!r.enabled) return { enabled: false, maxQty: r.maxQty, session: null, captures: [], ready: 0, drafted: 0 };
  const s = (await deps.db.liveSession.findFirst({ where: { storeId: who.storeId, status: 'LIVE' } })) ?? (await deps.db.liveSession.findFirst({ where: { storeId: who.storeId }, orderBy: { startedAt: 'desc' } }));
  if (!s) return { enabled: true, maxQty: r.maxQty, session: null, captures: [], ready: 0, drafted: 0 };
  const codes = asCodes(s.codes);
  const products = await deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: codes.map((c) => c.productId) } }, select: { id: true, nameEn: true, nameBn: true } });
  const byId = new Map(products.map((p) => [p.id, { nameEn: p.nameEn, nameBn: p.nameBn }]));
  const caps = await deps.db.liveCapture.findMany({ where: { storeId: who.storeId, sessionId: s.id }, orderBy: { createdAt: 'asc' }, take: 500 });
  const captures: LiveCaptureRow[] = [];
  for (const c of caps) {
    const p = asParse(c.parsed);
    let state: CaptureState = 'NOT_ORDER';
    let product: LiveCaptureRow['product'] = null;
    let colourToConfirm = false;
    if (c.status === 'IN_BAG') state = 'IN_BAG';
    else if (c.status === 'SKIPPED') state = 'SKIPPED';
    else if (p.ok) {
      const code = codes.find((x) => x.code === p.code);
      product = code ? (byId.get(code.productId) ?? null) : null;
      const v = code ? await resolveVariant(deps, who.storeId, code.productId, p.size) : null;
      state = !v ? 'SOLD_OUT' : !c.conversationId ? 'NO_CHAT' : 'READY';
      colourToConfirm = !!v && v.colours > 1;
    }
    captures.push({ id: c.id, name: c.name, text: c.text, at: c.createdAt, practice: c.practice, state, reason: p.ok ? null : p.reason, conversationId: c.conversationId, product, size: p.ok ? p.size : null, qty: p.ok ? p.qty : null, guessedCode: p.ok ? p.guessedCode : false, colourToConfirm });
  }
  return {
    enabled: true,
    maxQty: r.maxQty,
    session: { id: s.id, title: s.title, channelKind: s.channelKind, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, codes: codes.map((c) => ({ code: c.code, product: byId.get(c.productId) ?? null })) },
    captures,
    ready: captures.filter((c) => c.state === 'READY').length,
    drafted: captures.filter((c) => c.state === 'IN_BAG').length,
  };
}

export interface DraftResult {
  captureId: string;
  ok: boolean;
  /** When not ok: SOLD_OUT, NO_CHAT, NOT_AN_ORDER, ALREADY or the chat bag's own refusal code. */
  code: string | null;
}

/** "Make draft": the capture's piece goes in that person's chat bag (`support.order`, and `support.cart` on). */
export async function makeLiveDraft(deps: ChatOrderDeps, who: Who, captureId: string): Promise<DraftResult> {
  await allow(deps, who, 'support.order');
  await rules(deps, who.storeId);
  const c = await deps.db.liveCapture.findFirst({ where: { id: captureId, storeId: who.storeId }, include: { session: { select: { codes: true } } } });
  if (!c) throw new SupportError('NOT_FOUND', 'no such comment');
  if (c.status !== 'NEW') return { captureId, ok: false, code: 'ALREADY' };
  const p = asParse(c.parsed);
  if (!p.ok) return { captureId, ok: false, code: 'NOT_AN_ORDER' };
  if (!c.conversationId) return { captureId, ok: false, code: 'NO_CHAT' };
  const code = asCodes(c.session.codes).find((x) => x.code === p.code);
  const v = code ? await resolveVariant(deps, who.storeId, code.productId, p.size) : null;
  if (!v) return { captureId, ok: false, code: 'SOLD_OUT' };
  try {
    await changeChatBag(deps, who, { conversationId: c.conversationId, action: 'add', variantId: v.variantId, quantity: p.qty });
  } catch (e) {
    if (e instanceof SupportError && ['OUT_OF_STOCK', 'CART_OFF', 'NOT_FOUND', 'INVALID_INPUT', 'NOT_ASSIGNABLE'].includes(e.code)) return { captureId, ok: false, code: e.code };
    throw e;
  }
  await deps.db.$transaction(async (tx) => {
    await tx.liveCapture.update({ where: { id: c.id }, data: { status: 'IN_BAG', variantId: v.variantId, qty: p.qty } });
    await tx.conversationEvent.create({ data: { storeId: who.storeId, conversationId: c.conversationId!, kind: 'LIVE_DRAFT', actorType: 'STAFF', actorStaffId: who.actor.staffUserId ?? null, data: { captureId: c.id, size: p.size, qty: p.qty, code: p.code }, createdAt: nowOf(deps) } });
    await logChange(tx, who, { action: 'support.live.draft', entityType: 'LiveCapture', entityId: c.id, before: { status: 'NEW' }, after: { status: 'IN_BAG', qty: p.qty } });
  });
  return { captureId, ok: true, code: null };
}

/** "Make all": every ready capture of the running session, one after another. A refused one is reported, never skipped silently. */
export async function makeAllLiveDrafts(deps: ChatOrderDeps, who: Who): Promise<DraftResult[]> {
  await allow(deps, who, 'support.order');
  const board = await liveBoard(deps, who);
  const out: DraftResult[] = [];
  for (const c of board.captures.filter((x) => x.state === 'READY')) out.push(await makeLiveDraft(deps, who, c.id));
  return out;
}

/** A person says a capture is not wanted (`support.reply`). */
export async function skipLiveCapture(deps: SupportDeps, who: Who, captureId: string): Promise<void> {
  await allow(deps, who, 'support.reply');
  await rules(deps, who.storeId);
  const done = await deps.db.liveCapture.updateMany({ where: { id: captureId, storeId: who.storeId, status: 'NEW' }, data: { status: 'SKIPPED' } });
  if (!done.count) throw new SupportError('NOT_FOUND', 'no such comment to skip');
  await logChange(deps.db, who, { action: 'support.live.skip', entityType: 'LiveCapture', entityId: captureId, before: { status: 'NEW' }, after: { status: 'SKIPPED' } });
}
