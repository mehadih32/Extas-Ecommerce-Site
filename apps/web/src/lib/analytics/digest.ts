// S15 · PR 341 (Blueprint D5.3, "weekly and monthly digests to Telegram and e-mail") — the record-and-send half.
// `@extas/analytics`'s own `buildDigestContent` is pure (D5.3: "deterministic... never an AI guess"); this file
// reads the store's own stored events and saved funnels (`funnel-list.ts`, never duplicated here), keeps one
// `ReportDigest` row per store/kind/period (idempotent: a second run of the same period reuses the row rather than
// building or sending it twice), and sends it on whichever channel the owner turned on
// (`reports.digest.telegramOn`/`emailOn`, registry-reports-digest.ts). No automatic schedule is wired yet — the same
// honest gap `ads.costAlerts` (ad-alerts.ts, PR 267) already ships with: "Check now" there, "Run now" here, both
// read only (rule 6) — until a shared report scheduler exists in `@extas/jobs` to hook a real cadence into.
import { buildDigestContent, digestWindows, DIGEST_WINDOW_DAYS, type DigestContent, type DigestKind, type FunnelEventRow } from '@extas/analytics';
import type { Actor, RequestContext } from '@extas/auth';
import { audit } from '@extas/auth';
import { createConnections, sendOwnerAlert, telegramAdapters, emailAdapters, type EmailSender } from '@extas/adapters';
import { Prisma, type PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import type { AppResolver } from '../settings';
import { t, type Dict } from '../i18n';
import { listFunnels } from './funnel-list';
import bn from '../../../messages/digest-send.bn.json';
import en from '../../../messages/digest-send.en.json';

export class DigestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export function isDigestError(e: unknown): e is DigestError {
  return e instanceof DigestError;
}

export interface Who {
  actor: Actor;
  ctx: RequestContext;
}

export interface DigestDeps {
  db: PrismaClient;
  resolver: AppResolver;
  vault?: Pick<Vault, 'get'> | null;
  now?: () => Date;
  /** Tests inject these to bypass the real Telegram/e-mail wiring, the same `send` override `sendCostAlerts`
   *  (ad-alerts.ts) already takes. */
  sendTelegram?: (text: string) => Promise<void>;
  sendEmail?: (to: string, subject: string, text: string) => Promise<void>;
}

export interface DigestRecord {
  id: string;
  storeId: number | null;
  kind: DigestKind;
  periodStart: string;
  periodEnd: string;
  content: DigestContent;
  sentTelegramAt: string | null;
  sentEmailAt: string | null;
  createdAt: string;
}

type Row = {
  id: string;
  storeId: number | null;
  kind: string;
  periodStart: Date;
  periodEnd: Date;
  content: unknown;
  sentTelegramAt: Date | null;
  sentEmailAt: Date | null;
  createdAt: Date;
};

const KINDS: readonly DigestKind[] = ['weekly', 'monthly'];
const isKind = (v: unknown): v is DigestKind => typeof v === 'string' && (KINDS as readonly string[]).includes(v);

/** A digest's own content was built and stored by this module alone — never trusted further than "looks like a
 *  digest" if anything else ever touched the row, the same honesty `funnel-list.ts`'s `stepsOf` already practises. */
function contentOf(raw: unknown): DigestContent {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as DigestContent).events) || !Array.isArray((raw as DigestContent).funnels)) {
    throw new DigestError(500, 'CORRUPT_DIGEST', ['content']);
  }
  return raw as DigestContent;
}

