// PR 818 (owner order 15 Nov 2026: the real admin equals prototype v5, AI Center › Costs & limits) — the three AI limits the
// prototype's Costs & limits page changes in one place: the AI's monthly ceiling (`ai.monthlyCapMinor`, null = no ceiling), the
// cost-saver mode (`ai.costSaver`) and "turn it on by itself at 80% of the ceiling" (`ai.costSaverAuto`, off as shipped). Each is a
// settings-registry key, written through the settings resolver (so it lands in the settings history with who and why). A no-op when
// the value is what it already was. Nothing here runs an agent, moves money or sends anything; the per-agent caps stay in
// `./spend-cap.ts`. Words: messages/admin-ai-limits.*.json.
import type { Actor, RequestContext } from '@extas/auth';
import { aiDigestSchema, aiKeepOnFeaturesSchema, aiOffTextSchema, INSTALLATION, type AiDigestSettings, type AiKeepOnFeaturesSettings, type AiOffTextSettings } from '@extas/settings';
import type { AppResolver } from '../settings';
import { AiError } from './errors';
import { parseCapInput } from './spend-cap';

export interface LimitsDeps {
  resolver: Pick<AppResolver, 'value' | 'set'>;
}
export interface LimitsWho {
  actor: Actor;
  ctx?: RequestContext;
}

/** The cost-saver turns on by itself once this share of the AI ceiling is spent (the same 80% the per-agent caps warn at). */
export const SAVER_AT_PCT = 80; // hardcode-ok: the warning line the whole AI Center shares (spend-cap.ts)

/** Is the month's AI spend at or past `SAVER_AT_PCT` of the ceiling? Whole-number arithmetic, never a float; no ceiling is never. */
export function atSaverLine(spentMinor: number, capMinor: number | null): boolean {
  return !!capMinor && spentMinor * 100 >= capMinor * SAVER_AT_PCT;
}

/** Month-end spend at the pace so far: spend so far spread over the days gone, times the days in the month (whole minor units). */
export function monthEndAtThisPace(spentMinor: number, dayOfMonth: number, daysInMonth: number): number {
  const day = Math.max(1, Math.min(dayOfMonth, daysInMonth));
  return Math.round((spentMinor / day) * daysInMonth);
}

/** The cost-saver's own estimate: about this share of what the rest of the month would cost at today's pace is saved (prototype v5 m-ai.js). */
export const SAVER_SAVES_PCT = 35; // hardcode-ok: an estimate shown beside the switch, not a rule that changes any money

/** "Saves about …": the part of the rest-of-month spend (at the pace so far) the cost-saver mode is expected to save, whole minor units. */
export function saverSavesMinor(spentMinor: number, dayOfMonth: number, daysInMonth: number): number {
  const day = Math.max(1, Math.min(dayOfMonth, daysInMonth));
  return Math.round(((spentMinor / day) * (daysInMonth - day) * SAVER_SAVES_PCT) / 100);
}

/** PR 935: the running total of the month's AI spend, one number per day from day 1 to `dayOfMonth` (whole minor units).
 * `ymdOf` turns a time into the store's own `YYYY-MM-DD`; a row from another month is left out; day 1 is index 0. */
export function cumulativeByDay(rows: readonly { at: Date; minor: number }[], ymdOf: (d: Date) => string, monthYm: string, dayOfMonth: number): number[] {
  const days = Math.max(1, dayOfMonth);
  const perDay = new Array<number>(days).fill(0);
  for (const r of rows) {
    const ymd = ymdOf(r.at);
    if (!ymd.startsWith(`${monthYm}-`)) continue;
    const day = Number(ymd.slice(8, 10));
    if (day >= 1 && day <= days) perDay[day - 1] = (perDay[day - 1] ?? 0) + r.minor;
  }
  let run = 0;
  return perDay.map((v) => (run += v));
}

export type LimitsInput = { aiCapMinor: number | null } | { costSaver: boolean } | { costSaverAuto: boolean } | { digest: AiDigestSettings } | { offText: AiOffTextSettings } | { keepOn: AiKeepOnFeaturesSettings };

