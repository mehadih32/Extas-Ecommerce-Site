// PR 12, PR 6 (follow-up 84), PR 155 (follow-up 90), PR 495 — the admin shell without a database: its words in both
// languages, the 14 sections and who sees them, where an address belongs, the guide files and their parser, the
// waiting-work rows and badges, the search query, and the Dashboard's helpers.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS } from '@extas/settings';
import bn from '../../../messages/admin-shell.bn.json';
import en from '../../../messages/admin-shell.en.json';
import { ADMIN_PAGES } from '../admin-nav';
import { t, type Dict } from '../i18n';
import { ageOf, hourIn, partOfDay, rangeOf, startHref, startSection, trend } from './dashboard';
import { guideDir, parseInline, parseMarkdown, readGuide, type Block } from './guide';
import { initialsOf } from './model';
import { badgesFrom, QUEUES, visibleQueues, type QueueCount } from './queues';
import { parseQuery } from './search';
import { GUIDE_SLUGS, locate, locateKey, placeholderSections, sectionById, sectionHome, sectionVisible, SHELL_SECTIONS, visibleTabs, type ShellViewer } from './sections';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

const APP = resolve(__dirname, '../../app');
const viewer = (perms: string[], owner = false): ShellViewer => ({ perms: new Set(perms), owner });
const OWNER = viewer([], true);

describe('shell words (Bengali and English side by side)', () => {
  it('both files have the same keys, none empty', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    for (const k of keys(bn as Dict)) {
      expect(t(bn as Dict, k), `bn ${k}`).not.toBe('');
      expect(t(en as Dict, k), `en ${k}`).not.toBe('');
    }
  });

  it('English shows no Bengali except the guide button (the guides are Bengali, CN-014)', () => {
    const BN = /[ঀ-৿]/;
    for (const k of keys(en as Dict)) if (k !== 'shell.guide.button') expect(BN.test(t(en as Dict, k)), k).toBe(false);
  });

  it('every section, tab, sub-page and waiting list has its words', () => {
    for (const d of [bn, en] as Dict[]) {
      for (const s of SHELL_SECTIONS) {
        for (const k of [`shell.sec.${s.id}`, `shell.purpose.${s.id}`, `shell.plan.${s.id}`, `shell.syn.${s.id}`]) expect(t(d, k), k).not.toBe(k);
        for (const tab of s.tabs) expect(t(d, `shell.tab.${s.id}.${tab.id}`)).not.toBe(`shell.tab.${s.id}.${tab.id}`);
      }
      for (const q of QUEUES) expect(t(d, `dash.queue.${q.id}`)).not.toBe(`dash.queue.${q.id}`);
    }
  });
});

describe('the 14 sections', () => {
  it('match the settings list of sections, in order, in 3 groups plus the bottom', () => {
    expect(SHELL_SECTIONS.map((s) => s.id)).toEqual([...ADMIN_SECTIONS]);
    expect(SHELL_SECTIONS).toHaveLength(14);
    expect(new Set(SHELL_SECTIONS.map((s) => s.group))).toEqual(new Set(['daily', 'grow', 'business', 'bottom']));
  });

  it('every page a tab names is a built page, and every built admin page has a home in a section', () => {
    const file = (href: string) => join(APP, href.replace(/^\//, ''), 'page.tsx');
    for (const s of SHELL_SECTIONS) for (const tab of s.tabs) for (const p of tab.pages) expect(existsSync(file(p.href)), p.href).toBe(true);
    for (const p of ADMIN_PAGES) expect(locateKey(p.key), p.key).not.toBeNull();
  });

  it('a section shows only to someone with a key in it; AI Center only to owners', () => {
    const ai = sectionById('ai')!;
    expect(sectionVisible(ai, OWNER)).toBe(true);
    expect(sectionVisible(ai, viewer(['catalogue.read', 'system.read', 'vault.read']))).toBe(false);
    const products = sectionById('products')!;
    expect(sectionVisible(products, viewer([]))).toBe(false);
    expect(sectionVisible(products, viewer(['inventory.read']))).toBe(true);
    expect(visibleTabs(products, viewer(['inventory.read'])).map((x) => x.id)).toEqual(['stock']);
    expect(sectionVisible(sectionById('customers')!, viewer(['catalogue.read']))).toBe(false);
    expect(sectionVisible(sectionById('orders')!, viewer(['orders.invoice']))).toBe(true);
  });

  it('an entry leads to the Dashboard itself, the first tab the person may open, or the placeholder', () => {
    expect(sectionHome(sectionById('dashboard')!, OWNER)).toBe('/admin?home=1');
    expect(sectionHome(sectionById('products')!, viewer(['inventory.read']))).toBe('/admin/stock');
    expect(sectionHome(sectionById('products')!, OWNER)).toBe('/admin/products');
    expect(sectionHome(sectionById('money')!, OWNER)).toBe('/admin/money');
    expect(placeholderSections().map((s) => s.id)).toEqual(['orders', 'customers', 'delivery', 'messages', 'support', 'marketing', 'website', 'money', 'reports', 'ai', 'settings']);
  });

  it('an address belongs to the longest page that owns it, else to a section', () => {
    expect(locate('/admin')?.section.id).toBe('dashboard');
    expect(locate('/admin/products/abc')?.tab?.id).toBe('all');
    expect(locate('/admin/products/queue')?.tab?.id).toBe('queue');
    expect(locate('/admin/products/back-in-stock')?.tab?.id).toBe('stock');
    expect(locate('/admin/stock/counts/7')?.page?.href).toBe('/admin/stock/counts');
    expect(locate('/admin/delivery/zones')?.tab?.id).toBe('zones');
    expect(locate('/admin/delivery')?.section.id).toBe('delivery');
    expect(locate('/admin/server')?.section.id).toBe('reports');
    expect(locate('/admin/integrations')?.section.id).toBe('settings');
    expect(locate('/admin/nothing-here')).toBeNull();
  });
});

describe('the guides (SH-05, follow-up 84)', () => {
  it('every guide a section or tab names exists in docs/admin-guide', () => {
    const dir = guideDir();
    expect(dir).not.toBeNull();
    for (const slug of GUIDE_SLUGS) expect(existsSync(join(dir!, `${slug}.md`)), slug).toBe(true);
  });

  it('reads a guide into blocks; an unknown or unsafe name is null', async () => {
    const g = await readGuide('README');
    expect(g?.title).toBeTruthy();
    expect(g?.blocks.length).toBeGreaterThan(0);
    expect(await readGuide('../CLAUDE')).toBeNull();
    expect(await readGuide('no-such-guide')).toBeNull();
  });

  it('parses headings, lists, tables, code and links without HTML', () => {
    const b = parseMarkdown('# Title\n\nSome **bold** text.\n\n- one\n  - nested\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```\n\n---');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'table', 'pre', 'hr']);
    const list = b[2] as Extract<Block, { t: 'ul' | 'ol' }>;
    expect(list.items).toHaveLength(2);
    expect(list.items[0]!.sub[0]?.t).toBe('ul');
    expect(parseInline('see [stock](stock.md) and [site](https://example.test) and [x](../a.md) <b>')).toEqual([
      { t: 'text', v: 'see ' },
      { t: 'guide', slug: 'stock', c: [{ t: 'text', v: 'stock' }] },
      { t: 'text', v: ' and ' },
      { t: 'a', href: 'https://example.test', c: [{ t: 'text', v: 'site' }] },
      { t: 'text', v: ' and ' },
      { t: 'text', v: 'x' },
      { t: 'text', v: ' <b>' },
    ]);
  });
});

