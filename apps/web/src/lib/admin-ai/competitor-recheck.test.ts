// S15 · PR 337 — the deterministic diff between a competitor's last report and its newest walk: pure, no DB, no
// AI call (the same "pure code decides the match, never the model" discipline PR 336's own pairing already set).
import { describe, expect, it } from 'vitest';
import { diffCompetitorFindings } from './competitor-recheck';
import type { CompetitorJourneyStepResult } from './competitor-journey-dispatch';

const step = (over: Partial<CompetitorJourneyStepResult> = {}): CompetitorJourneyStepResult => ({ label: 'Product', url: 'https://competitor.example/p/1', title: 'Their Polo', blocked: false, blockReason: null, note: 'A grid with a sale badge on every tile.', ...over });

describe('diffCompetitorFindings (PR 337)', () => {
  it('has no prior and no change at all on the very first run — never a fabricated "no change"', () => {
    const d = diffCompetitorFindings(null, step());
    expect(d.hasPrior).toBe(false);
    expect(d.changed).toBe(false);
    expect(d.changes).toEqual([]);
  });

  it('flags no change when nothing about the page differs', () => {
    const d = diffCompetitorFindings(step(), step());
    expect(d.hasPrior).toBe(true);
    expect(d.changed).toBe(false);
    expect(d.changes).toEqual([]);
  });

  it('flags a title change', () => {
    const d = diffCompetitorFindings(step({ title: 'Old Title' }), step({ title: 'New Title' }));
    expect(d.changed).toBe(true);
    expect(d.changes).toEqual([{ field: 'title', from: 'Old Title', to: 'New Title' }]);
  });

  it('flags becoming blocked, and becoming unblocked, as a plain ok/blocked change', () => {
    const became = diffCompetitorFindings(step({ blocked: false }), step({ blocked: true, title: null, note: null }));
    expect(became.changes).toContainEqual({ field: 'blocked', from: 'ok', to: 'blocked' });
    const recovered = diffCompetitorFindings(step({ blocked: true, title: null, note: null }), step({ blocked: false }));
    expect(recovered.changes).toContainEqual({ field: 'blocked', from: 'blocked', to: 'ok' });
  });

  it('flags a changed AI note, and can flag more than one field at once', () => {
    const d = diffCompetitorFindings(step({ title: 'A', note: 'old note' }), step({ title: 'B', note: 'new note' }));
    expect(d.changes.map((c) => c.field).sort()).toEqual(['note', 'title']);
  });

  it('cuts a very long before/after value rather than storing it whole', () => {
    const d = diffCompetitorFindings(step({ note: 'x'.repeat(400) }), step({ note: 'y'.repeat(400) }));
    const noteChange = d.changes.find((c) => c.field === 'note')!;
    expect(noteChange.from!.length).toBeLessThanOrEqual(301);
    expect(noteChange.to!.length).toBeLessThanOrEqual(301);
  });
});
