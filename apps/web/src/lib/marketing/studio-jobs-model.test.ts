import { describe, expect, it } from 'vitest';
import type { SocialPostRow } from '@extas/studio';
import { jobState, postOf, summarise } from './studio-jobs-model';

const post = (id: string, status: SocialPostRow['status'], assets: string[], createdAt = '2026-11-01T00:00:00Z'): SocialPostRow =>
  ({ id, accountId: 'a', platform: 'facebook', kind: 'image', caption: null, mediaAssetIds: assets, status, scheduledAt: null, approvalRequestId: null, externalPostId: null, publishedAt: null, error: null, createdAt, updatedAt: createdAt }) as SocialPostRow;

describe('studio jobs board', () => {
  it('reads the state from the job and the post made of its file', () => {
    expect(jobState({ status: 'QUEUED', outputAssetId: null }, null)).toBe('making');
    expect(jobState({ status: 'RUNNING', outputAssetId: null }, null)).toBe('making');
    expect(jobState({ status: 'FAILED', outputAssetId: null }, null)).toBe('failed');
    expect(jobState({ status: 'CANCELLED', outputAssetId: null }, null)).toBe('archived');
    expect(jobState({ status: 'SUCCEEDED', outputAssetId: 'x' }, null)).toBe('wait');
    expect(jobState({ status: 'SUCCEEDED', outputAssetId: 'x' }, { status: 'PENDING_APPROVAL' })).toBe('wait');
    expect(jobState({ status: 'SUCCEEDED', outputAssetId: 'x' }, { status: 'REJECTED' })).toBe('redo');
    expect(jobState({ status: 'SUCCEEDED', outputAssetId: 'x' }, { status: 'SCHEDULED' })).toBe('ok');
    expect(jobState({ status: 'SUCCEEDED', outputAssetId: 'x' }, { status: 'SUCCEEDED' })).toBe('ok');
  });
  it('finds the newest post that carries the job file, and none for a job without a file', () => {
    const posts = [post('1', 'REJECTED', ['x'], '2026-11-01T00:00:00Z'), post('2', 'SCHEDULED', ['x'], '2026-11-02T00:00:00Z'), post('3', 'SCHEDULED', ['y'])];
    expect(postOf({ outputAssetId: 'x' }, posts)?.id).toBe('2');
    expect(postOf({ outputAssetId: null }, posts)).toBeNull();
    expect(postOf({ outputAssetId: 'z' }, posts)).toBeNull();
  });
  it('counts waiting, approved this month and files, leaving archived jobs out', () => {
    const s = summarise(
      [
        { state: 'wait', updatedAt: '2026-11-03', hasFile: true },
        { state: 'ok', updatedAt: '2026-11-05', hasFile: true },
        { state: 'ok', updatedAt: '2026-10-05', hasFile: true },
        { state: 'making', updatedAt: '2026-11-05', hasFile: false },
        { state: 'archived', updatedAt: '2026-11-05', hasFile: true },
      ],
      '2026-11',
    );
    expect(s).toEqual({ wait: 1, approvedThisMonth: 1, files: 3 });
  });
});
