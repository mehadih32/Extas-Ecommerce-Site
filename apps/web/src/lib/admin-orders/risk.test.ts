// S06 · PR 160 — the risk card's words: every signal has its label and its "what it saw" in both admin languages, each
// row carries its weight, the band is named as it was stored, an our-fault refusal is shown as not counted (SIM-F-044),
// the card hides when the owner hides it or the order was never scored while the model is off, "Score again" needs
// `orders.risk.decide`, and the timeline line names the score, the band and every signal with its weight. PR 161: the
// level's steps and the advance it proposes, in both languages; the card no longer says "nothing is held" once levels run.
import { describe, expect, it } from 'vitest';
import { RISK_SIGNAL_KEYS } from '@extas/settings';
import type { FiredSignal, PhoneSummary, RiskPanel } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { historyLine, levelSummary, riskCardView, riskSummary, signalDetail } from './risk';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ORDER = { id: '01a16af2-30f0-7462-aab8-719bb3ce51b1', number: 'EX-1001', currency: 'BDT' };
const EMPTY: PhoneSummary = { orders: 0, delivered: 0, refused: 0, ourFault: 0, cancelled: 0, cancelsCounted: 0, returns: 0, open: 0, inTransit: 0, noAnswer: 0, firstAt: null, lastAt: null };
const ADDRESS = { delivery: true, resolved: true, placeSure: true, detail: true, area: null, lineage: [], district: null };

const fired: FiredSignal[] = [
  { key: 'refusals', weight: 30, values: { count: 2, ourFault: 1, windowDays: 0 } },
  { key: 'areaMismatch', weight: 10, values: { known: 'Dhaka', knownBn: 'ঢাকা', now: 'Bogura', nowBn: 'বগুড়া', from: 'saved', level: 'district' } },
  { key: 'orderValue', weight: 15, values: { totalMinor: 900_000, atLeastMinor: 500_000, firstOrderOnly: true } },
];

function panel(over: Partial<RiskPanel> = {}): RiskPanel {
  const at = new Date('2026-10-24T06:00:00Z');
  return {
    enabled: true,
    showOnOrder: true,
    current: { id: 'a1', score: 55, at, modelVersion: 'v1', after: 'placed', raw: 55, band: { key: 'medium', en: 'Medium', bn: 'মাঝারি', minScore: 35, tone: 'warn' }, fired, checked: [], off: [], history: EMPTY, address: ADDRESS, known: null },
    earlier: [],
    rulesChanged: false,
    canRescore: true,
    phone: { phone: '01700-000138', summary: { ...EMPTY, orders: 4, delivered: 1, refused: 2, ourFault: 1 }, recent: [] },
    level: null,
    levelsOn: false,
    ...over,
  };
}

