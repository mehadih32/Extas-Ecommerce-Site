// S29 · PR 761 (CN-054; register "Geography map: AI advisor", advice only) — the advisor on the database.
//
// What it does: reads the Geography map's lenses (all of them, and only the parts the person who pressed
// the button may see), works out the suggestions (advisor-model.ts: numbers only), and for each one asks the guarded AI note
// (`approvalExplainNote`: agent `gyani`, the master switch `ai.enabled`, the agent's cap, the usage ledger and the diary) for
// one short paragraph in the owner's language. A suggestion with a note becomes a draft in the approval queue (kind
// `geo.advice`, from the AI account's agent), with the numbers behind it, waiting `expiresDays` days.
//
// What it never does: change anything. No ad budget, campaign, price, delivery charge, COD rule, courier, stock or setting is
// touched (hard rule 6); the only write is the draft itself (`aiApprovalRequest`), and approving a draft changes nothing
// either: it only records that a person read it. There is no geo-specific switch (owner's decision, 16 Nov 2026); the one gate
// is the site's global AI control, and it stops the run before any read or AI call:  AI is on (`ai.enabled`, off as shipped)
// With AI off (or paused, or capped, or on the mock) there is no AI call and no draft: a suggestion without its AI note is
// not queued, so the queue never fills with unexplained cards.
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import {
  courierLens,
  geoDemand,
  geoMoney,
  geoRisk,
  type LensResult,
  type MoneyPart,
  type RiskPart,
} from "@extas/metrics";
import {
  approvalExplainOption,
  type ApprovalExplainAiDeps,
  type ApprovalExplainFacts,
} from "../admin-ai/approval-explain-dispatch";
import { requestApproval } from "../admin-ai/approvals";
import { profitInputs } from "../order-profit-view";
import type { AppResolver } from "../settings";
import {
  suggestionsFrom,
  textOf,
  type AdviceInput,
  type CourierHint,
  type CoverageGap,
  type Lang,
  type Suggestion,
} from "./advisor-model";
import { courierHints, coverageGaps } from "./advisor-hints";
import { moneyParts, riskParts, topRiskBand } from "./lens-api";
import { readLensSetting } from "./setting";
import type { Actor } from "@extas/auth";

/** The kind and the reference type of the drafts in the approval queue. */
export const ADVICE_KIND = 'geo.advice';
export const ADVICE_REF_TYPE = 'geo-advice';
export const ADVICE_AGENT = 'gyani';
export const ADVICE_CHANNEL = 'geo-map';
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day, a unit

export type AdvisorStatus = "aiOff" | "ready";

/** Where the advisor stands for a store: global AI off, or `ready`. Reads only settings. */
export async function advisorStatus(
  resolver: Pick<AppResolver, "value">,
  storeId: number,
): Promise<AdvisorStatus> {
  if (!(await resolver.value("ai.enabled", { storeId }))) return "aiOff";
  return "ready";
}

export interface AdvisorDeps {
  db: PrismaClient;
  resolver: AppResolver;
  vault: ApprovalExplainAiDeps['vault'];
  now?: () => Date;
  /** For tests: the AI note, instead of the guarded call. */
  explain?: (storeId: number, refId: string, lang: Lang, facts: ApprovalExplainFacts) => Promise<string | null>;
}

export interface AdvisorRun {
  status: AdvisorStatus;
  /** Suggestions the figures supported (before the cap). */
  found: number;
  /** Drafts newly put in the queue. */
  drafted: number;
  /** Suggestions already waiting in the queue (not queued twice). */
  alreadyWaiting: number;
  /** Suggestions left out: over the cap, or with no AI note. */
  left: { overCap: number; noNote: number };
}

const EMPTY = (status: AdvisorStatus): AdvisorRun => ({
  status,
  found: 0,
  drafted: 0,
  alreadyWaiting: 0,
  left: { overCap: 0, noNote: 0 },
});

export interface AdvisorInputs {
  actor: Actor;
  lang: Lang;
  days: { from: string; to: string };
  /** The courier lens's own findings, when the caller has them; left out, the run reads the courier lens itself (advisor-hints.ts). */
  hints?: {
    courier?: readonly CourierHint[] | null;
    coverage?: readonly CoverageGap[] | null;
  };
}

/** The district figures behind the ad lists, from the risk lens's rows (delivered and returned, as Sales by area). */
export function districtsOf(risk: LensResult | null) {
  if (!risk) return null;
  const rows = risk.rows.filter(
    (r) =>
      r.figures.delivered !== null && r.figures.delivered !== undefined && r.figures.returned !== null && r.figures.returned !== undefined,
  );
  if (!rows.length) return null;
  return rows.map((r) => ({
    areaId: r.areaId,
    nameEn: r.nameEn,
    nameBn: r.nameBn,
    delivered: r.figures.delivered ?? 0,
    returned: r.figures.returned ?? 0,
  }));
}

