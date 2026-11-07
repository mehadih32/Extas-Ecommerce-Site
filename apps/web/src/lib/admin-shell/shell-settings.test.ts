// PR 495 (12) follow-up 205 — the Start & search page's conversions: the start-page card lists every role (the Dashboard
// when none), saving back drops the Dashboard entries and keeps roles that are no longer listed; the Dashboard's date
// choices travel as rows; the switch cards turn recent pages on with a count inside 1–10 and off as 0. Sample roles only.
import { describe, expect, it } from 'vitest';
import { dashCardOf, dashFrom, searchCardOf, shellWithSwitch, START_SECTIONS, startCardOf, startPagesFrom } from './shell-settings';

const roles = [{ key: 'packing' }, { key: 'accounts' }];
const shell = { badgeCacheSeconds: 30, searchPerGroup: 5, searchMinChars: 2, recentPages: 0, keyJumps: false };

describe('Start & search page (follow-up 205)', () => {
  it('lists every role with its start section, the Dashboard when it has none', () => {
    expect(startCardOf({ packing: 'orders', gone: 'money' }, roles)).toEqual({ packing: 'orders', accounts: 'dashboard' });
  });

  it('saves only real start pages and keeps a role no longer listed', () => {
    expect(startPagesFrom({ packing: 'dashboard', accounts: 'money' }, { packing: 'orders', gone: 'support' }, roles)).toEqual({ accounts: 'money', gone: 'support' });
    expect(startPagesFrom({}, { packing: 'orders' }, roles)).toEqual({ packing: 'orders' });
  });

  it('does not offer AI Center while its stage is closed', () => {
    expect(START_SECTIONS).not.toContain('ai');
    expect(START_SECTIONS).toContain('orders');
  });

  it('carries the Dashboard date choices as rows and back', () => {
    const card = dashCardOf({ ranges: [1, 7, 30], afternoonHour: 12, eveningHour: 17, sparkDays: 14 });
    expect(card.ranges).toEqual([{ days: 1 }, { days: 7 }, { days: 30 }]);
    expect(dashFrom(card)).toEqual({ ranges: [1, 7, 30], afternoonHour: 12, eveningHour: 17, sparkDays: 14 });
  });

  it('the search card holds the three numbers only', () => {
    expect(searchCardOf({ ...shell, recentPages: 4, keyJumps: true })).toEqual({ badgeCacheSeconds: 30, searchPerGroup: 5, searchMinChars: 2 });
  });

  it('switch cards: recent pages on with a count inside 1–10, off = 0; key jumps on and off; nothing else moves', () => {
    expect(shellWithSwitch(shell, 'recentPages', true, { count: 4 })).toEqual({ ...shell, recentPages: 4 });
    expect(shellWithSwitch(shell, 'recentPages', true, { count: 99 }).recentPages).toBe(10);
    expect(shellWithSwitch(shell, 'recentPages', true, { count: 0 }).recentPages).toBe(1);
    expect(shellWithSwitch(shell, 'recentPages', true, {}).recentPages).toBe(10);
    expect(shellWithSwitch({ ...shell, recentPages: 6 }, 'recentPages', false, { count: 6 })).toEqual(shell);
    expect(shellWithSwitch(shell, 'keyJumps', true, {})).toEqual({ ...shell, keyJumps: true });
    expect(shellWithSwitch({ ...shell, keyJumps: true }, 'keyJumps', false, {})).toEqual(shell);
  });
});
