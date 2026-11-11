// S15 · PR 312 (Blueprint C2.1, C2.2; AIC-0x "AI Cost Book" — demo 89b-admin-agents.js #/admin/ai?tab=costbook) —
// AI › Cost Book at `/admin/ai/cost-book` (owner only, `ai.read`): one searchable table of every AI job EXTAS
// could run (Support, Orders, Marketing, Social, SEO & blog, Site audit, Reports, Admin helpers, Studio), each row
// with what it does, Claude's own recommended model and why, an estimated cost per run and per month, the same job
// on other companies' models, and a model selector that changes the row's own model immediately (`ai.control`).
// Nothing has run yet (no job runner reads this), so every number is honestly an estimate — never an "actual"
// (that self-correction loop is PR 313). Cost is shown in the store's own currency once the owner has typed a USD
// rate (Money › Costs & fees, PR 345/266); until then it is shown honestly in USD, with a plain note why.
// Guide: docs/admin-guide/pages/ai/cost-book.md.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { AdminNotice } from "@/components/admin/AdminFrame";
import {
  CostBookModelSelect,
  type CostBookModelOption,
} from "@/components/admin/ai/CostBookModelSelect";
import { CostBookSearch } from "@/components/admin/ai/CostBookSearch";
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
import { costBookView } from "@/lib/admin-ai/cost-book";
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

  const optionsFor = (job: (typeof o.jobs)[number]): CostBookModelOption[] =>
    job.choices.map((ch) => ({
      modelKey: ch.modelKey,
      label: `${ch.providerName} — ${ch.displayName}`,
      isRecommended: ch.isRecommended,
      perRunMinor: ch.perRunStoreMinor ?? ch.perRunUsdMinor,
      perMonthMinor: ch.perMonthStoreMinor ?? ch.perMonthUsdMinor,
    }));
  const moneyForSelect = (minor: number) =>
    o.hasUsdRate
      ? formatMoney(minor, storeMoney)
      : formatMoney(minor, usdMoney);
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
                        money={moneyForSelect}
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
    </div>
  );
}
