// PR 778 — Website › Control: every card leads to a real page, is shown only to a person who may open it, has words in both
// languages, and the search matches title, line and search words.
import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin-website-control.bn.json';
import en from '../../../messages/admin-website-control.en.json';
import { cardMatches, cardTarget, CONTROL_GROUPS, controlGroups } from './cards';
import type { ShellViewer } from '../admin-shell/sections';

const OWNER: ShellViewer = { perms: new Set<string>(), owner: true };
const WANTED = ['shopName', 'logo', 'favicon', 'header', 'menu', 'footer', 'look', 'cookie', 'policies', 'layouts', 'text', 'seo', 'analytics', 'email', 'appicon', 'checkout', 'delivery', 'contact', 'categories'];

describe('Website control cards', () => {
  const all = CONTROL_GROUPS.flatMap((g) => g.cards);

  it('covers every setting the owner listed', () => {
    for (const id of WANTED) expect(all.map((c) => c.id), id).toContain(id);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it('every card opens a built page (no moved page, no new address)', () => {
    for (const c of all) {
      const to = cardTarget(c);
      expect(to, c.id).not.toBeNull();
      expect(to!.href.startsWith('/admin/'), c.id).toBe(true);
    }
    expect(cardTarget(all.find((c) => c.id === 'cookie')!)!.href).toBe('/admin/website/page-settings?screen=cookie');
    expect(cardTarget(all.find((c) => c.id === 'logo')!)!.href).toBe('/admin/website/brand-menus');
  });

  it('the owner sees every card; a person sees only the cards whose page they may open', () => {
    expect(controlGroups(OWNER).flatMap((g) => g.cards).length).toBe(all.length);
    const web: ShellViewer = { perms: new Set(['website.read']), owner: false };
    const ids = controlGroups(web).flatMap((g) => g.cards.map((c) => c.id));
    expect(ids).toContain('logo');
    expect(ids).toContain('cookie');
    expect(ids).not.toContain('checkout'); // settings.read
    expect(ids).not.toContain('delivery'); // delivery.read
    expect(ids).not.toContain('categories'); // catalogue.read
    expect(ids).not.toContain('seo'); // seo.read
    const nobody: ShellViewer = { perms: new Set(), owner: false };
    expect(controlGroups(nobody)).toEqual([]);
  });

  it('has a title, a line and search words for every card and group in English and Bengali', () => {
    for (const dict of [en, bn]) {
      for (const c of all) {
        const w = (dict.wc.card as Record<string, { t: string; d: string; k: string }>)[c.id];
        expect(w?.t, c.id).toBeTruthy();
        expect(w?.d, c.id).toBeTruthy();
        expect(w?.k, c.id).toBeTruthy();
      }
      for (const g of CONTROL_GROUPS) expect((dict.wc.group as Record<string, string>)[g.id], g.id).toBeTruthy();
    }
  });

  it('search needs every typed word, ignores case and finds by the hidden search words', () => {
    const w = en.wc.card.logo;
    expect(cardMatches(w, '')).toBe(true);
    expect(cardMatches(w, 'LOGO')).toBe(true);
    expect(cardMatches(w, 'logo phone')).toBe(true);
    expect(cardMatches(w, 'logo cookie')).toBe(false);
    expect(cardMatches(en.wc.card.cookie, 'consent')).toBe(true);
    expect(cardMatches(bn.wc.card.cookie, 'কুকি')).toBe(true);
  });
});
