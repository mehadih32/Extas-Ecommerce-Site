// PR 862 (prototype v5 parity, lane A6) — Home: the "Change target" button and its window, the navy hero style of the month
// target, the arrow mark on every "Do now" row, the Calm (B) and Classic (C) layouts in the prototype's order, and the phone
// rules (44 px buttons, one column under 1024 px), words in both languages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../messages/admin-shell.bn.json';
import en from '../../../../../messages/admin-shell.en.json';
import { ChangeTarget } from './ChangeTarget';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

const here = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const css = readFileSync(join(__dirname, '../../../../app/admin/look.css'), 'utf8');
const proto = (d: typeof en) => (d.dsh as unknown as { proto: Record<string, string> }).proto;
const WORDS = ['targetChange', 'targetTitle', 'targetField', 'targetSave', 'targetCancel', 'targetSaved', 'targetFailed', 'calmNet', 'calmFrom'];

describe('PR 862 · Home change target', () => {
  it('has every word in English and Bengali', () => {
    for (const k of WORDS) {
      expect(proto(en)[k], k).toBeTruthy();
      expect(proto(bn)[k], k).toBeTruthy();
    }
    expect(proto(bn).targetChange).toMatch(/[ঀ-৿]/);
  });
  it('draws the button and the window with the amount, in the language it is given', () => {
    const w = (d: typeof en) => ({ button: proto(d).targetChange!, title: proto(d).targetTitle!, field: proto(d).targetField!, save: proto(d).targetSave!, cancel: proto(d).targetCancel!, saved: proto(d).targetSaved!, failed: proto(d).targetFailed! });
    const html = renderToStaticMarkup(<ChangeTarget amount={450000} currency="BDT" words={w(en)} />);
    expect(html).toContain('data-testid="dash-target-change"');
    expect(html).toContain('Change target');
    expect(html).toContain('value="450000"');
    expect(html).toContain('<dialog');
    const bnHtml = renderToStaticMarkup(<ChangeTarget amount={0} currency="BDT" words={w(bn)} />);
    expect(bnHtml).toContain(proto(bn).targetChange);
    expect(bnHtml).toContain('value="0"');
  });
  it('saves through the page-settings API, goal key, and only for someone who may change settings', () => {
    const src = here('ChangeTarget.tsx');
    expect(src).toContain("'/api/admin/dashboard/today'");
    expect(src).toContain("key: 'goal'");
    const cards = here('ProtoCards.tsx');
    expect(cards).toMatch(/if \(!can\(viewer, "settings.write"\)\) return null/);
  });
});

describe('PR 862 · Home Calm and Classic follow the prototype', () => {
  it('the month target is a navy hero card, and B puts it inside its one hero card with the button', () => {
    const cards = here('ProtoCards.tsx');
    expect(cards).toContain('cls="a3-hero-card"');
    expect(css).toMatch(/\.a3-card\.a3-hero-card\{background:var\(--lm-hero\)/);
    expect(cards).toMatch(/export function CalmHero[\s\S]*ChangeTargetButton/);
  });
  it('every "Do now" row ends with an arrow mark', () => {
    const cards = here('ProtoCards.tsx');
    expect(cards).toContain('className="a3-go"');
    expect(css).toContain('.a3-prob .a3-go');
  });
  it('B is the prototype order: profit snapshot, one hero, Do now beside four figures, trend, products beside ads', () => {
    const b = here('B.tsx');
    const order = ['<CodStrip', '<ProfitSnap', '<CalmHero', '<DoNow', "only={['orders', 'sales', 'cod', 'ret']}", '<TrendCard', '<ProductsToDo', '<AdsPaying'].map((t) => b.indexOf(t));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
  it('C is the prototype order: four figures, trend, Do now / Products / Delivery + ERP, then Ads beside Latest orders', () => {
    const c = here('C.tsx');
    const order = ['<CodStrip', '<ProfitSnap', "only={['orders', 'sales', 'net', 'cod']}", '<TrendCard', '<DoNow', '<ProductsToDo', '<CourierMid', '<ErpCard', '<AdsPaying', '<LatestOrders'].map((t) => c.indexOf(t));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
  it('the phone rules: one column under 1024 px, 44 px buttons, no fixed pixel widths on the hero', () => {
    expect(css).toMatch(/@media \(max-width:1023px\)\{\.adm2 \.a3-calm\{grid-template-columns:minmax\(0,1fr\)\}/);
    expect(css).toMatch(/\.a3-tgt-btn\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.a3-tgt-in input\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.a3-tgt-dlg\{[^}]*width:min\(420px,calc\(100vw - 32px\)\)/);
  });
});
