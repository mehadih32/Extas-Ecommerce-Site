// S21 · PR 422 (B7.3) — "What this run says": one run's summary and its likely cause, written by rules, so it works
// with AI off (B7.3: the journeys are plain scripts; "AI only writes the summary, guesses the cause and proposes a
// fix"). It reads only what the history keeps: the run's counts and problems, its findings (page, screen, severity,
// new or not), the run of the same tool before it and how many runs in a row failed. Each line is a message key with
// its values, so the page says it in the owner's language. Nothing here changes anything.
import type { FindingSeverity } from '@extas/jobs';

export interface SummaryLine {
  key: string;
  vars?: Record<string, string | number>;
}
export interface RunSummary {
  headline: SummaryLine;
  /** The likely causes and what to look at, most telling first (at most MAX_CAUSES). */
  causes: SummaryLine[];
}
export interface SummaryInput {
  ok: boolean;
  passed: number;
  failed: number;
  sha: string;
  summary: Record<string, unknown>;
  findings: { page: string | null; device: string | null; severity: FindingSeverity; title: string; isNew: boolean }[];
  previous: { ok: boolean; sha: string } | null;
  /** Failed runs in a row of this tool, this one included (0 when it passed). */
  streak: number;
}

/** Wording thresholds only (they change what the summary says, never what the shop does). */
const DOWN_SHARE = 0.8; // hardcode-ok: "nearly every page failed" in the summary's words
const DOWN_MIN = 5; // hardcode-ok: below this many pages "nearly every" says nothing
const STREAK_SAYS = 3; // hardcode-ok: "failing for N runs in a row" from this many on
const MAX_CAUSES = 4; // hardcode-ok: how many lines the card shows
const MONEY = /^\/(bag|cart|checkout)(\/|$|\?)/;
const SERVER_ERROR = /answered 5\d\d|\b5\d\d\b.*(error|status)/i;

export function summariseRun(r: SummaryInput): RunSummary {
  const sev = (s: FindingSeverity) => r.findings.filter((f) => f.severity === s).length;
  const problems = Array.isArray(r.summary.problems) ? r.summary.problems.filter((x): x is string => typeof x === 'string') : [];
  const total = typeof r.summary.total === 'number' ? r.summary.total : r.passed + r.failed;
  const causes: SummaryLine[] = [];
  const add = (key: string, vars?: Record<string, string | number>) => causes.push(vars ? { key, vars } : { key });

  if (r.ok) {
    if (r.previous && !r.previous.ok) add('recovered');
    if (r.findings.length) add('passedWithNotes', { n: r.findings.length });
    return { headline: { key: 'headOk', vars: { passed: r.passed } }, causes: causes.slice(0, MAX_CAUSES) };
  }

  // the test itself did not run through: nothing about the shop can be said
  if (!r.findings.length && (total === 0 || problems.some((p) => /did not finish|timed out|exit \d+/i.test(p)))) {
    return { headline: { key: 'headStuck' }, causes: [{ key: 'stuck' }] };
  }
  const pages = new Set(r.findings.map((f) => f.page ?? ''));
  if (total >= DOWN_MIN && r.failed / total >= DOWN_SHARE) add('down', { failed: r.failed, total });
  const serverErrors = r.findings.filter((f) => SERVER_ERROR.test(f.title)).length;
  if (serverErrors) add('serverErrors', { n: serverErrors });
  if (r.summary.rolledBack === true) add('rolledBack', { sha: r.sha || '—' });
  else if (r.previous?.ok && r.sha && r.previous.sha && r.sha !== r.previous.sha) add('newVersion', { sha: r.sha });
  const money = r.findings.filter((f) => f.page && MONEY.test(f.page)).length;
  if (money) add('money', { n: money });
  const withPage = r.findings.filter((f) => f.page);
  if (withPage.length && withPage.every((f) => f.page!.startsWith('/admin'))) add('adminOnly');
  else if (withPage.length && withPage.every((f) => !f.page!.startsWith('/admin'))) add('shopOnly');
  const screens = new Set(r.findings.map((f) => f.device).filter(Boolean));
  if (screens.size === 1 && r.findings.every((f) => f.device)) add('oneScreen', { screen: [...screens][0]! });
  if (r.findings.length && r.findings.every((f) => f.severity === 'CAN_WAIT')) add('looksOnly');
  if (r.streak >= STREAK_SAYS) add('streak', { n: r.streak });
  else if (r.previous && !r.previous.ok && r.findings.length && r.findings.every((f) => !f.isNew)) add('same');
  if (!causes.length) add('few', { pages: pages.size });
  return { headline: { key: 'headFailed', vars: { urgent: sev('URGENT'), important: sev('IMPORTANT'), canWait: sev('CAN_WAIT') } }, causes: causes.slice(0, MAX_CAUSES) };
}
