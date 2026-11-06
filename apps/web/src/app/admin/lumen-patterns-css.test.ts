// PR 627 follow-up (CN-036, LUMEN-SPEC §1 "text on cards never smaller than 14 px") — the shared Lumen patterns' styles
// (summary tiles, hero chart, toast, queue, list, split, form + live preview with its badge, settings cards): no text
// under 14 px.
import { describe, expect, it } from 'vitest';
import { readAdmin, smallSizes } from '@/lib/admin-lumen/section-check';

describe('Lumen shared pattern styles', () => {
  it('no text under 14 px', () => {
    expect(smallSizes(readAdmin('lumen-patterns.css'))).toEqual([]);
  });
});
