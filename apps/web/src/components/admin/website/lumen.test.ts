// PR 640 (CN-036) — the Website section in the Lumen look: the layouts, words, eye toggles, SEO and blog screens say
// "saved" / "done" through the admin's one toast (components/admin/lumen/Toast.tsx); a refusal stays beside the field
// it is about. Nothing here offers Undo, and the article preview stays a light island (it shows the shop).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = __dirname;
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const FILES = ['AltTextCard', 'BriefForm', 'ClusterPlanner', 'EyeList', 'JournalEditor', 'JournalShelf', 'LayoutEditor', 'RedirectsScreen', 'SeoScreen', 'SeoTexts', 'SitemapsCard', 'WordsEditor'].map((f) => `${f}.tsx`);

describe('the Website screens speak through the one toast', () => {
  it('every success line goes to showToast, none stays on the page', () => {
    for (const f of FILES) {
      const s = read(f);
      expect(s, f).toContain('showToast');
      expect(s, f).not.toMatch(/setSaid\(\{ text: [^}]*bad: false \}\)|set(?:Msg|Note|Done|Made)\(\{ ok: true/);
      expect(s, f).not.toMatch(/undo\s*:/);
    }
  });

  it('the article preview stays a light island in dark mode', () => {
    expect(read('JournalEditor.tsx')).toContain('jr-preview lm-island');
  });
});
