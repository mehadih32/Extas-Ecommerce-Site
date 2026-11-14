// S15 · PR 582 — pure tests for the memory digest builder and the kind guard: no database, no AI provider.
import { describe, expect, it } from 'vitest';
import { buildDigest, isMemoryKind, MEMORY_KINDS } from './agent-memory';

describe('isMemoryKind', () => {
  it('accepts every kind in the register row and refuses anything else', () => {
    for (const k of MEMORY_KINDS) expect(isMemoryKind(k)).toBe(true);
    expect(isMemoryKind('rumor')).toBe(false);
    expect(isMemoryKind('')).toBe(false);
  });
});

describe('buildDigest', () => {
  const since = new Date('2026-11-06T00:00:00Z');

  it('with no rows, every count is honestly zero and there are no highlights or top tags', () => {
    const d = buildDigest([], since);
    expect(d.totalCount).toBe(0);
    expect(d.sinceDate).toBe('2026-11-06');
    for (const k of MEMORY_KINDS) expect(d.byKind[k]).toBe(0);
    expect(d.topTags).toEqual([]);
    expect(d.highlights).toEqual([]);
  });

  it('counts by kind and ranks tags by how often they appear', () => {
    const rows = [
      { id: '1', kind: 'fact', content: 'Dhaka orders spike before Eid', tags: ['eid', 'dhaka'], createdAt: new Date('2026-11-12T10:00:00Z') },
      { id: '2', kind: 'fact', content: 'Pathao is faster than Steadfast for Sylhet', tags: ['courier'], createdAt: new Date('2026-11-11T10:00:00Z') },
      { id: '3', kind: 'lesson', content: 'Discount codes over 20% get abused', tags: ['discount', 'eid'], createdAt: new Date('2026-11-10T10:00:00Z') },
    ];
    const d = buildDigest(rows, since);
    expect(d.totalCount).toBe(3);
    expect(d.byKind.fact).toBe(2);
    expect(d.byKind.lesson).toBe(1);
    expect(d.byKind.instruction).toBe(0);
    expect(d.topTags[0]).toEqual({ tag: 'eid', count: 2 });
  });

  it('truncates a long highlight and keeps the newest rows first, capped at five', () => {
    const long = 'x'.repeat(300);
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      kind: 'task',
      content: i === 0 ? long : `memory ${i}`,
      tags: [],
      createdAt: new Date(since.getTime() + i * 1000),
    }));
    const d = buildDigest(rows, since);
    expect(d.highlights).toHaveLength(5);
    expect(d.highlights[0]!.content.endsWith('…')).toBe(true);
    expect(d.highlights[0]!.content.length).toBeLessThanOrEqual(161);
  });

  it('reads an unknown stored kind as the honest fallback "fact" rather than throwing', () => {
    const d = buildDigest([{ id: '1', kind: 'not-a-real-kind', content: 'x', tags: [], createdAt: since }], since);
    expect(d.highlights[0]!.kind).toBe('fact');
  });
});
