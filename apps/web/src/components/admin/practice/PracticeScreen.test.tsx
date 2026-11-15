// PR 843 — Settings › Practice data drawn as the prototype draws Demo products and Start fresh: a big light with the switch, a card of
// what a reset clears next to a card of what stays, Preview and Reset; only the owner sees controls; both languages have every word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-practice.bn.json';
import en from '../../../../messages/admin-practice.en.json';
import type { Dict } from '@/lib/i18n';
import type { PracticeView } from '@/lib/practice/api';
import { PracticeScreen } from './PracticeScreen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const dict = (m: unknown) => ({ practice: (m as { practice: unknown }).practice }) as unknown as Dict;
const view: PracticeView = { enabled: true, showReset: true, isOwner: true, counts: { orders: 90, customers: 60 }, total: 150, keptProducts: 7, photos: { done: 2, total: 10 } };

describe('PracticeScreen (PR 843)', () => {
  it('shows the big light with the switch, what is cleared and what stays, and Preview and Reset', () => {
    const html = renderToStaticMarkup(<PracticeScreen dict={dict(en)} view={view} />);
    expect(html).toContain('data-state="on"');
    expect(html).toContain('Practice mode is on.');
    expect(html).toContain('150 practice records · 7 products you uploaded are kept');
    expect(html).toContain('Will be cleared');
    expect(html).toContain('Will be kept');
    expect(html).toContain('Preview (nothing changes)');
    expect(html).toContain('data-testid="practice-reset-open"');
    expect(html).toContain('role="switch"');
  });
  it('shows no Preview or Reset while the reset is switched off, and the off light when practice mode is off', () => {
    const html = renderToStaticMarkup(<PracticeScreen dict={dict(en)} view={{ ...view, enabled: false, showReset: false }} />);
    expect(html).toContain('data-state="off"');
    expect(html).not.toContain('practice-reset-open');
    expect(html).not.toContain('practice-preview-open');
  });
  it('shows only a line to someone who is not the owner', () => {
    const html = renderToStaticMarkup(<PracticeScreen dict={dict(bn)} view={{ ...view, isOwner: false }} />);
    expect(html).toContain('practice-owner-only');
    expect(html).not.toContain('role="switch"');
  });
  it('has the same words in both languages', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});