/** Reads the one change out of a request body, or throws `INVALID_INPUT` / `INVALID_CAP`. */
export function parseLimits(input: unknown): LimitsInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new AiError(400, 'INVALID_INPUT', ['body']);
  const b = input as Record<string, unknown>;
  if ('aiCapMinor' in b) return { aiCapMinor: parseCapInput(b.aiCapMinor) };
  if (typeof b.costSaver === 'boolean') return { costSaver: b.costSaver };
  if (typeof b.costSaverAuto === 'boolean') return { costSaverAuto: b.costSaverAuto };
  if ('digest' in b) {
    const r = aiDigestSchema.safeParse(b.digest);
    if (!r.success) throw new AiError(400, 'INVALID_INPUT', ['digest']);
    return { digest: r.data };
  }
  if ('offText' in b) {
    const r = aiOffTextSchema.safeParse(b.offText);
    if (!r.success) throw new AiError(400, 'INVALID_INPUT', ['offText']);
    return { offText: r.data };
  }
  if ('keepOn' in b) {
    const r = aiKeepOnFeaturesSchema.safeParse(b.keepOn);
    if (!r.success) throw new AiError(400, 'INVALID_INPUT', ['keepOn']);
    return { keepOn: r.data };
  }
  throw new AiError(400, 'INVALID_INPUT', ['aiCapMinor|costSaver|costSaverAuto|digest|offText|keepOn']);
}

/**
 * "Turn on by itself at 80% of the AI ceiling": run whenever the Costs & limits page reads the month's spend (the same way the
 * per-agent cap warnings run). When the switch is on, the cost-saver is off and the spend is at the line, it turns the cost-saver on
 * under the settings history with that reason. It never turns the saver off again (that is the owner's). True when it just did.
 */
export async function applyAutoSaver(deps: LimitsDeps, spentMinor: number, storeId: number): Promise<boolean> {
  const [auto, saver, cap] = await Promise.all([deps.resolver.value('ai.costSaverAuto', { storeId }), deps.resolver.value('ai.costSaver', { storeId }), deps.resolver.value('ai.monthlyCapMinor', { storeId })]);
  if (!auto || saver || !atSaverLine(spentMinor, cap)) return false;
  await deps.resolver.set('ai.costSaver', true, INSTALLATION, { actorId: null, reason: `AI › Costs & limits: cost-saver switched on by itself at ${SAVER_AT_PCT}% of the AI ceiling` });
  return true;
}

export async function setAiLimits(deps: LimitsDeps, who: LimitsWho, input: unknown, storeId: number): Promise<void> {
  const change = parseLimits(input);
  const opts = { actorId: who.actor.staffUserId ?? null };
  if ('aiCapMinor' in change) {
    const now = await deps.resolver.value('ai.monthlyCapMinor', { storeId });
    if (now === change.aiCapMinor) return;
    await deps.resolver.set('ai.monthlyCapMinor', change.aiCapMinor, INSTALLATION, { ...opts, reason: 'AI › Costs & limits: monthly AI ceiling' });
    return;
  }
  if ('digest' in change) {
    await deps.resolver.set('ai.digest', change.digest, INSTALLATION, { ...opts, reason: 'AI › Approvals: daily digest' });
    return;
  }
  if ('keepOn' in change) {
    await deps.resolver.set('ai.keepOnFeatures', change.keepOn, INSTALLATION, { ...opts, reason: 'AI › AI agents: checks that keep running while AI is off' });
    return;
  }
  if ('offText' in change) {
    await deps.resolver.set('ai.offText', change.offText, INSTALLATION, { ...opts, reason: 'AI Center: text shown while AI is off' });
    return;
  }
  if ('costSaver' in change) {
    const now = await deps.resolver.value('ai.costSaver', { storeId });
    if (now === change.costSaver) return;
    await deps.resolver.set('ai.costSaver', change.costSaver, INSTALLATION, { ...opts, reason: change.costSaver ? 'AI › Costs & limits: cost-saver on' : 'AI › Costs & limits: cost-saver off' });
    return;
  }
  const now = await deps.resolver.value('ai.costSaverAuto', { storeId });
  if (now === change.costSaverAuto) return;
  await deps.resolver.set('ai.costSaverAuto', change.costSaverAuto, INSTALLATION, { ...opts, reason: change.costSaverAuto ? 'AI › Costs & limits: cost-saver by itself on' : 'AI › Costs & limits: cost-saver by itself off' });
}
