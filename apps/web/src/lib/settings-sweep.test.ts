// PR 853 — the Settings sweep as a test (owner order 15 Nov 2026: the real admin equals prototype v5). `tools/settings-sweep/sweep.mjs`
// reads every English/Bengali pair of the prototype's Settings (docs/demo/admin-proto-v5/js/m-settings.js) and looks for each fixed
// piece of text in the real admin (the messages files and the screens' source). The prototype also has sample data, toasts and
// windows that the real screens word their own way, so some pieces are honestly not there yet. This test is a ratchet: for every
// Settings page the number of prototype texts still missing may only go down. Lower a number here in the same change that brings
// the words in; never raise one. The list of what is still missing: `node tools/settings-sweep/sweep.mjs`.
import { describe, expect, it } from 'vitest';
// @ts-expect-error the sweep is a plain script (no types)
import { pairs, pieces, run } from '../../../../tools/settings-sweep/sweep.mjs';

/** Prototype texts still missing in the real admin, per Settings page (the most that may be missing). */
const STILL_MISSING: Record<string, number> = {
  'Frame and data': 1,
  'Store details': 24,
  Payments: 9,
  'Team & roles': 27,
  Keys: 16,
  Backups: 9,
  'Site health': 33,
  Updates: 10,
  'Activity log': 1,
  'Data & privacy': 3,
  'AI control': 3,
  'Demo products': 22,
  'Start fresh': 7,
  Telegram: 15,
  'ERP connection': 10,
  Couriers: 45,
  Security: 6,
};
const TOTAL_MAX = 241;

describe('Settings sweep against prototype v5 (PR 853)', () => {
  it('finds the prototype texts', () => {
    const p = pairs("t('Save', 'সেভ') t(`Hello ${x}`, `হ্যালো ${x}`)") as { en: string; bn: string }[];
    expect(p.map((x) => x.en)).toEqual(['Save', 'Hello ${x}']);
    expect(pieces('Hello <b>${n}</b> customers waiting')).toEqual(['hello', 'customers waiting']);
  });

  it('never has more prototype texts missing than before, on any page', () => {
    const r = run() as { total: number; missing: { area: string }[] };
    expect(r.total).toBeGreaterThan(700);
    const by: Record<string, number> = {};
    for (const m of r.missing) by[m.area] = (by[m.area] ?? 0) + 1;
    for (const [area, n] of Object.entries(by)) expect(n, `${area}: ${n} prototype texts missing, at most ${STILL_MISSING[area] ?? 0} allowed`).toBeLessThanOrEqual(STILL_MISSING[area] ?? 0);
    expect(r.missing.length).toBeLessThanOrEqual(TOTAL_MAX);
  }, 60_000);

  it('has every word of the pages this lane finished (ERP connection head and cards, Backups guide, Roles default, Privacy export)', () => {
    const r = run() as { missing: { en: string }[] };
    const gone = ['Sync stock now', 'Import products', 'Change ERP connection', 'Restore guide (Bengali + English)', 'Back to default', 'Everything (one ZIP)', 'Save or undo the changes first', 'Who can sign in, which role they have, and exactly which pages each role can open.'];
    for (const w of gone) expect(r.missing.some((m) => m.en.includes(w)), w).toBe(false);
  }, 60_000);
});
