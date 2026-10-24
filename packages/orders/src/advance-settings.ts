// S06 · PR 542 — the "Advance request" card of Orders › Risk rules (under the Levels card): the owner's choices for the
// one-click advance request (`orders.advanceRequest`): whether a level's proposal is sent by itself (`auto`, off as it
// ships), which ways are ticked when the order's dialog opens (SMS, WhatsApp, a call) and which payment service the pay
// link uses. Read with `risk.rules.read`, saved whole with `risk.rules.write`, with the screen's version (a save in
// between is STALE) and an audit row. The template key is kept as it is (Messages › Templates owns the words).
// Saving never sends anything, moves money, or changes a COD rule, a price or a charge.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { ADVANCE_PROVIDERS, advanceRequestSchema, registry, storeTarget, type AdvanceProvider, type AdvanceRequestSettings } from '@extas/settings';
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import type { SettingsWriter } from './rule-switches';

export interface AdvanceSettingsView {
  value: AdvanceRequestSettings;
  /** What a new installation ships with (auto off). */
  byDefault: AdvanceRequestSettings;
  providers: readonly AdvanceProvider[];
  /** Whether the risk levels are switched on (without them nothing proposes an ask, so auto has nothing to send). */
  levelsOn: boolean;
  version: string;
}

const versionOf = (v: AdvanceRequestSettings): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

async function viewOf(deps: OrdersDeps, storeId: number): Promise<AdvanceSettingsView> {
  const [value, levels] = await Promise.all([setting(deps, storeId, 'orders.advanceRequest'), setting(deps, storeId, 'risk.levels')]);
  return { value, byDefault: registry['orders.advanceRequest'].default, providers: ADVANCE_PROVIDERS, levelsOn: levels.enabled, version: versionOf(value) };
}

/** The card's data (`risk.rules.read`). */
export async function advanceSettings(deps: OrdersDeps, who: Who): Promise<AdvanceSettingsView> {
  await allow(deps, who, 'risk.rules.read');
  return viewOf(deps, who.storeId);
}

export const saveAdvanceSettingsInput = z.object({ value: z.unknown(), version: z.string().min(1).max(64).optional() }).strict();

/** Saves the card whole (`risk.rules.write`); a stale version is refused with the fresh one. */
export async function saveAdvanceSettings(deps: OrdersDeps & { settings: OrdersDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<AdvanceSettingsView> {
  await allow(deps, who, 'risk.rules.write');
  const d = parse(saveAdvanceSettingsInput, input, 'advance');
  const value = parse(advanceRequestSchema, d.value, 'advance');
  const before = await viewOf(deps, who.storeId);
  if (d.version !== undefined && d.version !== before.version) throw new OrdersError('STALE', 'the advance request settings were changed by someone else; reload them', ['version'], { version: before.version });
  if (versionOf(value) === before.version) return before;
  try {
    await deps.settings.set('orders.advanceRequest', value, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Risk rules › Advance request' });
  } catch (e) {
    const details = (e as { details?: string[] }).details ?? [];
    throw new OrdersError('INVALID_INPUT', 'the advance request settings could not be saved', details.length ? details : ['value']);
  }
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'orders.advanceRequest.save', entityType: 'AdvanceRequestSettings', entityId: String(who.storeId), before: before.value, after: value }, { source: 'admin-api', ...who.ctx });
  return viewOf(deps, who.storeId);
}
