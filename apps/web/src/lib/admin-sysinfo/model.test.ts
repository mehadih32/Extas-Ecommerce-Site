// PR 791 — the Site health lights: honest about missing data, yellow when old, red when failed.
import { describe, expect, it } from 'vitest';
import type { RuntimeState } from '@/lib/status';
import { allGreen, lights } from './model';

const NOW = new Date('2026-11-15T12:00:00Z');
const base = (over: Partial<RuntimeState> = {}): RuntimeState =>
  ({ deploy: null, health: null, backups: { local: null, blob: null, drive: null }, smoke: null, restoreTest: null, drill: null, restore: { staging: null, production: null }, serverSetup: null, originCert: null, simulation: null, acceptance: null, erpAcceptance: null, ...over }) as RuntimeState;
const by = (ls: ReturnType<typeof lights>, id: string) => ls.find((l) => l.id === id)!;

describe('Site health lights (PR 791)', () => {
  it('says "not reported" instead of inventing green when the server wrote nothing', () => {
    const ls = lights(base(), NOW, 'dev');
    expect(ls.map((l) => l.tone)).toEqual(['off', 'off', 'off', 'off', 'off', 'off']);
    expect(allGreen(ls)).toBe(true);
  });
  it('green when fresh and clean', () => {
    const ls = lights(
      base({
        health: { at: '2026-11-15T11:30:00Z', problems: [] },
        smoke: { ok: true, at: '2026-11-15T03:00:00Z', pages: 142, failed: 0 },
        backups: { local: { result: 'ok', at: '2026-11-15T02:00:00Z' }, blob: null, drive: null },
        drill: { result: 'ok', at: '2026-11-01T00:00:00Z' },
        originCert: { daysLeft: 60 },
      }),
      NOW,
      'abc1234',
    );
    expect(ls.map((l) => l.tone)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(by(ls, 'nightly').vars.pages).toBe(142);
  });
  it('red for problems and failed checks, yellow for old ones and a certificate close to its end', () => {
    const ls = lights(
      base({
        health: { at: '2026-11-15T11:30:00Z', problems: ['disk'] },
        smoke: { ok: true, at: '2026-11-13T03:00:00Z', pages: 10, failed: 0 },
        backups: { local: { result: 'fail', at: '2026-11-15T02:00:00Z' }, blob: null, drive: null },
        originCert: { daysLeft: 5 },
      }),
      NOW,
      'abc1234',
    );
    expect(by(ls, 'up').tone).toBe('bad');
    expect(by(ls, 'nightly').tone).toBe('warn');
    expect(by(ls, 'backup').tone).toBe('bad');
    expect(by(ls, 'ssl').tone).toBe('warn');
    expect(allGreen(ls)).toBe(false);
  });
});
