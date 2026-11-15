// PR 818 — AI Center › Costs & limits: the meter with its ceiling, the warning from 80%, the per-agent caps and the cost-saver card;
// someone who may not control AI sees the figures and no controls; both languages have every word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-ai-limits.bn.json';
import en from '../../../../messages/admin-ai-limits.en.json';
import type { Dict } from '@/lib/i18n';
import { CostsLimits } from './CostsLimits';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const money = { currency: 'BDT', digits: 2, locale: 'en' } as never;
const base = { money, capMinor: 1_000_000, spentMinor: 850_000, dayOfMonth: 15, daysInMonth: 30, saver: false, saverAuto: false, agents: [{ key: 'doot', name: 'Doot', monthMinor: 5000, capMinor: null, provider: 'Practice writer' }] };

describe('CostsLimits (PR 818)', () => {
  it('warns from 80% and says the month will cross the ceiling at this pace', () => {
    const html = renderToStaticMarkup(<CostsLimits dict={en as unknown as Dict} canControl {...base} />);
    expect(html).toContain('data-testid="ai-limits-warn"');
    expect(html).toContain('Will cross');
    expect(html).toContain('Cost-saver mode');
    expect(html).toContain('data-testid="ai-ceiling-input"');
  });
  it('shows no warning and no controls when under 80% and the person may not control AI', () => {
    const html = renderToStaticMarkup(<CostsLimits dict={bn as unknown as Dict} canControl={false} {...base} spentMinor={1000} />);
    expect(html).not.toContain('ai-limits-warn');
    expect(html).not.toContain('ai-ceiling-input');
    expect(html).not.toContain('role="switch"');
    expect(html).toContain('সীমার মধ্যে');
  });
  it('has the same words in both languages', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});
