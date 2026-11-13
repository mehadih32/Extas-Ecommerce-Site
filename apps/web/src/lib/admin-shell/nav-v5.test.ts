// PR 659 (CN-048) — the real admin menu equals the prototype v5's `A.NAV` (docs/demo/admin-proto-v5/js/core.js), word
// for word and in order, in English and Bengali. The prototype file is read here, so the menu cannot drift from it.
// Pages that are not built yet are listed (AWAITING, PENDING) and the test says what to do when one lands.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { adminDicts, type AdminLang } from '../admin-i18n';
import { t } from '../i18n';
import { AWAITING, applyNavV5, NAV_V5, PENDING, stillPending, V5_SECTION, withLandedPages } from './nav-v5';
import pendingJson from './nav-pending.json';
import { lumenNav } from './lumen-nav';
import { RAW_SECTIONS, SHELL_SECTIONS, locate, sectionById, sectionHome, visibleTabs, type ShellSection, type ShellViewer } from './sections';

const ROOT = resolve(__dirname, '../../../../..');
const APP = resolve(__dirname, '../../app');
const OWNER: ShellViewer = { perms: new Set<string>(), owner: true };

interface ProtoSection { id: string; name: { en: string; bn: string }; tabs: { id: string; en: string; bn: string }[] }
function protoNav(): ProtoSection[] {
  const src = readFileSync(join(ROOT, 'docs/demo/admin-proto-v5/js/core.js'), 'utf8');
  const m = /A\.NAV = (\[[\s\S]*?\n {2}\]);/.exec(src);
  expect(m, 'A.NAV found in the prototype').not.toBeNull();
  const nav = vm.runInNewContext(`(${m![1]})`, { T: (en: string, bn: string) => ({ en, bn }) }) as { id: string; name: { en: string; bn: string }; tabs: [string, { en: string; bn: string }][] }[];
  return nav.map((s) => ({ id: s.id, name: s.name, tabs: s.tabs.map((x) => ({ id: x[0], en: x[1].en, bn: x[1].bn })) }));
}

