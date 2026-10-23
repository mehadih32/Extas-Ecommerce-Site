import { describe, expect, it } from 'vitest';
import { motionSettings, thanksCelebrateSchema } from '@extas/settings';
import { celebrationFor, celebrationMode, type DeviceFacts } from './celebrate';

const SET = motionSettings['thanks.celebrate'].default;
const ON = { ...SET, on: true };
const FAST: DeviceFacts = { reducedMotion: false, saveData: false, effectiveType: '4g', memoryGb: 8, cores: 8, seen: false };

describe('PR 87 · the celebration overlay', () => {
  it('ships off, never longer than 2.5 seconds, once per customer per occasion', () => {
    expect(SET).toMatchObject({ on: false, once: true });
    expect(SET.durationMs).toBeLessThanOrEqual(2500);
    expect(thanksCelebrateSchema.safeParse({ ...SET, durationMs: 2600 }).success).toBe(false);
    expect(thanksCelebrateSchema.safeParse({ ...SET, from: '2026-11-02', until: '2026-11-01' }).success).toBe(false);
  });

  it('off: nothing reaches the page, unless the owner previews it', () => {
    expect(celebrationFor(SET, '2026-10-23', 'A1', null, 'Thank you!')).toBeNull();
    expect(celebrationFor(SET, '2026-10-23', 'A1', 'preview', 'Thank you!')).toMatchObject({ preview: true });
    expect(celebrationFor({ ...SET, preview: false }, '2026-10-23', 'A1', 'preview', 'x')).toBeNull();
  });

  it('on: only between the occasion\'s first and last day', () => {
    const eid = { ...ON, from: '2026-11-01', until: '2026-11-03' };
    expect(celebrationFor(eid, '2026-10-31', 'A1', null, 'x')).toBeNull();
    expect(celebrationFor(eid, '2026-11-01', 'A1', null, 'x')).not.toBeNull();
    expect(celebrationFor(eid, '2026-11-03', 'A1', null, 'x')).not.toBeNull();
    expect(celebrationFor(eid, '2026-11-04', 'A1', null, 'x')).toBeNull();
  });

  it('remembered per occasion, or per order when not once per customer', () => {
    expect(celebrationFor(ON, '2026-10-23', 'A1', null, 'x')?.seenKey).toBe('celebrate:launch');
    expect(celebrationFor({ ...ON, once: false }, '2026-10-23', 'A1', null, 'x')?.seenKey).toBe('celebrate:launch:A1');
  });

  it('never on a slow connection, data saving or a low-end phone, never twice; reduced motion gets the still words', () => {
    const plan = { preview: false, text: 'Thank you!' };
    expect(celebrationMode(plan, FAST)).toBe('play');
    expect(celebrationMode(plan, { ...FAST, seen: true })).toBe('skip');
    expect(celebrationMode(plan, { ...FAST, saveData: true })).toBe('skip');
    expect(celebrationMode(plan, { ...FAST, effectiveType: '3g' })).toBe('skip');
    expect(celebrationMode(plan, { ...FAST, memoryGb: 1 })).toBe('skip');
    expect(celebrationMode(plan, { ...FAST, cores: 2 })).toBe('skip');
    expect(celebrationMode(plan, { ...FAST, effectiveType: null, memoryGb: null, cores: null })).toBe('play');
    expect(celebrationMode(plan, { ...FAST, reducedMotion: true })).toBe('still');
    expect(celebrationMode({ ...plan, text: '' }, { ...FAST, reducedMotion: true })).toBe('skip');
  });

  it('a preview plays every time, and still respects reduced motion', () => {
    const plan = { preview: true, text: 'x' };
    expect(celebrationMode(plan, { ...FAST, seen: true, effectiveType: '2g' })).toBe('play');
    expect(celebrationMode(plan, { ...FAST, reducedMotion: true })).toBe('still');
  });
});
