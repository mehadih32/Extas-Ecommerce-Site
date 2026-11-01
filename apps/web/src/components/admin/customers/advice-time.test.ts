// PR 294: "Send at that time" lands on the store's hour, whatever the browser's own zone.
import { describe, expect, it } from 'vitest';
import { nextStoreHour } from './advice-time';

describe('nextStoreHour (PR 294)', () => {
  it('finds the next store-clock hour and writes it in the browser clock', () => {
    // 10:20 UTC = 16:20 in Dhaka (UTC+6); 20:00 Dhaka = 14:00 UTC the same day
    const now = new Date(Date.UTC(2026, 10, 1, 10, 20));
    const v = nextStoreHour(20, 'Asia/Dhaka', now);
    const back = new Date(v); // read back in the same browser clock
    expect(back.getTime()).toBe(Date.UTC(2026, 10, 1, 14, 0));
    // an hour already past today goes to tomorrow: 09:00 Dhaka = 03:00 UTC on 2 Nov
    expect(new Date(nextStoreHour(9, 'Asia/Dhaka', now)).getTime()).toBe(Date.UTC(2026, 10, 2, 3, 0));
    // exactly on the hour: the next day, never now
    expect(new Date(nextStoreHour(16, 'Asia/Dhaka', new Date(Date.UTC(2026, 10, 1, 10, 0)))).getTime()).toBe(Date.UTC(2026, 10, 2, 10, 0));
    // a half-hour zone
    expect(new Date(nextStoreHour(20, 'Asia/Kolkata', now)).getTime()).toBe(Date.UTC(2026, 10, 1, 14, 30));
  });
});
