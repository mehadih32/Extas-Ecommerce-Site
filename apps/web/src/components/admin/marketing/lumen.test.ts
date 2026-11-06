// PR 638 (CN-036) — Marketing part 1 in the Lumen look: the marketing and Smart Rules screens say "done" through the
// admin's one toast (components/admin/lumen/Toast.tsx); a refusal stays beside the field that caused it (or, on the
// Smart Rules screens, the same toast in the "bad" tone). None of them draws its own .ad-toast, and none offers Undo:
// coupons, discounts and ad budgets keep their own confirmation and the owner's OK (hard rule 6).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = join(__dirname, '..');
const read = (f: string) => readFileSync(join(here, f), 'utf8');

const MARKETING = ['AdAlertControls', 'AdCampaignBuilder', 'AdPlatformControls', 'AudienceBuilder', 'AudiencePush', 'BriefControls', 'CalendarForms', 'CampaignEditor', 'GrowthControls', 'LandingBuilder', 'OutreachForms', 'ReferralReward', 'SeasonalEditor', 'SeasonalForms', 'YoutubeForms'].map((f) => `marketing/${f}.tsx`);
const RULES = ['rules/RulesScreen.tsx', 'rules/NoticesScreen.tsx', 'rules/EidScreen.tsx'];

describe('Marketing part 1 speaks through the one toast', () => {
  it('every success line goes to showToast; only the copy-by-hand link stays on the page', () => {
    for (const f of MARKETING) {
      const s = read(f);
      expect(s, f).toContain('showToast');
      const inline = s.match(/set(?:Said|Out|TplSaid)\(\{ text: [^}]*bad: false \}\)|setMsg\(\{ ok: true/g) ?? [];
      expect(inline.every((m) => m.startsWith('setSaid({ text: link,')), `${f}: ${inline.join(' | ')}`).toBe(true);
    }
  });

  it('the Smart Rules screens draw no .ad-toast of their own and offer no Undo', () => {
    for (const f of RULES) {
      const s = read(f);
      expect(s, f).not.toContain('ad-toast');
      expect(s, f).not.toMatch(/undo\s*:/);
    }
  });

  it('no marketing screen offers Undo (budgets, offers and rewards are not reversible shop actions)', () => {
    for (const f of MARKETING) expect(read(f), f).not.toMatch(/undo\s*:/);
  });
});
