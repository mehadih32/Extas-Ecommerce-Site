// S21 · PR 423 (CN-015) — POST /api/problems: the shop's pages report what went wrong for a visitor (the probe,
// components/shop/ProblemProbe.tsx, and the error screen, app/global-error.tsx). Public, same-site only (the proxy and
// this handler both check), size-capped, and counted per address by the proxy (bucket `report`). Each report is made
// anonymous here again (lib/problems/kinds.ts: the address pattern, the scrubbed message; the device and browser
// families from the user agent, never the agent itself), added to its problem (one per cause) and judged. It answers
// 204 to every same-site report, kept or not, so a page never shows an error for it. Nothing here blocks anyone.
//
// PR 415 (CN-015): `keepRecord` is the one step that adds a record to its problem and judges it, for the pages' reports
// and for the shop server's own failures (lib/problems/server.ts). After it, `health.alerts` (off as it ships) may send
// the owner one Telegram line (Keys & connections; the practice copy until the bot is connected): when the problem is
// Urgent, or when it hit many visitors within a few minutes. A problem claims its line on `alertedAt`, so it sends at
// most one within the hours set, however many servers or reports arrive at once. An alert never stops a report.
import { createConnections, sendOwnerAlert, telegramAdapters } from '@extas/adapters';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import type { HealthProblemsSettings } from '@extas/settings';
import type { Vault } from '@extas/vault';
import { z } from 'zod';
import bn from '../../../messages/admin-problems.bn.json';
import { fail, sameOrigin } from '../admin-auth';
import { ADMIN_HOME as ADMIN_BASE } from '../admin-nav';
import { PROBLEMS_REPORT_PATH } from '../security/edge-gate';
import { t, type Dict } from '../i18n';
import type { AppResolver } from '../settings';
import { browserOf, deviceOf, fingerprintOf, judge, NETWORKS, pathPattern, PROBLEM_KINDS, scrub, stepOf, worse, type JourneyStep, type ProblemKind, type Severity } from './kinds';

export const PROBLEMS_PATH = PROBLEMS_REPORT_PATH;
/** The most a report body may be. */
export const PROBLEM_BODY_MAX = 16_384; // hardcode-ok: a body-size guard, not a business number
/** The most items one body may carry, whatever the setting (the setting's own maximum). */
const ITEMS_MAX = 50; // hardcode-ok: the schema's bound, the same as health.problems.maxPerPage's maximum
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const reportSchema = z.object({
  s: z.int().min(1).optional(),
  v: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  p: z.string().max(2_000),
  n: z.enum(NETWORKS).nullish(),
  r: z
    .array(
      z.object({
        k: z.enum(PROBLEM_KINDS),
        d: z.string().max(2_000).default(''),
        ms: z.int().min(0).max(3_600_000).nullish(),
      }),
    )
    .min(1)
    .max(ITEMS_MAX),
});
export type ProblemReport = z.output<typeof reportSchema>;

export interface ProblemDeps {
  db: PrismaClient;
  resolver: AppResolver;
  /** The credential vault, for the owner's Telegram bot (PR 415); without it the alert goes to the practice copy. */
  vault?: Vault | null;
  now?: () => Date;
  /** Sends one line to the owner (tests); by default the Telegram bot on Keys & connections. Must not throw. */
  alert?: (text: string) => Promise<void>;
}

/** One record of a problem, from a page's report or from the shop's own server (PR 415). */
export interface ProblemRecordInput {
  storeId: number;
  kind: ProblemKind;
  step: JourneyStep;
  path: string;
  detail: string;
  visitorId: string;
  device: string;
  browser: string;
  network: string | null;
  ms: number | null;
  now: Date;
}

