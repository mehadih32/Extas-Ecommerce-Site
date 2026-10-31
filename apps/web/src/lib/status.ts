import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import generated from '@/generated/status.json';

export type Stage = { id: string; name: string; total: number; done: number; live: number; parked: boolean };
export type Waiting = { n: string; what: string; why: string; state: string };
export type BuildStatus = {
  generatedAt: string;
  commit: string;
  totals: { active: number; done: number };
  /** CN-027: the PRs needed before real orders (docs/LAUNCH-TRACK.md), done = merged or live. */
  launch?: { done: number; total: number };
  stages: Stage[];
  waiting: Waiting[];
};
export type Deploy = { sha?: string; at?: string; color?: string };
export type Health = { at?: string; problems?: string[] };
export type Backup = { result?: 'ok' | 'off' | 'fail'; at?: string; detail?: string };
// PR 395: extas-restore test (the monthly restore test into a throw-away database).
export type RestoreTest = { result?: 'ok' | 'fail'; at?: string; detail?: string; from?: string };
// PR 507: extas-restore drill (the monthly restore drill: each copy into a throw-away database).
export type RestoreDrill = { result?: 'ok' | 'fail'; at?: string; detail?: string; runs?: { from: string; result: 'ok' | 'fail' | 'off'; detail: string }[] };
// PR 396: extas-restore request — the last check copy (staging) and the last restore of the live shop. The live one is
// kept here because after it the database is the backup's, without the request that asked for it.
export type RestoreStaging = { id?: string; ok?: boolean; from?: string; backup?: string; at?: string; detail?: string; finishedAt?: string };
export type RestoreProduction = { result?: 'ok' | 'fail' | 'refused'; at?: string; detail?: string; from?: string; backup?: string; request?: string };
// CN-016: infra/deploy/smoke.sh after every deploy and every night (every built page, signed out and as the admin).
export type Smoke = { ok?: boolean; at?: string; kind?: string; pages?: number; failed?: number };

export const buildStatus = generated as BuildStatus;

// Runtime state written on the server (deploy.yml, extas-monitor, extas-backup, smoke.sh), mounted read-only at
// EXTAS_STATE_DIR. Missing files are normal on a developer machine and in CI.
async function readJson<T>(name: string): Promise<T | null> {
  const dir = process.env.EXTAS_STATE_DIR;
  if (!dir) return null;
  try {
    return JSON.parse(await readFile(join(dir, name), 'utf8')) as T;
  } catch {
    return null;
  }
}

export type RuntimeState = Awaited<ReturnType<typeof runtimeState>>;

export async function runtimeState() {
  const [deploy, health, local, blob, drive, smoke, restoreTest, drill, staging, production] = await Promise.all([
    readJson<Deploy>('last-good-deploy.json'),
    readJson<Health>('health.json'),
    readJson<Backup>('backup-daily-local.json'),
    readJson<Backup>('backup-daily-blob.json'),
    readJson<Backup>('backup-daily-drive.json'),
    readJson<Smoke>('smoke.json'),
    readJson<RestoreTest>('restore-test.json'),
    readJson<RestoreDrill>('restore-drill.json'),
    readJson<RestoreStaging>('restore-staging.json'),
    readJson<RestoreProduction>('restore-production.json'),
  ]);
  return { deploy, health, backups: { local, blob, drive }, smoke, restoreTest, drill, restore: { staging, production } };
}
