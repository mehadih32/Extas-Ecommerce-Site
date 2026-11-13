// S24 · PR 462 — pure tests for `aggregatePilotMetrics` (C7.19's own named numbers), no DB.
import { describe, expect, it } from 'vitest';
import { aggregatePilotMetrics, type PilotJobRow, type PilotOutputRow } from './pilotMetrics';

const job = (over: Partial<PilotJobRow> = {}): PilotJobRow => ({ id: 'j1', status: 'APPROVED', attempt: 1, actualMinor: null, startedAt: null, finishedAt: null, ...over });
const output = (over: Partial<PilotOutputRow> = {}): PilotOutputRow => ({ jobId: 'j1', reviewStatus: 'APPROVED', reviewedAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), ...over });

describe('aggregatePilotMetrics', () => {
  it('is all null, never 0, with no rows at all (CN-018: never an invented number)', () => {
    const m = aggregatePilotMetrics([], []);
    expect(m).toEqual({
      generatedImages: 0,
      approvedImages: 0,
      costPerApprovedMinor: null,
      firstPassApprovalRatePercent: null,
      retriesPerApprovedImage: null,
      avgProcessingTimeMs: null,
      failureRatePercent: null,
      avgReviewTimeMs: null,
      jobCount: 0,
      terminalJobCount: 0,
    });
  });

  it('counts every candidate as generated, only APPROVED ones as approved', () => {
    const m = aggregatePilotMetrics(
      [job({ id: 'j1' })],
      [output({ jobId: 'j1', reviewStatus: 'APPROVED' }), output({ jobId: 'j1', reviewStatus: 'NOT_SELECTED' })],
    );
    expect(m.generatedImages).toBe(2);
    expect(m.approvedImages).toBe(1);
  });

  it('cost per approved image: real spend over approved jobs only, divided by approved images', () => {
    const m = aggregatePilotMetrics(
      [job({ id: 'j1', actualMinor: 1000 }), job({ id: 'j2', actualMinor: 2000, status: 'REJECTED' })],
      [output({ jobId: 'j1', reviewStatus: 'APPROVED' }), output({ jobId: 'j2', reviewStatus: 'REJECTED' })],
    );
    expect(m.costPerApprovedMinor).toBe(1000); // j2 never approved, its spend is not counted
  });

  it('a job with no recorded spend (free provider, or none named) costs 0, not skipped', () => {
    const m = aggregatePilotMetrics([job({ id: 'j1', actualMinor: null })], [output({ jobId: 'j1', reviewStatus: 'APPROVED' })]);
    expect(m.costPerApprovedMinor).toBe(0);
  });

  it('first-pass approval rate: share of approved jobs with attempt 1', () => {
    const m = aggregatePilotMetrics(
      [job({ id: 'j1', attempt: 1 }), job({ id: 'j2', attempt: 2 }), job({ id: 'j3', attempt: 3 })],
      [output({ jobId: 'j1', reviewStatus: 'APPROVED' }), output({ jobId: 'j2', reviewStatus: 'APPROVED' }), output({ jobId: 'j3', reviewStatus: 'APPROVED' })],
    );
    expect(m.firstPassApprovalRatePercent).toBe(33); // 1 of 3, rounded
  });

  it('retries per approved image: mean(attempt - 1) over approved jobs', () => {
    const m = aggregatePilotMetrics(
      [job({ id: 'j1', attempt: 1 }), job({ id: 'j2', attempt: 3 })],
      [output({ jobId: 'j1', reviewStatus: 'APPROVED' }), output({ jobId: 'j2', reviewStatus: 'APPROVED' })],
    );
    expect(m.retriesPerApprovedImage).toBe(1); // (0 + 2) / 2
  });

  it('processing time: mean finishedAt - startedAt, over every job with both set (any status)', () => {
    const m = aggregatePilotMetrics(
      [
        job({ id: 'j1', startedAt: new Date('2026-01-01T00:00:00Z'), finishedAt: new Date('2026-01-01T00:01:00Z') }),
        job({ id: 'j2', startedAt: new Date('2026-01-01T00:00:00Z'), finishedAt: new Date('2026-01-01T00:03:00Z') }),
        job({ id: 'j3' }), // neither timestamp — left out
      ],
      [],
    );
    expect(m.avgProcessingTimeMs).toBe(120_000); // mean of 60s and 180s
  });

  it('failure rate: FAILED share of jobs that reached a real conclusion, never counting DRAFT/QUEUED/PROCESSING/CANCELLED', () => {
    const m = aggregatePilotMetrics(
      [job({ id: 'j1', status: 'FAILED' }), job({ id: 'j2', status: 'PUBLISHED' }), job({ id: 'j3', status: 'QUEUED' }), job({ id: 'j4', status: 'CANCELLED' })],
      [],
    );
    expect(m.failureRatePercent).toBe(50); // 1 FAILED of 2 terminal (j1, j2) — j3/j4 excluded
    expect(m.terminalJobCount).toBe(2);
  });

  it('review time: mean reviewedAt - createdAt, over outputs that were actually decided', () => {
    const m = aggregatePilotMetrics(
      [job({ id: 'j1' })],
      [
        output({ jobId: 'j1', createdAt: new Date('2026-01-01T00:00:00Z'), reviewedAt: new Date('2026-01-01T00:10:00Z') }),
        output({ jobId: 'j1', reviewStatus: 'PENDING', reviewedAt: null }), // not yet decided — left out
      ],
    );
    expect(m.avgReviewTimeMs).toBe(600_000);
  });

  it('jobCount is every job in the period, regardless of status', () => {
    const m = aggregatePilotMetrics([job({ id: 'j1', status: 'DRAFT' }), job({ id: 'j2', status: 'PUBLISHED' })], []);
    expect(m.jobCount).toBe(2);
  });
});