const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/** A request's address part of a message (`GET /api/x?y 500` → `GET /api/x 500`) as a pattern, the rest scrubbed. */
function detailOf(kind: ProblemKind, raw: string, productPrefix: string): string {
  const d = raw.trim();
  if (kind === 'request_failed' || kind === 'slow_request' || kind === 'broken_image') {
    const m = /^(?:(GET|POST|PUT|PATCH|DELETE)\s+)?(\S+)(?:\s+(\d{3}))?$/i.exec(d);
    if (m) {
      const target = m[2]!;
      let where = target;
      try {
        const u = new URL(target, 'http://same.invalid');
        where = u.host === 'same.invalid' ? pathPattern(u.pathname, productPrefix) : `${u.origin}${pathPattern(u.pathname, productPrefix)}`;
      } catch {
        where = scrub(target);
      }
      return [m[1]?.toUpperCase(), where, m[3]].filter(Boolean).join(' ').slice(0, 200);
    }
  }
  if (kind === 'slow_load' || kind === 'page_failed') return '';
  return scrub(d);
}

/** Adds one report's items to their problems. Returns how many were kept. */
export async function recordReport(deps: ProblemDeps, report: ProblemReport, ua: string): Promise<number> {
  const storeId = report.s ?? MOTHER_STORE_ID;
  const cfg = await deps.resolver.value('health.problems', { storeId });
  if (!cfg.enabled) return 0;
  const store = await deps.db.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });
  if (!store) return 0;
  const productPrefix = await deps.resolver.value('naming.productPathPrefix', {
    storeId,
  });
  const now = deps.now?.() ?? new Date();
  const pattern = pathPattern(report.p, productPrefix);
  // the admin's own error screen (app/global-error.tsx is shared) is not a customer's problem
  if (pattern === ADMIN_BASE || pattern.startsWith(`${ADMIN_BASE}/`)) return 0;
  const step = stepOf(pattern, productPrefix);
  const device = deviceOf(ua);
  const browser = browserOf(ua);
  const seen = new Set<string>();
  let kept = 0;
  for (const item of report.r.slice(0, cfg.maxPerPage)) {
    const detail = detailOf(item.k, item.d, productPrefix);
    const fingerprint = fingerprintOf(item.k, pattern, detail);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    await keepRecord(deps, cfg, {
      storeId,
      kind: item.k,
      step,
      path: pattern,
      detail,
      visitorId: report.v,
      device,
      browser,
      network: report.n ?? null,
      ms: item.ms ?? null,
      now,
    });
    kept += 1;
  }
  return kept;
}

/**
 * Adds one record to its problem (made when new) and judges it on the visitors of the last day; never made less urgent
 * by itself (a person decides that). Then the owner's alert, when `health.alerts` asks for one (PR 415).
 */
export async function keepRecord(deps: ProblemDeps, cfg: Pick<HealthProblemsSettings, 'urgentVisitors'>, r: ProblemRecordInput): Promise<void> {
  const fingerprint = fingerprintOf(r.kind, r.path, r.detail);
  const problem = await problemFor(deps.db, {
    storeId: r.storeId,
    fingerprint,
    kind: r.kind,
    step: r.step,
    path: r.path,
    detail: r.detail,
    now: r.now,
  });
  await deps.db.problemRecord.create({
    data: {
      storeId: r.storeId,
      problemId: problem.id,
      visitorId: r.visitorId,
      device: r.device,
      browser: r.browser,
      network: r.network,
      ms: r.ms,
      createdAt: r.now,
    },
  });
  const visitors = await visitorsSince(deps.db, problem.id, new Date(r.now.getTime() - DAY_MS));
  const severity = worse(problem.severity as Severity, judge(r.kind, r.step, visitors, cfg.urgentVisitors));
  if (severity !== problem.severity)
    await deps.db.customerProblem.update({
      where: { id: problem.id },
      data: { severity },
    });
  await alertOwner(deps, { id: problem.id, storeId: r.storeId, kind: r.kind, step: r.step, path: r.path, severity, visitors, now: r.now });
}

const visitorsSince = async (db: PrismaClient, problemId: string, since: Date): Promise<number> =>
  (
    await db.problemRecord.groupBy({
      by: ['visitorId'],
      where: { problemId, createdAt: { gte: since } },
    })
  ).length;

