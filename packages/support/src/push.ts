// S22 · PR 435 (Blueprint B4.11, B4.14 item 11) — the support app's push notifications: who is told, with what words,
// on which devices. The support core decides; the web hands it a sender (the push connection, on its mock until the
// shop's VAPID key pair is in Keys & connections) and the words in each person's admin language.
//
// `support.app` (off as it ships) with `push` on, for the `events` chosen:
// - `message`: a customer's new message goes to the chat's owner — or, while nobody owns it, to everyone with a device
//   switched on who may answer in that store (`support.reply`). A blocked person (the block list on) wakes nobody.
// - `assigned`: a chat given to someone goes to that person (never to the one who took it themselves).
// What the lock screen shows follows `preview` (nothing, the name, or the name and the message's start, its numbers
// masked when the privacy card masks numbers). Each device is told once per event; a device the push service no longer
// knows is switched off (kept, `revokedAt`), and its failures are counted. A push never holds the message's reply up:
// the callers queue it and go on; tests wait for `supportPushesSettled()`.
import { permissionsFor } from '@extas/auth';
import { z } from 'zod';
import type { ChannelKind } from './channels';
import { allow, logChange, nowOf, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { maskPhonesInText } from './identity-pure';

/** One device's subscription as the sender takes it. */
export interface SupportPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The push connection (the web wires @extas/adapters' `webPush`, a mock until its key pair is in). */
export interface SupportPushSender {
  practice: boolean;
  send(target: SupportPushTarget, payload: string, opts: { ttlSeconds: number; urgency?: 'normal' | 'high'; topic?: string }): Promise<{ ok: true } | { ok: false; gone: boolean; error: string }>;
}

/** What one notification is about, for its words. */
export interface SupportPushFacts {
  /** `test`: the app page's "Send a test notification". */
  kind: 'message' | 'assigned' | 'test';
  channelKind: ChannelKind;
  refCode: string;
  /** The person's name, when `preview` shows it. */
  name: string | null;
  /** The message's start, when `preview` shows it. */
  text: string | null;
}

export interface SupportPushWiring {
  sender: () => Promise<SupportPushSender>;
  /** The title and body in the person's admin language. */
  words: (lang: 'en' | 'bn', facts: SupportPushFacts) => { title: string; body: string };
  /** Where a tap opens (the chat in the support app). */
  url: (conversationId: string) => string;
}

export type SupportPushEvent = { kind: 'message'; storeId: number; conversationId: string; text: string | null } | { kind: 'assigned'; storeId: number; conversationId: string; to: string };

export interface SupportPushResult {
  devices: number;
  sent: number;
  failed: number;
  gone: number;
}

/** The longest message start a notification shows. */
export const PUSH_PREVIEW_CHARS = 80;

const NONE: SupportPushResult = { devices: 0, sent: 0, failed: 0, gone: 0 };

type PushDeps = Pick<SupportDeps, 'db' | 'settings' | 'now'> & { push?: SupportPushWiring };

/** Tell the devices of the people this event is for (see the header). Never throws for one device's failure. */
export async function pushSupport(deps: PushDeps, e: SupportPushEvent): Promise<SupportPushResult> {
  const wiring = deps.push;
  if (!wiring) return NONE;
  const cfg = await setting(deps, e.storeId, 'support.app');
  if (!cfg.enabled || !cfg.push || !cfg.events.includes(e.kind)) return NONE;
  const c = await deps.db.conversation.findFirst({
    where: { id: e.conversationId, storeId: e.storeId },
    select: { id: true, refCode: true, assignedToId: true, channel: { select: { kind: true } }, contact: { select: { displayName: true, blockedAt: true } } },
  });
  if (!c) return NONE;
  if (c.contact.blockedAt && (await setting(deps, e.storeId, 'support.blockList')).enabled) return NONE;
  const people = e.kind === 'assigned' ? [e.to] : c.assignedToId ? [c.assignedToId] : null;
  const subs = await deps.db.staffPushSubscription.findMany({
    where: { revokedAt: null, ...(people ? { staffUserId: { in: people } } : {}), staffUser: { status: 'ACTIVE', archivedAt: null } },
    select: { id: true, endpoint: true, p256dh: true, auth: true, failCount: true, staffUserId: true, staffUser: { select: { adminLocale: true } } },
  });
  if (!subs.length) return NONE;
  // only people who may answer in this store
  const may = new Map<string, boolean>();
  for (const id of new Set(subs.map((s) => s.staffUserId))) may.set(id, (await permissionsFor(deps.db, id, { storeId: e.storeId })).has('support.reply'));
  const targets = subs.filter((s) => may.get(s.staffUserId));
  if (!targets.length) return NONE;

  let text: string | null = null;
  if (cfg.preview === 'text' && e.kind === 'message' && e.text) {
    const privacy = await setting(deps, e.storeId, 'support.privacy');
    const start = e.text.length > PUSH_PREVIEW_CHARS ? `${e.text.slice(0, PUSH_PREVIEW_CHARS - 1)}…` : e.text;
    text = privacy.maskNumbersInText ? maskPhonesInText(start, await setting(deps, e.storeId, 'customers.phoneMask')) : start;
  }
  const facts: SupportPushFacts = { kind: e.kind, channelKind: c.channel.kind as ChannelKind, refCode: c.refCode, name: cfg.preview === 'none' ? null : c.contact.displayName, text };
  const sender = await wiring.sender();
  const url = wiring.url(c.id);
  const now = nowOf(deps);
  const out = { ...NONE, devices: targets.length };
  await Promise.all(
    targets.map(async (s) => {
      const w = wiring.words(s.staffUser.adminLocale === 'bn' ? 'bn' : 'en', facts);
      // the tag folds a chat's notifications into one on the device
      const payload = JSON.stringify({ title: w.title, body: w.body, url, tag: `chat-${c.id}` });
      let r: Awaited<ReturnType<SupportPushSender['send']>>;
      try {
        r = await sender.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, { ttlSeconds: cfg.ttlMinutes * 60, urgency: 'high', topic: c.refCode.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined });
      } catch {
        r = { ok: false, gone: false, error: 'the push connection failed' };
      }
      if (r.ok) {
        out.sent++;
        await deps.db.staffPushSubscription.update({ where: { id: s.id }, data: { lastPushAt: now, failCount: 0 } });
      } else if (r.gone) {
        out.gone++;
        await deps.db.staffPushSubscription.update({ where: { id: s.id }, data: { revokedAt: now, failCount: s.failCount + 1 } });
      } else {
        out.failed++;
        await deps.db.staffPushSubscription.update({ where: { id: s.id }, data: { failCount: s.failCount + 1 } });
      }
    }),
  );
  return out;
}

const pending = new Set<Promise<unknown>>();

/** Queue a push (the caller goes on at once); a failure is swallowed — the inbox and the bell still show the chat. */
export function queueSupportPush(deps: PushDeps, e: SupportPushEvent): void {
  if (!deps.push) return;
  const p: Promise<unknown> = pushSupport(deps, e)
    .catch(() => NONE)
    .finally(() => pending.delete(p));
  pending.add(p);
}

/** Every queued push finished (tests). */
export async function supportPushesSettled(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}

// ------------------------------------------------------------------------------------------------------------ devices

/** The longest device label ("Rahim's phone"). */
export const PUSH_DEVICE_LABEL_MAX = 60;

const b64url = (min: number, max: number) => z.string().regex(/^[A-Za-z0-9_-]+=*$/).min(min).max(max);
export const deviceInput = z
  .object({
    endpoint: z.url({ protocol: /^https$/ }).max(2000),
    keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 32) }).strict(),
    label: z.string().trim().max(PUSH_DEVICE_LABEL_MAX).optional(),
  })
  .strict();
