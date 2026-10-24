// S14 · PR 291 — Messages › Channels & limits (MSG-05, ADMIN-ARCHITECTURE §4.6): the master switch, each channel's
// provider (live, or its mock until the owner types a key in Keys & connections) with the credit left on its account,
// what the channel did in the last 7 days (sent, delivered, failed, cost), the SMS masking name and part prices, the
// caps per order and the quiet hours. One version over every setting it edits: a save over someone else's newer change
// is refused with STALE. Seeing needs `messages.channels.read`, saving `messages.channels.write`; nothing here sends.
import { createHash } from 'node:crypto';
import { MESSAGE_CHANNELS, registry, storeTarget, type Key, type MessageChannel, type Value } from '@extas/settings';
import { z } from 'zod';
import { allow, holds, logChange, MessagesError, nowOf, parse, setting, type MessagesDeps, type SenderBalance, type SettingsWriter, type Who } from './context';

/** A group of settings one screen edits, by the screen's own field names. */
export type SettingsGroup = Record<string, Key>;
export type GroupValues<G extends SettingsGroup> = { [F in keyof G]: Value<G[F]> };

export async function readGroup<G extends SettingsGroup>(deps: Pick<MessagesDeps, 'settings'>, storeId: number, group: G): Promise<GroupValues<G>> {
  const entries = await Promise.all(Object.entries(group).map(async ([f, key]) => [f, await setting(deps, storeId, key)] as const));
  return Object.fromEntries(entries) as GroupValues<G>;
}

export const groupVersion = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/**
 * Saves the changed fields of a group, each through its setting's own schema (every field checked before any is
 * written, so a bad one saves nothing), with one audit row. `version` is the screen's; a newer save in between is STALE.
 */
export async function saveGroup<G extends SettingsGroup>(
  deps: MessagesDeps & { settings: MessagesDeps['settings'] & SettingsWriter },
  who: Who,
  group: G,
  input: unknown,
  version: string | undefined,
  what: { name: string; reason: string; action: string; entityType: string },
): Promise<void> {
  const shape = Object.fromEntries(Object.keys(group).map((f) => [f, z.unknown()]));
  const next = parse(z.object(shape).partial().strict(), input, what.name) as Partial<Record<keyof G, unknown>>;
  const before = await readGroup(deps, who.storeId, group);
  if (version !== undefined && version !== groupVersion(before)) throw new MessagesError('STALE', `the ${what.name} was changed by someone else; reload it`, ['version'], { version: groupVersion(before) });
  const fields = Object.keys(next) as (keyof G & string)[];
  const changed = fields.filter((f) => JSON.stringify(next[f] ?? null) !== JSON.stringify(before[f] ?? null));
  const bad = changed.flatMap((f) => {
    const r = (registry[group[f]!].schema as z.ZodType).safeParse(next[f]);
    return r.success ? [] : r.error.issues.map((i) => `${f}${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`);
  });
  if (bad.length) throw new MessagesError('INVALID_INPUT', `the ${what.name} is not valid`, bad);
  for (const f of changed) {
    try {
      await deps.settings.set(group[f]!, next[f] as never, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: what.reason });
    } catch (e) {
      const details = (e as { details?: string[] }).details ?? [];
      throw new MessagesError('INVALID_INPUT', `the ${f} is not valid`, details.length ? details.map((d) => `${f}: ${d}`) : [f]);
    }
  }
  if (changed.length) {
    const after = await readGroup(deps, who.storeId, group);
    const pick = (c: GroupValues<G>) => Object.fromEntries(changed.map((f) => [f, c[f]]));
    await logChange(deps.db, who, { action: what.action, entityType: what.entityType, entityId: String(who.storeId), before: pick(before), after: pick(after) });
  }
}

/** The settings the channels screen edits. */
export const CHANNEL_SETTINGS = {
  enabled: 'messages.enabled',
  caps: 'messages.caps',
  quietHours: 'messages.quietHours',
  masking: 'messages.sms.masking',
  smsRates: 'messages.sms.rates',
} as const satisfies SettingsGroup;
export type ChannelsConfig = GroupValues<typeof CHANNEL_SETTINGS>;

