// S21 · PR 419 — the run history's words for a run's kind ("after deploy", "nightly", …) as the tools write them.
const KINDS: Record<string, string> = { 'after deploy': 'deploy', nightly: 'nightly', 'first-week': 'firstWeek', scheduled: 'scheduled', 'run now': 'runNow' };

/** The message key under `hst.kind` for a kind (`other` keeps the tool's own word). */
export const kindKey = (kind: string): string => KINDS[kind] ?? 'other';

/** The pill tone of a finding's severity (the shell's a2-pill tones, as Customer problems). */
export const SEV_TONE: Record<string, string> = { URGENT: 'bad', IMPORTANT: 'warn', CAN_WAIT: 'line' };
