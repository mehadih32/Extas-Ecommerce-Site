// S15 · PR 312 (Blueprint C2.1, C2.2; AIC-0x "AI Cost Book" — demo 89b-admin-agents.js #/admin/ai?tab=costbook) —
// AI › Cost Book at `/admin/ai/cost-book` (owner only, `ai.read`): one searchable table of every AI job EXTAS
// could run (Support, Orders, Marketing, Social, SEO & blog, Site audit, Reports, Admin helpers, Studio), each row
// with what it does, Claude's own recommended model and why, an estimated cost per run and per month, the same job
// on other companies' models, and a model selector that changes the row's own model immediately (`ai.control`).
// Beside every estimate sits its own Actual column (PR 313, Blueprint C2.3): the job's real cost over the last 30
// days, read from the usage ledger — honestly blank until a job dispatcher writes real rows (none does yet) and
// shown only once 5 real runs exist, so a single stray run never reads as "the real cost". Cost is shown in the
// store's own currency once the owner has typed a USD rate (Money › Costs & fees, PR 345/266); until then it is
// shown honestly in USD, with a plain note why.
// PR 314 adds two more C2.3 pieces: three one-click presets (Economy/Balanced/Premium, `ai.control`, one combined
// audit entry) that set every job's own model at once, each card already showing its own hypothetical monthly
// total and how many jobs would move to a smaller or larger model before it is applied; and a "what if" slider per
// section that recomputes the monthly total live, entirely in the browser (`CostBookWhatIf`) — it saves nothing.
// Guide: docs/admin-guide/pages/ai/cost-book.md.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { AdminNotice } from "@/components/admin/AdminFrame";
import {
  CostBookCalculator,
  type CalcJobOption,
} from "@/components/admin/ai/CostBookCalculator";
import {
  CostBookModelSelect,
  type CostBookModelOption,
} from "@/components/admin/ai/CostBookModelSelect";
import { CostBookPresetButton } from "@/components/admin/ai/CostBookPresetButton";
import { CostBookSearch } from "@/components/admin/ai/CostBookSearch";
import { CostBookWhatIf } from "@/components/admin/ai/CostBookWhatIf";
import { ShellIcon } from "@/components/admin/shell/ShellIcon";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import {
  formatMoney,
  formatNumber,
  moneyOf,
} from "@/components/admin/products/model";
import { adminDeps } from "@/lib/admin-auth";
import { costBookView, MIN_ACTUAL_SAMPLES } from "@/lib/admin-ai/cost-book";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import bn from "../../../../../messages/admin-ai.bn.json";
import en from "../../../../../messages/admin-ai.en.json";
import "../ai.css";
import "./cost-book.css";

export const dynamic = "force-dynamic";