function view(r: Row): DigestRecord {
  if (!isKind(r.kind)) throw new DigestError(500, 'CORRUPT_DIGEST', ['kind']);
  return {
    id: r.id,
    storeId: r.storeId,
    kind: r.kind,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    content: contentOf(r.content),
    sentTelegramAt: r.sentTelegramAt?.toISOString() ?? null,
    sentEmailAt: r.sentEmailAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

async function eventsBetween(db: PrismaClient, storeId: number, from: Date, to: Date): Promise<FunnelEventRow[]> {
  const rows = await db.analyticsEvent.findMany({
    where: { storeId, occurredAt: { gte: from, lt: to } },
    select: { visitorId: true, name: true, pageType: true, productId: true, categoryId: true },
  });
  return rows.map((r) => ({
    visitorId: r.visitorId,
    // Safe: every row's own `name` was written by `recordAnalyticsEvent` (PR 338), which refuses anything outside
    // the catalogue before it is ever stored.
    name: r.name as FunnelEventRow['name'],
    pageType: r.pageType,
    productId: r.productId,
    categoryId: r.categoryId,
  }));
}

/** The store's digest for this kind's current period: the one already kept, or a freshly built one (not sent yet).
 *  Idempotent per store/kind/period — a second call in the same period never re-counts or re-sends. */
export async function getOrCreateDigest(deps: Pick<DigestDeps, 'db' | 'now'>, storeId: number, kind: DigestKind): Promise<{ digest: DigestRecord; created: boolean }> {
  const now = deps.now ? deps.now() : new Date();
  const window = digestWindows(kind, now);
  const existing = await deps.db.reportDigest.findFirst({ where: { storeId, kind, periodStart: window.current.start, periodEnd: window.current.end } });
  if (existing) return { digest: view(existing), created: false };
  const [currentEvents, previousEvents, funnels] = await Promise.all([
    eventsBetween(deps.db, storeId, window.current.start, window.current.end),
    eventsBetween(deps.db, storeId, window.previous.start, window.previous.end),
    listFunnels({ db: deps.db }, storeId),
  ]);
  const content = buildDigestContent({ kind, window, currentEvents, previousEvents, funnels: funnels.map((f) => ({ id: f.id, name: f.name, steps: f.steps })) });
  const row = await deps.db.reportDigest.create({ data: { storeId, kind, periodStart: window.current.start, periodEnd: window.current.end, content: content as unknown as Prisma.InputJsonValue } });
  return { digest: view(row), created: true };
}

const pct = (n: number): string => Math.round(n * 1000) / 10 + '';

/** The digest's own words, one language, the owner's Telegram and e-mail both read the same text. Exported for its
 *  own tests. */
export function digestText(content: DigestContent, lang: 'bn' | 'en'): string {
  const d = (lang === 'bn' ? bn : en) as unknown as Dict;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `digest.${k}`, vars);
  const from = content.periodStart.slice(0, 10);
  const to = content.periodEnd.slice(0, 10);
  const lines = [s('head', { title: s(`title.${content.kind}`), from, to, days: DIGEST_WINDOW_DAYS[content.kind] }), '', s('eventsHead')];
  for (const e of content.events) {
    if (e.count === 0 && e.prevCount === 0) continue; // nothing happened either period: not worth a line
    const change = e.changeCount === null ? s('new') : e.changeCount === 0 ? s('noChange') : `${e.changeCount > 0 ? '+' : ''}${pct(e.changeCount)}%`;
    lines.push(s('event', { label: s(`eventName.${e.name}`), count: e.count, change }));
  }
  lines.push('', s('funnelsHead'));
  if (content.funnels.length === 0) lines.push(s('noFunnels'));
  for (const f of content.funnels) {
    lines.push(`${f.name}:`);
    for (const step of f.current.steps) {
      const fromFirst = step.conversionFromFirst === null ? '' : s('funnelFromFirst', { pct: pct(step.conversionFromFirst) });
      lines.push(s('funnelStep', { label: step.label, visitors: step.visitors, pct: fromFirst }));
    }
  }
  lines.push('', s('foot'));
  return lines.join('\n');
}

export interface DigestSendResult {
  telegram: 'sent' | 'skipped' | 'failed';
  email: 'sent' | 'skipped' | 'failed';
}

async function telegramSend(deps: Pick<DigestDeps, 'db' | 'resolver' | 'vault'>, text: string): Promise<void> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: telegramAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const r = await sendOwnerAlert(c, text);
  if (!r.ok) throw new Error(r.error ?? 'telegram send failed');
}

