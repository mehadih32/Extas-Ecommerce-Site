// PR 641 (CN-036) — the Support section in the Lumen look: its "saved" / "done" lines go through the admin's one toast
// (components/admin/lumen/Toast.tsx); a refusal stays beside the field it is about. Blocking keeps its reason and its
// confirm press, nothing here offers Undo, and an AI draft never sends by itself (a person presses Send).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = join(__dirname, '..');
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const FILES = ['BlockActions', 'ChannelsCard', 'ChatBag', 'FollowUpCard', 'IdentityActions', 'ProductDrawer', 'SideActions'].map((f) => `support/${f}.tsx`).concat('courier-report/Parts.tsx');

describe('the Support screens speak through the one toast', () => {
  it('every success line goes to showToast, none stays on the page', () => {
    for (const f of FILES) {
      const s = read(f);
      expect(s, f).toContain('showToast');
      expect(s, f).not.toMatch(/setSaid\(\{ text: [^}]*bad: false \}\)|set(?:Msg|Note|Done|Made)\(\{ ok: true/);
      expect(s, f).not.toMatch(/undo\s*:/);
    }
  });

  it('blocking keeps its confirm press, and the composer has no automatic send of an AI draft', () => {
    expect(read('support/BlockActions.tsx')).toContain('support-block-confirm');
    expect(read('support/Composer.tsx')).not.toMatch(/useEffect\([^)]*send\(/);
  });
});
