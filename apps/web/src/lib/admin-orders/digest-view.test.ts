// PR 540 — the approval digest and the permission gate on the admin screens without a database: the digest's screen model
// (the one-sentence report, the figures, held and cancelled by reason, the waiting lists with their order links and the
// cut note, the gate note, Bengali with Western digits), and the proposed hold on the order screens ("Hold" and "Let it
// go" only with `orders.hold`, each asking a note; the list chip; the level line; the timeline line). Every word key
// exists in both languages. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import type * as od from '@extas/orders';
import { HOLD_PROPOSED_FLAG } from '@extas/orders';
import { t, type Dict } from '../i18n';
import obn from '../../../messages/admin-orders.bn.json';
import oen from '../../../messages/admin-orders.en.json';
import bn from '../../../messages/admin-digest.bn.json';
import en from '../../../messages/admin-digest.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { holdProposalSpecs, holdProposedLine } from './detail';
import { digestScreen, type DigestFormat } from './digest-view';
import { flagChips } from './list';
import { levelSummary } from './risk';

const OID = '01a16af2-30f0-7462-aab8-719bb3ce5240';
const wait = (n: number, over: Partial<od.DigestWaitRow> = {}): od.DigestWaitRow => ({ orderId: `${OID.slice(0, -2)}${String(n).padStart(2, '0')}`, number: `EX-50${n}`, what: null, reasonKey: null, confidence: null, at: '2026-10-31T06:00:00.000Z', ...over });

function digest(over: Partial<od.ApprovalDigest> = {}): od.ApprovalDigest {
  return {
    from: '2026-10-30T18:00:00.000Z',
    to: '2026-10-31T18:00:00.000Z',
    placed: 50,
    movedOn: 30,
    toConfirm: 4,
    awaitingAdvance: 2,
    held: [
      { key: 'call', count: 3 },
      { key: 'risk-check', count: 2 },
    ],
    cancelled: [{ key: 'CUSTOMER_REQUEST', count: 1 }],
    running: 10,
    duplicates: 8,
    gate: true,
    holds: { rows: [wait(1, { what: 'duplicateHold', reasonKey: 'call' }), wait(2, { what: 'levelHold', reasonKey: 'risk-check' })], total: 5 },
    reviews: { rows: [wait(3, { what: 'HOLD', confidence: 90 })], total: 1 },
    bundles: { rows: [], total: 0 },
    blockProposals: 2,
    ...over,
  };
}

function fmt(lang: 'en' | 'bn'): DigestFormat {
  const d = { ...adminDicts[lang], ...((lang === 'bn' ? bn : en) as unknown as Dict) };
  return {
    w: (k, vars) => t(d, `dg.${k}`, vars),
    num: (n) => new Intl.NumberFormat(lang, { numberingSystem: 'latn' }).format(n),
    pct: (x) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' }).format(x),
    when: (iso) => iso.slice(0, 10),
    day: '31 Oct 2026',
    holdReason: (k) => (k === 'call' ? 'Call first' : k === 'risk-check' ? 'Risk check' : k),
    cancelReason: (c) => (c === 'CUSTOMER_REQUEST' ? 'Customer asked' : c),
  };
}
const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });

