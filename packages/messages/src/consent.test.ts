// PR 298 — the stop and start words without a database: any case, Bengali too, the whole reply only, and the setting's
// own checks (a word cannot both stop and start).
import { describe, expect, it } from 'vitest';
import { consentSettingsSchema, registry } from '@extas/settings';
import { consentWordOf, phoneOf } from './pure';

const cfg = registry['messages.consent'].default;

describe('PR 298 · stop and start words', () => {
  it('reads the whole reply as a stop or start word, any case, Bengali too', () => {
    expect(['stop', ' STOP. ', 'Unsubscribe', 'বন্ধ', 'বন্ধ।'].map((t) => consentWordOf(cfg, t))).toEqual(['stop', 'stop', 'stop', 'stop', 'stop']);
    expect(['start', 'চালু'].map((t) => consentWordOf(cfg, t))).toEqual(['start', 'start']);
    expect(['stop it', 'please stop', '', '1'].map((t) => consentWordOf(cfg, t))).toEqual([null, null, null, null]);
  });

  it('ships honouring a stop of every message on the channel it came on, offers none, no answer sent', () => {
    expect(cfg).toMatchObject({ stopCovers: 'everything', stopChannels: 'thisChannel', offerSteps: [], confirmReply: false });
    expect(consentSettingsSchema.safeParse({ ...cfg, startWords: ['Stop'] }).success).toBe(false);
    expect(consentSettingsSchema.safeParse({ ...cfg, stopWords: ['STOP', 'stop'] }).success).toBe(false);
    expect(consentSettingsSchema.safeParse({ ...cfg, offerSteps: ['day3Review', 'day3Review'] }).success).toBe(false);
  });

  it('a number in any Bangladeshi form is the same number', () => {
    expect(phoneOf('01700-000298')).toBe(phoneOf('+8801700000298'));
    expect(phoneOf('12')).toBeNull();
  });
});
