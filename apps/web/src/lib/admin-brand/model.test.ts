// PR 726 — the Brand & menus editor's pure parts: moving rows (drag, touch and arrow keys all end in these), the rows built
// from the settings' own defaults, and a label that is left alone staying a dictionary key.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { shopT } from '../shop/dict';
import { collapseLabel, dropInto, footerCard, labelPair, menuCard, moveBy, moveLink, newId, ALL_PAY, ALL_SOCIAL, type FooterColumnRow, type Words } from './model';

const en = shopT('en', null);
const bn = shopT('bn', null);
const words: Words = (key) => ({ en: en(key), bn: bn(key) });
const D = {
  announce: registry['shell.announce'].default,
  header: registry['shell.header'].default,
  menu: registry['shell.menu'].default,
  footer: registry['shell.footer'].default,
};
const urls = { facebook: '', instagram: '', youtube: '', tiktok: '' };

describe('moving rows', () => {
  const rows = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  it('moveBy moves one place and stops at the ends', () => {
    expect(moveBy(rows, 1, -1).map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveBy(rows, 1, 1).map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveBy(rows, 0, -1).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(moveBy(rows, 3, 1).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('dropInto puts a row before another, or last', () => {
    expect(dropInto(rows, { id: 'd' }, 'b').map((r) => r.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(dropInto(rows, { id: 'a' }, null).map((r) => r.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(dropInto(rows, { id: 'z' }, 'nope').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'z']);
  });
  it('newId is unique and a legal short id', () => {
    const id = newId('link', ['link-1'], 1);
    expect(id).not.toBe('link-1');
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
  });
});

describe('footer links between columns', () => {
  const link = (id: string) => ({ id, label: { en: id, bn: id }, cat: '', href: `/${id}`, editHref: true, on: true, builtIn: false });
  const col = (id: string, ids: string[]): FooterColumnRow => ({ id, title: { en: id, bn: id }, on: true, builtIn: false, links: ids.map(link) });
  const cols = [col('one', ['a', 'b']), col('two', ['c'])];
  it('a link dragged to another column leaves its own and lands before the chosen one', () => {
    const next = moveLink(cols, { list: 'one', id: 'a' }, { list: 'two', before: 'c' });
    expect(next.map((c) => c.links.map((l) => l.id))).toEqual([['b'], ['a', 'c']]);
  });
  it('inside one column it is a reorder; into an empty end it goes last', () => {
    expect(moveLink(cols, { list: 'one', id: 'a' }, { list: 'one', before: null })[0]!.links.map((l) => l.id)).toEqual(['b', 'a']);
    expect(moveLink(cols, { list: 'one', id: 'b' }, { list: 'two', before: null })[1]!.links.map((l) => l.id)).toEqual(['c', 'b']);
  });
  it('a column holds at most 12 links, an unknown column changes nothing', () => {
    const full = [col('one', ['a']), col('two', Array.from({ length: 12 }, (_, i) => `x${i}`))];
    expect(moveLink(full, { list: 'one', id: 'a' }, { list: 'two', before: null })).toEqual(full);
    expect(moveLink(cols, { list: 'one', id: 'a' }, { list: 'nope', before: null })).toEqual(cols);
  });
});

describe('words', () => {
  it('a dictionary key shows in both languages; the owner\'s own pair as it is', () => {
    expect(labelPair({ key: 'nav.newIn' }, words)).toEqual({ en: en('nav.newIn'), bn: bn('nav.newIn') });
    expect(labelPair({ en: 'Sale', bn: 'সেল' }, words)).toEqual({ en: 'Sale', bn: 'সেল' });
    expect(labelPair(undefined, words)).toBeNull();
  });
  it('left alone it stays the key; reworded it becomes the owner\'s own pair', () => {
    const key = { key: 'nav.newIn' };
    expect(collapseLabel(labelPair(key, words), key, words)).toEqual(key);
    expect(collapseLabel({ en: ' Fresh ', bn: 'নতুন' }, key, words)).toEqual({ en: 'Fresh', bn: 'নতুন' });
    expect(collapseLabel(null, key, words)).toEqual(key);
  });
});

describe('rows from the shop\'s own defaults', () => {
  it('every default menu item, message and header icon is built in', () => {
    const c = menuCard({ announce: D.announce, header: D.header, menu: D.menu }, { announce: D.announce, menu: D.menu }, words);
    expect(c.items.map((i) => i.id)).toEqual(D.menu.items.map((i) => i.id));
    expect(c.items.every((i) => i.builtIn)).toBe(true);
    expect(c.announce.every((m) => m.builtIn && m.text.en && m.text.bn)).toBe(true);
    expect(c.icons.map((i) => i.id)).toEqual(D.header.icons.map((i) => i.id));
  });
  it('the footer lists every social and payment mark, the unused ones hidden behind the shown', () => {
    const c = footerCard(D.footer, D.footer, urls, words);
    expect(c.social.map((m) => m.id).sort()).toEqual([...ALL_SOCIAL].sort());
    expect(c.pay.map((m) => m.id).sort()).toEqual([...ALL_PAY].sort());
    expect(c.pay.filter((m) => m.on).map((m) => m.id)).toEqual(D.footer.pay.filter((m) => m.on).map((m) => m.id));
    expect(c.columns.every((col) => col.builtIn && col.links.every((l) => l.builtIn))).toBe(true);
    expect(c.copyright.en).toContain('{year}');
    // a category link has no words of its own and no address to edit
    const polos = c.columns[0]!.links.find((l) => l.id === 'polos')!;
    expect(polos.label).toBeNull();
    expect(polos.editHref).toBe(false);
  });
});