describe('PR 540 · the approval digest screen', () => {
  it('the one-sentence report, the figures, held and cancelled by reason', () => {
    const s = digestScreen(digest(), fmt('en'));
    expect(s.headline).toBe(
      'Orders on 31 Oct 2026: 50; 30 confirmed and moved on; 4 still to confirm; 5 held (Call first: 3, Risk check: 2); 1 cancelled; 10 had another order running, 8 of those look like duplicates.',
    );
    expect(s.kpis.map((k) => [k.id, k.value])).toEqual([
      ['placed', '50'],
      ['movedOn', '30'],
      ['toConfirm', '4'],
      ['held', '5'],
      ['running', '10'],
    ]);
    expect(s.kpis[1]!.foot).toBe('60% of the day\'s orders');
    expect(s.kpis[2]!.foot).toBe('2 more wait for an advance');
    expect(s.held).toEqual([
      { name: 'Call first', count: '3' },
      { name: 'Risk check', count: '2' },
    ]);
    expect(s.cancelled).toEqual([{ name: 'Customer asked', count: '1' }]);
    expect(s.gateNote).toBe(en.dg.gate.on);
    expect(s.blocks).toBe('2 numbers proposed for the blocklist wait in Risk rules.');
  });

  it('the waiting lists link each order, name the rule and the reason, and say when they are cut', () => {
    const s = digestScreen(digest(), fmt('en'));
    const [holds, reviews, bundles] = s.waits;
    expect(holds).toMatchObject({ id: 'holds', count: '5', more: 'Showing 2 of 5. Raise the most rows in the card below to see more.' });
    expect(holds!.rows[0]).toMatchObject({ number: 'EX-501', href: `/admin/orders/${holds!.rows[0]!.key}`, cells: ['Duplicate check', 'Call first', '2026-10-31'] });
    expect(holds!.cols).toEqual(['Order', 'Rule', 'Hold reason', 'When']);
    expect(reviews!.rows[0]!.cells).toEqual(['Hold', '90% sure', '2026-10-31']);
    expect(reviews!.more).toBeNull();
    expect(bundles).toMatchObject({ rows: [], count: '0', more: null });
  });

  it('a quiet day, the gate off, no blocklist proposal; Bengali with Western digits', () => {
    const quiet = digestScreen(digest({ placed: 0, movedOn: 0, toConfirm: 0, held: [], cancelled: [], running: 0, duplicates: 0, gate: false, blockProposals: 0 }), fmt('en'));
    expect(quiet.headline).toBe('No orders on 31 Oct 2026.');
    expect(quiet.kpis[1]!.foot).toBe('—');
    expect(quiet.gateNote).toBe(en.dg.gate.off);
    expect(quiet.blocks).toBe(en.dg.blocks.none);
    const noReason = digestScreen(digest({ held: [{ key: '', count: 1 }] }), fmt('en'));
    expect(noReason.held[0]!.name).toBe(en.dg.noReason);
    const b = digestScreen(digest(), fmt('bn'));
    expect(b.headline.startsWith('31 Oct 2026 তারিখে 50টা অর্ডার; 30টা')).toBe(true);
    expect(b.headline.endsWith('।')).toBe(true);
    expect(b.waits[0]!.cols[0]).toBe(bn.dg.col.order);
  });

  it('every word exists in English and Bengali', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    for (const d of [oen.orders, obn.orders]) {
      expect(d.flag.holdProposed && d.band.holdProposed && d.cmd.propHold.label && d.cmd.propLetGo.label && d.eff.propHold && d.eff.propLetGo && d.eff.propNoCancel && d.dlg.propNote && d.ev.order_holdProposed && d.ev.order_holdProposalDecided && d.ev.holdProposed && d.risk.level.GATED).toBeTruthy();
      expect(Object.keys(d.ev.gateRule).sort()).toEqual(['blocklistHold', 'duplicateHold', 'levelHold']);
    }
  });
});

describe('PR 540 · the proposed hold on the order screens', () => {
  it('"Hold" and "Let it go" only with orders.hold, each asking a note; nothing cancels', () => {
    expect(holdProposalSpecs(view('en'), OID, 'EX-501', new Set(['orders.read']))).toEqual([]);
    const specs = holdProposalSpecs(view('en'), OID, 'EX-501', new Set(['orders.read', 'orders.hold']));
    expect(specs.map((s) => [s.id, s.fixed])).toEqual([
      ['propLetGo', { decision: 'dismiss' }],
      ['propHold', { decision: 'hold' }],
    ]);
    for (const s of specs) {
      expect(s.url).toBe(`/api/admin/risk/hold-proposals/${OID}`);
      expect(s.fields).toEqual([expect.objectContaining({ name: 'note', required: true, maxLength: 500 })]);
      expect(s.effects).toContain(oen.orders.eff.propNoCancel);
    }
    expect(holdProposalSpecs(view('bn'), OID, 'EX-501', new Set(['orders.hold']))[1]!.label).toBe(obn.orders.cmd.propHold.label);
  });

  it('the list chip, the level line and the timeline line in both languages', () => {
    const r = { status: 'PLACED', cancelRequested: false, inReview: false, holdReasonCode: null, customerWantsChange: false, orderGroupId: null, internalFlags: [], source: 'WEBSITE', flags: [HOLD_PROPOSED_FLAG] } as unknown as od.OrderRow;
    const labels = { holdReasons: new Map<string, string>(), flags: new Map<string, string>() };
    expect(flagChips(view('en'), r, labels)).toEqual([{ label: oen.orders.flag.holdProposed, tone: 'warn' }]);
    for (const status of ['ON_HOLD', 'IN_TRANSIT'] as const) expect(flagChips(view('en'), { ...r, status } as od.OrderRow, labels).some((c) => c.label === oen.orders.flag.holdProposed), status).toBe(false);
    expect(flagChips(view('bn'), r, labels)[0]!.label).toBe(obn.orders.flag.holdProposed);
    expect(levelSummary(view('en'), { band: 'high', watch: false, hold: 'GATED', call: false, ask: 'none' }, [{ key: 'high', en: 'High', bn: 'বেশি' }])).toContain(oen.orders.risk.level.GATED);
    const names = new Map([['call', 'Call first']]);
    expect(holdProposedLine(view('en'), { rule: 'duplicateHold', reasonKey: 'call' }, names)).toBe('The duplicate check wanted to hold it: Call first');
    expect(holdProposedLine(view('bn'), { rule: 'levelHold', reasonKey: 'x' }, names)).toContain('x');
    expect(holdProposedLine(view('en'), { rule: 'other', reasonKey: 'call' }, names)).toBeNull();
  });
});
