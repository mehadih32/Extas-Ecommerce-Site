// S28 · PR 693 (CN-048; prototype v5 Inbox › Comments; gap I2, I9, I10, N2) — the comment desk. Facebook Page and
// Instagram public comments already arrive as inbox conversations marked "(public comment)" (PR 443). This adds, over
// them: the desk's list with its four views (All, Need a reply, Hidden, Auto-replied) and counts; hiding a comment (by the
// owner's rules, or by a person) and bringing it back; "Message privately" (one private message to the commenter) and the
// optional automatic reply to a price or size question (one private message and one public reply, once).
//
// Everything that leaves the shop goes through the Page's connector (`CommentSender`), a practice stand-in until the
// Page's keys are typed in (it answers ok and says `practice`; nothing reaches Meta). A hidden comment is never answered.
// Off as shipped (`support.commentDesk`); the automatic reply has its own switch inside it. Hiding is only ever on the
// Page's own comment (nothing is deleted); the words stay in the inbox. Every change is audited.
import { audit, SYSTEM } from '@extas/auth';
import { allow, logChange, nowOf, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { classifyComment, COMMENT_MARK, commentWords, COMMENT_VIEWS, inView, needsReply, type CommentHide, type CommentView } from './comments-pure';
import { z } from 'zod';

export interface CommentTarget {
  storeId: number;
  channel: { id: string; kind: string; externalId: string };
  /** The channel's own id of the comment (the message's `externalMessageId`). */
  commentId: string;
  /** The commenter's id on the channel. */
  commenter: string;
}

export type CommentSendResult = { ok: true; practice?: boolean } | { ok: false; error: string };

/** What the Page's connector does for a comment. Missing in the deps: the practice stand-in below. */
export interface CommentSender {
  hide(t: CommentTarget, hidden: boolean): Promise<CommentSendResult>;
  privateReply(t: CommentTarget, text: string): Promise<CommentSendResult>;
  publicReply(t: CommentTarget, text: string): Promise<CommentSendResult>;
}

/** Until the Page's keys are in: answers ok, reaches nobody. */
export const practiceCommentSender: CommentSender = {
  hide: async () => ({ ok: true, practice: true }),
  privateReply: async () => ({ ok: true, practice: true }),
  publicReply: async () => ({ ok: true, practice: true }),
};

const senderOf = (deps: Pick<SupportDeps, 'comments'>): CommentSender => deps.comments ?? practiceCommentSender;

const COMMENT_KINDS = ['messenger', 'instagram'] as const;
const READ_LIMIT = 300; // hardcode-ok: how many recent comments the desk reads, not a business number

export interface CommentRow {
  id: string;
  conversationId: string;
  /** 'messenger' is a Facebook Page comment. */
  channelKind: string;
  name: string | null;
  words: string;
  at: Date;
  hiddenAt: Date | null;
  hideReason: string | null;
  autoRepliedAt: Date | null;
  question: boolean;
  needsReply: boolean;
}

export interface CommentList {
  enabled: boolean;
  view: CommentView;
  counts: Record<CommentView, number>;
  rows: CommentRow[];
}

const listInput = z.object({ view: z.enum(COMMENT_VIEWS).optional() }).strict();

/** The desk's list (`support.read`). Off: empty. The newest 300 comments are read; counts are over those. */
export async function listComments(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who, input: unknown = {}): Promise<CommentList> {
  await allow(deps, who, 'support.read');
  const { view = 'all' } = parse(listInput, input, 'comment list');
  const rules = await setting(deps, who.storeId, 'support.commentDesk');
  const empty = { enabled: false, view, counts: { all: 0, need: 0, hidden: 0, auto: 0 }, rows: [] };
  if (!rules.enabled) return empty;
  const msgs = await deps.db.message.findMany({
    where: { storeId: who.storeId, direction: 'IN', isInternalNote: false, body: { startsWith: COMMENT_MARK }, conversation: { channel: { kind: { in: [...COMMENT_KINDS] } } } },
    orderBy: { sentAt: 'desc' },
    take: READ_LIMIT,
    select: { id: true, body: true, sentAt: true, hiddenAt: true, hideReason: true, autoRepliedAt: true, conversation: { select: { id: true, lastDirection: true, lastMessageAt: true, channel: { select: { kind: true } }, contact: { select: { displayName: true } } } } },
  });
  const rows = msgs.map((m) => {
    const words = commentWords(m.body);
    const question = classifyComment(words, { ...rules, hidePhone: false, hideAbuse: false }).question;
    const answered = m.conversation.lastDirection === 'OUT' && !!m.conversation.lastMessageAt && m.conversation.lastMessageAt > m.sentAt;
    const state = { hiddenAt: m.hiddenAt, autoRepliedAt: m.autoRepliedAt, answered, question };
    return { state, row: { id: m.id, conversationId: m.conversation.id, channelKind: m.conversation.channel.kind, name: m.conversation.contact.displayName, words, at: m.sentAt, hiddenAt: m.hiddenAt, hideReason: m.hideReason, autoRepliedAt: m.autoRepliedAt, question, needsReply: needsReply(state) } satisfies CommentRow };
  });
  const counts = { all: rows.length, need: 0, hidden: 0, auto: 0 };
  for (const r of rows) for (const v of ['need', 'hidden', 'auto'] as const) if (inView(r.state, v)) counts[v]++;
  return { enabled: true, view, counts, rows: rows.filter((r) => inView(r.state, view)).map((r) => r.row) };
}

interface Loaded {
  id: string;
  body: string | null;
  hiddenAt: Date | null;
  hideReason: string | null;
  autoRepliedAt: Date | null;
  conversationId: string;
  target: CommentTarget;
  lang: 'en' | 'bn';
}

async function load(deps: Pick<SupportDeps, 'db'>, storeId: number, messageId: string): Promise<Loaded> {
  const m = await deps.db.message.findFirst({
    where: { id: messageId, storeId, direction: 'IN', body: { startsWith: COMMENT_MARK }, conversation: { channel: { kind: { in: [...COMMENT_KINDS] } } } },
    select: { id: true, body: true, externalMessageId: true, hiddenAt: true, hideReason: true, autoRepliedAt: true, conversation: { select: { id: true, channel: { select: { id: true, kind: true, externalId: true } }, contact: { select: { externalId: true } } } } },
  });
  if (!m || !m.externalMessageId) throw new SupportError('NOT_FOUND', 'no such comment');
  const bengali = /[ঀ-৿]/.test(m.body ?? '');
  return { id: m.id, body: m.body, hiddenAt: m.hiddenAt, hideReason: m.hideReason, autoRepliedAt: m.autoRepliedAt, conversationId: m.conversation.id, target: { storeId, channel: m.conversation.channel, commentId: m.externalMessageId, commenter: m.conversation.contact.externalId }, lang: bengali ? 'bn' : 'en' };
}

async function event(deps: Pick<SupportDeps, 'db'>, c: Loaded, storeId: number, kind: string, who: Who | null, at: Date, data: Record<string, unknown>): Promise<void> {
  await deps.db.conversationEvent.create({ data: { storeId, conversationId: c.conversationId, kind, actorType: who ? 'STAFF' : 'SYSTEM', actorStaffId: who?.actor.staffUserId ?? null, messageId: c.id, data: data as never, createdAt: at } });
}

async function doHide(deps: SupportDeps, c: Loaded, storeId: number, reason: CommentHide | 'manual', who: Who | null): Promise<void> {
  const sent = await senderOf(deps).hide(c.target, true);
  if (!sent.ok) throw new SupportError('COMMENT_SEND_FAILED', 'the Page did not hide the comment', [sent.error]);
  const at = nowOf(deps);
  await deps.db.message.update({ where: { id: c.id }, data: { hiddenAt: at, hideReason: reason } });
  await event(deps, c, storeId, 'COMMENT_HIDDEN', who, at, { reason, practice: !!(sent as { practice?: boolean }).practice });
  await audit(deps.db, who?.actor ?? SYSTEM, { storeId, action: 'support.comment.hide', entityType: 'Message', entityId: c.id, before: { hidden: false }, after: { hidden: true, reason } }, who?.ctx ?? {});
}

/** Hides a comment by hand (`support.reply`). The words stay in the inbox; a hidden comment is never answered. */
export async function hideComment(deps: SupportDeps, who: Who, messageId: string): Promise<void> {
  await allow(deps, who, 'support.reply');
  const rules = await setting(deps, who.storeId, 'support.commentDesk');
  if (!rules.enabled) throw new SupportError('COMMENT_DESK_OFF', 'the comment desk is switched off');
  const c = await load(deps, who.storeId, messageId);
  if (c.hiddenAt) return;
  await doHide(deps, c, who.storeId, 'manual', who);
}

/** Shows a hidden comment again (`support.reply`). */
export async function unhideComment(deps: SupportDeps, who: Who, messageId: string): Promise<void> {
  await allow(deps, who, 'support.reply');
  const rules = await setting(deps, who.storeId, 'support.commentDesk');
  if (!rules.enabled) throw new SupportError('COMMENT_DESK_OFF', 'the comment desk is switched off');
  const c = await load(deps, who.storeId, messageId);
  if (!c.hiddenAt) return;
  const sent = await senderOf(deps).hide(c.target, false);
  if (!sent.ok) throw new SupportError('COMMENT_SEND_FAILED', 'the Page did not show the comment', [sent.error]);
  const at = nowOf(deps);
  await deps.db.message.update({ where: { id: c.id }, data: { hiddenAt: null, hideReason: null } });
  await event(deps, c, who.storeId, 'COMMENT_SHOWN', who, at, {});
  await logChange(deps.db, who, { action: 'support.comment.show', entityType: 'Message', entityId: c.id, before: { hidden: true }, after: { hidden: false } });
}

const privateInput = z.object({ messageId: z.string().uuid(), text: z.string().trim().min(1).max(1000).optional() }).strict();

/** "Message privately": one private message to the commenter, a person's own send (`support.reply`). Text: the desk's. */
export async function messageCommenterPrivately(deps: SupportDeps, who: Who, input: unknown): Promise<{ practice: boolean }> {
  await allow(deps, who, 'support.reply');
  const i = parse(privateInput, input, 'private message');
  const rules = await setting(deps, who.storeId, 'support.commentDesk');
  if (!rules.enabled) throw new SupportError('COMMENT_DESK_OFF', 'the comment desk is switched off');
  const c = await load(deps, who.storeId, i.messageId);
  if (c.hiddenAt) throw new SupportError('COMMENT_HIDDEN', 'a hidden comment is not answered');
  const text = i.text ?? (c.lang === 'bn' ? rules.privateTextBn || rules.privateTextEn : rules.privateTextEn || rules.privateTextBn);
  if (!text) throw new SupportError('EMPTY', 'there is no text to send');
  const sent = await senderOf(deps).privateReply(c.target, text);
  if (!sent.ok) throw new SupportError('COMMENT_SEND_FAILED', 'the Page did not send the message', [sent.error]);
  await event(deps, c, who.storeId, 'COMMENT_PRIVATE_REPLY', who, nowOf(deps), { practice: !!(sent as { practice?: boolean }).practice });
  await logChange(deps.db, who, { action: 'support.comment.privateReply', entityType: 'Message', entityId: c.id, before: null, after: { chars: text.length } });
  return { practice: !!(sent as { practice?: boolean }).practice };
}

export type CommentDecision = 'off' | 'hidden-phone' | 'hidden-abuse' | 'replied' | 'nothing' | 'failed';

/**
 * The desk's own rules for one new comment (the inbound path calls this after the comment is saved; never throws).
 * A phone number or an abuse word hides it (when those are on); a price or size question gets one private message and one
 * public reply, once (when `autoPrivate` is on). A comment already hidden or already answered is left as it is.
 */
export async function applyCommentRules(deps: SupportDeps, storeId: number, messageId: string): Promise<CommentDecision> {
  try {
    const rules = await setting(deps, storeId, 'support.commentDesk');
    if (!rules.enabled) return 'off';
    const c = await load(deps, storeId, messageId);
    if (c.hiddenAt || c.autoRepliedAt) return 'nothing';
    const v = classifyComment(commentWords(c.body), rules);
    if (v.hide) {
      await doHide(deps, c, storeId, v.hide, null);
      return v.hide === 'phone' ? 'hidden-phone' : 'hidden-abuse';
    }
    if (v.question && rules.autoPrivate) {
      const bn = c.lang === 'bn';
      const priv = bn ? rules.privateTextBn || rules.privateTextEn : rules.privateTextEn || rules.privateTextBn;
      const pub = bn ? rules.publicTextBn || rules.publicTextEn : rules.publicTextEn || rules.publicTextBn;
      const s = senderOf(deps);
      if (priv) {
        const a = await s.privateReply(c.target, priv);
        if (!a.ok) return 'failed';
      }
      if (pub) {
        const b = await s.publicReply(c.target, pub);
        if (!b.ok) return 'failed';
      }
      const at = nowOf(deps);
      await deps.db.message.update({ where: { id: c.id }, data: { autoRepliedAt: at } });
      await event(deps, c, storeId, 'COMMENT_AUTO_REPLIED', null, at, {});
      await audit(deps.db, SYSTEM, { storeId, action: 'support.comment.autoReply', entityType: 'Message', entityId: c.id, before: null, after: { private: !!priv, public: !!pub } });
      return 'replied';
    }
    return 'nothing';
  } catch {
    return 'failed';
  }
}