export const deviceOffInput = z.object({ endpoint: z.url({ protocol: /^https$/ }).max(2000) }).strict();

export interface SupportDevice {
  id: string;
  label: string | null;
  since: string;
  lastPushAt: string | null;
  failCount: number;
}

export interface SupportAppState {
  /** `support.app` switched on (the pages offer to be installed). */
  enabled: boolean;
  /** Notifications switched on for the store. */
  push: boolean;
  /** The push connection is its mock: nothing leaves the server. */
  practice: boolean;
  /** The key a device subscribes with; null on the mock. */
  publicKey: string | null;
  /** This person's devices with notifications on. */
  devices: SupportDevice[];
}

type DeviceDeps = Pick<SupportDeps, 'db' | 'settings' | 'now'> & { push?: SupportPushWiring & { publicKey?: () => Promise<string | null> } };

const deviceOf = (s: { id: string; deviceLabel: string | null; createdAt: Date; lastPushAt: Date | null; failCount: number }): SupportDevice => ({
  id: s.id,
  label: s.deviceLabel,
  since: s.createdAt.toISOString(),
  lastPushAt: s.lastPushAt?.toISOString() ?? null,
  failCount: s.failCount,
});

function me(who: Who): string {
  if (!who.actor.staffUserId) throw new SupportError('INVALID_INPUT', 'a device belongs to a person', ['staff']);
  return who.actor.staffUserId;
}

