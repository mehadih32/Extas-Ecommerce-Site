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
// PR 394: infra/server/setup.sh — the last full server setup run (every A2.9 step) as data.
export type ServerSetup = {
  at?: string;
  commit?: string;
  full?: boolean;
  passed?: boolean;
  counts?: { ok: number; fail: number; warn: number };
  steps?: { step: string; status: string; detail: string }[];
};
// PR 397: infra/server/bin/extas-origin-cert — the certificate Caddy shows Cloudflare (never a key).
export type OriginCert = {
  at?: string;
  mode?: 'origin' | 'auto';
  active?: boolean;
  names?: string[];
  host?: string;
  notAfter?: string | null;
  daysLeft?: number | null;
  issuer?: string;
  error?: string | null;
};
// CN-016: infra/deploy/smoke.sh after every deploy and every night (every built page, signed out and as the admin).
// R1 ops review (M8): `at` is ISO with its offset (infra/deploy/smoke.sh); `atText` the same time in words for people.
export type Smoke = { ok?: boolean; at?: string; atText?: string; kind?: string; pages?: number; failed?: number };
// PR 414 follow-up 668 (CN-036): the last 70-order simulation run (GATE_PLAN=simulation infra/deploy/gate-orders.sh,
// simulation.yml); `iso` is its time with the offset, `at` the same in words.
export type SimulationRun = { at?: string; iso?: string; sha?: string; ok?: boolean; planned?: number; passed?: number; failed?: number; skipped?: number; orders?: number; cleanup?: boolean };
// PR 393 follow-up (CN-036): the last acceptance run (infra/deploy/acceptance.sh, acceptance.yml): its parts' results.
export type AcceptanceRun = { at?: string; atText?: string; sha?: string; ok?: boolean; passed?: number; total?: number; parts?: { key: string; ok: boolean; line: string }[] };

// Follow-up 575 (PR 621): the last ERP acceptance run against the demo ERP (infra/deploy/erp-acceptance.sh, nightly and
// before every release): its state and counts only, never a key or an address.
export type ErpAcceptance = {
  at?: string;
  exit?: number;
  state?: 'RAN' | 'NOT_RUN' | 'WAITING_FOR_KEY' | 'NOT_FINISHED' | 'NOT_IN_VERSION';
  passed?: number;
  failed?: number;
  skipped?: number;
  unreachable?: boolean;
  keyRefused?: boolean;
};

/** The status page's line for the last ERP acceptance run: a word key in messages/status.*.json, its numbers, a tone. */
export function erpAcceptanceLine(a: ErpAcceptance | null): { key: string; vars: Record<string, number>; tone: 'ok' | 'bad' | 'warn' | 'soft' } {
  switch (a?.state) {
    case 'RAN':
      if (a.keyRefused) return { key: 'erpKeyRefused', vars: {}, tone: 'warn' };
      if (a.unreachable) return { key: 'erpUnreachable', vars: {}, tone: 'warn' };
      if ((a.failed ?? 0) > 0) return { key: 'erpFail', vars: { failed: a.failed ?? 0, passed: a.passed ?? 0 }, tone: 'bad' };
      return { key: 'erpOk', vars: { passed: a.passed ?? 0, skipped: a.skipped ?? 0 }, tone: 'ok' };
    case 'WAITING_FOR_KEY':
      return { key: 'erpWaitingKey', vars: {}, tone: 'soft' };
    case 'NOT_RUN':
      return { key: 'erpNotRun', vars: {}, tone: 'warn' };
    case 'NOT_FINISHED':
      return { key: 'erpNotFinished', vars: {}, tone: 'bad' };
    default:
      return { key: 'erpNone', vars: {}, tone: 'soft' };
  }
}

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
  const [deploy, health, local, blob, drive, smoke, restoreTest, drill, staging, production, serverSetup, originCert, simulation, acceptance, erpAcceptance] = await Promise.all([
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
    readJson<ServerSetup>('server-setup.json'),
    readJson<OriginCert>('origin-cert.json'),
    readJson<SimulationRun>('simulation.json'),
    readJson<AcceptanceRun>('acceptance.json'),
    readJson<ErpAcceptance>('erp-acceptance.json'),
  ]);
  return { deploy, health, backups: { local, blob, drive }, smoke, restoreTest, drill, restore: { staging, production }, serverSetup, originCert, simulation, acceptance, erpAcceptance };
}
