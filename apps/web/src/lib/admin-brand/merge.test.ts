// PR 726 — an edited Brand & menus card folded back onto the stored settings: nothing the owner did not touch changes,
// built-in rows can be hidden, reworded and moved but not taken out, his own rows can be added and taken out, and every
// word and address is checked with the settings' own schemas.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { shopT } from '../shop/dict';
import { mergeFooter, mergeMenu } from './merge';
import { footerCard, menuCard, type FooterCardValue, type MenuCardValue, type Words } from './model';

const en = shopT('en', null);
const bn = shopT('bn', null);
const words: Words = (key) => ({ en: en(key), bn: bn(key) });
const D = { announce: registry['shell.announce'].default, header: registry['shell.header'].default, menu: registry['shell.menu'].default, footer: registry['shell.footer'].default };
const urls = { facebook: '', instagram: '', youtube: '', tiktok: '' };
const menuNow = () => menuCard({ announce: D.announce, header: D.header, menu: D.menu }, { announce: D.announce, menu: D.menu }, words);
const footerNow = () => footerCard(D.footer, D.footer, urls, words);
const mergeM = (v: unknown) => mergeMenu({ announce: D.announce, header: D.header, menu: D.menu }, { announce: D.announce, menu: D.menu }, v, words);
const mergeF = (v: unknown) => mergeFooter(D.footer, D.footer, v, words);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('menu', () => {
  it('an untouched card gives back exactly what is stored (labels stay dictionary keys)', () => {
    const r = mergeM(menuNow());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.menu).toEqual(D.menu);
      expect(r.value.announce).toEqual(D.announce);
      expect(r.value.header).toEqual(D.header);
    }
  });

  it('reordering and hiding are kept; rewording one item turns only its label into the owner\'s own', () => {
    const v: MenuCardValue = clone(menuNow());
    const first = v.items.shift()!;
    v.items.push({ ...first, on: false });
    v.icons.reverse();
    const sets = v.items.find((i) => i.id === 'sets')!;
    sets.label = { en: 'Build a set', bn: 'সেট বানান' };
    const r = mergeM(v);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.menu.items.at(-1)).toMatchObject({ id: 'new', on: false, label: { key: 'nav.newIn' } });
    expect(r.value.menu.items.find((i) => i.id === 'sets')).toMatchObject({ label: { en: 'Build a set', bn: 'সেট বানান' }, phoneLabel: { key: 'nav.buildYourOwnSet' } });
    expect(r.value.header.icons.map((i) => i.id)).toEqual([...D.header.icons.map((i) => i.id)].reverse());
  });

  it('the owner adds a link and later takes it out; a built-in item cannot be taken out', () => {
    const v: MenuCardValue = clone(menuNow());
    v.items.push({ id: 'sale', kind: 'link', label: { en: 'Sale', bn: 'সেল' }, cat: '', href: '/collections/sale', editHref: true, on: true, desk: true, phone: false, builtIn: false });
    const added = mergeM(v);
    expect(added.ok && added.value.menu.items.at(-1)).toMatchObject({ id: 'sale', kind: 'link', href: '/collections/sale', label: { en: 'Sale', bn: 'সেল' }, phone: false });
    const gone = clone(v);
    gone.items = gone.items.filter((i) => i.id !== 'sale');
    expect(mergeM(gone).ok).toBe(true);
    const lost = clone(menuNow());
    lost.items = lost.items.filter((i) => i.id !== 'combos');
    expect(mergeM(lost)).toEqual({ ok: false, details: ['items.combos'] });
  });

  it('refuses a link with no words, an address outside the shop, a half-written announcement and a malformed card', () => {
    const noWords: MenuCardValue = clone(menuNow());
    noWords.items.push({ id: 'x1', kind: 'link', label: null, cat: '', href: '/a', editHref: true, on: true, desk: true, phone: true, builtIn: false });
    expect(mergeM(noWords).ok).toBe(false);
    const outside = clone(menuNow());
    outside.items.push({ id: 'x2', kind: 'link', label: { en: 'A', bn: 'এ' }, cat: '', href: 'https://example.com', editHref: true, on: true, desk: true, phone: true, builtIn: false });
    expect(mergeM(outside)).toEqual({ ok: false, details: ['items.x2'] });
    const half = clone(menuNow());
    half.announce.push({ id: 'n1', text: { en: 'Hello', bn: '' }, href: '', on: true, builtIn: false });
    expect(mergeM(half).ok).toBe(false);
    expect(mergeM({ items: 1 })).toEqual({ ok: false, details: ['value'] });
    expect(mergeM(null).ok).toBe(false);
  });

  it('the bottom bar and the help links are never touched, and the bag stays in the header', () => {
    const r = mergeM(menuNow());
    expect(r.ok && r.value.menu.bottom).toEqual(D.menu.bottom);
    const noBag: MenuCardValue = clone(menuNow());
    noBag.icons = noBag.icons.filter((i) => i.id !== 'bag');
    expect(mergeM(noBag).ok).toBe(false);
  });
});

