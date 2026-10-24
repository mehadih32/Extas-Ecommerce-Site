// S06 · PR 519 — the identity graph's values without a database: one phone in every way it is typed meets itself,
// names and addresses are folded (case, spaces, Unicode forms), and only the values an order has become links.
import { describe, expect, it } from 'vitest';
import { identityValues, normPhone, normText } from './identity-graph';

describe('the identity graph values (PR 519)', () => {
  it('one number in every typed form is one phone link; an impossible number keeps its text', () => {
    const forms = ['01712345678', '+8801712345678', '8801712345678', '+88 01712-345678', '০১৭১২৩৪৫৬৭৮']; // hardcode-ok: made-up test numbers
    expect(new Set(forms.map(normPhone))).toEqual(new Set(['+8801712345678'])); // hardcode-ok: the same made-up number
    expect(normPhone('12345')).toBe('12345');
    expect(normPhone('  ')).toBeNull();
    expect(normPhone(null)).toBeNull();
  });

  it('names and addresses: letter case, spaces and Unicode forms folded; empty is nothing', () => {
    expect(normText('  Rahim   UDDIN ')).toBe('rahim uddin');
    expect(normText('House 4,\nRoad 5')).toBe('house 4, road 5');
    expect(normText('ｒａｈｉｍ')).toBe('rahim');
    expect(normText('   ')).toBeNull();
  });

  it('an order becomes one link per value it has (phone, name, address, device, IP)', () => {
    expect(identityValues({ phone: '01712345678', customerName: 'Rahim', shippingAddressText: 'House 4', deviceId: 'd-1', ip: '192.0.2.1' }).map((v) => v.kind)).toEqual(['PHONE', 'NAME', 'ADDRESS', 'DEVICE', 'IP']); // hardcode-ok: made-up values
    expect(identityValues({ phone: null, customerName: 'Rahim', shippingAddressText: null, deviceId: null, ip: null })).toEqual([{ kind: 'NAME', valueNorm: 'rahim' }]);
  });
});
