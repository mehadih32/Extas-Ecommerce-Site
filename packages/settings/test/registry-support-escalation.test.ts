// S22 · PR 538 (registry v188): desk hours, telling the owner when nobody answers, link safety — never owner data,
// labelled in both languages, off as shipped (CN-018), every number editable within its bounds, strict.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportDeskHoursSchema, supportEscalationSchema, supportEscalationSettings, supportLinkSafetySchema } from '../src/registry-support-escalation';

const keys = ['support.deskHours', 'support.escalation', 'support.linkSafety'] as const;

describe('support desk hours, escalation, link safety (v188)', () => {
  it('are in the registry at version 188, store-level, labelled in English and Bengali, off as shipped', () => {
    for (const k of keys) {
      const s = supportEscalationSettings[k];
      expect(registry[k]).toBe(s);
      expect(s.version).toBe(188);
      expect(s.scope).toBe('store');
      expect(s.isOwnerData).toBe(false);
      expect(s.isPublic).toBe(false);
      expect((s.default as { enabled: boolean }).enabled).toBe(false);
      for (const lang of ['en', 'bn'] as const) for (const m of [s.labelKey, s.helpKey!]) expect(lookup(messages[lang], m)).toBeTruthy();
    }
  });

  it('desk hours: every day 10:00–22:00 as shipped; closes after it opens; real times only', () => {
    const d = supportEscalationSettings['support.deskHours'].default;
    expect(d).toEqual({ enabled: false, days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'], opens: '10:00', closes: '22:00' });
    expect(supportDeskHoursSchema.safeParse({ ...d, closes: '24:00' }).success).toBe(true);
    for (const bad of [{ opens: '22:00', closes: '10:00' }, { opens: '10:00', closes: '10:00' }, { opens: '25:00' }, { closes: '9:00' }, { days: ['sat', 'sat'] }, { days: ['mon', 'xyz'] }, { extra: 1 }])
      expect(supportDeskHoursSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });

  it('escalation: 5 minutes, waits for the desk, both languages carry the four blanks; bounds refused', () => {
    const e = supportEscalationSettings['support.escalation'].default;
    expect(e.minutes).toBe(5);
    expect(e.outsideHours).toBe('wait');
    for (const l of ['en', 'bn'] as const) for (const b of ['{minutes}', '{channel}', '{name}', '{ref}']) expect(e.words[l]).toContain(b);
    for (const bad of [{ minutes: 0 }, { minutes: 241 }, { perHour: 0 }, { perHour: 201 }, { lookBackHours: 0 }, { lookBackHours: 169 }, { outsideHours: 'never' }, { lang: 'fr' }, { words: { en: '', bn: 'x' } }, { extra: 1 }])
      expect(supportEscalationSchema.safeParse({ ...e, ...bad }).success).toBe(false);
  });

  it('link safety: lists are text with a bound', () => {
    const l = supportEscalationSettings['support.linkSafety'].default;
    expect(l.shorteners).toContain('bit.ly');
    expect(l.trustedSites).toBe('');
    expect(supportLinkSafetySchema.safeParse({ ...l, trustedSites: 'x'.repeat(1001) }).success).toBe(false);
    expect(supportLinkSafetySchema.safeParse({ ...l, extra: 1 }).success).toBe(false);
  });
});
