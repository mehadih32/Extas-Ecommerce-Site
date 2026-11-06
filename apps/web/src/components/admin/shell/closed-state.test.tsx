// PR 652 follow-up (669) — a closed stage's section opened by its address: "closed by the owner for now" with the
// stage named and the way back, in both languages, in the Lumen look (data-lm-ready, the shared empty state), never the
// no-access state; the catch-all page checks the closed parts before access.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-shell.bn.json';
import en from '../../../../messages/admin-shell.en.json';
import type { AdminView } from '@/lib/admin-page';
import { sectionById } from '@/lib/admin-shell/sections';
import type { Dict } from '@/lib/i18n';

vi.mock('@/lib/admin-shell/session', () => ({ shellSession: async () => ({ kind: 'none' }), deniedMemo: () => ({ permission: null }) }));
const { ClosedState } = await import('./ShellParts');

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: (lang === 'bn' ? bn : en) as unknown as Dict, locale: lang === 'bn' ? 'bn-BD' : 'en-IN', timeZone: 'UTC', storeName: null });

describe('a closed stage opened by its address (PR 652 follow-up, 669)', () => {
  const ai = sectionById('ai')!;

  it('says the owner closed it for now, names the stage and leads back, in English and Bengali', () => {
    for (const lang of ['en', 'bn'] as const) {
      const d = (lang === 'bn' ? bn : en).shell;
      const html = renderToStaticMarkup(<ClosedState view={view(lang)} section={ai} stage="S15" />);
      expect(html).toContain('data-lm-ready=""');
      expect(html).toContain('data-stage="S15"');
      expect(html).toContain(d.state.closed.title);
      expect(html).toContain(d.sec.ai);
      expect(html).toContain('S15');
      expect(html).toContain('href="/admin?home=1"');
      expect(html).not.toContain(d.state.denied.title);
      expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('the same words exist in both languages', () => {
    expect(Object.keys(bn.shell.state.closed).sort()).toEqual(Object.keys(en.shell.state.closed).sort());
  });

  it('the catch-all page shows it before the access check, so the owner sees it too', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../app/admin/[...rest]/page.tsx', import.meta.url)), 'utf8');
    const closed = src.indexOf('<ClosedState');
    expect(closed).toBeGreaterThan(0);
    expect(closed).toBeLessThan(src.indexOf('sectionVisible(section, viewer)'));
  });
});
