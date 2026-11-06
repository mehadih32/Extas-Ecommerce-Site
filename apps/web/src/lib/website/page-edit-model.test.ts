// S02 · PR 600 — the on-page edit mode's pure rules: what a section offers, field writes checked by the setting's
// schema, money never editable, the phone's light version, "Apply to phone too?" → No, the phone checks, page kinds.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { LOOK_KEYS } from './look-model';
import { applyField, boundsOf, desktopOnly, EDIT_KEYS, EditInputError, getAt, judgePhone, lightOnly, pageKindOf, readField, sectionDef, setAt, type FieldDef } from './page-edit-model';

const field = (page: Parameters<typeof sectionDef>[0], id: string, fid: (f: FieldDef) => boolean, blocks: unknown = []) => {
  const f = sectionDef(page, id, blocks)?.fields.find(fid);
  if (!f) throw new Error(`no field in ${page}/${id}`);
  return f;
};

describe('page-edit-model', () => {
  it('edits only settings of a saved shop look, never money', () => {
    for (const k of EDIT_KEYS) expect(LOOK_KEYS as readonly string[]).toContain(k);
    for (const money of ['home.flashSale', 'home.flashRows', 'bag.tiers.rules', 'payment.cod.enabled', 'delivery.freeOverMinor', 'shell.announce']) expect(EDIT_KEYS as readonly string[]).not.toContain(money);
  });

  it('offers a section its own settings; money only as links; the bag and checkout locked', () => {
    const hero = sectionDef('home', 'hero', [])!;
    expect(hero.fields.map((f) => f.kind)).toEqual(expect.arrayContaining(['show', 'dev', 'move', 'label', 'number', 'toggle']));
    const flash = sectionDef('home', 'flash-sale', [])!;
    expect(flash.fields.every((f) => f.key === 'home.sections')).toBe(true);
    expect(flash.money.map((m) => m.href)).toContain('/admin/rules');
    const bag = sectionDef('bag', 'offer', [])!;
    expect(bag.locked).toBe(true);
    expect(bag.fields).toEqual([]);
    expect(bag.money.map((m) => m.href)).toContain('/admin/combos/bag-box');
    expect(sectionDef('checkout', 'pay', [])!.locked).toBe(true);
    expect(sectionDef('home', 'nope', [])).toBeNull();
    // A locked section (category heading) moves but never hides.
    expect(sectionDef('category', 'head', [])!.fields.map((f) => f.kind)).toEqual(['dev', 'move']);
  });

  it("reads an owner's own section: its words and counts", () => {
    const blocks = [{ id: 'abc123', page: 'home', type: 'offerStrip', on: true, dev: 'both', data: { text: { en: 'Hi', bn: 'হাই' }, link: { en: '', bn: '' }, href: '', tone: 'brand' } }];
    const sec = sectionDef('home', 'lb-abc123', blocks)!;
    expect(sec.fields.filter((f) => f.kind === 'words').map((f) => f.name)).toEqual(['w.text', 'w.link']);
    expect(sectionDef('category', 'lb-abc123', blocks)).toBeNull();
  });

  it('reads number bounds from the setting itself', () => {
    expect(boundsOf('home.newIn', 'count')).toEqual({ min: 2, max: 24 });
    expect(field('home', 'new-in', (f) => f.kind === 'number')).toMatchObject({ min: 2, max: 24 });
  });

  it('writes a field and checks the whole setting', () => {
    const def = registry['home.sections'].default;
    const show = field('home', 'reviews', (f) => f.kind === 'show');
    const hidden = applyField(show, def, false) as { id: string; on: boolean }[];
    expect(hidden.find((r) => r.id === 'reviews')?.on).toBe(false);
    expect(readField(show, hidden)).toBe(false);
    const move = field('home', 'reviews', (f) => f.kind === 'move');
    const moved = applyField(move, def, 'up') as { id: string }[];
    expect(moved.findIndex((r) => r.id === 'reviews')).toBe((def as { id: string }[]).findIndex((r) => r.id === 'reviews') - 1);
    const title = field('home', 'hero', (f) => f.name === 'title');
    const hero = applyField(title, registry['home.hero'].default, { en: ' New drop ', bn: 'নতুন' });
    expect(getAt(hero, ['title'])).toEqual({ en: 'New drop', bn: 'নতুন' });
    expect(() => applyField(title, registry['home.hero'].default, { en: 'Only English', bn: '' })).toThrow(EditInputError);
    const count = field('home', 'new-in', (f) => f.kind === 'number');
    expect(() => applyField(count, registry['home.newIn'].default, 99)).toThrow(EditInputError);
    expect(() => applyField(count, registry['home.newIn'].default, 3.5)).toThrow(EditInputError);
    expect(getAt(applyField(count, registry['home.newIn'].default, 12), ['count'])).toBe(12);
    const btn = field('home', 'hero', (f) => f.name === 'setsButtonOn');
    expect(getAt(applyField(btn, registry['home.hero'].default, false), ['buttons', { id: 'sets' }, 'on'])).toBe(false);
    expect(setAt({ a: 1 }, ['b', 'c'], 2)).toBeNull();
  });

  it('the phone light version keeps texts only', () => {
    const kinds = lightOnly(sectionDef('home', 'hero', [])!.fields).map((f) => f.kind);
    expect(new Set(kinds)).toEqual(new Set(['label']));
  });

  it('"Apply to phone too?" No: a section shown or hidden keeps phones as they were; other changes stay', () => {
    const live = registry['home.sections'].default;
    const show = field('home', 'reviews', (f) => f.kind === 'show');
    const hidden = applyField(show, live, false);
    const kept = desktopOnly('home.sections', live, hidden) as { id: string; on: boolean; dev?: string }[];
    expect(kept.find((r) => r.id === 'reviews')).toEqual({ id: 'reviews', on: true, dev: 'phone' });
    const moved = applyField(field('home', 'reviews', (f) => f.kind === 'move'), live, 'up');
    expect(desktopOnly('home.sections', live, moved)).toBeNull();
    expect(desktopOnly('home.hero', registry['home.hero'].default, registry['home.hero'].default)).toBeNull();
    // Shown again on computers only.
    const back = desktopOnly('home.sections', hidden, live) as { id: string; on: boolean; dev?: string }[];
    expect(back.find((r) => r.id === 'reviews')).toEqual({ id: 'reviews', on: true, dev: 'desktop' });
  });

  it('judges one phone size against the checks that are on', () => {
    const cfg = { checks: { sideways: true, cut: true, taps: true, buyFold: true } };
    const ok = { name: 'p', w: 360, h: 800, loaded: true, sideways: 0, cut: [], small: [], buy: 'above' as const };
    expect(judgePhone(ok, cfg)).toEqual({ pass: true, issues: [] });
    expect(judgePhone({ ...ok, sideways: 12, small: ['a'], buy: 'below' }, cfg).issues).toEqual(['sideways', 'taps', 'buyFold']);
    expect(judgePhone({ ...ok, small: ['a'] }, { checks: { ...cfg.checks, taps: false } }).pass).toBe(true);
    expect(judgePhone({ ...ok, loaded: false }, cfg).issues).toEqual(['load']);
  });

  it('knows the page kind from the address', () => {
    expect(pageKindOf('/', '/p')).toBe('home');
    expect(pageKindOf('/collections/polo?x=1', '/p')).toBe('category');
    expect(pageKindOf('/p/oxford-shirt', '/p')).toBe('product');
    expect(pageKindOf('/bag', '/p')).toBe('bag');
    expect(pageKindOf('/checkout', '/p')).toBe('checkout');
    expect(pageKindOf('/journal', '/p')).toBe('other');
  });
});
