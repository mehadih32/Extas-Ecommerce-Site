// S05 · PR 141 (and follow-up 180) — the order page's buttons without a database: a button exists only for a command the order service
// says is open now AND the person's keys allow (a role without orders.cancel gets no Cancel); a paid order's cancel
// says it records a refund REQUEST and nothing more; the dialog sends exactly the fields, the note an "Other" reason
// needs and the order's version; a refusal is a stable code with its own words, and a lost connection never throws.
import { describe, expect, it, vi } from 'vitest';
import type * as od from '@extas/orders';
import { ORDER_COMMANDS, type OrderCommand } from '@extas/orders/pure';
import bn from '../../../messages/admin-orders.bn.json';
import en from '../../../messages/admin-orders.en.json';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t, type Dict } from '../i18n';
import { COMMAND_PATHS, KNOWN_ERRORS, commandUrl, errorKey, newKey, refundRequestsOf, send } from './commands';
import { editBody } from '../orders-api';
import { COMMAND_PERM, DO_PERM, commandSpecs, deliveryCheckSpecs, editSummary, returnReasonSpecs, reviewSpecs, twoSizeSpecs, twoSizeSummary, type EditStart } from './detail';
import { flagChips } from './list';
import { invoiceHref } from './model';
import { bodyOf, missingOf, noteNeeded, startOf, type CommandSpec } from './spec';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ID = '01a16af2-30f0-7462-aab8-719bb3ce51b1';
const reasons: od.ReasonLists = {
  cancel: [
    { key: 'OUT_OF_STOCK', en: 'Out of stock', bn: 'স্টক নেই', noteRequired: false },
    { key: 'OTHER', en: 'Other', bn: 'অন্য', noteRequired: true },
  ],
  hold: [{ key: 'call-back', en: 'Call back', bn: 'পরে কল', noteRequired: false }],
  customerCancel: [],
  flags: [{ key: 'vip', en: 'VIP', bn: 'ভিআইপি' }],
  edit: [
    { key: 'customer-asked', en: 'Customer asked', bn: 'কাস্টমার চেয়েছে', noteRequired: false },
    { key: 'wrong-phone', en: 'Wrong phone', bn: 'ভুল ফোন', noteRequired: false },
    { key: 'other', en: 'Other', bn: 'অন্য', noteRequired: true },
  ],
  channels: [{ key: 'phone-call', en: 'Phone call', bn: 'ফোন কল' }],
  refusal: [],
};
const order = (over: Partial<Parameters<typeof commandSpecs>[1]> = {}): Parameters<typeof commandSpecs>[1] => ({
  id: ID,
  number: 'EX-1001',
  version: 3,
  status: 'PLACED',
  holdFromStatus: null,
  cancelRequested: false,
  cancelPending: false,
  booked: false,
  internalFlags: [],
  paidMinor: 0,
  currency: 'BDT',
  ...over,
});
const OWNER = new Set<string>([...Object.values(COMMAND_PERM), 'orders.read']);
const ids = (r: ReturnType<typeof commandSpecs>) => [...r.primary, ...r.more, ...r.courier, ...r.request].map((s) => s.id);