const KEY = "aiCostBook";
const HERE = "/admin/ai/cost-book";

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      aiCostBook: (view.lang === "bn" ? bn : en).aiCostBook as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, "aiCostBook.metaTitle")} · ${t(view.dict, "shell.admin")}`,
    robots: { index: false, follow: false },
  };
}

export default async function AiCostBookPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([
    adminView(deps),
    pageAccess("ai.read", deps, MOTHER_STORE_ID),
  ]);
  const view = withScreen(plain);
  if (access.kind === "login" || access.kind === "password")
    redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable")
    return (
      <AdminNotice view={view} current={KEY} text={t(view.dict, "page.noDb")} />
    );
  if (access.kind === "forbidden")
    return (
      <div className="a2-z" data-testid="cost-book-page">
        <ShellState view={view} kind="denied" permission="ai.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) =>
    t(d, `aiCostBook.${k}`, vars);
  const canControl = access.guard.permissions?.has("ai.control") ?? false;

  const o = await costBookView(
    { db: access.deps.db, resolver: access.deps.resolver },
    MOTHER_STORE_ID,
  );
  const storeMoney = moneyOf(o.currency, view.locale);
  const usdMoney = moneyOf("USD", view.locale);
  const amount = (storeMinor: number | null, usdMinor: number) =>
    storeMinor !== null
      ? formatMoney(storeMinor, storeMoney)
      : formatMoney(usdMinor, usdMoney);
  const num = (n: number) => formatNumber(n, view.locale);

  const moneyForSelect = (minor: number) =>
    o.hasUsdRate
      ? formatMoney(minor, storeMoney)
      : formatMoney(minor, usdMoney);
  const optionsFor = (job: (typeof o.jobs)[number]): CostBookModelOption[] =>
    job.choices.map((ch) => ({
      modelKey: ch.modelKey,
      label: `${ch.providerName} — ${ch.displayName}`,
      isRecommended: ch.isRecommended,
      perRunText: moneyForSelect(ch.perRunStoreMinor ?? ch.perRunUsdMinor),
      perMonthText: moneyForSelect(ch.perMonthStoreMinor ?? ch.perMonthUsdMinor),
    }));
  const nameOf = (job: (typeof o.jobs)[number]) =>
    view.lang === "bn" ? job.nameBn : job.nameEn;
  const sectionNameOf = (id: string) =>
    (view.lang === "bn"
      ? o.sections.find((s) => s.id === id)?.nameBn
      : o.sections.find((s) => s.id === id)?.nameEn) ?? id;
  const altsOf = (job: (typeof o.jobs)[number]) => {
    const others = job.choices
      .filter((ch) => ch.modelKey !== job.selectedModelKey)
      .slice(0, 3);
    if (!others.length) return c("altNone");
    return others
      .map(
        (ch) =>
          `${ch.providerName} ${ch.displayName}: ${amount(ch.perMonthStoreMinor, ch.perMonthUsdMinor)}/mo`,
      )
      .join(" · ");
  };
  const actualOf = (job: (typeof o.jobs)[number]) => {
    const a = job.actual;
    if (!a) return c("actualNone", { min: MIN_ACTUAL_SAMPLES });
    const dev =
      a.deviationPct === null || a.deviationPct === 0
        ? c("actualSame")
        : c(a.deviationPct > 0 ? "actualAbove" : "actualBelow", {
            pct: Math.abs(a.deviationPct),
          });
    return `${c("actualRuns", { runs: num(a.runs), perRun: amount(a.perRunStoreMinor, a.perRunUsdMinor) })} — ${dev}`;
  };

  return (
    <div
      className="a2-z"
      data-testid="cost-book-page"
      data-on-rate={o.hasUsdRate ? "yes" : "no"}
    >
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={c("title")}
        sub={c("sub")}
      />
      <SectionTabs view={view} current={KEY} />

      {!o.hasUsdRate ? (
        <div
          className="a2-note cb-note a2-mt12"
          role="note"
          data-testid="cb-no-rate"
        >
          <ShellIcon name="alert" size={15} />
          <span>{c("noRate")}</span>
        </div>
      ) : null}
      <div
        className="a2-note cb-note a2-mt12"
        role="note"
        data-testid="cb-honest-note"
      >
        <ShellIcon name="info" size={15} />
        <span>{c("honestNote")}</span>
      </div>

      <div className="a2-kpis a2-mt12">
        <div
          className="a2-card a2-kpi"
          data-testid="cb-kpi-jobs"
          data-n={o.jobs.length}
        >
          <div className="a2-kl">{c("kpis.jobs")}</div>
          <div className="a2-kv">{num(o.jobs.length)}</div>
        </div>
        <div className="a2-card a2-kpi" data-testid="cb-kpi-month">
          <div className="a2-kl">{c("kpis.month")}</div>
          <div className="a2-kv">
            {amount(o.totalPerMonthStoreMinor, o.totalPerMonthUsdMinor)}
          </div>
        </div>
      </div>

      <section
        className="a2-sc a2-mt12 cb-presets"
        aria-labelledby="cb-presets-h"
        data-testid="cb-presets"
      >
        <h2 className="a2-h3" id="cb-presets-h">
          {c("presets.title")}
        </h2>
        <div className="cb-presets-grid">
          {o.presets.map((p) => {
            const name = view.lang === "bn" ? p.nameBn : p.nameEn;
            return (
              <div
                key={p.key}
                className="a2-card cb-preset-card"
                data-testid={`cb-preset-card-${p.key}`}
              >
                <div className="n">{name}</div>
                <div className="cb-preset-total">
                  {amount(p.totalPerMonthStoreMinor, p.totalPerMonthUsdMinor)}
                  /mo
                </div>
                <div className="a2-xs a2-mute">
                  {p.changedJobs > 0
                    ? c("presets.changed", {
                        n: num(p.changedJobs),
                        smaller: num(p.movedToSmaller),
                        larger: num(p.movedToLarger),
                      })
                    : c("presets.noChange")}
                </div>
                {canControl ? (
                  <CostBookPresetButton
                    preset={p.key}
                    label={c("presets.apply", { preset: name })}
                    changedText={c("presets.toastChanged", { preset: name })}
                    failedText={c("presets.toastFailed")}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="a2-mt12">
        <CostBookSearch
          label={c("search.label")}
          placeholder={c("search.placeholder")}
          noneText={c("search.none")}
          rowsId="cb-rows"
          noneId="cb-none"
        />
      </div>

      <div className="a2-tblw a2-mt12">
        <table className="a2-tbl" data-testid="cb-table">
          <thead>
            <tr>
              <th>{c("col.section")}</th>
              <th>{c("col.job")}</th>
              <th>{c("col.model")}</th>
              <th>{c("col.perRun")}</th>
              <th>{c("col.perMonth")}</th>
              <th>{c("col.runs")}</th>
              <th>{c("col.actual")}</th>
              <th>{c("col.alternatives")}</th>
            </tr>
          </thead>
          <tbody id="cb-rows">
            {o.jobs.map((job) => {
              const name = nameOf(job);
              const text = [
                job.nameEn,
                job.nameBn,
                job.description,
                sectionNameOf(job.section),
              ]
                .join(" ")
                .toLowerCase();
              return (
                <tr
                  key={job.key}
                  data-cb-text={text}
                  data-job={job.key}
                  data-testid={`cb-row-${job.key}`}
                >
                  <td data-l={c("col.section")}>
                    <span className="a2-pill line">
                      {sectionNameOf(job.section)}
                    </span>
                  </td>
                  <td className="cb-job" data-l={c("col.job")}>
                    <div className="n">{name}</div>
                    <div className="d a2-xs a2-mute">{job.description}</div>
                  </td>
                  <td data-l={c("col.model")}>
                    {canControl ? (
                      <CostBookModelSelect
                        jobKey={job.key}
                        selected={job.selectedModelKey}
                        options={optionsFor(job)}
                        label={c("modelSelectLabel", { job: name })}
                        changedText={c("toastChanged")}
                        failedText={c("toastFailed")}
                        recommendedText={c("recommended")}
                      />
                    ) : (
                      <span className="a2-xs">
                        {
                          optionsFor(job).find(
                            (x) => x.modelKey === job.selectedModelKey,
                          )?.label
                        }
                      </span>
                    )}
                    <div className="a2-xs a2-mute">
                      {job.recommendationNote}
                    </div>
                  </td>
                  <td data-l={c("col.perRun")}>
                    {amount(job.perRunStoreMinor, job.perRunUsdMinor)}
                  </td>
                  <td data-l={c("col.perMonth")}>
                    <b>
                      {amount(job.perMonthStoreMinor, job.perMonthUsdMinor)}
                    </b>
                  </td>
                  <td className="a2-xs" data-l={c("col.runs")}>
                    {c("runsLine", {
                      perDay: num(job.typicalRunsPerDay),
                      perMonth: num(job.typicalRunsPerDay * 30),
                    })}
                  </td>
                  <td
                    className="cb-actual a2-xs"
                    data-l={c("col.actual")}
                    data-has-actual={job.actual ? "yes" : "no"}
                  >
                    {actualOf(job)}
                  </td>
                  <td
                    className="cb-alts a2-xs a2-mute"
                    data-l={c("col.alternatives")}
                  >
                    {altsOf(job)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="a2-sm a2-mute" id="cb-none" style={{ display: "none" }}>
          {c("search.none")}
        </p>
      </div>

      <CostBookWhatIf
        jobs={o.jobs.map((j) => ({
          section: j.section,
          perMonthUsdMinor: j.perMonthUsdMinor,
          perMonthStoreMinor: j.perMonthStoreMinor,
        }))}
        sections={o.sections.map((s) => ({
          id: s.id,
          name: view.lang === "bn" ? s.nameBn : s.nameEn,
        }))}
        money={amount}
        title={c("whatIf.title")}
        resetText={c("whatIf.reset")}
      />

      <section
        className="a2-sc a2-mt12 cb-top"
        aria-labelledby="cb-top-h"
        data-testid="cb-top"
      >
        <h2 className="a2-h3" id="cb-top-h">
          {c("kpis.top")}
        </h2>
        <ol className="a2-sm">
          {o.topExpensive.map((job) => (
            <li key={job.key}>
              {nameOf(job)} —{" "}
              {amount(job.perMonthStoreMinor, job.perMonthUsdMinor)}/mo
            </li>
          ))}
        </ol>
      </section>

      {canControl ? (
        <CostBookCalculator
          jobs={o.jobs.map(
            (job): CalcJobOption => ({
              key: job.key,
              name: nameOf(job),
              sectionName: sectionNameOf(job.section),
              models: job.choices.map((ch) => ({
                modelKey: ch.modelKey,
                label: `${ch.providerName} ${ch.displayName}`,
                isRecommended: ch.isRecommended,
              })),
            }),
          )}
          money={amount}
          lang={view.lang}
          labels={{
            title: c("calc.title"),
            jobLabel: c("calc.jobLabel"),
            quantityLabel: c("calc.quantityLabel"),
            scaleLabel: c("calc.scaleLabel"),
            scaleHint: c("calc.scaleHint"),
            modelLabel: c("calc.modelLabel"),
            modelAuto: c("calc.modelAuto"),
            addLine: c("calc.addLine"),
            removeLine: c("calc.removeLine"),
            calculate: c("calc.calculate"),
            calculating: c("calc.calculating"),
            total: c("calc.total"),
            altLabel: c("calc.altLabel"),
            saveLabel: c("calc.saveLabel"),
            savePlaceholder: c("calc.savePlaceholder"),
            saveButton: c("calc.saveButton"),
            saved: c("calc.saved"),
            failed: c("calc.failed"),
            invalid: c("calc.invalid"),
          }}
        />
      ) : (
        <div
          className="a2-note cb-note a2-mt12"
          role="note"
          data-testid="cb-calc-locked"
        >
          <ShellIcon name="info" size={15} />
          <span>{c("calc.needPermission")}</span>
        </div>
      )}
    </div>
  );
}
