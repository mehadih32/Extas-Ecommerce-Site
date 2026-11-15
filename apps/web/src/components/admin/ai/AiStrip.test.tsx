// PR 792 — the AI switch strip on every AI Center tab: on / off words, the off-text line, and the switch only for someone who
// may control AI; both languages have every word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import bn from '../../../../messages/admin-ai-strip.bn.json';
import en from '../../../../messages/admin-ai-strip.en.json';
import type { Dict } from '@/lib/i18n';
import { AiStrip } from './AiStrip';

const dict = (x: unknown) => x as Dict;

describe('AiStrip (PR 792)', () => {
  it('says AI is on and shows the switch to someone who controls AI', () => {
    const html = renderToStaticMarkup(<AiStrip dict={dict(en)} on canControl />);
    expect(html).toContain('AI is on');
    expect(html).toContain('data-on="yes"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('When AI is off, staff and the shop see:');
  });
  it('says AI is off and hides the switch from everyone else', () => {
    const html = renderToStaticMarkup(<AiStrip dict={dict(bn)} on={false} canControl={false} />);
    expect(html).toContain('AI বন্ধ');
    expect(html).toContain('data-on="no"');
    expect(html).not.toContain('role="switch"');
  });
  it('has the same words in both languages', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});