describe('which buttons an order shows', () => {
  const open: OrderCommand[] = ['confirm', 'hold', 'cancel', 'setFlags'];

  it('the owner: Confirm first, then Hold, Cancel and Flags in "More", each with its route and the order version', () => {
    const r = commandSpecs(view('en'), order(), open, OWNER, reasons);
    expect(r.primary.map((s) => s.id)).toEqual(['confirm']);
    expect(r.more.map((s) => s.id)).toEqual(['hold', 'cancel', 'flags']);
    for (const s of [...r.primary, ...r.more]) expect(s.version).toBe(3);
    expect(r.primary[0]!.url).toBe(`/api/admin/orders/${ID}/confirm`);
  });

  it('a role without orders.cancel gets no Cancel (and the deep link ?do=cancel needs that key)', () => {
    const noCancel = new Set([...OWNER].filter((k) => k !== 'orders.cancel'));
    expect(ids(commandSpecs(view('en'), order(), open, noCancel, reasons))).not.toContain('cancel');
    expect(DO_PERM.cancel).toBe('orders.cancel');
    expect(ids(commandSpecs(view('en'), order(), open, new Set(['orders.read']), reasons))).toEqual([]);
  });

  it('only what the order service says is open now: a held order shows Release, not Confirm', () => {
    const r = commandSpecs(view('en'), order({ status: 'ON_HOLD', holdFromStatus: 'PLACED' }), ['release', 'cancel'], OWNER, reasons);
    expect(ids(r)).toEqual(['release', 'cancel']);
    expect(r.primary[0]!.effects.join(' ')).toContain(t(adminDicts.en, 'orders.st.PLACED'));
  });

  it("a customer's cancel request: approve or refuse it, and no plain Cancel beside it", () => {
    const r = commandSpecs(view('en'), order({ cancelRequested: true }), ['confirm', 'cancel', 'refuseCancelRequest'], OWNER, reasons);
    expect(r.request.map((s) => s.id)).toEqual(['approveRequest', 'refuseRequest']);
    expect(r.more.map((s) => s.id)).not.toContain('cancel');
  });

  it("the courier's answer to a cancel after booking: yes or no, with who said it", () => {
    const r = commandSpecs(view('en'), order({ booked: true, cancelPending: true }), ['courierCancelConfirmed', 'courierCancelRefused'], OWNER, reasons);
    expect(r.courier.map((s) => [s.id, s.fixed?.answer])).toEqual([
      ['courierYes', 'confirmed'],
      ['courierNo', 'refused'],
    ]);
    expect(r.courier[0]!.fields.map((f) => f.name)).toEqual(['courierPerson', 'courierRef', 'note']);
  });

  it("a paid order's cancel says it records a refund request for the amount, nothing more; an unpaid one does not", () => {
    const paid = commandSpecs(view('en'), order({ paidMinor: 150000 }), open, OWNER, reasons).more.find((s) => s.id === 'cancel')!;
    const line = paid.effects.find((e) => e.includes('1,500'));
    expect(line).toBeTruthy();
    const unpaid = commandSpecs(view('en'), order(), open, OWNER, reasons).more.find((s) => s.id === 'cancel')!;
    expect(unpaid.effects).toHaveLength(paid.effects.length - 1);
    expect(paid.doneRefund).toContain('{n}');
  });

  it('every spec id has its words in both languages, and a deep-link key', () => {
    const all = commandSpecs(view('en'), order({ cancelRequested: true, booked: true }), [...ORDER_COMMANDS], OWNER, reasons);
    const every = [...all.primary, ...all.more, ...all.courier, ...all.request];
    expect(every.length).toBeGreaterThanOrEqual(8);
    for (const s of every) {
      expect(DO_PERM[s.id], s.id).toBeTruthy();
      for (const part of ['label', 'title', 'ok', 'done']) {
        for (const d of [en, bn] as Dict[]) expect(t(d, `orders.cmd.${s.id}.${part}`), `${s.id}.${part}`).not.toBe(`orders.cmd.${s.id}.${part}`);
      }
    }
  });

  it('follow-up 180: the staff "Get invoice" opens the order\'s invoice page, its number made safe for an address', () => {
    expect(invoiceHref('EX-1001')).toBe('/account/orders/EX-1001/invoice');
    expect(invoiceHref('EX 1/2')).toBe('/account/orders/EX%201%2F2/invoice');
    for (const d of [en, bn] as Dict[]) expect(t(d, 'orders.detail.invoice')).not.toBe('orders.detail.invoice');
  });

  it('duplicate review: each decision needs its own key; decline needs the cancel key', () => {
    expect(reviewSpecs(view('en'), ID, 'EX-1', [], new Set(['orders.read']), reasons, null)).toEqual([]);
    const some = reviewSpecs(view('en'), ID, 'EX-1', [{ id: ID, number: 'EX-2' }], new Set(['orders.risk.decide']), reasons, null);
    expect(some.map((s) => s.fixed?.decision)).toEqual(['approve', 'ask']);
    const all = reviewSpecs(view('bn'), ID, 'EX-1', [{ id: ID, number: 'EX-2' }], new Set(['orders.risk.decide', 'orders.hold', 'orders.merge', 'orders.cancel']), reasons, null);
    expect(all.map((s) => s.fixed?.decision)).toEqual(['approve', 'hold', 'ask', 'merge', 'decline']);
  });

  it('PR 525 · a delivery check: three answers behind their own key, each to the check route, with words in both languages', () => {
    expect(deliveryCheckSpecs(view('en'), ID, 'EX-1', new Set(['orders.read', 'delivery.parcels']), reasons, null)).toEqual([]);
    for (const lang of ['en', 'bn'] as const) {
      const specs = deliveryCheckSpecs(view(lang), ID, 'EX-1', new Set(['delivery.outcomes']), reasons, '৳60'); // hardcode-ok: a made-up test amount
      expect(specs.map((s) => s.fixed?.outcome)).toEqual(['DELIVERED', 'CHARGE_PAID_RETURN', 'RETURNED']);
      for (const s of specs) {
        expect(s.url).toBe(`/api/admin/delivery/checks/${ID}/resolve`);
        expect(s.version).toBeNull();
        for (const w of [s.label, s.title, s.ok, s.done, ...s.effects]) expect(w, `${lang} ${s.id}`).not.toMatch(/orders\.check\./);
      }
      expect(specs[0]!.fields.map((f) => f.name)).toEqual(['note']);
      expect(specs[1]!.fields.map((f) => f.name)).toEqual(['refusalKey', 'note']);
      expect(specs[1]!.fields[0]!.options![0]!.value).toBe(''); // no reason picked unless a person picks one
      expect(specs[1]!.effects.join(' ')).toContain('৳60');
    }
  });

  it("PR 526 · why it came back: behind its own key, the owner's reasons to pick from, the rider's note to start from", () => {
    const back = { ...reasons, refusal: [{ key: 'did-not-like', en: "Didn't like it", bn: 'পছন্দ হয়নি', noteRequired: false }, { key: 'other', en: 'Other', bn: 'অন্য', noteRequired: true }] };
    expect(returnReasonSpecs(view('en'), ID, 'EX-1', new Set(['delivery.parcels']), back, null)).toEqual([]);
    expect(returnReasonSpecs(view('en'), ID, 'EX-1', new Set(['delivery.outcomes']), reasons, null)).toEqual([]); // no list, no button
    for (const lang of ['en', 'bn'] as const) {
      const [s, ...rest] = returnReasonSpecs(view(lang), ID, 'EX-1', new Set(['delivery.outcomes']), back, 'refused at the door');
      expect(rest).toEqual([]);
      expect(s).toMatchObject({ id: 'return-reason', url: `/api/admin/delivery/parcels/${ID}/return-reason`, version: null });
      expect(s!.fields[0]).toMatchObject({ name: 'reasonKey', required: true, options: [{ value: '' }, { value: 'did-not-like', label: lang === 'en' ? "Didn't like it" : 'পছন্দ হয়নি' }, { value: 'other', noteRequired: true }] });
      expect(s!.fields[1]).toMatchObject({ name: 'note', noteFor: 'reasonKey', value: 'refused at the door' });
      for (const w of [s!.label, s!.title, s!.ok, s!.done, ...s!.effects]) expect(w, lang).not.toMatch(/orders\.(retReason|check)\./);
    }
  });
});

