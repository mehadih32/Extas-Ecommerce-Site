// Follow-up 650 (PR 280) — which seasonal home windows make a note in the bell: a start inside the days, an end (its
// own end time) or a stop before that end inside the days; a window stopped before it started never showed, so none;
// newest first.
import { describe, expect, it } from 'vitest';
import { seasonalNoteEvents, type NoteWindow } from './seasonal-notes';

const d = (s: string) => new Date(`${s}:00Z`);
const w = (id: string, applyAt: string, revertAt: string | null, stoppedAt: string | null = null): NoteWindow => ({
  id,
  name: id.toUpperCase(),
  applyAt: d(applyAt),
  revertAt: revertAt ? d(revertAt) : null,
  status: stoppedAt ? 'STOPPED' : 'SCHEDULED',
  stoppedAt: stoppedAt ? d(stoppedAt) : null,
});

describe('seasonalNoteEvents (follow-up 650)', () => {
  const from = d('2027-03-07T00:00');
  const now = d('2027-03-14T00:00');

  it('a start and an end inside the days, newest first; outside them nothing', () => {
    const rows = [w('eid', '2027-03-09T12:00', '2027-03-12T18:00'), w('old', '2027-02-01T00:00', '2027-02-05T00:00'), w('soon', '2027-03-20T00:00', null)];
    expect(seasonalNoteEvents(rows, from, now).map((e) => [e.kind, e.name, e.at.toISOString()])).toEqual([
      ['ended', 'EID', '2027-03-12T18:00:00.000Z'],
      ['started', 'EID', '2027-03-09T12:00:00.000Z'],
    ]);
  });

  it('a window that began before the days and ends inside them: only its end', () => {
    expect(seasonalNoteEvents([w('long', '2027-02-20T00:00', '2027-03-10T00:00')], from, now).map((e) => e.kind)).toEqual(['ended']);
  });

  it('stopped while live: "stopped" at the stop; stopped after its own end: the end; stopped before it started: nothing', () => {
    expect(seasonalNoteEvents([w('a', '2027-03-08T00:00', '2027-03-12T00:00', '2027-03-10T00:00')], from, now).map((e) => [e.kind, e.at.toISOString()])).toEqual([
      ['stopped', '2027-03-10T00:00:00.000Z'],
      ['started', '2027-03-08T00:00:00.000Z'],
    ]);
    expect(seasonalNoteEvents([w('b', '2027-03-08T00:00', '2027-03-09T00:00', '2027-03-11T00:00')], from, now).map((e) => e.kind)).toEqual(['ended', 'started']);
    expect(seasonalNoteEvents([w('c', '2027-03-12T00:00', null, '2027-03-11T00:00')], from, now)).toEqual([]);
    expect(seasonalNoteEvents([w('open', '2027-03-08T00:00', null, '2027-03-13T00:00')], from, now).map((e) => e.id)).toEqual(['seasonal-end-open', 'seasonal-start-open']);
  });
});
