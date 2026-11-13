// S28 · PR 670 — the Couriers section's words: the same keys in Bengali and English, and a label for every parcel filter,
// every statement-line reason and every Courier 360 section, so a page never shows a raw code.
import { describe, expect, it } from 'vitest';
import { LINE_MISMATCHES } from '@extas/payments';
import { PAYOUT_STATES } from '@extas/adapters';
import { PARCEL_FILTERS } from '@extas/shipping';
import bn from '../../messages/admin-couriers.bn.json';
import en from '../../messages/admin-couriers.en.json';
import { t, type Dict } from './i18n';

const keys = (d: Dict, at = ''): string[] => Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [`${at}${k}`] : keys(v, `${at}${k}.`)));

describe('the Couriers words (PR 670)', () => {
  it('Bengali and English have the same keys', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
  });
  it('every filter, reason and section is labelled', () => {
    for (const d of [bn, en] as Dict[]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const x of PARCEL_FILTERS) has(`cr.p.f.${x}`);
      for (const x of LINE_MISMATCHES) has(`cr.m.reasons.${x}`);
      for (const x of PAYOUT_STATES) has(`cr.y.state.${x}`);
      for (const x of ['PIN_REQUIRED', 'WRONG_PIN', 'PIN_LOCKED', 'PIN_NOT_SET', 'PAYOUTS_OFF', 'PAYOUT_NOT_SUPPORTED', 'PAYOUT_OPEN', 'PAYOUT_NOTHING', 'PAYOUT_REFUSED', 'FORBIDDEN']) has(`cr.y.err.${x}`);
      for (const x of ['overview', 'parcels', 'money', 'payouts', 'performance', 'setup']) has(`cr.c.sec.${x}`);
    }
  });
});
