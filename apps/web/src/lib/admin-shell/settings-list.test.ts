// PR 779 — Settings as prototype v5 draws it: a searchable list in two groups. Every item opens a built page, only what the
// person may open shows, the words exist in both languages, the prototype's own items come first in its order, and the
// list reads the prototype's file so the words cannot drift.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin-shell.bn.json';
import en from '../../../messages/admin-shell.en.json';
import { currentItem, itemMatches, SETTINGS_ITEMS, settingsItems } from './settings-list';
import { locateKey, type ShellViewer } from './sections';

const ROOT = resolve(__dirname, '../../../../..');
const OWNER: ShellViewer = { perms: new Set<string>(), owner: true };

describe('Settings list (PR 779)', () => {
  it('every item opens a page the menu table has; the owner sees all of them', () => {
    for (const it of SETTINGS_ITEMS) expect(locateKey(it.nav)?.page, it.id).toBeTruthy();
    expect(settingsItems(OWNER).map((x) => x.id)).toEqual(SETTINGS_ITEMS.map((x) => x.id));
    expect(new Set(SETTINGS_ITEMS.map((x) => x.id)).size).toBe(SETTINGS_ITEMS.length);
  });

  it('shows a person only the items whose page they may open', () => {
    const staff: ShellViewer = { perms: new Set(['settings.read', 'staff.read']), owner: false };
    const ids = settingsItems(staff).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['store', 'policies', 'payments', 'team']));
    expect(ids).not.toContain('keys');
    expect(ids).not.toContain('backups');
    expect(settingsItems({ perms: new Set(), owner: false })).toEqual([]);
  });

  it('has the prototype items in its order and words (m-settings.js ITEMS), then the real extras', () => {
    const src = readFileSync(join(ROOT, 'docs/demo/admin-proto-v5/js/m-settings.js'), 'utf8');
    const proto = [...src.matchAll(/\{ id: '(\w+)', g: '([bs])', ic: '\w+', en: '([^']+)', bn: '([^']+)'/g)].map((m) => ({ id: m[1]!, g: m[2]!, en: m[3]!, bn: m[4]! }));
    expect(proto.length).toBe(17);
    const idMap: Record<string, string> = { telegram: 'telegram', ai: 'ai', manual: 'help', health: 'health', updates: 'updates' };
    const mine = new Map(SETTINGS_ITEMS.map((x) => [x.id, x]));
    let last = -1;
    const missing: string[] = [];
    for (const p of proto) {
      const id = p.id in idMap ? idMap[p.id]! : p.id;
      const it = id ? mine.get(id) : undefined;
      if (!it) {
        missing.push(p.id);
        continue;
      }
      expect(it.group, p.id).toBe(p.g);
      const at = SETTINGS_ITEMS.indexOf(it);
      expect(at, `${p.id} keeps the prototype order`).toBeGreaterThan(last);
      last = at;
      const nameEn = (en.shell.setlist.item as Record<string, { n: string }>)[it.id]!.n;
      const nameBn = (bn.shell.setlist.item as Record<string, { n: string }>)[it.id]!.n;
      // Telegram control is the real page's own name in the owner's list (Telegram approvals)
      if (p.id !== 'telegram') {
        expect(nameEn, p.id).toBe(p.en);
        expect(nameBn, p.id).toBe(p.bn);
      }
    }
    // every prototype item has a built page (PR 791 built Site health and Updates & versions)
    expect(missing).toEqual([]);
    expect(en.shell.setlist.groups).toEqual({ b: 'Business', s: 'System' });
  });

  it('has a name and search words in English and Bengali for every item', () => {
    for (const dict of [en, bn]) {
      for (const it of SETTINGS_ITEMS) {
        const w = (dict.shell.setlist.item as Record<string, { n: string; k: string }>)[it.id];
        expect(w?.n, it.id).toBeTruthy();
        expect(w?.k, it.id).toBeTruthy();
      }
    }
  });

  it('lights the item a sub-page belongs to; search needs every word and also finds by hidden words', () => {
    const items = settingsItems(OWNER);
    expect(currentItem(items, '/admin/settings/store')?.id).toBe('store');
    expect(currentItem(items, '/admin/settings/security/edge')?.id).toBe('edge');
    expect(currentItem(items, '/admin/settings/security')?.id).toBe('security');
    expect(currentItem(items, '/admin/orders')).toBeNull();
    expect(itemMatches({ name: 'Payments', kw: 'bkash nagad' }, 'bkash')).toBe(true);
    expect(itemMatches({ name: 'Payments', kw: 'bkash nagad' }, 'bkash card')).toBe(false);
    expect(itemMatches({ name: 'Payments', kw: 'x' }, '')).toBe(true);
  });
});