const label = (lang: AdminLang, key: string) => t(adminDicts[lang], key);
const mainTabs = (s: ShellSection) => visibleTabs(s, OWNER).filter((x) => !x.more);
const pageFile = (href: string) => join(APP, href.replace(/^\//, ''), 'page.tsx');

/** The menu as it would be with every pending page merged. */
const landed = RAW_SECTIONS.map((s) => applyNavV5(s, new Set<string>()));

describe('the menu equals the prototype A.NAV (PR 659)', () => {
  const proto = protoNav();

  it('has the prototype sections, in its order, with its words', () => {
    expect(proto.map((s) => s.id)).toEqual(Object.keys(V5_SECTION));
    const ids = proto.map((s) => V5_SECTION[s.id]!);
    const shown = lumenNav(OWNER, { aiShown: true }).flatMap((g) => g.sections.map((s) => s.id)).filter((id) => ids.includes(id));
    expect(shown).toEqual(ids);
    for (const s of proto) {
      const id = V5_SECTION[s.id]!;
      expect(label('en', `shell.sec.${id}`), s.id).toBe(s.name.en);
    }
  });

  it('the spec lists exactly the prototype tabs of each section, in its order', () => {
    for (const s of proto) {
      const spec = NAV_V5[V5_SECTION[s.id]!] ?? [];
      expect(spec.map((x) => x.proto), s.id).toEqual(s.tabs.map((x) => x.id));
    }
  });

  it('every built prototype tab shows, in order and in both languages; a missing one is awaiting a page', () => {
    for (const s of proto) {
      const id = V5_SECTION[s.id]!;
      const sec = sectionById(id)!;
      const spec = NAV_V5[id] ?? [];
      const shown = mainTabs(sec).map((x) => x.id);
      const heads = (lang: AdminLang) => shown.map((x) => label(lang, `shell.tab.${id}.${x}`));
      const missing = s.tabs.filter((x) => !heads('en').includes(x.en));
      for (const x of missing) {
        const real = spec.find((y) => y.proto === x.id)!.real;
        const waitingPage = PENDING.some((p) => p.section === id && real.includes(p.tab) && stillPending().has(p.key));
        expect(AWAITING.includes(`${id}.${x.id}`) || waitingPage, `${s.id}: "${x.en}" is missing and is neither awaiting nor a waiting page`).toBe(true);
      }
      // a section none of whose tabs is built keeps its own tabs (nothing disappears early)
      if (missing.length === s.tabs.length) continue;
      const built = s.tabs.filter((x) => !missing.includes(x));
      expect(heads('en'), `${s.id} (en)`).toEqual(built.map((x) => x.en));
      expect(heads('bn'), `${s.id} (bn)`).toEqual(built.map((x) => x.bn));
    }
  });

  it('with every pending page merged the menu is the prototype exactly, except the tabs listed as awaiting', () => {
    for (const s of proto) {
      const id = V5_SECTION[s.id]!;
      const sec = landed.find((x) => x.id === id)!;
      const main = sec.tabs.filter((x) => !x.more).map((x) => x.id);
      const expected = s.tabs.filter((x) => !AWAITING.includes(`${id}.${x.id}`));
      expect(main.map((x) => label('en', `shell.tab.${id}.${x}`)), s.id).toEqual(expected.map((x) => x.en));
      expect(main.map((x) => label('bn', `shell.tab.${id}.${x}`)), s.id).toEqual(expected.map((x) => x.bn));
    }
  });

  it('AWAITING names real prototype tabs, and none of them shows yet (take a tab off the list when its page is merged)', () => {
    for (const key of AWAITING) {
      const [sec, tab] = key.split('.') as [string, string];
      const p = proto.find((x) => V5_SECTION[x.id] === sec);
      expect(p?.tabs.some((x) => x.id === tab), key).toBe(true);
      const s = sectionById(sec as never)!;
      const wanted = p!.tabs.find((x) => x.id === tab)!;
      expect(mainTabs(s).map((x) => label('en', `shell.tab.${sec}.${x.id}`)), `${key} is built now: remove it from AWAITING`).not.toContain(wanted.en);
    }
  });

  it('nothing is dropped: every built page is in the menu exactly once, under a tab or under More', () => {
    const hrefs = (secs: readonly ShellSection[]) => secs.flatMap((s) => s.tabs.flatMap((x) => x.pages.map((p) => p.href))).sort();
    const raw = hrefs(RAW_SECTIONS);
    // a page that landed in `sections.ts` itself (a lane that could edit the shared files) is in `raw` already and is not counted twice
    const extra = (keep: (key: string) => boolean) => PENDING.filter((p) => keep(p.key)).map((p) => p.page.href).filter((h) => !raw.includes(h));
    expect(hrefs(SHELL_SECTIONS)).toEqual([...raw, ...extra((k) => !stillPending().has(k))].sort());
    expect(new Set(raw).size).toBe(raw.length);
    expect(hrefs(landed)).toEqual([...raw, ...extra(() => true)].sort());
  });

  it('a section opens on its first prototype tab', () => {
    expect(sectionHome(sectionById('orders')!, OWNER)).toBe('/admin/orders/batch');
    expect(sectionHome(sectionById('products')!, OWNER)).toBe('/admin/products');
    expect(locate('/admin/products/new')?.tab?.id).toBe('add');
  });

  it('folds the tabs of the prototype into one tab and leaves the closed Studio tab alone', () => {
    const money = landed.find((x) => x.id === 'money')!;
    const costs = money.tabs.find((x) => x.id === 'costs')!;
    expect(costs.pages.map((p) => p.href)).toEqual(['/admin/money/costs', '/admin/money/expenses', '/admin/money/fees', '/admin/money/cost-ledger', '/admin/money/cost-ledger/report', '/admin/money/budgets']);
    const erp = money.tabs.find((x) => x.id === 'erp')!;
    expect(erp.pages.map((p) => p.keys[0])).toEqual(['booksAccount', 'booksMatch', 'booksDifferences', 'booksCloses', 'booksDaily', 'moneyMonthEnd']);
    const studio = SHELL_SECTIONS.find((x) => x.id === 'marketing')!.tabs.find((x) => x.id === 'studio')!;
    expect(studio.more).toBe(true);
    expect(studio.pages.length).toBeGreaterThan(1);
  });

  it('Settings is the prototype two tabs: Business settings and System (owner only), their pages as chips in the prototype order', () => {
    const s = landed.find((x) => x.id === 'settings')!;
    expect(s.tabs.filter((x) => !x.more).map((x) => x.id)).toEqual(['store', 'keys']);
    expect(s.tabs.find((x) => x.id === 'store')!.pages.map((p) => p.keys[0])).toEqual(['store', 'policies', 'people', 'roles', 'staffControls', 'erpLink', 'adminLook', 'productDemo']);
    expect(s.tabs.find((x) => x.id === 'keys')!.pages.map((p) => p.keys[0])).toEqual(['integrations', 'telegramApprovals', 'cache', 'backups', 'golive', 'security', 'edge', 'activity', 'privacy', 'startFresh']);
    expect(s.tabs.filter((x) => x.more).map((x) => x.id).sort()).toEqual(['practice', 'shell', 'shimmer']);
  });
});

describe('pages built in the lanes that could not edit the shared files (PR 682-707)', () => {
  it('a page shows in the menu only once its page file is merged: nav-pending.json lists exactly the missing ones', () => {
    const keys = PENDING.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of pendingJson.waiting) expect(keys, `${k} is not a pending page`).toContain(k);
    for (const p of PENDING) {
      const built = existsSync(pageFile(p.page.href));
      expect(stillPending().has(p.key), `${p.key} (${p.page.href}): ${built ? 'the page is merged, run: node tools/nav/activate-pending.mjs' : 'the page is not merged, keep it in nav-pending.json'}`).toBe(!built);
    }
  });

  it('a waiting page is not in the menu; a landed one joins its tab', () => {
    const raw = RAW_SECTIONS.find((x) => x.id === 'products')!;
    const all = new Set(PENDING.map((p) => p.key));
    expect(withLandedPages(raw, all).flatMap((x) => x.pages.map((p) => p.href))).not.toContain('/admin/products/faqs');
    const now = new Set(all);
    now.delete('products.reviews.faqs');
    const reviews = withLandedPages(raw, now).find((x) => x.id === 'reviews')!;
    expect(reviews.pages.map((p) => p.keys[0])).toEqual(['productReviews', 'productQuestions', 'productFaqs']);
  });

  it('a page that has to come first (Report library, Message campaigns) does', () => {
    const marketing = landed.find((x) => x.id === 'marketing')!;
    expect(marketing.tabs.find((x) => x.id === 'messages')!.pages[0]!.keys[0]).toBe('marketingMessageCampaigns');
    const reports = landed.find((x) => x.id === 'reports')!;
    expect(reports.tabs[0]!.id).toBe('library');
    expect(reports.tabs.find((x) => x.id === 'packs')!.more).toBe(true);
  });

  it('every pending page has a key, a permission and words in both languages (tab words when it shows as a tab)', () => {
    for (const p of PENDING) {
      expect(p.page.href.startsWith('/admin/'), p.key).toBe(true);
      expect(p.page.keys.length, p.key).toBeGreaterThan(0);
      const sec = landed.find((x) => x.id === p.section)!;
      const tab = sec.tabs.find((x) => x.pages.some((y) => y.href === p.page.href))!;
      expect(tab, `${p.key}: it sits in a tab once landed`).toBeDefined();
      for (const lang of ['en', 'bn'] as const) {
        if (tab.pages.length > 1) expect(label(lang, `nav.${p.page.keys[0]}`), `${p.key} chip (${lang})`).not.toContain('nav.');
        if (tab.id === p.tab && !tab.more) expect(label(lang, `shell.tab.${p.section}.${p.tab}`), `${p.key} tab (${lang})`).not.toContain('shell.tab.');
      }
    }
  });

  it('a section with none of its prototype tabs built keeps its tabs as they are', () => {
    const fake: ShellSection = { id: 'ai', icon: 'spark', group: 'business', base: '/admin/ai', guide: 'ai', tabs: [{ id: 'control', pages: [{ href: '/admin/ai', perm: 'ai.read', keys: ['aiControl'] }] }] };
    expect(applyNavV5(fake, new Set()).tabs).toEqual(fake.tabs);
    expect(applyNavV5({ ...fake, id: 'help' }).tabs).toEqual(fake.tabs);
  });
});
