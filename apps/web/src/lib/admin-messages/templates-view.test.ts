// S14 · PR 505 — the Templates list order and the Order journey form's draft (journey-draft.ts).
import { describe, expect, it } from 'vitest';
import type { JourneyConfig, TemplateGroup } from '@extas/messages';
import { DEFAULT_JOURNEY } from '@extas/settings';
import { journeyChanges, journeyDraft, stepOf, clock } from './journey-draft';
import { groupTemplates, openGroup } from './templates-view';

const g = (key: string, uses: string[]): TemplateGroup => ({ key, name: key, uses: uses.map((use) => ({ use, channels: ['SMS'], on: true })), rows: [], missing: [], problems: 0, edited: false });

describe('PR 505 · the Templates list', () => {
  it('journey templates first in the journey`s order, then other messages, then the unused', () => {
    const list = [g('a.unused', []), g('order.packed', ['packed']), g('reply.received', ['autoReply']), g('order.placed', ['placed'])];
    const out = groupTemplates(list, ['placed', 'confirmed', 'packed']);
    expect(out.journey.map((x) => x.key)).toEqual(['order.placed', 'order.packed']);
    expect(out.other.map((x) => x.key)).toEqual(['reply.received']);
    expect(out.unused.map((x) => x.key)).toEqual(['a.unused']);
    expect(openGroup(out, 'reply.received')?.key).toBe('reply.received');
    expect(openGroup(out, 'nope')?.key).toBe('order.placed');
    expect(openGroup({ journey: [], other: [], unused: [] }, null)).toBeNull();
  });
});

const config = {
  enabled: true,
  journey: DEFAULT_JOURNEY,
  caps: { SMS: 2, WHATSAPP: 1, EMAIL: null, total: null },
  selfConfirm: { newCustomersOnly: false, waitHours: 3, confirmOnYes: true, countsAsTheOneWhatsApp: true },
  quietHours: { on: false, fromHour: 22, toHour: 8 },
  language: 'store',
  amountLine: { en: 'Keep {amount} ready.', bn: '{amount} হাতে রাখুন।' },
  exactAmount: { due: { en: 'x', bn: 'x' }, paid: { en: 'y', bn: 'y' } },
  cancelNotice: { reasons: {}, silent: [], duplicateTemplate: 'order.cancelledDuplicate' },
} as unknown as JourneyConfig;

describe('PR 505 · the Order journey form', () => {
  it('an untouched draft sends nothing; a changed step sends the whole journey', () => {
    const d = journeyDraft(config);
    expect(journeyChanges(d, config)).toEqual({ changes: {}, bad: [] });
    d.steps.booked = { ...d.steps.booked!, on: true, channel: 'WHATSAPP', fallback: 'SMS' };
    const { changes, bad } = journeyChanges(d, config);
    expect(bad).toEqual([]);
    expect((changes.journey as typeof DEFAULT_JOURNEY).booked).toMatchObject({ on: true, channel: 'WHATSAPP', fallback: 'SMS' });
    expect((changes.journey as typeof DEFAULT_JOURNEY).placed).toEqual(DEFAULT_JOURNEY.placed);
  });

  it('times: at once, minutes later, a time of day; a number that is not whole is named', () => {
    const d = journeyDraft(config);
    expect(d.steps.day1Care).toMatchObject({ kind: 'at', days: '1', hour: '11', minute: '0' });
    expect(stepOf({ ...d.steps.packed!, kind: 'after', minutes: '45' })?.when).toEqual({ kind: 'after', minutes: 45 });
    expect(stepOf({ ...d.steps.packed!, kind: 'after', minutes: '' })).toBeNull();
    expect(stepOf({ ...d.steps.packed!, kind: 'at', days: '2', hour: '9', minute: 'x' })).toBeNull();
    d.steps.packed = { ...d.steps.packed!, kind: 'after', minutes: '4.5' };
    d.waitHours = '';
    expect(journeyChanges(d, config).bad).toEqual(['packed', 'waitHours']);
    expect(clock(9, 5)).toBe('09:05');
  });

  it('more options: language, the amount line and the self-confirm', () => {
    const d = { ...journeyDraft(config), language: 'bn' as const, amountLine: { en: 'Pay {amount}.', bn: '{amount} দিন।' }, waitHours: '0', countsAsOne: false };
    expect(journeyChanges(d, config).changes).toEqual({
      language: 'bn',
      amountLine: { en: 'Pay {amount}.', bn: '{amount} দিন।' },
      selfConfirm: { newCustomersOnly: false, waitHours: 0, confirmOnYes: true, countsAsTheOneWhatsApp: false },
    });
  });
});
