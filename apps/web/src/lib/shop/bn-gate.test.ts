// PR 84 — the language gate (CN-017, SIM-F-025 "the বাংলা journey is half English"): with বাংলা on, no English word
// is left in the shop's own words. The names people write in Latin letters stay (WhatsApp, SMS, the DBID number and the
// 01XXXXXXXXX pattern), and the language switch says its way out in the other language on purpose.
import { describe, expect, it } from 'vitest';
import { SHOP_DICTS, keysOf, shopT } from './dict';

const KEEP = new Set(['WhatsApp', 'SMS', 'DBID', 'XXXXXXXXX']);
const SWITCH = new Set(['lang.toBn', 'lang.toEn', 'lang.en']);

/** The Latin words left in a Bengali entry, slots ({store}) taken out. */
function englishLeft(text: string): string[] {
  return (text.replace(/\{[^}]+\}/g, '').match(/[A-Za-z][A-Za-z'’]*/g) ?? []).filter((w) => !KEEP.has(w));
}

describe('PR 84 · the Bengali shop is Bengali (SIM-F-025)', () => {
  it('no English word is left in the Bengali dictionary, apart from the names people write in Latin letters', () => {
    const t = shopT('bn');
    const left = keysOf(SHOP_DICTS.bn)
      .filter((k) => !SWITCH.has(k))
      .flatMap((k) => englishLeft(t(k)).map((w) => `${k}: ${w}`));
    expect(left).toEqual([]);
  });

  it('the gate itself catches an English word and lets the kept names through', () => {
    expect(englishLeft('অর্ডার করুন now')).toEqual(['now']);
    expect(englishLeft('WhatsApp-এ {store}-কে মেসেজ দিন')).toEqual([]);
    expect(englishLeft('যেমন 01XXXXXXXXX।')).toEqual([]);
  });
});