describe('what a dialog sends', () => {
  const spec = (): CommandSpec => commandSpecs(view('en'), order(), ['cancel'], OWNER, reasons).more[0]!;

  it('the reason, the trimmed note and the version; an empty note is left out', () => {
    const s = spec();
    expect(bodyOf(s, { reasonCode: 'OUT_OF_STOCK', note: '  ' })).toEqual({ reasonCode: 'OUT_OF_STOCK', version: 3 });
    expect(bodyOf(s, { reasonCode: 'OUT_OF_STOCK', note: ' late ' })).toEqual({ reasonCode: 'OUT_OF_STOCK', note: 'late', version: 3 });
    expect(startOf(s.fields[0]!)).toBe('OUT_OF_STOCK');
  });

  it('"Other" needs the note before it can be sent', () => {
    const s = spec();
    const noteField = s.fields.find((f) => f.name === 'note')!;
    expect(noteNeeded(s, { reasonCode: 'OUT_OF_STOCK' }, noteField)).toBe(false);
    expect(noteNeeded(s, { reasonCode: 'OTHER' }, noteField)).toBe(true);
    expect(missingOf(s, { reasonCode: 'OTHER', note: '' })).toEqual(['note']);
    expect(missingOf(s, { reasonCode: 'OTHER', note: 'asked twice' })).toEqual([]);
  });

  it('fixed values (the courier answer) go with it; a note-only spec sends no version', () => {
    const yes = commandSpecs(view('en'), order({ booked: true }), ['courierCancelConfirmed'], OWNER, reasons).courier[0]!;
    expect(bodyOf(yes, {})).toEqual({ answer: 'confirmed', version: 3 });
    expect(bodyOf({ ...yes, version: null, fixed: undefined }, {})).toEqual({});
  });
});

