// PR 606 — the bulk / corporate enquiry's pure rules: the form's checks in the form's order (the phone through the one
// helper, Bengali digits in the quantity, the owner's minimum and maximum, a date from today on), and when the bag
// shows the bulk card (SIM-F-023: at the owner's number of pieces, or a line stopped at the stock in hand).
import { describe, expect, it } from 'vitest';
import { bulkCardReason, bulkQuantity, checkBulk, type BulkInput, type BulkLimits } from './bulk';

const L: BulkLimits = { nameMin: 2, textMax: 200, noteMax: 50, minQuantity: null, maxQuantity: 10_000, today: '2026-10-24', hasBagLines: false };
const OK: BulkInput = { name: 'Sabrina Test', phone: '01700006060', company: 'Test Ltd', itemsText: 'Polo with logo', quantity: '40', logo: true, neededBy: '2026-11-10' }; // hardcode-ok: a made-up test number

describe('PR 606 · the enquiry form', () => {
  it('a finished form: the phone stored as +880…, the rest trimmed', () => {
    expect(checkBulk({ ...OK, email: ' HR@Example.com ' }, L)).toEqual({
      ok: true,
      value: { name: 'Sabrina Test', phone: '+8801700006060', email: 'hr@example.com', company: 'Test Ltd', itemsText: 'Polo with logo', quantity: 40, logo: true, neededBy: '2026-11-10', note: null },
    });
  });

  it('names the first unfinished field, in the form order', () => {
    expect(checkBulk({ ...OK, name: '' }, L)).toEqual({ ok: false, field: 'name', problem: 'empty' });
    expect(checkBulk({ ...OK, name: 'S' }, L)).toEqual({ ok: false, field: 'name', problem: 'short' });
    expect(checkBulk({ ...OK, phone: '0171234567' }, L)).toEqual({ ok: false, field: 'phone', problem: 'phone' });
    expect(checkBulk({ ...OK, phone: '' }, L)).toEqual({ ok: false, field: 'phone', problem: 'empty' });
    expect(checkBulk({ ...OK, email: 'not-an-email' }, L)).toEqual({ ok: false, field: 'email', problem: 'email' });
    expect(checkBulk({ ...OK, itemsText: '' }, L)).toEqual({ ok: false, field: 'itemsText', problem: 'empty' });
    expect(checkBulk({ ...OK, quantity: '' }, L)).toEqual({ ok: false, field: 'quantity', problem: 'empty' });
    expect(checkBulk({ ...OK, quantity: 'many' }, L)).toEqual({ ok: false, field: 'quantity', problem: 'few' });
    expect(checkBulk({ ...OK, neededBy: '2026-10-23' }, L)).toEqual({ ok: false, field: 'neededBy', problem: 'date' });
    expect(checkBulk({ ...OK, note: 'x'.repeat(51) }, L)).toEqual({ ok: false, field: 'note', problem: 'long' });
  });

  it("from the bag, the bag's lines say what he wants; the owner's minimum and maximum hold", () => {
    expect(checkBulk({ ...OK, itemsText: '' }, { ...L, hasBagLines: true }).ok).toBe(true);
    expect(checkBulk({ ...OK, quantity: 10 }, { ...L, minQuantity: 20 })).toEqual({ ok: false, field: 'quantity', problem: 'few' });
    expect(checkBulk({ ...OK, quantity: 20 }, { ...L, minQuantity: 20 }).ok).toBe(true);
    expect(checkBulk({ ...OK, quantity: 10_001 }, L)).toEqual({ ok: false, field: 'quantity', problem: 'many' });
  });

  it('a quantity in Bengali digits or with a comma is read; a phone typed any way is one number', () => {
    expect(bulkQuantity('৪০')).toBe(40);
    expect(bulkQuantity('1,200')).toBe(1_200);
    expect(bulkQuantity('12.5')).toBeNaN();
    const r = checkBulk({ ...OK, phone: '+88 01700-006060' }, L);
    expect(r.ok && r.value.phone).toBe('+8801700006060');
  });
});

describe('PR 606 · the bag card (SIM-F-023)', () => {
  const on = { enabled: true, bag: { atPieces: null, atStockLimit: true } };
  it('off: never', () => {
    expect(bulkCardReason({ ...on, enabled: false }, 500, [{ quantity: 4, maxQuantity: 4 }])).toBeNull();
  });
  it("a line stopped at the stock in hand (40 polos asked, 4 there) shows it; a line with room doesn't", () => {
    expect(bulkCardReason(on, 4, [{ quantity: 4, maxQuantity: 4 }])).toBe('stock');
    expect(bulkCardReason(on, 2, [{ quantity: 2, maxQuantity: 9 }])).toBeNull();
    expect(bulkCardReason({ ...on, bag: { atPieces: null, atStockLimit: false } }, 4, [{ quantity: 4, maxQuantity: 4 }])).toBeNull();
  });
  it("at the owner's number of pieces", () => {
    expect(bulkCardReason({ ...on, bag: { atPieces: 10, atStockLimit: false } }, 10, [{ quantity: 10, maxQuantity: 50 }])).toBe('count');
    expect(bulkCardReason({ ...on, bag: { atPieces: 10, atStockLimit: false } }, 9, [{ quantity: 9, maxQuantity: 50 }])).toBeNull();
  });
});
