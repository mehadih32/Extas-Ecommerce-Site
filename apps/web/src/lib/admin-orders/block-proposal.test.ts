// S06 · PR 523 — the blocklist proposal on the admin screens without a database: the list chip shows while the number is
// proposed and not listed; the order page's "Block the number" and "Not now" exist only for `risk.block`, send only the
// decision and the reason to the proposal (the server checks it again), and say the order is never cancelled or held;
// the Blocklist card shows each proposal's counts, its order and "What we know" in the admin's language. Made-up values.
import { describe, expect, it } from 'vitest';
import type * as od from '@extas/orders';
import { BLOCK_PROPOSED_FLAG, BLOCKLIST_FLAG } from '@extas/orders';
import bn from '../../../messages/admin-orders.bn.json';
import en from '../../../messages/admin-orders.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { blocklistCardScreen, blocklistCardTexts } from './blocklist-card';
import { proposalSpecs } from './detail';
import { flagChips } from './list';
import { bodyOf } from './spec';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const PID = '01a16af2-30f0-7462-aab8-719bb3ce5233';
const OID = '01a16af2-30f0-7462-aab8-719bb3ce5234';
const facts: od.RegisterFacts = {
  phones: ['+8801700000911'],
  names: ['Sample Person'],
  addresses: ['House 7, Road 3, Sampleganj'],
  orders: [{ number: 'EX-3001', placedAt: '2026-10-20T06:00:00.000Z', status: 'RETURNED', lines: [{ name: 'Oxford shirt', colour: 'Navy', size: 'M', qty: 2 }] }],
};
const proposal = (state: od.BlockProposalState): od.BlockProposalRow => ({
  id: PID,
  phone: '+8801700000911',
  state,
  rejections: 3,
  refused: 2,
  declined: 1,
  identity: true,
  lastOrderId: OID,
  lastOrderNumber: 'EX-3002',
  facts,
  proposedAt: '2026-10-30T06:00:00.000Z',
  decidedAt: state === 'PROPOSED' ? null : '2026-10-31T06:00:00.000Z',
  decidedBy: state === 'PROPOSED' ? null : 'Sample owner',
  decisionReason: state === 'PROPOSED' ? null : 'called, will pay first',
});

describe('PR 523 · the blocklist proposal on the admin screens', () => {
  it('the list chip shows while proposed and not listed', () => {
    const row = { status: 'PLACED', cancelRequested: false, inReview: false, holdReasonCode: null, customerWantsChange: false, orderGroupId: null, internalFlags: [], source: 'WEBSITE', flags: [BLOCK_PROPOSED_FLAG] } as unknown as od.OrderRow;
    const labels = { holdReasons: new Map<string, string>(), flags: new Map<string, string>() };
    expect(flagChips(view('en'), row, labels).map((c) => c.label)).toEqual([en.orders.flag.blockProposal]);
    expect(flagChips(view('bn'), row, labels).map((c) => c.label)).toEqual([bn.orders.flag.blockProposal]);
    expect(flagChips(view('en'), { ...row, flags: [BLOCK_PROPOSED_FLAG, BLOCKLIST_FLAG] }, labels).map((c) => c.label)).not.toContain(en.orders.flag.blockProposal);
  });

  it('"Block the number" and "Not now" only with risk.block; each sends the decision and the reason, nothing else', () => {
    expect(proposalSpecs(view('en'), PID, 'EX-3002', new Set())).toEqual([]);
    const [dismiss, block] = proposalSpecs(view('en'), PID, 'EX-3002', new Set(['risk.block']));
    expect(block).toMatchObject({ id: 'propBlock', url: `/api/admin/risk/blocklist/proposals/${PID}`, version: null, label: en.orders.cmd.propBlock.label });
    expect(dismiss).toMatchObject({ id: 'propDismiss', url: `/api/admin/risk/blocklist/proposals/${PID}`, label: en.orders.cmd.propDismiss.label });
    expect(bodyOf(block!, { reason: 'refused three parcels' })).toEqual({ decision: 'block', reason: 'refused three parcels' });
    expect(bodyOf(dismiss!, { reason: 'will pay first' })).toEqual({ decision: 'dismiss', reason: 'will pay first' });
    expect(block!.fields[0]).toMatchObject({ name: 'reason', required: true });
    for (const s of [block!, dismiss!]) expect(s.effects).toContain(en.orders.eff.propNever);
  });

  it('the Blocklist card: counts, the order, "What we know" in the admin language, and who decided', () => {
    const v = { value: { enabled: false, onOrder: 'mark', holdReasonKey: 'risk-check' }, active: [], undone: [], holdReasons: [], proposals: [proposal('PROPOSED')], decidedProposals: [proposal('DISMISSED')], reasonLimits: { min: 5, max: 500 } } as od.BlocklistView;
    const s = blocklistCardScreen(view('en'), v);
    expect(s.proposals[0]).toMatchObject({ counts: '3 rejections: 2 refused at the door, 1 cancelled', order: { number: 'EX-3002' }, identity: true, decided: null });
    expect(s.proposals[0]!.draft).toBe(s.proposals[0]!.counts);
    expect(s.proposals[0]!.facts.orders[0]).toMatchObject({ key: 'EX-3001', products: 'Oxford shirt (Navy, M) ×2' });
    expect(s.proposals[0]!.facts.orders[0]!.head).toContain('EX-3001');
    expect(s.decided[0]!.decided).toContain('Sample owner');
    expect(s.decided[0]!.decided).toContain('called, will pay first');
    const b = blocklistCardScreen(view('bn'), v);
    // Western digits in Bengali too (the owner's rule)
    expect(b.proposals[0]!.counts).toContain('3টা');
    const x = blocklistCardTexts(view('bn'));
    expect(x.propBlock).toBe(bn.orders.rr.bl.propBlock);
    expect(x.factsH).toBe(bn.orders.rr.bl.factsH);
  });

  it('every proposal word exists in English and Bengali', () => {
    for (const d of [en.orders, bn.orders]) {
      expect(d.flag.blockProposal && d.band.blockProposal && d.cmd.propBlock.label && d.cmd.propDismiss.label && d.eff.propBlock && d.dlg.propWhy && d.ev.order_blockProposal && d.ev.blockProposal).toBeTruthy();
      expect(Object.keys(d.rr.bp).sort()).toEqual(Object.keys(en.orders.rr.bp).sort());
      expect(Object.keys(d.rr.bl).sort()).toEqual(Object.keys(en.orders.rr.bl).sort());
    }
  });
});
