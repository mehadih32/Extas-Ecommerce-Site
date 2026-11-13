// S23 · PR 443 — Facebook Page comments and Instagram comments + Direct messages into the Support inbox (Blueprint
// C5.5 point 5, C10 item 6: Doot's community agent "reads comments and DMs … and routes them into the Support
// Inbox"). The connector (apps/web's webhook routes, like PR 426's Messenger one) calls `receiveSocialEngagement`
// with its already-verified items; nothing else does.
//
// Facebook comments share the SAME `SupportChannel` row (kind `messenger`) as that Page's Messenger DMs — one Page,
// one app, one Keys & connections secret per feature, two webhook fields of the one subscription (feed, messaging).
// Instagram comments and Direct messages share the Support core's own reserved `instagram` kind (channels.ts) — one
// row per connected Instagram Business account, both its public comments and its private messages.
//
// A comment is public; a Direct message is private. Nothing here hides that difference: a public item's words carry
// a short, fixed mark (`SOCIAL_COMMENT_MARK`) so a reader of the conversation never mistakes a reply typed from here
// for a private one — Doot only routes and classifies ("price?" becomes a conversation); replying out is a person's
// job, same as any inbox message, and stays NOT_SENT with CHANNEL_NOT_CONNECTED until a sender adapter exists for
// that kind (none is added by this PR — an honest gap, not a silent one: channels.ts's existing fallback already
// covers it without new code).
import { receiveMessage, type ReceiveResult } from './inbound';
import { applyCommentRules } from './comments';
import { SupportError, type SupportDeps } from './context';

/** Marks a public comment's words in the conversation, ahead of the commenter's own text. */
export const SOCIAL_COMMENT_MARK = '(public comment)';

/** One comment or Direct message a webhook's own parser already produced (Facebook's `feed`, Instagram's `comments`/`messages`). */
export interface SocialEngagementInbound {
  /** The Page id (Facebook) or the Instagram Business account id — the `SupportChannel`'s own `externalId`. */
  channelExternalId: string;
  from: string;
  name?: string;
  messageId: string;
  text: string;
  files: { kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER'; sourceUrl: string }[];
  at: Date;
  isPublicComment: boolean;
}

export interface SocialEngagementReceiveResult {
  received: number;
  duplicate: number;
  /** No such channel in Support, switched off, or nothing usable in the item (no words and no file). */
  skipped: number;
}

/** A webhook's comments/DMs into the inbox of the store whose channel (`kind`) they came to. Safe to call again. */
export async function receiveSocialEngagement(deps: Pick<SupportDeps, 'db' | 'settings' | 'now' | 'push' | 'comments'>, storeId: number, kind: string, items: readonly SocialEngagementInbound[]): Promise<SocialEngagementReceiveResult> {
  const out: SocialEngagementReceiveResult = { received: 0, duplicate: 0, skipped: 0 };
  for (const m of items) {
    const channel = await deps.db.supportChannel.findUnique({ where: { storeId_kind_externalId: { storeId, kind, externalId: m.channelExternalId } }, select: { enabled: true, archivedAt: true } });
    if (!channel || !channel.enabled || channel.archivedAt) {
      out.skipped++;
      continue;
    }
    const text = m.isPublicComment && m.text.trim() ? `${SOCIAL_COMMENT_MARK} ${m.text}` : m.text;
    let r: ReceiveResult;
    try {
      r = await receiveMessage(deps, {
        storeId,
        channel: { kind, externalId: m.channelExternalId },
        contact: { externalId: m.from, ...(m.name?.trim() ? { name: m.name.trim().slice(0, 120) } : {}) },
        message: { externalId: m.messageId, ...(text ? { text } : {}), sentAt: m.at, files: m.files.slice(0, 20) },
      });
    } catch (e) {
      if (e instanceof SupportError && (e.code === 'EMPTY' || e.code === 'INVALID_INPUT' || e.code === 'NOT_FOUND')) {
        out.skipped++;
        continue;
      }
      throw e;
    }
    if (r.duplicate) out.duplicate++;
    else {
      out.received++;
      // S28 · PR 693: the comment desk's own rules (hide a phone number or abuse, the optional automatic reply); never fails the webhook
      if (m.isPublicComment) await applyCommentRules(deps as SupportDeps, storeId, r.messageId);
    }
    // No reply window to extend here: comments carry none in Meta's own rules, and Instagram's own DM window is
    // moot until a real Instagram sender exists (channels.ts's fallback already keeps a reply NOT_SENT without one).
  }
  return out;
}
