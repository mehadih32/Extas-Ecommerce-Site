// Parity round 3, lane F6 · PR 866 (prototype v5 Marketing › Studio, js/m-marketing.js `renderStudio`) — the jobs board on the real
// render jobs, without the database. A job is a render job; its state is read from the job and from the post made of its file:
//   QUEUED / RUNNING                          -> making   (Making)
//   FAILED                                    -> failed   (Failed — shown beside the prototype's five)
//   SUCCEEDED, no post yet or a post waiting  -> wait     (Waiting for your OK)
//   SUCCEEDED, its post rejected              -> redo     (Changes asked)
//   SUCCEEDED, its post scheduled or posted   -> ok       (Approved)
//   CANCELLED                                 -> archived (not listed)
// Nothing here changes anything.
import type { SocialPostRow, SocialRenderJobRow } from '@extas/studio';

export type JobState = 'wait' | 'making' | 'ok' | 'redo' | 'failed' | 'archived';

/** The post made of this job's file (the newest one), if any. */
export function postOf(job: Pick<SocialRenderJobRow, 'outputAssetId'>, posts: readonly SocialPostRow[]): SocialPostRow | null {
  if (!job.outputAssetId) return null;
  return [...posts].filter((p) => p.mediaAssetIds.includes(job.outputAssetId as string)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function jobState(job: Pick<SocialRenderJobRow, 'status' | 'outputAssetId'>, post: Pick<SocialPostRow, 'status'> | null): JobState {
  if (job.status === 'CANCELLED') return 'archived';
  if (job.status === 'QUEUED' || job.status === 'RUNNING') return 'making';
  if (job.status === 'FAILED') return 'failed';
  if (!post || post.status === 'PENDING_APPROVAL') return 'wait';
  if (post.status === 'REJECTED') return 'redo';
  return 'ok';
}

export interface JobsSummary {
  wait: number;
  approvedThisMonth: number;
  files: number;
}

/** The three figures over the listed jobs: waiting, approved in the shop's current month (by the job's last change) and files made. */
export function summarise(rows: readonly { state: JobState; updatedAt: string; hasFile: boolean }[], monthPrefix: string): JobsSummary {
  const live = rows.filter((r) => r.state !== 'archived');
  return {
    wait: live.filter((r) => r.state === 'wait').length,
    approvedThisMonth: live.filter((r) => r.state === 'ok' && r.updatedAt.startsWith(monthPrefix)).length,
    files: live.filter((r) => r.hasFile).length,
  };
}
