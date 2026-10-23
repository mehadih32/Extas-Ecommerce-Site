// PR 6 — how long a failed job waits before its next try: `jobs.retry.backoffBaseSeconds` × 2^(n−1), never above
// `jobs.retry.backoffMaxSeconds`, for at most `jobs.retry.maxAttempts` tries in all. The queue (BullMQ's backoff
// strategy) and the JobRun row's "next attempt" use this one function, so the Server page shows the real time.
import type { SettingsReader } from './context';

export interface RetryPolicy {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
}

/** The wait after attempt `attempt` (1 = the first try) failed. */
export function retryDelayMs(attempt: number, p: RetryPolicy): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = p.baseMs * 2 ** Math.min(n - 1, 30);
  return Math.max(0, Math.min(p.maxMs, raw));
}

export async function retryPolicyOf(settings: SettingsReader): Promise<RetryPolicy> {
  const [maxAttempts, baseS, maxS] = await Promise.all([
    settings.value('jobs.retry.maxAttempts'),
    settings.value('jobs.retry.backoffBaseSeconds'),
    settings.value('jobs.retry.backoffMaxSeconds'),
  ]);
  return { maxAttempts, baseMs: baseS * 1000, maxMs: Math.max(baseS, maxS) * 1000 };
}
