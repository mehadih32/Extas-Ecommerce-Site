// S18 · PR 379 — the quiet bot check: a person's form scores low, a script's high; a high score is only a note in the
// security log (no address, a tag); off writes nothing; a failing write never stops the sign-in or the order.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { addressTag } from './edge-gate';
import { botSettings, noteBotSignals, readSignals, scoreSignals } from './bot-check';
import { humanSignals, watchHumanInput } from './human-signals';

const defaults = {
  mode: registry['security.bot.mode'].default,
  minFillSeconds: registry['security.bot.minFillSeconds'].default,
  weights: registry['security.bot.weights'].default,
  noteScore: registry['security.bot.noteScore'].default,
};

describe('scoreSignals', () => {
  it('a person: some time, some input, no automation — 0', () => {
    expect(scoreSignals('checkout', { ms: 40_000, inputs: 25, auto: false }, defaults)).toEqual({ score: 0, reasons: [] });
  });

  it('a script that sends nothing, an automated browser, a form sent in a blink', () => {
    expect(scoreSignals('signIn', undefined, defaults)).toEqual({ score: 50, reasons: ['missing'] });
    expect(scoreSignals('checkout', { ms: 300, inputs: 0, auto: true }, defaults)).toEqual({ score: 100, reasons: ['automation', 'tooFast', 'noInput'] });
    expect(scoreSignals('signIn', { ms: 1_000, inputs: 3, auto: false }, defaults)).toEqual({ score: 40, reasons: ['tooFast'] });
  });

  it('a weight of 0 or a minimum of 0 switches that sign off', () => {
    const s = { ...defaults, weights: { ...defaults.weights, automation: 0 }, minFillSeconds: { ...defaults.minFillSeconds, checkout: 0 } };
    expect(scoreSignals('checkout', { ms: 10, inputs: 4, auto: true }, s)).toEqual({ score: 0, reasons: [] });
  });

  it('reads only numbers it can trust', () => {
    expect(readSignals({ ms: '5', inputs: 1 })).toBeNull();
    expect(readSignals({ ms: -1, inputs: 1 })).toBeNull();
    expect(readSignals({ ms: 1e12, inputs: 2, auto: 'yes' })).toEqual({ ms: 86_400_000, inputs: 2, auto: false });
  });
});

describe('noteBotSignals', () => {
  const fakeDb = () => {
    const rows: { data: Record<string, unknown> }[] = [];
    return { rows, db: { securityEvent: { create: async (a: { data: Record<string, unknown> }) => (rows.push(a), a.data) } } as never };
  };

  it('writes a security event (a tag, never the address) at or over the note score; the request carries on', async () => {
    const { rows, db } = fakeDb();
    const r = await noteBotSignals({ db, settings: null }, { form: 'checkout', sent: { ms: 200, inputs: 0, auto: true }, storeId: 1, ip: '203.0.113.9' });
    expect(r).toEqual({ score: 100, noted: true });
    expect(rows[0]!.data).toEqual({
      storeId: 1,
      kind: 'bot.signal',
      severity: 'info',
      details: { form: 'checkout', score: 100, reasons: ['automation', 'tooFast', 'noInput'], address: addressTag('203.0.113.9') },
    });
    expect(JSON.stringify(rows)).not.toContain('203.0.113.9');
  });

  it('below the note score, or off, writes nothing', async () => {
    const { rows, db } = fakeDb();
    expect(await noteBotSignals({ db, settings: null }, { form: 'signIn', sent: undefined, storeId: 1, ip: null })).toEqual({ score: 50, noted: false });
    const off = { value: async (k: string) => (k === 'security.bot.mode' ? 'off' : registry[k as keyof typeof registry].default) };
    expect(await noteBotSignals({ db, settings: off as never }, { form: 'checkout', sent: { ms: 1, inputs: 0, auto: true }, storeId: 1, ip: null })).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it('a failed write never throws', async () => {
    const db = { securityEvent: { create: async () => Promise.reject(new Error('db down')) } } as never;
    await expect(noteBotSignals({ db, settings: null }, { form: 'adminSignIn', sent: { ms: 1, inputs: 0, auto: true }, storeId: null, ip: null })).resolves.toBeNull();
  });

  it('botSettings falls back to the defaults when the settings cannot be read', async () => {
    expect(await botSettings({ value: async () => Promise.reject(new Error('x')) } as never)).toEqual(defaults);
  });
});

describe('human signals (the page side)', () => {
  it('without a window it counts nothing and says so', () => {
    watchHumanInput();
    const s = humanSignals();
    expect(s).toMatchObject({ ms: 0, inputs: 0 });
  });
});