/** Reads the lenses (district level, as the ad lists are) and returns what the figures support. */
export async function gatherSuggestions(
  deps: Pick<AdvisorDeps, 'db' | 'resolver'>,
  storeId: number,
  inp: AdvisorInputs,
): Promise<{ suggestions: Suggestion[]; currency: string }> {
  const setting = await readLensSetting(deps.resolver, storeId);
  const at = { storeId };
  const [timeZone, guide, currency] = await Promise.all([
    deps.resolver.value('store.timeZone', at),
    deps.resolver.value('ads.geoGuide', at),
    deps.resolver.value('store.currency', at),
  ]);
  const level = 'district' as const;
  const base = { level, parentAreaId: null, minOrders: setting.minOrders };

  const risk = await geoRisk(deps.db, storeId, inp.days, {
    ...base,
    timeZone,
    warnReturnPct: setting.warnReturnPct,
    topBandKey: await topRiskBand(deps.resolver, storeId),
    parts: (await riskParts(deps.db, inp.actor, storeId)) as Set<RiskPart>,
  });
  const money = await geoMoney(deps.db, storeId, inp.days, {
    ...base,
    profit: await profitInputs(deps.resolver, storeId),
    topProducts: setting.topProducts,
    parts: (await moneyParts(deps.db, inp.actor, storeId)) as Set<MoneyPart>,
  });
  const demand = await geoDemand(deps.db, storeId, inp.days, {
    ...base,
    timeZone,
    topProducts: setting.topProducts,
  });

  // the courier lens's own findings (PR 757): the caller's hints, else the lens itself (read-only, district level)
  let hints = inp.hints;
  if (hints?.courier === undefined && hints?.coverage === undefined) {
    const lens = await courierLens(deps.db, {
      storeId,
      timeZone,
      days: inp.days,
      level,
      parentAreaId: null,
      thresholds: await deps.resolver.value("reports.geoMapCourier", at),
    });
    hints = { courier: courierHints(lens), coverage: coverageGaps(lens) };
  }

  const input: AdviceInput = {
    minOrders: setting.minOrders,
    guide,
    districts: districtsOf(risk),
    risk,
    money,
    demand,
    courier: hints?.courier ?? null,
    coverage: hints?.coverage ?? null,
  };
  return { suggestions: suggestionsFrom(input), currency };
}

/**
 * One run. The global AI gate first (no read, no AI call, no draft while it is closed), then the suggestions, then at most `maxPerRun`
 * drafts, each with its own AI note. Never throws for an AI "no": that just leaves the suggestion out.
 */
export async function runGeoAdvisor(deps: AdvisorDeps, storeId: number = MOTHER_STORE_ID, inp: AdvisorInputs): Promise<AdvisorRun> {
  const status = await advisorStatus(deps.resolver, storeId);
  if (status !== 'ready') return EMPTY(status);
  const got = await gatherSuggestions(deps, storeId, inp);
  const cfg = await deps.resolver.value("reports.geoAdvisor", { storeId });
  const now = deps.now?.() ?? new Date();
  const run = EMPTY('ready');
  run.found = got.suggestions.length;
  const chosen = got.suggestions.slice(0, cfg.maxPerRun);
  run.left.overCap = got.suggestions.length - chosen.length;
  const ai: ApprovalExplainAiDeps = {
    db: deps.db,
    resolver: deps.resolver,
    vault: deps.vault,
    now: deps.now,
  };

  for (const s of chosen) {
    const refId = `${s.key}:${inp.days.from}:${inp.days.to}`;
    const { title, facts } = textOf(s, inp.lang, got.currency);
    const note = await (deps.explain
      ? deps.explain(storeId, refId, inp.lang, { title, why: facts })
      : approvalExplainOption(ai, storeId, refId, inp.lang)({ title, why: facts }));
    if (!note) {
      run.left.noNote += 1;
      continue;
    }
    const made = await requestApproval(
      { db: deps.db, now: deps.now },
      {
        storeId,
        agentKey: ADVICE_AGENT,
        kind: ADVICE_KIND,
        title,
        summary: note,
        payload: {
          advice: s.kind,
          key: s.key,
          areaId: s.areaId,
          numbers: s.numbers,
          list: s.list ?? null,
          item: s.item ?? null,
          facts,
          days: inp.days,
          level: 'district',
          lang: inp.lang,
          advisoryOnly: true,
        },
        channel: ADVICE_CHANNEL,
        refType: ADVICE_REF_TYPE,
        refId,
        expiresAt: new Date(now.getTime() + cfg.expiresDays * DAY_MS),
      },
    );
    if (made.created) run.drafted += 1;
    else run.alreadyWaiting += 1;
  }
  return run;
}

/** The pending advice drafts of a store (newest first), for the screen's list. Read-only. */
export async function pendingAdvice(db: PrismaClient, storeId: number) {
  const rows = await db.aiApprovalRequest.findMany({
    where: { kind: ADVICE_KIND, storeId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }); // hardcode-ok: a list page size
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    note: r.summary,
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  }));
}