async function emailSend(deps: Pick<DigestDeps, 'db' | 'resolver' | 'vault'>, to: string, subject: string, text: string): Promise<void> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: emailAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const { api } = await c.use<EmailSender>('EMAIL');
  const r = await api.send({ to, subject, text, purpose: 'reports.digest' });
  if (!r.ok) throw new Error(r.error);
}

/** Sends `digest` on every channel the owner turned on, skipping a channel already sent for this row (idempotent)
 *  or with nothing to send to (e-mail on, no address yet). Never throws: a failed send is reported, not raised, the
 *  same "never throws" `sendCostAlerts` (ad-alerts.ts) already practises. */
export async function sendDigest(deps: DigestDeps, storeId: number, digest: DigestRecord): Promise<DigestSendResult> {
  const at = { storeId };
  const [telegramOn, emailOn, ownerEmail, lang] = await Promise.all([
    deps.resolver.value('reports.digest.telegramOn', at),
    deps.resolver.value('reports.digest.emailOn', at),
    deps.resolver.value('reports.digest.ownerEmail', at),
    deps.resolver.value('reports.digest.lang', at),
  ]);
  const text = digestText(digest.content, lang);
  const out: DigestSendResult = { telegram: digest.sentTelegramAt ? 'sent' : 'skipped', email: digest.sentEmailAt ? 'sent' : 'skipped' };

  if (telegramOn && !digest.sentTelegramAt) {
    try {
      await (deps.sendTelegram ?? ((x: string) => telegramSend(deps, x)))(text);
      await deps.db.reportDigest.update({ where: { id: digest.id }, data: { sentTelegramAt: new Date() } });
      out.telegram = 'sent';
    } catch (e) {
      console.warn(`reports.digest: Telegram not sent (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
      out.telegram = 'failed';
    }
  }
  if (emailOn && ownerEmail && !digest.sentEmailAt) {
    const subject = t((lang === 'bn' ? bn : en) as unknown as Dict, 'digest.emailSubject', { title: t((lang === 'bn' ? bn : en) as unknown as Dict, `digest.title.${digest.content.kind}`), from: digest.content.periodStart.slice(0, 10), to: digest.content.periodEnd.slice(0, 10) });
    try {
      await (deps.sendEmail ?? ((to: string, subj: string, body: string) => emailSend(deps, to, subj, body)))(ownerEmail, subject, text);
      await deps.db.reportDigest.update({ where: { id: digest.id }, data: { sentEmailAt: new Date() } });
      out.email = 'sent';
    } catch (e) {
      console.warn(`reports.digest: e-mail not sent (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
      out.email = 'failed';
    }
  }
  return out;
}

/** The admin's own "Run now": builds (or reuses) this period's digest and sends it on whichever channel is on.
 *  Audited — a staff member chose to send it, even though nothing it reads or sends can move money, pause a
 *  campaign or touch an order (rule 6). */
export async function runDigestNow(deps: DigestDeps, who: Who, storeId: number, kind: unknown): Promise<{ digest: DigestRecord; created: boolean; sent: DigestSendResult }> {
  if (!isKind(kind)) throw new DigestError(422, 'INVALID_INPUT', ['kind']);
  const { digest, created } = await getOrCreateDigest(deps, storeId, kind);
  const sent = await sendDigest(deps, storeId, digest);
  await audit(deps.db, who.actor, { storeId, action: 'analytics.digest.run', entityType: 'ReportDigest', entityId: digest.id, after: { kind, created, telegram: sent.telegram, email: sent.email } }, who.ctx);
  // the row as it stands after the send, so the caller sees (and a second send honours) the "sent at" it just got
  const after = await deps.db.reportDigest.findUnique({ where: { id: digest.id } });
  return { digest: after ? view(after) : digest, created, sent };
}
