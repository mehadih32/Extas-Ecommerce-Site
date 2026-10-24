// S06 · PR 519 — the identity graph's words: every way two orders are tied has words in both admin languages, and the
// link step's timeline line names the earlier orders with how each tied in, a new identity, and identities joined.
import { describe, expect, it } from 'vitest';
import { IDENTITY_VIAS } from '@extas/orders/pure';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { identitySummary, viaText } from './identity';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });

describe('PR 519 · the identity words', () => {
  it('every tie and the timeline event have words in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const d = adminDicts[lang];
      for (const v of IDENTITY_VIAS) expect(t(d, `orders.identity.via.${v}`), `${lang} ${v}`).not.toBe(`orders.identity.via.${v}`);
      for (const k of ['orders.ev.order_identityLinked', 'orders.identity.new', 'orders.identity.joined', 'orders.identity.merged', 'orders.identity.afterEdit']) expect(t(d, k), `${lang} ${k}`).not.toBe(k);
    }
  });

  it('the timeline line: the earlier orders by how they tied in, or a new identity; merges and edits said', () => {
    const v = view('en');
    expect(identitySummary(v, { created: false, joined: { phone: ['1001'], device: ['1005', '1006'], nameAddress: [] }, merged: 1 })).toBe('the same person as 1001 (same phone) · 1005, 1006 (same device) · 2 identities joined into one');
    expect(identitySummary(v, { created: true, joined: { phone: [], device: [], nameAddress: [] }, merged: 0, after: 'edit' })).toBe('a new identity: no earlier order of the same person · after an edit');
    expect(identitySummary(v, null)).toBeNull();
    expect(viaText(view('bn'), ['phone', 'device'])).toBe('একই ফোন · একই ডিভাইস');
  });
});