describe('footer', () => {
  it('an untouched card gives back the stored footer, with the unused payment marks added hidden', () => {
    const r = mergeF(footerNow());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect({ ...r.value.footer, pay: [] }).toEqual({ ...D.footer, pay: [] });
    expect(r.value.footer.pay.slice(0, D.footer.pay.length)).toEqual(D.footer.pay);
    expect(r.value.footer.pay.slice(D.footer.pay.length).every((m) => !m.on)).toBe(true);
    expect(r.value.urls).toEqual({ facebook: null, instagram: null, youtube: null, tiktok: null });
  });

  it('a link dragged to another column, a hidden column, a reworded title and a new copyright line all land', () => {
    const v: FooterCardValue = clone(footerNow());
    const shop = v.columns.find((c) => c.id === 'shop')!;
    const help = v.columns.find((c) => c.id === 'help')!;
    const moved = shop.links.splice(0, 1)[0]!;
    help.links.unshift(moved);
    v.columns.find((c) => c.id === 'about')!.on = false;
    help.title = { en: 'Need help?', bn: 'সাহায্য' };
    v.copyright = { en: '© {year} {store}. All rights reserved.', bn: '© {year} {store}। সব অধিকার সংরক্ষিত।' };
    v.contact.hours = false;
    v.promise.reverse();
    const r = mergeF(v);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.value.footer;
    expect(f.columns.find((c) => c.id === 'help')!.links[0]).toMatchObject({ id: 'new', href: '/collections/new-in', label: { key: 'nav.newIn' }, icon: 'spark' });
    expect(f.columns.find((c) => c.id === 'shop')!.links.some((l) => l.id === 'new')).toBe(false);
    expect(f.columns.find((c) => c.id === 'about')!.on).toBe(false);
    expect(f.columns.find((c) => c.id === 'help')!.title).toEqual({ en: 'Need help?', bn: 'সাহায্য' });
    expect(f.legal.copyright).toMatchObject({ en: expect.stringContaining('All rights') as unknown });
    expect(f.contact.hours).toBe(false);
    expect(f.promise.items.map((p) => p.id)).toEqual([...D.footer.promise.items.map((p) => p.id)].reverse());
  });

  it('the owner adds a column with a link, a promise and a social address; a built-in link cannot be taken out', () => {
    const v: FooterCardValue = clone(footerNow());
    v.columns.push({ id: 'extra', title: { en: 'Offers', bn: 'অফার' }, on: true, builtIn: false, links: [{ id: 'sale', label: { en: 'Sale', bn: 'সেল' }, cat: '', href: '/collections/sale', editHref: true, on: true, builtIn: false }] });
    v.promise.push({ id: 'gift', text: { en: 'Gift wrap', bn: 'গিফট র‍্যাপ' }, on: true, builtIn: false });
    v.urls.facebook = 'https://facebook.com/sample';
    const r = mergeF(v);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.footer.columns.at(-1)).toMatchObject({ id: 'extra', links: [{ id: 'sale', href: '/collections/sale' }] });
      expect(r.value.footer.promise.items.at(-1)).toMatchObject({ id: 'gift', icon: 'check', on: true });
      expect(r.value.urls.facebook).toBe('https://facebook.com/sample');
    }
    const lost: FooterCardValue = clone(footerNow());
    lost.columns[1]!.links = lost.columns[1]!.links.filter((l) => l.id !== 'faq');
    expect(mergeF(lost).ok).toBe(false);
    const noCol: FooterCardValue = clone(footerNow());
    noCol.columns = noCol.columns.filter((c) => c.id !== 'about');
    expect(mergeF(noCol).ok).toBe(false);
  });

  it('refuses a sixth column, a thirteenth link and a malformed card', () => {
    const six: FooterCardValue = clone(footerNow());
    for (const id of ['c1', 'c2', 'c3']) six.columns.push({ id, title: { en: id, bn: id }, on: true, builtIn: false, links: [] });
    expect(mergeF(six).ok).toBe(false);
    const many: FooterCardValue = clone(footerNow());
    for (let i = 0; i < 13; i++) many.columns[2]!.links.push({ id: `k${i}`, label: { en: 'K', bn: 'কে' }, cat: '', href: '/k', editHref: true, on: true, builtIn: false });
    expect(mergeF(many).ok).toBe(false);
    expect(mergeF({}).ok).toBe(false);
  });
});
