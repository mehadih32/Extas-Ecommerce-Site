// S18 · PR 379 (Blueprint B6.3) — the server's side of the quiet bot check: the signals a form sent (human-signals.ts)
// are scored with the settings (registry-bot-check.ts), and a score at or over `security.bot.noteScore` is written as a
// security event (kind `bot.signal`) for staff and the Site health pages. Never a refusal, never a delay, never a
// block: the caller always carries on, whatever happens here (a failed write is only logged).
import type { PrismaClient } from '@extas/db/client';
import { registry, type BotForm, type BotWeights, type Key, type Value } from '@extas/settings';
import { addressTag } from './edge-gate';

export interface BotSettings {
  mode: Value<'security.bot.mode'>;
  minFillSeconds: Value<'security.bot.minFillSeconds'>;
  weights: BotWeights;
  noteScore: number;
}

export type BotReason = keyof BotWeights;

/** The signals as the server reads them from a body (anything else counts as nothing sent). */
export function readSignals(v: unknown): { ms: number; inputs: number; auto: boolean } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(x, 86_400_000) : null);
  const ms = n(o.ms);
  const inputs = n(o.inputs);
  if (ms === null || inputs === null) return null;
  return { ms, inputs, auto: o.auto === true };
}

/** The score (0–100) and the signs that added to it. */
export function scoreSignals(form: BotForm, sent: unknown, s: BotSettings): { score: number; reasons: BotReason[] } {
  const sig = readSignals(sent);
  const reasons: BotReason[] = [];
  if (!sig) reasons.push('missing');
  else {
    if (sig.auto) reasons.push('automation');
    const min = s.minFillSeconds[form] * 1000;
    if (min > 0 && sig.ms < min) reasons.push('tooFast');
    if (sig.inputs === 0) reasons.push('noInput');
  }
  const counted = reasons.filter((r) => s.weights[r] > 0);
  return { score: Math.min(100, counted.reduce((t, r) => t + s.weights[r], 0)), reasons: counted };
}

interface Reader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** The bot check's settings (the declared defaults when one cannot be read). */
export async function botSettings(settings: Reader | null): Promise<BotSettings> {
  const read = async <K extends 'security.bot.mode' | 'security.bot.minFillSeconds' | 'security.bot.weights' | 'security.bot.noteScore'>(k: K): Promise<Value<K>> => {
    if (!settings) return registry[k].default as Value<K>;
    try {
      return await settings.value(k);
    } catch {
      return registry[k].default as Value<K>;
    }
  };
  const [mode, minFillSeconds, weights, noteScore] = await Promise.all([
    read('security.bot.mode'),
    read('security.bot.minFillSeconds'),
    read('security.bot.weights'),
    read('security.bot.noteScore'),
  ]);
  return { mode, minFillSeconds, weights, noteScore };
}

export interface BotNoteDeps {
  db: Pick<PrismaClient, 'securityEvent'>;
  settings: Reader | null;
}

/**
 * Scores one form and writes the note when the score is high enough. Returns the score (null when off). Never throws:
 * the sign-in or the order goes on whatever happens here.
 */
export async function noteBotSignals(
  deps: BotNoteDeps,
  input: { form: BotForm; sent: unknown; storeId: number | null; ip: string | null },
): Promise<{ score: number; noted: boolean } | null> {
  try {
    const s = await botSettings(deps.settings);
    if (s.mode === 'off') return null;
    const { score, reasons } = scoreSignals(input.form, input.sent, s);
    if (score < s.noteScore) return { score, noted: false };
    await deps.db.securityEvent.create({
      data: {
        storeId: input.storeId,
        kind: 'bot.signal',
        severity: 'info',
        details: { form: input.form, score, reasons, address: input.ip ? addressTag(input.ip) : null },
      },
    });
    return { score, noted: true };
  } catch (e) {
    console.warn(`bot check: not noted (${e instanceof Error ? e.message.split('\n').slice(-1)[0] : String(e)})`);
    return null;
  }
}
