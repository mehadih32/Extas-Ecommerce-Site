import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import generated from '@/generated/status.json';

export type Stage = { id: string; name: string; total: number; done: number; live: number; parked: boolean };
export type Waiting = { n: string; what: string; why: string; state: string };
export type BuildStatus = {
  generatedAt: string;
  commit: string;
  totals: { active: number; done: number };
  stages: Stage[];
  waiting: Waiting[];
};
export type Deploy = { sha?: string; at?: string; color?: string };
export type Health = { at?: string; problems?: string[] };
export type Backup = { result?: 'ok' | 'off' | 'fail'; at?: string };

export const buildStatus = generated as BuildStatus;

// Runtime state written on the server (deploy.yml, extas-monitor, extas-backup), mounted read-only at
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

export async function runtimeState() {
  const [deploy, health, local, blob, drive] = await Promise.all([
    readJson<Deploy>('last-good-deploy.json'),
    readJson<Health>('health.json'),
    readJson<Backup>('backup-daily-local.json'),
    readJson<Backup>('backup-daily-blob.json'),
    readJson<Backup>('backup-daily-drive.json'),
  ]);
  return { deploy, health, backups: { local, blob, drive } };
}
