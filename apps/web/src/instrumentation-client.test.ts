// PR 378 (follow-up): the browser start-up turns Zod's eval probe off, so the content security policy never sees
// `new Function` (the "script-src stopped eval" reports), and parsing still gives the same answers.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { config } from 'zod/v4/core';

describe('instrumentation-client', () => {
  it('sets Zod jitless, so no `new Function` is ever made while parsing', async () => {
    await import('./instrumentation-client');
    expect(config().jitless).toBe(true);
    const made = vi.fn();
    const Real = globalThis.Function;
    globalThis.Function = new Proxy(Real, { construct: (t, a) => (made(), Reflect.construct(t, a)) });
    try {
      const shape = z.object({ name: z.string().min(1), n: z.number().int() });
      expect(shape.safeParse({ name: 'a', n: 2 }).success).toBe(true);
      expect(shape.safeParse({ name: '', n: 2.5 }).success).toBe(false);
    } finally {
      globalThis.Function = Real;
    }
    expect(made).not.toHaveBeenCalled();
  });
});
