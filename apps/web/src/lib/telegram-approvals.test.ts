// S28 · PR 703 — the pure parts of the Telegram approvals: which requests go to Telegram, how long the buttons stay live,
// the chat line, and the constant-time secret check.
import { describe, expect, it } from 'vitest';
import type { TelegramApprovalsSettings } from '@extas/settings';
import { approvalText, asksTelegram, buttonsLive, secretMatches } from './telegram-approvals';

const cfg = (over: Partial<TelegramApprovalsSettings> = {}): TelegramApprovalsSettings => ({ enabled: true, refund: true, price: true, cash: true, cod: true, codOverMinor: 800000, waitMinutes: 30, pinAlarmPerDay: 5, pinLockPerDay: 20, lockedAt: null, ...over });

describe('which approvals go to Telegram', () => {
  it('nothing while the switch is off or the lock is on', () => {
    expect(asksTelegram(cfg({ enabled: false }), 'refund', 100)).toBe(false);
    expect(asksTelegram(cfg({ lockedAt: '2026-11-13T10:00:00Z' }), 'refund', 100)).toBe(false);
  });
  it('refund and price follow their switch; COD only over the line; other never', () => {
    expect(asksTelegram(cfg(), 'refund', null)).toBe(true);
    expect(asksTelegram(cfg({ refund: false }), 'refund', null)).toBe(false);
    expect(asksTelegram(cfg({ price: false }), 'price', null)).toBe(false);
    expect(asksTelegram(cfg(), 'cod', 800000)).toBe(false);
    expect(asksTelegram(cfg(), 'cod', 800001)).toBe(true);
    expect(asksTelegram(cfg(), 'cod', null)).toBe(false);
    expect(asksTelegram(cfg({ cod: false }), 'cod', 9_000_000)).toBe(false);
    expect(asksTelegram(cfg(), 'other', 9_000_000)).toBe(false);
  });
  it('cash entries waiting for an approver (PR 687) follow their own switch', () => {
    expect(asksTelegram(cfg(), 'cash', 5000)).toBe(true);
    expect(asksTelegram(cfg({ cash: false }), 'cash', 5000)).toBe(false);
  });
});

describe('buttons, text and secret', () => {
  const NOW = new Date('2026-11-13T12:00:00Z');
  it('the buttons stay live for the setting minutes after the ask', () => {
    expect(buttonsLive(new Date('2026-11-13T11:31:00Z'), NOW, 30)).toBe(true);
    expect(buttonsLive(new Date('2026-11-13T11:29:00Z'), NOW, 30)).toBe(false);
    expect(buttonsLive(null, NOW, 30)).toBe(false);
  });
  it('the chat line holds the title, the amount and the detail, nothing else', () => {
    const t = approvalText({ kind: 'cod', title: 'Big COD order #1042', detail: 'Courier score 7.4', amountMinor: 950000 }, { heading: 'Needs your OK', amount: (m) => `${m / 100} Tk` });
    expect(t).toBe('Needs your OK\nBig COD order #1042\n9500 Tk\nCourier score 7.4');
    expect(approvalText({ kind: 'price', title: 'x', detail: null, amountMinor: null }, { heading: 'h', amount: () => '' })).toBe('h\nx');
  });
  it('the secret must match exactly', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abd', 'abc')).toBe(false);
    expect(secretMatches('ab', 'abc')).toBe(false);
    expect(secretMatches('abc', undefined)).toBe(false);
  });
});
