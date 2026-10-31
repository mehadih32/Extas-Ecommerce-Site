// S19 · PR 393 (CN-031) — the go-live checklist on Settings → System → Go-live: everything that must be true before real
// orders, in one list. Each item is one of
//   - `auto`: read from what the server wrote and the shop's own records (the smoke test of every page, the server's
//     health check, the backups' own go-live checks of PR 391 …), never typed by anyone;
//   - `signoff`: a person checks it and presses "Confirm" (the QA gate of Blueprint Appendix C, the staging acceptance
//     list of docs/golive/ACCEPTANCE.md, real phones, the journey simulation of CN-013 …); who and when is kept in
//     `golive.signoff`;
//   - `owner`: the owner's own step (PR 399, 403), shown so nothing is forgotten, done by him.
// Later PRs add their items to GO_LIVE (394 the server, 397 the certificate, 398 the runbook, 400 the connections,
// 401 indexing, 402 the first week). One pure function evaluates the list; it only reports: nothing is switched,
// opened or blocked by it.
import type { Health, ServerSetup, Smoke } from './status';

export type GoLiveKind = 'auto' | 'signoff' | 'owner';

export interface GoLiveContext {
  now: Date;
  checks: { smokeHours: number; healthMinutes: number };
  signoff: Record<string, { at: string; by: string | null }>;
  smoke: Smoke | null;
  health: Health | null;
  /** The backups' own go-live checks (PR 391): ready, and how many are still to do. */
  backups: { ready: boolean; todo: number };
  /** PR 394: the last full server setup run (infra/server/setup.sh → state/server-setup.json). */
  serverSetup?: ServerSetup | null;
}

export interface GoLiveResult {
  key: string;
  pr: number;
  kind: GoLiveKind;
  ok: boolean;
  /** When it last happened or was confirmed. */
  at?: string;
  /** Who confirmed it (a staff user id), for `signoff`. */
  by?: string | null;
  /** Numbers for the item's words (e.g. how many pages failed). */
  vars?: Record<string, string | number>;
}

interface GoLiveItem {
  key: string;
  pr: number;
  kind: GoLiveKind;
  /** For `auto` items; `signoff` items are done when confirmed. */
  check?: (ctx: GoLiveContext) => Omit<GoLiveResult, 'key' | 'pr' | 'kind'>;
}

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;

const within = (at: string | undefined, now: Date, minutes: number) => {
  const t = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(t) && now.getTime() - t <= minutes * MINUTE_MS && t <= now.getTime() + MINUTE_MS;
};

/** Every item, in the order the page shows them. */
export const GO_LIVE: readonly GoLiveItem[] = [
  {
    key: 'smoke',
    pr: 393,
    kind: 'auto',
    check: ({ smoke, now, checks }) => ({
      ok: smoke?.ok === true && within(smoke.at, now, checks.smokeHours * HOUR_MINUTES),
      at: smoke?.at,
      vars: { pages: smoke?.pages ?? 0, failed: smoke?.failed ?? 0 },
    }),
  },
  {
    key: 'health',
    pr: 393,
    kind: 'auto',
    check: ({ health, now, checks }) => ({
      ok: Boolean(health) && (health?.problems ?? []).length === 0 && within(health?.at, now, checks.healthMinutes),
      at: health?.at,
      vars: { problems: (health?.problems ?? []).length },
    }),
  },
  { key: 'backups', pr: 393, kind: 'auto', check: ({ backups }) => ({ ok: backups.ready, vars: { todo: backups.todo } }) },
  // PR 394 — every server item of Blueprint A2.9 (A2.9.16): the last full setup run passed every step. A warning (for
  // example the public HTTPS answer while DNS is new) is shown with the number but does not hold it back.
  {
    key: 'server',
    pr: 394,
    kind: 'auto',
    check: ({ serverSetup: s }) => ({
      ok: s?.full === true && s.passed === true,
      at: s?.at,
      vars: {
        steps: s?.steps?.length ?? 0,
        fail: s?.counts?.fail ?? 0,
        warn: s?.counts?.warn ?? 0,
        failed: (s?.steps ?? []).filter((x) => x.status === 'FAIL').map((x) => x.step).join(', ') || '—',
      },
    }),
  },
  { key: 'qaGate', pr: 393, kind: 'signoff' },
  { key: 'acceptance', pr: 393, kind: 'signoff' },
  { key: 'realPhones', pr: 393, kind: 'signoff' },
  { key: 'simulation', pr: 393, kind: 'signoff' },
];

/** The keys a person may confirm. */
export const SIGNOFF_KEYS: readonly string[] = GO_LIVE.filter((i) => i.kind === 'signoff').map((i) => i.key);

/** Every item now, and whether all of them are done. */
export function goLiveChecks(ctx: GoLiveContext): { ready: boolean; done: number; total: number; items: GoLiveResult[] } {
  const items = GO_LIVE.map((i): GoLiveResult => {
    if (i.check) return { key: i.key, pr: i.pr, kind: i.kind, ...i.check(ctx) };
    const s = ctx.signoff[i.key];
    return { key: i.key, pr: i.pr, kind: i.kind, ok: Boolean(s), at: s?.at, by: s?.by ?? null };
  });
  const done = items.filter((i) => i.ok).length;
  return { ready: done === items.length, done, total: items.length, items };
}
