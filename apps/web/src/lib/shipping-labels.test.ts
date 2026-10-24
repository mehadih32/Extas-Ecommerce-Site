// S08 · PR 175 — every parcel state, every exception reason and every courier adapter has its label in both admin
// languages, so the Delivery screens never show a raw code.
import { describe, expect, it } from 'vitest';
import { courierAdapters, EXCEPTION_REASONS } from '@extas/adapters';
import { ACTIVE_STATES, FINAL_STATES } from '@extas/shipping/pure';
import bn from '../../messages/admin.bn.json';
import en from '../../messages/admin.en.json';
import { t } from './i18n';

describe('courier labels (PR 175)', () => {
  it('every state, reason and courier is labelled in Bengali and English', () => {
    const states = [...ACTIVE_STATES, ...FINAL_STATES, 'BOOKING', 'BOOKING_FAILED', 'CANCEL_REQUESTED'];
    const reasons = [...new Set(Object.values(EXCEPTION_REASONS).flat())];
    for (const d of [bn, en]) {
      for (const s of states) expect(t(d, `courier.status.${s}`), s).not.toBe(`courier.status.${s}`);
      for (const r of reasons) expect(t(d, `courier.reasons.${r}`), r).not.toBe(`courier.reasons.${r}`);
      for (const a of courierAdapters) expect(t(d, `courier.providers.${a.provider}`), a.provider).not.toBe(`courier.providers.${a.provider}`);
    }
  });
});