describe('sending a command', () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

  it('POSTs with the idempotency key and gives back the answer', async () => {
    const f = reply(200, { ok: true, result: { refundRequestIds: ['a', 'b'] } });
    const a = await send(commandUrl(ID, 'cancel'), { version: 3 }, 'key-1', f as unknown as typeof fetch);
    expect(a.ok).toBe(true);
    expect(refundRequestsOf(a)).toBe(2);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/admin/orders/${ID}/cancel`);
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('key-1');
    expect(JSON.parse(String(init.body))).toEqual({ version: 3 });
  });

  it('a refusal is its stable code; a lost connection is "network" and never throws', async () => {
    const stale = await send('/x', {}, 'k', reply(409, { ok: false, error: 'STALE' }) as unknown as typeof fetch);
    expect(stale).toEqual({ ok: false, code: 'STALE', status: 409 });
    const lost = await send('/x', {}, 'k', vi.fn(async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch);
    expect(lost).toEqual({ ok: false, code: 'network', status: 0 });
    expect(refundRequestsOf(lost)).toBe(0);
  });

  it('every known refusal and every timeline event has words in both languages; an unknown code is "other"', () => {
    for (const code of KNOWN_ERRORS) for (const d of [en, bn] as Dict[]) expect(t(d, errorKey(code)), code).not.toBe(errorKey(code));
    expect(errorKey('SOMETHING_NEW')).toBe('orders.err.other');
    const events = [...ORDER_COMMANDS.map((c) => `order.${c}`), 'order.placed', 'order.duplicateCheck', 'order.duplicate.approved', 'order.duplicate.ask', 'order.merged', 'order.note', 'order.note.archived', 'order.followUp', 'order.identityLinked', 'exchange.approved', 'exchange.refused'];
    for (const e of events) {
      const k = `orders.ev.${e.replace(/\./g, '_')}`;
      for (const d of [en, bn] as Dict[]) expect(t(d, k), k).not.toBe(k);
    }
    expect(Object.keys(COMMAND_PATHS).every((c) => COMMAND_PERM[c as keyof typeof COMMAND_PERM])).toBe(true);
    expect(newKey()).not.toBe(newKey());
  });
});

describe('PR 142 · the edit dialogs (SIM-F-037)', () => {
  const LINE = '01a16af2-30f0-7462-aab8-719bb3ce51b2';
  const SIZE_L = '01a16af2-30f0-7462-aab8-719bb3ce51b3';
  const start: EditStart = {
    customerName: 'Test Customer',
    phone: '+8801710000071',
    address: 'House 4, Road 5, Dhanmondi',
    note: null,
    lines: [{ id: LINE, label: 'Oxford shirt × 1', size: 'M', colour: 'Sky' }],
    choices: [{ lineId: LINE, removeRefusal: 'LAST_LINE', swaps: [{ variantId: SIZE_L, colour: 'Sky', size: 'L' }] }],
  };
  const open: OrderCommand[] = ['confirm', 'edit'];

  it('"Edit items & address" and "Correct phone (logged)" in More, only with orders.edit and while the service has edit open', () => {
    const r = commandSpecs(view('en'), order(), open, OWNER, reasons, start);
    expect(r.more.map((s) => s.id)).toEqual(['edit', 'phone']);
    for (const s of r.more) expect(s.url).toBe(`/api/admin/orders/${ID}/edit`);
    expect(DO_PERM.edit).toBe('orders.edit');
    expect(DO_PERM.phone).toBe('orders.edit');
    const noEdit = new Set([...OWNER].filter((k) => k !== 'orders.edit'));
    expect(ids(commandSpecs(view('en'), order(), open, noEdit, reasons, start))).not.toContain('edit');
    expect(ids(commandSpecs(view('en'), order({ booked: true }), ['confirm'], OWNER, reasons, start))).not.toContain('phone');
  });

  it('the phone dialog starts from the stored number, read back; a reason is picked and "other" needs a note', () => {
    const phone = commandSpecs(view('en'), order(), open, OWNER, reasons, start).more.find((s) => s.id === 'phone')!;
    const values = Object.fromEntries(phone.fields.map((f) => [f.name, startOf(f)]));
    expect(values.phone).toBe('01710-000071');
    expect(values.reasonKey).toBe('wrong-phone');
    expect(bodyOf(phone, { ...values, phone: '01710-000072' })).toEqual({ phone: '01710-000072', reasonKey: 'wrong-phone', channel: 'phone-call', version: 3 });
    expect(missingOf(phone, { ...values, reasonKey: 'other' })).toEqual(['note']);
  });

  it("each line offers keep, the other sizes at the same price, and taking out only when the service allows it", () => {
    const edit = commandSpecs(view('en'), order(), open, OWNER, reasons, start).more.find((s) => s.id === 'edit')!;
    const line = edit.fields.find((f) => f.name === `line:${LINE}`)!;
    expect(line.options!.map((o) => o.value)).toEqual(['keep', SIZE_L]);
    expect(line.value).toBe('keep');
    expect(editBody({ reasonKey: 'customer-asked', [`line:${LINE}`]: SIZE_L, phone: '01710-000071' })).toEqual({ reasonKey: 'customer-asked', phone: '01710-000071', lines: [{ lineId: LINE, variantId: SIZE_L }] });
    expect(editBody({ reasonKey: 'customer-asked', [`line:${LINE}`]: 'keep' })).toEqual({ reasonKey: 'customer-asked' });
    expect(editBody({ [`line:${LINE}`]: 'remove' })).toEqual({ lines: [{ lineId: LINE, remove: true }] });
    expect(() => editBody({ [`line:${LINE}`]: 'nonsense' })).toThrow();
  });

  it('the timeline says what changed, before → after, in both languages', () => {
    const data = { fields: [{ field: 'phone', before: '+8801710000071', after: '+8801710000072' }], lines: [{ kind: 'size', label: 'Oxford · Sky · M', toLabel: 'Oxford · Sky · L' }], channel: { en: 'Phone call', bn: 'ফোন কল' } };
    expect(editSummary(view('en'), data)).toBe('Phone: 01710-000071 → 01710-000072 · Oxford · Sky · M → Oxford · Sky · L · via Phone call');
    expect(editSummary(view('bn'), data)).toContain('ফোন কল');
    expect(editSummary(view('en'), {})).toBeNull();
  });
});

describe('PR 146 · the two-size band (SIM-F-036)', () => {
  const S = '01a16af2-30f0-7462-aab8-719bb3ce51c1';
  const M = '01a16af2-30f0-7462-aab8-719bb3ce51c2';
  const g: od.TwoSizeGroup = { key: 'p|c|s+m', product: 'Oxford shirt', colour: 'Sky', sizes: [{ sizeId: S, label: 'S', lineIds: ['a'] }, { sizeId: M, label: 'M', lineIds: ['b'] }] };
  const o = { id: ID, number: 'EX-1001', version: 4 };

  it('keep all, only S, only M: each sends the question and the size with the version; a paid order says it is only a refund REQUEST', () => {
    const specs = twoSizeSpecs(view('en'), o, g, 0, true);
    expect(specs.map((s) => s.label)).toEqual(['Keep all', 'Only S', 'Only M']);
    for (const s of specs) expect(s.url).toBe(`/api/admin/orders/${ID}/two-size`);
    expect(bodyOf(specs[2]!, { note: '' })).toEqual({ key: 'p|c|s+m', keep: M, version: 4 });
    expect(bodyOf(specs[0]!, { note: 'both' })).toEqual({ key: 'p|c|s+m', keep: 'all', note: 'both', version: 4 });
    expect(specs[2]!.effects.join(' ')).toContain('S is taken out');
    expect(specs[2]!.effects.join(' ')).toContain(t(adminDicts.en, 'orders.eff.editPaid'));
    expect(twoSizeSpecs(view('en'), o, g, 0, false)[2]!.effects.join(' ')).not.toContain(t(adminDicts.en, 'orders.eff.editPaid'));
    expect(COMMAND_PERM.twoSize).toBe('orders.edit');
    expect(twoSizeSpecs(view('bn'), o, g, 0, false)[1]!.label).toBe('শুধু S');
  });

  it('the flags say "2 sizes — check" or, for a family, "2 sizes — for someone else"; the timeline says what was asked and kept', () => {
    const row = { status: 'PLACED', cancelRequested: false, inReview: false, holdReasonCode: null, customerWantsChange: false, orderGroupId: null, internalFlags: [], source: 'WEBSITE' } as unknown as od.OrderRow;
    const labels = { holdReasons: new Map<string, string>(), flags: new Map<string, string>() };
    expect(flagChips(view('en'), { ...row, flags: ['TWO_SIZES'] }, labels).map((c) => c.label)).toEqual(['2 sizes — check']);
    expect(flagChips(view('en'), { ...row, flags: ['TWO_SIZES_OTHER'] }, labels).map((c) => c.label)).toEqual(['2 sizes — for someone else']);
    expect(twoSizeSummary(view('en'), 'order.twoSizeCheck', { asked: [], noted: [{ product: 'Oxford shirt', sizes: [{ label: 'S' }, { label: 'M' }, { label: 'L' }] }] })).toBe('for someone else (said in the bag): Oxford shirt S + M + L');
    expect(twoSizeSummary(view('en'), 'order.twoSizeAnswer', { product: 'Oxford shirt', sizes: ['S', 'M'], keep: 'M', applied: true, via: 'order-page' })).toContain('Oxford shirt S + M: keep M');
    expect(twoSizeSummary(view('en'), 'order.twoSizeAnswer', { product: 'Oxford shirt', sizes: ['S', 'M'], keep: 'M', applied: false })).toContain('offer');
  });
});
