// PR 639 (CN-036) — Marketing part 2, the customer messages pages, in the Lumen look: their "saved" / "done" lines go
// through the admin's one toast (components/admin/lumen/Toast.tsx); a refusal stays beside the field it is about. A
// send keeps its own confirmation; nothing here offers Undo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = join(__dirname, '..');
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const FILES = ['messages/AutoReplyForm.tsx', 'messages/ChannelsForm.tsx', 'messages/ConsentForm.tsx', 'messages/JourneyForm.tsx', 'messages/MsgAct.tsx', 'messages/TemplateEditor.tsx', 'customers/CampaignForm.tsx', 'customers/EmailSendForm.tsx', 'customers/EmailTemplateForm.tsx', 'customers/JourneyBuilder.tsx'];

describe('Messages speak through the one toast', () => {
  it('every success line goes to showToast, none stays on the page', () => {
    for (const f of FILES) {
      const s = read(f);
      expect(s, f).toContain('showToast');
      expect(s, f).not.toMatch(/setSaid\(\{ text: [^}]*bad: false \}\)|setMsg\(\{ ok: true/);
    }
  });

  it('a message action keeps its own confirmation and offers no Undo', () => {
    const s = read('messages/MsgAct.tsx');
    expect(s).toContain('window.confirm(ask)');
    for (const f of FILES) expect(read(f), f).not.toMatch(/undo\s*:/);
  });

  it('the phone preview stays a light island in dark mode', () => {
    expect(read('messages/TemplateEditor.tsx')).toContain('a2-phone lm-island');
  });
});