/** The app's state for this person (`support.read`). */
export async function supportAppState(deps: DeviceDeps, who: Who): Promise<SupportAppState> {
  await allow(deps, who, 'support.read');
  const cfg = await setting(deps, who.storeId, 'support.app');
  const sender = deps.push && cfg.enabled ? await deps.push.sender() : null;
  const rows = who.actor.staffUserId
    ? await deps.db.staffPushSubscription.findMany({ where: { staffUserId: who.actor.staffUserId, revokedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, deviceLabel: true, createdAt: true, lastPushAt: true, failCount: true } })
    : [];
  const publicKey = sender && !sender.practice && deps.push?.publicKey ? await deps.push.publicKey() : null;
  return { enabled: cfg.enabled, push: cfg.enabled && cfg.push, practice: !sender || sender.practice, publicKey, devices: rows.map(deviceOf) };
}

/**
 * Notifications on for this device (`support.read`; the app and its push on). A device that belonged to someone else
 * (another person signed in on the same browser) becomes this person's; switched off before, it is on again.
 */
export async function saveSupportDevice(deps: DeviceDeps, who: Who, input: unknown): Promise<SupportAppState> {
  await allow(deps, who, 'support.read');
  const d = parse(deviceInput, input, 'device');
  const cfg = await setting(deps, who.storeId, 'support.app');
  if (!cfg.enabled || !cfg.push) throw new SupportError('PUSH_OFF', 'notifications are switched off in Support settings', ['support.app']);
  const staffUserId = me(who);
  const before = await deps.db.staffPushSubscription.findUnique({ where: { endpoint: d.endpoint }, select: { id: true, staffUserId: true, revokedAt: true } });
  const data = { staffUserId, p256dh: d.keys.p256dh, auth: d.keys.auth, deviceLabel: d.label || null, revokedAt: null, failCount: 0 };
  const row = await deps.db.staffPushSubscription.upsert({ where: { endpoint: d.endpoint }, create: { endpoint: d.endpoint, ...data }, update: data, select: { id: true } });
  if (!before || before.staffUserId !== staffUserId || before.revokedAt) {
    await logChange(deps.db, who, { action: 'support.app.device.on', entityType: 'StaffPushSubscription', entityId: row.id, before: before ? { staffUserId: before.staffUserId, on: !before.revokedAt } : null, after: { staffUserId, on: true } });
  }
  return supportAppState(deps, who);
}

/** Notifications off for this device (`support.read`; only one's own). Kept, switched off. */
export async function removeSupportDevice(deps: DeviceDeps, who: Who, input: unknown): Promise<SupportAppState> {
  await allow(deps, who, 'support.read');
  const d = parse(deviceOffInput, input, 'device');
  const staffUserId = me(who);
  const row = await deps.db.staffPushSubscription.findUnique({ where: { endpoint: d.endpoint }, select: { id: true, staffUserId: true, revokedAt: true } });
  if (row && row.staffUserId === staffUserId && !row.revokedAt) {
    await deps.db.staffPushSubscription.update({ where: { id: row.id }, data: { revokedAt: nowOf(deps) } });
    await logChange(deps.db, who, { action: 'support.app.device.off', entityType: 'StaffPushSubscription', entityId: row.id, before: { on: true }, after: { on: false } });
  }
  return supportAppState(deps, who);
}

/** A test notification to this person's own devices (`support.read`; the app and its push on). */
export async function testSupportPush(deps: DeviceDeps, who: Who): Promise<SupportPushResult & { practice: boolean }> {
  await allow(deps, who, 'support.read');
  const cfg = await setting(deps, who.storeId, 'support.app');
  if (!cfg.enabled || !cfg.push || !deps.push) throw new SupportError('PUSH_OFF', 'notifications are switched off in Support settings', ['support.app']);
  const staffUserId = me(who);
  const wiring = deps.push;
  const sender = await wiring.sender();
  const subs = await deps.db.staffPushSubscription.findMany({ where: { staffUserId, revokedAt: null }, select: { id: true, endpoint: true, p256dh: true, auth: true, failCount: true, staffUser: { select: { adminLocale: true } } } });
  const out = { ...NONE, devices: subs.length, practice: sender.practice };
  const now = nowOf(deps);
  for (const s of subs) {
    const w = wiring.words(s.staffUser.adminLocale === 'bn' ? 'bn' : 'en', { kind: 'test', channelKind: 'livechat', refCode: '', name: null, text: null });
    const r = await sender.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, JSON.stringify({ title: w.title, body: w.body, url: wiring.url(''), tag: 'test' }), { ttlSeconds: 60 }).catch(() => ({ ok: false as const, gone: false, error: 'the push connection failed' }));
    if (r.ok) out.sent++;
    else if (r.gone) out.gone++;
    else out.failed++;
    await deps.db.staffPushSubscription.update({ where: { id: s.id }, data: r.ok ? { lastPushAt: now, failCount: 0 } : r.gone ? { revokedAt: now, failCount: s.failCount + 1 } : { failCount: s.failCount + 1 } });
  }
  return out;
}
