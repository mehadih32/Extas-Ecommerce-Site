// S19 · PR 391 (CN-030, CN-031) — "backups ready for real orders" on Settings → System → Backups. One pure function
// reads what the server wrote (the last nightly copy of each place, the last restore drill) and which connections are
// LIVE, and says, check by check, whether the shop's data is safe enough for real orders:
//   - the server's own copy of last night went well;
//   - Azure Blob is connected (LIVE) and its last copy went well within `backups.gate.freshHours`;
//   - Google Drive is connected and its last copy went well within the same hours;
//   - the restore drill brought back the Blob copy and the Drive copy within `backups.gate.drillDays`;
//   - Telegram is connected, so a failed night reaches the owner's phone.
// It only reads and reports: nothing is switched or blocked by it (the go-live checklist, PR 393, reads the same).
// CN-035 (6 Nov 2026): only the server's own copy is needed before go-live. The copies away from the server (Blob, Drive),
// their restore drill and Telegram are connected by the owner soon after go-live (`soon`); until Blob and Drive are both
// connected, `offSite` names what is missing for the yellow "Off-server backup: not connected" line (Dashboard, go-live
// page, the nightly Telegram line once Telegram is connected).
import type { Backup, RestoreDrill, RestoreTest } from './status';

export const GATE_CHECKS = ['local', 'blobLive', 'blobFresh', 'driveLive', 'driveFresh', 'drillBlob', 'drillDrive', 'telegram'] as const;
export type GateKey = (typeof GATE_CHECKS)[number];

/** The two places away from the server, as their installation-wide connections are kept (Keys & connections). */
export const OFF_SITE = {
  blob: { kind: 'STORAGE', provider: 'azureBlob' },
  drive: { kind: 'GOOGLE_DRIVE', provider: 'googleDrive' },
} as const;

/** CN-035: the places away from the server with no LIVE connection, from the switched-on LIVE connection rows. */
export function offSiteMissing(live: readonly { kind: string; provider: string }[]): ('blob' | 'drive')[] {
  return (Object.keys(OFF_SITE) as ('blob' | 'drive')[]).filter((k) => !live.some((r) => r.kind === OFF_SITE[k].kind && r.provider === OFF_SITE[k].provider));
}

/** CN-035: the checks done soon after go-live; they never hold back real orders. */
export const SOON_AFTER: readonly GateKey[] = ['blobLive', 'blobFresh', 'driveLive', 'driveFresh', 'drillBlob', 'drillDrive', 'telegram'];

export interface GateCheck {
  key: GateKey;
  ok: boolean;
  /** CN-035: done soon after go-live (it never holds back real orders). */
  soon: boolean;
  /** When the thing it is about happened (a copy, a drill), for "last: …". */
  at?: string;
}

export interface GateInput {
  now: Date;
  gate: { freshHours: number; drillDays: number };
  live: { blob: boolean; drive: boolean; telegram: boolean };
  backups: { local: Backup | null; blob: Backup | null; drive: Backup | null };
  drill: RestoreDrill | null;
  /** A single restore test (extas-restore test) also counts for the place it restored from. */
  restoreTest?: RestoreTest | null;
}

const HOUR_MS = 3_600_000;
const DAY_HOURS = 24;

const within = (at: string | undefined, now: Date, hours: number) => {
  const t = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(t) && now.getTime() - t <= hours * HOUR_MS && t <= now.getTime() + HOUR_MS;
};

function freshCopy(b: Backup | null, input: GateInput): GateCheck['ok'] {
  return b?.result === 'ok' && within(b.at, input.now, input.gate.freshHours);
}

function drilled(from: 'blob' | 'drive', input: GateInput): { ok: boolean; at?: string } {
  const hours = input.gate.drillDays * DAY_HOURS;
  const run = input.drill?.runs?.find((r) => r.from === from);
  if (run?.result === 'ok' && within(input.drill?.at, input.now, hours)) return { ok: true, at: input.drill?.at };
  const t = input.restoreTest;
  if (t?.from === from && t.result === 'ok' && within(t.at, input.now, hours)) return { ok: true, at: t.at };
  return { ok: false, at: run ? input.drill?.at : undefined };
}

export interface GateResult {
  /** Ready for real orders: every check that is not `soon` passes (CN-035: the server's own copy). */
  ready: boolean;
  /** Every check passes, the soon-after ones too. */
  complete: boolean;
  /** CN-035: the places away from the server not connected yet (empty = both connected). */
  offSite: ('blob' | 'drive')[];
  checks: GateCheck[];
}

/** Every check in a fixed order, whether those needed for real orders pass, and whether all of them do. */
export function backupGateChecks(input: GateInput): GateResult {
  const { backups, live } = input;
  const db = drilled('blob', input);
  const dd = drilled('drive', input);
  const rows: Omit<GateCheck, 'soon'>[] = [
    { key: 'local', ok: freshCopy(backups.local, input), at: backups.local?.at },
    { key: 'blobLive', ok: live.blob },
    { key: 'blobFresh', ok: live.blob && freshCopy(backups.blob, input), at: backups.blob?.at },
    { key: 'driveLive', ok: live.drive },
    { key: 'driveFresh', ok: live.drive && freshCopy(backups.drive, input), at: backups.drive?.at },
    { key: 'drillBlob', ok: db.ok, at: db.at },
    { key: 'drillDrive', ok: dd.ok, at: dd.at },
    { key: 'telegram', ok: live.telegram },
  ];
  const checks = rows.map((c): GateCheck => ({ ...c, soon: SOON_AFTER.includes(c.key) }));
  const offSite = (['blob', 'drive'] as const).filter((k) => !live[k]);
  return { ready: checks.every((c) => c.ok || c.soon), complete: checks.every((c) => c.ok), offSite, checks };
}
