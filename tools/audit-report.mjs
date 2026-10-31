// S21 · PR 570 (B7.3, Note 14/21) — the checklist audit's report: the groups the owner chose (docs/qa/audit-checklist.json),
// each judged from the automated runs of this audit — the smoke test's pages (rows.json, phone and desktop) and the
// saved journeys with every UI check on (result.json) — through docs/qa/audit-groups.json. A group fails when one of
// its pages or journeys failed, passes when its checks ran and passed, and otherwise waits for the audit agents. The
// agents (AI) are a mock until the AI key is in the vault: the report says how many were asked and that none ran.
// Run by infra/deploy/audit.sh in the smoke test's browser image:
//   node tools/audit-report.mjs  (AUDIT_IN=<folder with smoke/ and journeys/>, AUDIT_OUT, AUDIT_GROUPS=1,8,… or empty
//   for all, AUDIT_AGENTS, AUDIT_AT, AUDIT_SHA, AUDIT_KIND)
// Writes <AUDIT_OUT>/result.json and README.md. No page text, password or customer detail is read or kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBLEMS_PER_GROUP = 5;
const PROBLEMS_MAX = 20;
const JOURNEY_LINE = /^(\S+) \(([^)]+)\) step \d+ /;

/** The page addresses a group covers, as tests on a smoke row's path. */
function pathTests(paths) {
  return (paths ?? []).map((p) => {
    if (p === '*shop') return (path) => !path.startsWith('/admin');
    if (p === '*admin') return (path) => path.startsWith('/admin');
    const re = new RegExp(p);
    return (path) => re.test(path);
  });
}

/**
 * The report. `checklist`: audit-checklist.json; `cover`: audit-groups.json `groups`; `rows`: the smoke run's rows (or
 * null when it did not run); `journeys`: the journeys' result.json (or null); `chosen`: group ids (empty = all).
 */
export function auditReport({ checklist, cover, rows, journeys, chosen, agents, at, sha, kind }) {
  const pick = new Set(chosen ?? []);
  const groups = checklist.groups.filter((g) => !pick.size || pick.has(g.id));
  const journeyLines = (journeys?.problems ?? []).map((l) => [JOURNEY_LINE.exec(l)?.[1] ?? null, l]);
  const out = groups.map((g) => {
    const c = cover[g.id] ?? {};
    const tests = pathTests(c.paths);
    const mine = rows && tests.length ? rows.filter((r) => typeof r?.path === 'string' && tests.some((t) => t(r.path))) : [];
    const failedRows = mine.filter((r) => !r.ok);
    const js = journeys ? (c.journeys ?? []) : [];
    const jFails = journeyLines.filter(([name]) => name && js.includes(name)).map(([, l]) => l);
    const checked = mine.length + js.length;
    const problems = [...failedRows.map((r) => `${r.path} (${r.screen}): ${(r.problems ?? [])[0] ?? 'failed'}`), ...jFails].slice(0, PROBLEMS_PER_GROUP);
    const status = failedRows.length || jFails.length ? 'fail' : checked ? 'pass' : 'agents';
    return { id: g.id, title: g.title, points: g.points.length, status, pages: mine.length, failedPages: failedRows.length, journeys: js, failedSteps: jFails.length, problems };
  });
  const failed = out.filter((g) => g.status === 'fail');
  return {
    at,
    kind,
    sha,
    ok: failed.length === 0 && !!(rows || journeys),
    groups: out,
    chosen: groups.length,
    points: out.reduce((n, g) => n + g.points, 0),
    passedGroups: out.filter((g) => g.status === 'pass').length,
    failedGroups: failed.length,
    agentGroups: out.filter((g) => g.status === 'agents').length,
    agents: { asked: agents, ran: 0, mode: 'mock' },
    ran: { smoke: !!rows, journeys: !!journeys },
    problems: failed.flatMap((g) => g.problems.map((p) => `${g.id}. ${g.title}: ${p}`)).slice(0, PROBLEMS_MAX),
  };
}

export function readme(r) {
  const line = (g) => `| ${g.id} | ${g.title} | ${g.points} | ${g.status} | ${g.pages} / ${g.failedPages} | ${g.failedSteps} |`;
  return [
    `# Checklist audit — ${r.at}`,
    '',
    `${r.ok ? 'PASS' : 'FAIL'}: ${r.chosen} groups (${r.points} points) — ${r.passedGroups} passed, ${r.failedGroups} failed, ${r.agentGroups} wait for the audit agents (asked ${r.agents.asked}, mock until the AI key is in the vault).`,
    '',
    '| Group | Title | Points | Result | Pages / failed | Failed steps |',
    '|---|---|---|---|---|---|',
    ...r.groups.map(line),
    '',
    ...(r.problems.length ? ['## Problems', '', ...r.problems.map((p) => `- ${p}`)] : []),
    '',
  ].join('\n');
}

const json = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const inDir = process.env.AUDIT_IN;
  const out = process.env.AUDIT_OUT;
  const rows = json(join(inDir, 'smoke', 'rows.json'));
  const report = auditReport({
    checklist: json(join(root, 'docs/qa/audit-checklist.json')),
    cover: json(join(root, 'docs/qa/audit-groups.json')).groups,
    rows: Array.isArray(rows?.rows) ? rows.rows : null,
    journeys: json(join(inDir, 'journeys', 'result.json')),
    chosen: (process.env.AUDIT_GROUPS ?? '').split(',').filter(Boolean),
    agents: Number(process.env.AUDIT_AGENTS) || 1,
    at: process.env.AUDIT_AT ?? '',
    sha: process.env.AUDIT_SHA ?? '',
    kind: process.env.AUDIT_KIND ?? '',
  });
  writeFileSync(join(out, 'result.json'), `${JSON.stringify(report, null, 1)}\n`);
  writeFileSync(join(out, 'README.md'), readme(report));
  console.log(readme(report).split('\n')[2]);
  process.exit(report.ok ? 0 : 1);
}
