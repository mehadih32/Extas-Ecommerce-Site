// S22 · PR 538 (Blueprint B4.14 V2 note — the 18 Oct round, §59 answers 48 and 49) — the owner told on Telegram when a
// customer waits and nobody answers. With `support.escalation` on, the sweep (sweepEscalations; run by the worker every
// minute per store, packages/jobs support-escalation.ts) looks at the chats where a customer is waiting for an answer
// (Conversation.waitingSince; any answer — a person's or EXTAS AI's — ends the wait) and, once the wait reaches
// `minutes` (counting only the desk's open time when `support.deskHours` is on and the owner waits for it), tells the
// owner once per wait, at most `perHour` lines an hour per store, never about a wait older than `lookBackHours`, never
// about a blocked person (the block list on). Each is a SupportEscalation row (append-only; one per wait, so two
// sweepers never tell him twice) and a line in the chat's who-did-what log saying whether it went (or the practice
// copy took it while the bot is not connected).
//
// Also the desk's state for the inbox (supportDesk) and the link check of a customer's message as it arrives
// (messageLinkSafety, kept on Message.linkSafety). Nothing here sends a customer a message, moves money, changes an
// order, a price or COD, blocks or deletes anything.
import { deskNow, checkMessageLinks, escalationDueAt, escalationLine, type DeskNow, type MessageLinkSafety } from './escalation-pure';
import { nowOf, setting, TX, type SupportDeps } from './context';

const MINUTE = 60_000;
const HOUR = 3_600_000;
/** The advisory lock's first key: escalation sweeps (the second is the store). */
const LOCK_KEY = 538;
/** How many waiting chats one sweep looks at (the longest waits first). */
const SWEEP_CHATS = 200;

/** Sends one line to the owner (the Telegram bot on Keys & connections, its practice copy until connected). Never throws. */
export type OwnerAlert = (storeId: number, text: string) => Promise<{ ok: boolean; mode: string; error?: string }>;

export interface EscalationSweep {
  /** Waiting chats looked at. */
  waiting: number;
  /** Lines sent to the owner (or taken by the practice copy). */
  told: number;
  /** Due, but over the hourly cap (told on a later sweep, if still waiting). */
  capped: number;
}

/** One store's sweep. Safe to run twice at once: one runs, the other returns. */
export async function sweepEscalations(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'> & { alert: OwnerAlert }, storeId: number): Promise<EscalationSweep> {
  const out: EscalationSweep = { waiting: 0, told: 0, capped: 0 };
  const cfg = await setting(deps, storeId, 'support.escalation');
  if (!cfg.enabled) return out;
  const [desk, tz, blockList] = await Promise.all([setting(deps, storeId, 'support.deskHours'), setting(deps, storeId, 'store.timeZone'), setting(deps, storeId, 'support.blockList')]);
  const now = nowOf(deps);
  const due = await deps.db.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}::int, ${storeId}::int) AS ok`;
    if (!lock?.ok) return [];
    const chats = await tx.conversation.findMany({
      where: { storeId, status: { not: 'SOLVED' }, lastDirection: 'IN', waitingSince: { not: null, gte: new Date(now.getTime() - cfg.lookBackHours * HOUR), lte: new Date(now.getTime() - cfg.minutes * MINUTE) } },
      orderBy: { waitingSince: 'asc' },
      take: SWEEP_CHATS,
      select: { id: true, refCode: true, waitingSince: true, channel: { select: { name: true, kind: true } }, contact: { select: { displayName: true, blockedAt: true } } },
    });
    out.waiting = chats.length;
    if (!chats.length) return [];
    const told = new Set(
      (await tx.supportEscalation.findMany({ where: { storeId, conversationId: { in: chats.map((c) => c.id) }, waitingSince: { in: chats.map((c) => c.waitingSince!) } }, select: { conversationId: true, waitingSince: true } })).map(
        (e) => `${e.conversationId}|${e.waitingSince?.getTime()}`,
      ),
    );
    let room = cfg.perHour - (await tx.supportEscalation.count({ where: { storeId, createdAt: { gt: new Date(now.getTime() - HOUR) } } }));
    const picked: { id: string; minutes: number; channel: string; name: string | null; ref: string }[] = [];
    for (const c of chats) {
      if (told.has(`${c.id}|${c.waitingSince!.getTime()}`)) continue;
      if (blockList.enabled && c.contact.blockedAt) continue;
      const at = escalationDueAt(c.waitingSince!, cfg, desk, tz);
      if (!at || at > now) continue;
      // the clock waits for the desk: a wait that came due at closing is told when it opens again
      if (cfg.outsideHours === 'wait' && deskNow(now, desk, tz)?.open === false) continue;
      if (room <= 0) {
        out.capped += 1;
        continue;
      }
      room -= 1;
      const minutes = Math.max(1, Math.round((now.getTime() - c.waitingSince!.getTime()) / MINUTE));
      await tx.supportEscalation.create({ data: { storeId, conversationId: c.id, reason: 'NO_ANSWER', notifiedVia: 'telegram', waitingSince: c.waitingSince, minutes, createdAt: now } });
      picked.push({ id: c.id, minutes, channel: c.channel.name || c.channel.kind, name: c.contact.displayName, ref: c.refCode });
    }
    return picked;
  }, TX);
  for (const p of due) {
    const sent = await deps.alert(storeId, escalationLine(cfg, p)).catch((e: unknown) => ({ ok: false, mode: 'MOCK', error: e instanceof Error ? e.message : String(e) }));
    await deps.db.conversationEvent.create({
      data: { storeId, conversationId: p.id, kind: 'ESCALATED', actorType: 'SYSTEM', data: { minutes: p.minutes, via: 'telegram', ok: sent.ok, practice: sent.mode !== 'LIVE' }, createdAt: now },
    });
    if (sent.ok) out.told += 1;
  }
  return out;
}

/** The desk now for the inbox (with the store's time zone, to show its times), or null when desk hours are off. */
export async function supportDesk(deps: Pick<SupportDeps, 'settings' | 'now'>, storeId: number): Promise<(DeskNow & { timeZone: string }) | null> {
  const [desk, tz] = await Promise.all([setting(deps, storeId, 'support.deskHours'), setting(deps, storeId, 'store.timeZone')]);
  const now = deskNow(nowOf(deps), desk, tz);
  return now ? { ...now, timeZone: tz } : null;
}

/** The links of a customer's message checked as it arrives (null when the switch is off or there are none). */
export async function messageLinkSafety(deps: Pick<SupportDeps, 'settings' | 'now'>, storeId: number, body: string | null): Promise<MessageLinkSafety | null> {
  const cfg = await setting(deps, storeId, 'support.linkSafety');
  const links = checkMessageLinks(body, cfg);
  return links.length ? { checkedAt: nowOf(deps).toISOString(), links } : null;
}