export interface ChannelWeek {
  sent: number;
  delivered: number;
  failed: number;
  /** What the sent messages cost (the provider's price, else the owner's part price); null when none is known. */
  costMinor: number | null;
}

export interface ChannelInfo {
  channel: MessageChannel;
  /** The provider the connection layer picks now, and its mode (MOCK = "would send": nothing leaves the server). */
  provider: string | null;
  mode: string | null;
  /** The credit left with the provider (live only, when it says). */
  balance: SenderBalance | null;
  /** Why the credit could not be read (a short line), or null. */
  balanceError: string | null;
  week: ChannelWeek;
}

export interface ChannelsScreen {
  config: ChannelsConfig;
  version: string;
  channels: ChannelInfo[];
  perms: { write: boolean };
}

const DAY = 86_400_000;
const SENT = ['SENT', 'DELIVERED'];

async function weekOf(deps: MessagesDeps, storeId: number): Promise<Map<string, ChannelWeek>> {
  const since = new Date(nowOf(deps).getTime() - 7 * DAY);
  const groups = await deps.db.notificationLog.groupBy({ by: ['channel', 'status'], where: { storeId, createdAt: { gte: since } }, _count: { _all: true }, _sum: { costMinor: true } });
  const out = new Map<string, ChannelWeek>();
  for (const g of groups) {
    const w = out.get(g.channel) ?? { sent: 0, delivered: 0, failed: 0, costMinor: null };
    if (SENT.includes(g.status)) {
      w.sent += g._count._all;
      if (g._sum.costMinor !== null) w.costMinor = (w.costMinor ?? 0) + g._sum.costMinor;
    }
    if (g.status === 'DELIVERED') w.delivered += g._count._all;
    if (g.status === 'FAILED') w.failed += g._count._all;
    out.set(g.channel, w);
  }
  return out;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`no answer within ${Math.round(ms / 1000)} s`)), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

export async function channelsScreen(deps: MessagesDeps, who: Who): Promise<ChannelsScreen> {
  await allow(deps, who, 'messages.channels.read');
  const [config, write, week, waitS] = await Promise.all([
    readGroup(deps, who.storeId, CHANNEL_SETTINGS),
    holds(deps, who, 'messages.channels.write'),
    weekOf(deps, who.storeId),
    deps.settings.value('system.integrationTestTimeoutSeconds'),
  ]);
  const channels = await Promise.all(
    MESSAGE_CHANNELS.map(async (channel): Promise<ChannelInfo> => {
      const w = week.get(channel) ?? { sent: 0, delivered: 0, failed: 0, costMinor: null };
      try {
        const s = await deps.sender(who.storeId, channel);
        let balance: SenderBalance | null = null;
        let balanceError: string | null = null;
        if (s.mode !== 'MOCK' && s.balance) {
          try {
            balance = await withTimeout(s.balance(), waitS * 1000);
          } catch (e) {
            balanceError = (e instanceof Error ? e.message : String(e)).slice(0, 160);
          }
        }
        return { channel, provider: s.provider, mode: s.mode, balance, balanceError, week: w };
      } catch {
        return { channel, provider: null, mode: null, balance: null, balanceError: null, week: w };
      }
    }),
  );
  return { config, version: groupVersion(config), channels, perms: { write } };
}

/** Saves the changed parts of the channels screen (`messages.channels.write`); STALE over a newer save. */
export async function saveChannels(deps: MessagesDeps & { settings: MessagesDeps['settings'] & SettingsWriter }, who: Who, input: unknown, version?: string): Promise<ChannelsScreen> {
  await allow(deps, who, 'messages.channels.write');
  await saveGroup(deps, who, CHANNEL_SETTINGS, input, version, { name: 'channels', reason: 'Messages › Channels & limits', action: 'messages.channels.save', entityType: 'MessageChannels' });
  return channelsScreen(deps, who);
}
