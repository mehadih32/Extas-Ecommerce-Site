// S25 · PR 482 — pure tests for the video job's input shape (no database).
import { describe, expect, it } from 'vitest';
import { requestVideoJobInput, VIDEO_DURATION_MAX, VIDEO_DURATION_MIN } from './video';

const base = { productId: '0199362c-0000-7000-8000-000000000001', actionId: null, aspect: '9:16' as const, durationSec: 6 };

describe('requestVideoJobInput', () => {
  it('accepts a well-formed request with no action chosen', () => {
    expect(requestVideoJobInput.safeParse(base).success).toBe(true);
  });

  it('accepts every Blueprint C8.1 aspect', () => {
    for (const aspect of ['9:16', '1:1', '4:5', '16:9'] as const) expect(requestVideoJobInput.safeParse({ ...base, aspect }).success).toBe(true);
  });

  it('refuses a duration outside 4–8 seconds (Blueprint C8.1)', () => {
    expect(VIDEO_DURATION_MIN).toBe(4);
    expect(VIDEO_DURATION_MAX).toBe(8);
    expect(requestVideoJobInput.safeParse({ ...base, durationSec: 3 }).success).toBe(false);
    expect(requestVideoJobInput.safeParse({ ...base, durationSec: 9 }).success).toBe(false);
    expect(requestVideoJobInput.safeParse({ ...base, durationSec: 6.5 }).success).toBe(false);
  });

  it('refuses an unknown aspect', () => {
    expect(requestVideoJobInput.safeParse({ ...base, aspect: '21:9' }).success).toBe(false);
  });

  it('refuses an id that is not a product', () => {
    expect(requestVideoJobInput.safeParse({ ...base, productId: 'not-a-uuid' }).success).toBe(false);
  });

  it('refuses an unknown field', () => {
    expect(requestVideoJobInput.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
