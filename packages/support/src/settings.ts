// PR 425 — the cards of Support → Support settings: the inbox (`support.inbox`) and files in a conversation
// (`support.attachments`). Read with `support.read`, saved one card at a time with `support.settings`, with the card's
// version (a save in between is STALE) and an audit row. Customer numbers follow `customers.phoneMask` (PR 284).
// PR 426: two more cards, the channels' reply window (`support.channels`) and the site's live chat (`support.liveChat`).
// CN-020 (3): one more, "Call me" at checkout (`checkout.callMe`), whose call-backs land in this inbox.
import { createHash } from 'node:crypto';
import { callMeSchema, registry, storeTarget, supportAttachmentsSchema, supportChannelsSchema, supportInboxSchema, supportLiveChatSchema, type Key, type Value } from '@extas/settings';
import { z } from 'zod';
import { allow, logChange, parse, setting, SupportError, type SettingsWriter, type SupportDeps, type Who } from './context';

/** The keys Support settings edits, each one card. */
export const SUPPORT_SETTING_KEYS = ['support.inbox', 'support.attachments', 'support.channels', 'support.liveChat', 'checkout.callMe'] as const satisfies readonly Key[];
export type SupportSettingKey = (typeof SUPPORT_SETTING_KEYS)[number];

const SCHEMAS = {
  'support.inbox': supportInboxSchema,
  'support.attachments': supportAttachmentsSchema,
  'support.channels': supportChannelsSchema,
  'support.liveChat': supportLiveChatSchema,
  // CN-020 (3): "Call me" at checkout — its call-backs land in this inbox
  'checkout.callMe': callMeSchema,
} as const satisfies Record<SupportSettingKey, z.ZodType>;

export interface SupportSettingCard<K extends SupportSettingKey = SupportSettingKey> {
  key: K;
  value: Value<K>;
  /** What a new installation ships with. */
  byDefault: Value<K>;
  version: string;
}

export type SupportSettingsView = { [K in SupportSettingKey]: SupportSettingCard<K> };

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

async function card<K extends SupportSettingKey>(deps: Pick<SupportDeps, 'settings'>, storeId: number, key: K): Promise<SupportSettingCard<K>> {
  const value = await setting(deps, storeId, key);
  return { key, value, byDefault: registry[key].default as Value<K>, version: versionOf(value) };
}

async function viewOf(deps: Pick<SupportDeps, 'settings'>, storeId: number): Promise<SupportSettingsView> {
  const [a, b, c, d, e] = await Promise.all([
    card(deps, storeId, 'support.inbox'),
    card(deps, storeId, 'support.attachments'),
    card(deps, storeId, 'support.channels'),
    card(deps, storeId, 'support.liveChat'),
    card(deps, storeId, 'checkout.callMe'),
  ]);
  return { 'support.inbox': a, 'support.attachments': b, 'support.channels': c, 'support.liveChat': d, 'checkout.callMe': e };
}

/** Every card's data (`support.read`). */
export async function supportSettingsView(deps: Pick<SupportDeps, 'db' | 'settings'>, who: Who): Promise<SupportSettingsView> {
  await allow(deps, who, 'support.read');
  return viewOf(deps, who.storeId);
}

export const saveSupportSettingInput = z.object({ key: z.enum(SUPPORT_SETTING_KEYS), value: z.unknown(), version: z.string().min(1).max(64).optional() }).strict();

/** Saves one card whole (`support.settings`); a stale version is refused with the fresh one. */
export async function saveSupportSetting(deps: Pick<SupportDeps, 'db'> & { settings: SupportDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<SupportSettingsView> {
  await allow(deps, who, 'support.settings');
  const d = parse(saveSupportSettingInput, input, 'support setting');
  const key = d.key;
  const value = parse(SCHEMAS[key], d.value, 'support setting') as Value<typeof key>;
  const before = await card(deps, who.storeId, key);
  if (d.version !== undefined && d.version !== before.version) throw new SupportError('STALE', 'Support settings were changed by someone else; reload them', ['version'], { version: before.version });
  if (versionOf(value) === before.version) return viewOf(deps, who.storeId);
  try {
    await deps.settings.set(key, value, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Support › Support settings' });
  } catch (e) {
    const details = (e as { details?: string[] }).details ?? [];
    throw new SupportError('INVALID_INPUT', 'Support settings could not be saved', details.length ? details : ['value']);
  }
  await logChange(deps.db, who, { action: 'support.settings.save', entityType: 'Setting', entityId: key, before: before.value, after: value });
  return viewOf(deps, who.storeId);
}