/**
 * The owner's Telegram line for a problem that needs him now (`health.alerts`): Urgent (when `onUrgent`), or a sudden
 * rise (`spikeVisitors` visitors within `spikeMinutes`). The problem claims the line on `alertedAt` first, so at most
 * one goes out within `repeatHours`. Never throws.
 */
async function alertOwner(
  deps: ProblemDeps,
  p: { id: string; storeId: number; kind: ProblemKind; step: JourneyStep; path: string; severity: Severity; visitors: number; now: Date },
): Promise<void> {
  try {
    const a = await deps.resolver.value('health.alerts', { storeId: p.storeId });
    if (!a.enabled) return;
    let which: 'urgent' | 'spike' | null = a.onUrgent && p.severity === 'URGENT' ? 'urgent' : null;
    let visitors = p.visitors;
    if (!which) {
      visitors = await visitorsSince(deps.db, p.id, new Date(p.now.getTime() - a.spikeMinutes * MINUTE_MS));
      if (visitors >= a.spikeVisitors) which = 'spike';
    }
    if (!which) return;
    const claimed = await deps.db.customerProblem.updateMany({
      where: {
        id: p.id,
        OR: [{ alertedAt: null }, { alertedAt: { lt: new Date(p.now.getTime() - a.repeatHours * HOUR_MS) } }],
      },
      data: { alertedAt: p.now },
    });
    if (claimed.count === 0) return;
    const store = await deps.resolver.value('store.name', { storeId: p.storeId });
    const text = t(bn as Dict, `prb.alert.${which}`, {
      store: store ?? '',
      kind: t(bn as Dict, `prb.kind.${p.kind}`),
      step: t(bn as Dict, `prb.step.${p.step}`),
      where: p.path,
      visitors,
      minutes: a.spikeMinutes,
    });
    await (deps.alert ?? ((line: string) => telegramLine(deps, line)))(text);
  } catch (e) {
    console.warn(`problems: the owner's alert was not sent (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
  }
}

/** The owner's Telegram bot on Keys & connections (PR 392), the practice copy until it is connected. */
async function telegramLine(deps: ProblemDeps, text: string): Promise<void> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({
    db: deps.db,
    vault: deps.vault ?? { get: async () => null },
    adapters: telegramAdapters,
    secretCacheMs: cacheS * 1000,
    testTimeoutMs: testS * 1000,
  });
  await sendOwnerAlert(c, text);
}

/** The problem for this cause, made when it is new; its count and last time moved on. */
async function problemFor(
  db: PrismaClient,
  p: {
    storeId: number;
    fingerprint: string;
    kind: ProblemKind;
    step: string;
    path: string;
    detail: string;
    now: Date;
  },
) {
  const where = {
    storeId_fingerprint: { storeId: p.storeId, fingerprint: p.fingerprint },
  };
  const bump = { records: { increment: 1 }, lastSeenAt: p.now };
  try {
    return await db.customerProblem.upsert({
      where,
      update: bump,
      create: {
        storeId: p.storeId,
        fingerprint: p.fingerprint,
        kind: p.kind,
        step: p.step,
        path: p.path,
        detail: p.detail,
        records: 1,
        firstSeenAt: p.now,
        lastSeenAt: p.now,
      },
      select: { id: true, severity: true },
    });
  } catch (e) {
    // two first reports at once: the other made it; count this one on it
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return db.customerProblem.update({
        where,
        data: bump,
        select: { id: true, severity: true },
      });
    throw e;
  }
}

/** POST /api/problems — public, same-site; always 204 for a same-site report (kept, switched off or not readable). */
export async function problemsHandler(request: Request, deps: ProblemDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > PROBLEM_BODY_MAX) return fail(413, 'TOO_LARGE');
  if (!deps) return noContent();
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > PROBLEM_BODY_MAX) return fail(413, 'TOO_LARGE');
    raw = JSON.parse(text) as unknown;
  } catch {
    return noContent();
  }
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return noContent();
  try {
    await recordReport(deps, parsed.data, request.headers.get('user-agent') ?? '');
  } catch (e) {
    console.warn(`problems: a report was not kept (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
  }
  return noContent();
}
