// PR 781 — Store details: each prototype card that is not the legal numbers opens the page where its values live, shown only
// to a person who may open that page, with words in both languages.
import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin-store.bn.json';
import en from '../../../messages/admin-store.en.json';
import type { ShellViewer } from '../admin-shell/sections';
import { STORE_WHERE, storeWhere } from './where';

describe('Store details cards (PR 781)', () => {
  it('the owner sees every card and each opens a built page', () => {
    const owner: ShellViewer = { perms: new Set<string>(), owner: true };
    const cards = storeWhere(owner);
    expect(cards.map((c) => c.id)).toEqual(STORE_WHERE.map((c) => c.id));
    expect(cards.find((c) => c.id === 'contact')!.href).toBe('/admin/website/brand-menus');
    expect(cards.find((c) => c.id === 'tax')!.href).toBe('/admin/money/vat');
    expect(cards.find((c) => c.id === 'invoice')!.href).toBe('/admin/orders/packing/invoices');
  });

  it('a person sees only the cards whose page they may open', () => {
    const web: ShellViewer = { perms: new Set(['website.read']), owner: false };
    expect(storeWhere(web).map((c) => c.id)).toEqual(['addresses', 'contact', 'logos', 'social']);
    expect(storeWhere({ perms: new Set(), owner: false })).toEqual([]);
  });

  it('has words in English and Bengali; the legal card is called Business & legal as in the prototype', () => {
    for (const d of [en, bn]) {
      for (const c of STORE_WHERE) {
        const w = (d.stp.where as unknown as Record<string, { t: string; d: string }>)[c.id];
        expect(w?.t, c.id).toBeTruthy();
        expect(w?.d, c.id).toBeTruthy();
      }
    }
    expect(en.stp.legal.h).toBe('Business & legal');
  });
});
