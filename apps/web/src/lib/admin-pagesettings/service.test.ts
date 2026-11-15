// PR 744 — the platform checks for currency, language and time zone (no database).
import { describe, expect, it } from 'vitest';
import { platformIssue } from './service';

describe('platformIssue (PR 744)', () => {
  it('accepts real values', () => {
    expect(platformIssue('store.currency', 'BDT')).toBeNull();
    expect(platformIssue('store.locale', 'en-GB')).toBeNull();
    expect(platformIssue('store.timeZone', 'Asia/Dhaka')).toBeNull();
  });
  it('refuses made-up ones', () => {
    expect(platformIssue('store.currency', 'bdt')).not.toBeNull();
    expect(platformIssue('store.currency', 'ZZZZ')).not.toBeNull();
    expect(platformIssue('store.timeZone', 'Mars/Base')).not.toBeNull();
    expect(platformIssue('store.locale', 'not a tag')).not.toBeNull();
  });
  it('leaves other keys alone', () => {
    expect(platformIssue('cookie.banner', 'x')).toBeNull();
    expect(platformIssue('store.currency', 5)).toBeNull();
  });
});