describe('PR 160 · the risk card', () => {
  it('every signal has its label and its words in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const d = view(lang).dict;
      for (const k of RISK_SIGNAL_KEYS) {
        expect(t(d, `orders.risk.sig.${k}`), `${lang} ${k}`).not.toBe(`orders.risk.sig.${k}`);
        expect(t(d, `orders.risk.why.${k}`), `${lang} ${k}`).not.toBe(`orders.risk.why.${k}`);
      }
      for (const a of ['placed', 'edit', 'manual']) expect(t(d, `orders.risk.after.${a}`)).not.toBe(`orders.risk.after.${a}`);
      for (const k of ['label', 'title', 'ok', 'done']) expect(t(d, `orders.cmd.riskAssess.${k}`)).not.toBe(`orders.cmd.riskAssess.${k}`);
      expect(t(d, 'orders.err.RISK_OFF')).not.toBe('orders.err.RISK_OFF');
      expect(t(d, 'orders.ev.order_riskAssess')).not.toBe('orders.ev.order_riskAssess');
    }
  });

  it('the band as stored, each signal with its weight and what it saw; money as money; the place in the admin language', () => {
    const v = riskCardView(view('en'), panel(), ORDER, new Set(['orders.risk.read', 'orders.risk.decide']))!;
    expect(v.pill).toEqual({ text: 'Medium · 55', tone: 'warn' });
    expect(v.rows.map((r) => [r.key, r.weight])).toEqual([
      ['refusals', '+30'],
      ['areaMismatch', '+10'],
      ['orderValue', '+15'],
    ]);
    expect(v.rows[0]!.detail).toContain('(+1 our fault, not counted)');
    expect(v.rows[1]!.detail).toContain('Known in Dhaka, this order goes to Bogura');
    expect(v.rows[2]!.detail).toMatch(/9,000/);
    expect(v.when).toMatch(/^Scored when the order came in · /);
    expect(v.rescore).toMatchObject({ id: 'riskAssess', url: `/api/admin/orders/${ORDER.id}/risk/assess`, version: null });
    const b = riskCardView(view('bn'), panel(), ORDER, new Set(['orders.risk.read']))!;
    expect(b.pill!.text).toBe('মাঝারি · 55');
    expect(b.rows[1]!.detail).toContain('ঢাকা');
    expect(b.rescore).toBeNull();
  });

  it('hidden when the owner hides it, or never scored while the model is off; "not scored" while it is on', () => {
    expect(riskCardView(view('en'), panel({ showOnOrder: false }), ORDER, new Set())).toBeNull();
    expect(riskCardView(view('en'), panel({ enabled: false, current: null }), ORDER, new Set())).toBeNull();
    const v = riskCardView(view('en'), panel({ current: null }), ORDER, new Set())!;
    expect(v.pill).toBeNull();
    expect(v.empty).toBe(t(view('en').dict, 'orders.risk.notScored'));
    // a stored score stays visible after the owner switches the model off; no "Score again" then
    const off = riskCardView(view('en'), panel({ enabled: false, canRescore: false }), ORDER, new Set(['orders.risk.decide']))!;
    expect(off.pill).not.toBeNull();
    expect(off.rescore).toBeNull();
  });

  it('rules changed since, and the earlier scores', () => {
    const p = panel({ rulesChanged: true });
    p.earlier = [{ ...p.current!, id: 'a0', score: 10, after: 'placed', band: { key: 'low', en: 'Low', bn: 'কম', minScore: 0, tone: 'ok' } }];
    const v = riskCardView(view('en'), p, ORDER, new Set())!;
    expect(v.rulesChanged).toBeTruthy();
    expect(v.earlier!.rows[0]).toMatch(/^10 · Low · when it came in · /);
  });

  it("PR 157: the number's history in one line, our-fault refusals shown as not counted", () => {
    expect(historyLine(view('en'), EMPTY)).toBe('First order from this number');
    const line = historyLine(view('en'), { ...EMPTY, orders: 4, delivered: 1, refused: 2, ourFault: 1, cancelled: 1, noAnswer: 2 });
    expect(line).toBe('4 other orders · 1 delivered · 2 refused (+1 our fault, not counted) · 1 cancelled · 2 calls not answered');
    expect(signalDetail(view('en'), { key: 'refusals', weight: 30, values: { count: 1, ourFault: 0, windowDays: 90 } }, 'BDT')).toBe('1 refused at the door · in the last 90 days');
  });

  it('the timeline line: the score, the band and each signal with its weight', () => {
    expect(riskSummary(view('en'), { score: 40, band: { en: 'Medium', bn: 'মাঝারি' }, fired: [{ key: 'refusals', weight: 30 }, { key: 'newPhone', weight: 10 }] })).toBe('40 · Medium · Refused parcels before +30 · First order from this number +10');
    expect(riskSummary(view('en'), {})).toBeNull();
  });

  it('PR 161: the level line — its steps and the advance it proposes (a person sends it); the card says what levels may do', () => {
    const at = new Date('2026-10-24T06:05:00Z');
    const v = riskCardView(view('en'), panel({ levelsOn: true, level: { band: 'medium', watch: true, hold: 'held', call: true, ask: 'delivery', at } }), ORDER, new Set(['orders.risk.decide']))!;
    expect(v.level).toEqual({ line: 'Level Medium · held · watch mark · confirmation call in the queue', ask: 'Proposed: ask the delivery charge first', askNote: expect.stringContaining('proposal') });
    expect(v.informs).toBe(t(view('en').dict, 'orders.risk.informsLevels'));
    expect(v.rescore!.effects).toContain(t(view('en').dict, 'orders.eff.riskLevels'));
    expect(riskCardView(view('en'), panel(), ORDER, new Set())!.level).toBeNull();
    expect(riskCardView(view('en'), panel(), ORDER, new Set())!.informs).toBe(t(view('en').dict, 'orders.risk.informs'));
    const bn = riskCardView(view('bn'), panel({ levelsOn: true, level: { band: 'medium', watch: false, hold: 'NO_REASON', call: false, ask: 'none', at } }), ORDER, new Set())!;
    expect(bn.level).toEqual({ line: 'লেভেল মাঝারি · হোল্ড হয়নি: হোল্ডের কারণটা আপনার তালিকায় নেই', ask: null, askNote: null });
    for (const lang of ['en', 'bn'] as const) {
      const d = view(lang).dict;
      for (const k of ['line', 'watch', 'held', 'NO_REASON', 'NOT_HOLDABLE', 'call', 'none', 'askNote', 'ask.delivery', 'ask.partial', 'ask.full', 'ask.codOff']) expect(t(d, `orders.risk.level.${k}`), `${lang} ${k}`).not.toBe(`orders.risk.level.${k}`);
      for (const k of ['ev.order_riskLevel', 'flag.riskWatch', 'eff.riskLevels', 'risk.informsLevels', 'page.riskRules']) expect(t(d, `orders.${k}`), `${lang} ${k}`).not.toBe(`orders.${k}`);
    }
  });

  it('PR 161: the timeline line of a level names the band as the score stored it', () => {
    const bands = [{ key: 'high', en: 'High', bn: 'বেশি' }];
    expect(levelSummary(view('en'), { band: 'high', watch: true, hold: 'held', call: false, ask: 'full' }, bands)).toBe('Level High · held · watch mark · Proposed: ask the whole amount first');
    expect(levelSummary(view('bn'), { band: 'high', watch: false, hold: null, call: true, ask: 'none' }, bands)).toBe('লেভেল বেশি · কনফার্ম করার কল তালিকায়');
    expect(levelSummary(view('en'), { band: 'x', watch: false, hold: null, call: false, ask: 'none' })).toBe('Level x · no step');
    expect(levelSummary(view('en'), {})).toBeNull();
  });
});