describe('waiting work and badges', () => {
  const counts: QueueCount[] = [
    { id: 'launch', n: 3, oldest: '2026-10-20T00:00:00.000Z' },
    { id: 'lowStock', n: 0, oldest: null },
    { id: 'countsReview', n: 1, oldest: null },
    { id: 'erpFailed', n: 2, oldest: null },
    { id: 'jobsDead', n: 4, oldest: null },
  ];

  it('rows at 0 are hidden, and nobody sees work they cannot open', () => {
    expect(visibleQueues(counts, OWNER).map((r) => r.id)).toEqual(['launch', 'countsReview', 'erpFailed', 'jobsDead']);
    expect(visibleQueues(counts, viewer(['inventory.read'])).map((r) => r.id)).toEqual(['countsReview', 'erpFailed']);
    expect(visibleQueues(counts, viewer([]))).toEqual([]);
  });

  it('badges: Products = the launch queue, Reports = stopped jobs', () => {
    expect(badgesFrom(visibleQueues(counts, OWNER))).toEqual({ products: 3, reports: 4 });
    expect(badgesFrom(visibleQueues(counts, viewer(['inventory.read'])))).toEqual({});
  });
});

describe('search query and the Dashboard helpers', () => {
  it('reads the mode prefix, trims, and keeps the digits (Bengali digits too)', () => {
    expect(parseQuery('  Stock ')).toMatchObject({ mode: '', q: 'stock' });
    expect(parseQuery('#১২৩')).toMatchObject({ mode: '#', digits: '123' });
    expect(parseQuery('> new')).toMatchObject({ mode: '>', q: 'new' });
    expect(parseQuery('x'.repeat(200)).q).toHaveLength(80);
  });

  it('start page: the first role that has one, only when the person may open it', () => {
    const roles = [
      { key: 'packer', nameEn: 'Packer', nameBn: 'প্যাকার' },
      { key: 'catalogue', nameEn: 'Catalogue', nameBn: 'ক্যাটালগ' },
    ];
    expect(startSection({}, roles)).toBeNull();
    expect(startSection({ catalogue: 'products' }, roles)).toBe('products');
    expect(startHref('products', viewer(['catalogue.read']))).toBe('/admin/products');
    expect(startHref('products', viewer([]))).toBeNull();
    expect(startHref('dashboard', OWNER)).toBeNull();
    expect(startHref(null, OWNER)).toBeNull();
  });

  it('date choice, greeting, trend and age', () => {
    expect(rangeOf('7', [1, 7, 30])).toBe(7);
    expect(rangeOf('9', [1, 7, 30])).toBe(1);
    expect(rangeOf(undefined, [7, 30])).toBe(7);
    const s = { afternoonHour: 12, eveningHour: 17 };
    expect([partOfDay(9, s), partOfDay(12, s), partOfDay(20, s)]).toEqual(['morning', 'afternoon', 'evening']);
    expect(hourIn(new Date('2026-10-23T00:30:00Z'), 'Asia/Dhaka')).toBe(6);
    expect(trend(150, 100)).toBeCloseTo(0.5);
    expect(trend(5, 0)).toBeNull();
    const now = new Date('2026-10-23T12:00:00Z');
    expect(ageOf(null, now)).toBeNull();
    expect(ageOf('2026-10-23T11:59:40Z', now)).toEqual({ unit: 'now' });
    expect(ageOf('2026-10-23T11:15:00Z', now)).toEqual({ unit: 'm', n: 45 });
    expect(ageOf('2026-10-22T12:00:00Z', now)).toEqual({ unit: 'h', n: 24 });
    expect(ageOf('2026-10-19T12:00:00Z', now)).toEqual({ unit: 'd', n: 4 });
  });

  it('initials for the avatar', () => {
    expect(initialsOf('Sample Owner')).toBe('SO');
    expect(initialsOf('  ')).not.toBe(undefined);
  });
});
