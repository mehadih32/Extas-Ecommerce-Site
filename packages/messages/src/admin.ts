// PR 148 — Messages › Order journey (MSG-01, ADMIN-ARCHITECTURE: one screen, the steps in order, rare options under
// "More options"). The screen reads every setting of the journey in one go with a version, which the save sends back
// ([ver]): a save over someone else's newer change is refused with STALE. Each channel shows whether it is live or on
// its mock, and each step whether its template exists in both languages.
import { createHash } from 'node:crypto';
import { JOURNEY_STEPS, MESSAGE_CHANNELS, registry, storeTarget, type Key, type MessageChannel, type Value } from '@extas/settings';
import { z } from 'zod';
import { allow, holds, logChange, MessagesError, parse, setting, type MessagesDeps, type SettingsWriter, type Who } from './context';

/** The settings the journey screen edits (registry-messages.ts). */
const K = {
  enabled: 'messages.enabled',
  journey: 'messages.journey',
  caps: 'messages.caps',
  selfConfirm: 'messages.selfConfirm',
  quietHours: 'messages.quietHours',
  language: 'messages.language',
  amountLine: 'messages.amountLine',
  exactAmount: 'messages.exactAmount',
} as const satisfies Record<string, Key>;
type Field = keyof typeof K;
export type JourneyConfig = { [F in Field]: Value<(typeof K)[F]> };

export interface ChannelState {
  channel: MessageChannel;
  provider: string | null;
  /** MOCK until the owner enters the provider's key (Keys & connections); null when the connection cannot be read. */
  mode: string | null;
}

export interface JourneyScreen {
  config: JourneyConfig;
  version: string;
  channels: ChannelState[];
  /** For each step's template, the languages it exists in, per channel. */
  templates: Record<string, Partial<Record<MessageChannel, string[]>>>;
  perms: { write: boolean; reply: boolean };
}

async function journeyConfig(deps: Pick<MessagesDeps, 'settings'>, storeId: number): Promise<JourneyConfig> {
  const entries = await Promise.all((Object.entries(K) as [Field, Key][]).map(async ([f, key]) => [f, await setting(deps, storeId, key)] as const));
  return Object.fromEntries(entries) as unknown as JourneyConfig;
}

const versionOf = (c: JourneyConfig): string => createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16);

export async function journeyScreen(deps: MessagesDeps, who: Who): Promise<JourneyScreen> {
  await allow(deps, who, 'messages.journey.read');
  const [config, write, reply] = await Promise.all([journeyConfig(deps, who.storeId), holds(deps, who, 'messages.journey.write'), holds(deps, who, 'messages.selfConfirm.reply')]);
  const channels = await Promise.all(
    MESSAGE_CHANNELS.map(async (channel): Promise<ChannelState> => {
      try {
        const s = await deps.sender(who.storeId, channel);
        return { channel, provider: s.provider, mode: s.mode };
      } catch {
        return { channel, provider: null, mode: null };
      }
    }),
  );
  const keys = [...new Set(JOURNEY_STEPS.map((s) => config.journey[s].template))];
  const rows = await deps.db.notificationTemplate.findMany({ where: { storeId: who.storeId, key: { in: keys }, archivedAt: null }, select: { key: true, channel: true, locale: true } });
  const templates: JourneyScreen['templates'] = {};
  for (const r of rows) {
    if (!(MESSAGE_CHANNELS as readonly string[]).includes(r.channel)) continue;
    const t = (templates[r.key] ??= {});
    (t[r.channel as MessageChannel] ??= []).push(r.locale);
  }
  for (const t of Object.values(templates)) for (const l of Object.values(t)) l.sort();
  return { config, version: versionOf(config), channels, templates, perms: { write, reply } };
}

const saveInput = z
  .object({
    enabled: z.unknown(),
    journey: z.unknown(),
    caps: z.unknown(),
    selfConfirm: z.unknown(),
    quietHours: z.unknown(),
    language: z.unknown(),
    amountLine: z.unknown(),
    exactAmount: z.unknown(),
  })
  .partial()
  .strict();

/**
 * Saves the changed parts of the journey (`messages.journey.write`), each through its setting's own schema, with one
 * audit row. `version` is the screen's; a newer save in between is refused (STALE).
 */
export async function saveJourney(deps: MessagesDeps & { settings: MessagesDeps['settings'] & SettingsWriter }, who: Who, input: unknown, version?: string): Promise<JourneyScreen> {
  await allow(deps, who, 'messages.journey.write');
  const next = parse(saveInput, input, 'journey') as Partial<Record<Field, unknown>>;
  const before = await journeyConfig(deps, who.storeId);
  if (version !== undefined && version !== versionOf(before)) throw new MessagesError('STALE', 'the journey was changed by someone else; reload it', ['version'], { version: versionOf(before) });
  const changed = (Object.keys(next) as Field[]).filter((f) => JSON.stringify(next[f] ?? null) !== JSON.stringify(before[f] ?? null));
  // every part is checked before any is written, so a bad part saves nothing
  const bad = changed.flatMap((f) => {
    const r = (registry[K[f]].schema as z.ZodType).safeParse(next[f]);
    return r.success ? [] : r.error.issues.map((i) => `${f}${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`);
  });
  if (bad.length) throw new MessagesError('INVALID_INPUT', 'the journey is not valid', bad);
  for (const f of changed) {
    try {
      await deps.settings.set(K[f], next[f] as never, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Messages › Order journey' });
    } catch (e) {
      const details = (e as { details?: string[] }).details ?? [];
      throw new MessagesError('INVALID_INPUT', `the ${f} is not valid`, details.length ? details.map((d) => `${f}: ${d}`) : [f]);
    }
  }
  if (changed.length) {
    const after = await journeyConfig(deps, who.storeId);
    const pick = (c: JourneyConfig) => Object.fromEntries(changed.map((f) => [f, c[f]]));
    await logChange(deps.db, who, { action: 'messages.journey.save', entityType: 'MessageJourney', entityId: String(who.storeId), before: pick(before), after: pick(after) });
  }
  return journeyScreen(deps, who);
}
