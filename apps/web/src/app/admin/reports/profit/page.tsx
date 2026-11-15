// S28 · PR 714 (CN-048; prototype v5 Reports › Profit) — Reports › Profit at /admin/reports/profit: where the profit comes from,
// for any period (one-press periods or two dates, made safe by `costs.report`) with the span before beside it: net profit,
// profit before ads, margin, profit per order, ad spend, return losses, styles losing money, a hero chart of profit before ads
// day by day, and the profit by channel, category and style. Read-only. Every figure is the one Money › Profit & loss, Profit by
// channel and Profit by group already show (lib/reports-v5/load.ts): nothing is counted again and no money rule is new.
// Seeing needs `books.read`. Words: messages/admin-reports-v5.*.json (`reportsV5.profit.*`). Guide: docs/admin-guide/pages/reports/profit.md.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { AdminNotice } from "@/components/admin/AdminFrame";
import {
  SummaryTiles,
  type SummaryTile,
} from "@/components/admin/lumen/SummaryTiles";
import {
  ReportAnswers,
  type AnswerLine,
} from "@/components/admin/reports/ReportAnswers";
import { BarList, MarginLine } from "@/components/admin/reports/ReportCharts";
import { ReportBar } from "@/components/admin/reports/ReportBar";
import {
  ReportFilters,
  keepOf,
} from "@/components/admin/reports/ReportFilters";
import {
  MoreLink,
  ProfitTable,
  toTableRow,
  type ProfitTableRow,
} from "@/components/admin/reports/ReportProfitTables";
import "@/components/admin/reports/report-bar.css";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { channelMarginPct } from "@/lib/channel-profit-view";
import { marginPct } from "@/lib/group-profit-view";
import { t } from "@/lib/i18n";
import {
  categoryTree,
  loadGeoOrders,
  type GeoLine,
} from "@/lib/reports-v5/areas";
import { makeFmt } from "@/lib/reports-v5/fmt";
import { DIVISIONS } from "@/lib/reports-v5/geo";
import { loadBase, loadProfit, loadViews } from "@/lib/reports-v5/load";
import { change, leaves } from "@/lib/reports-v5/model";
import {
  divOfOrder,
  filteredFigures,
  filterOrders,
  losingProducts,
  profitGroups,
} from "@/lib/reports-v5/profit";
import { withReportsV5 } from "@/lib/reports-v5/words";
import "../../settings-cards.css";
import "../../money/money.css";
import "../delivery/report.css";

export const dynamic = "force-dynamic";

const KEY = "reportsProfit";
const HERE = "/admin/reports/profit";

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(await adminView());
  return {
    title: `${t(view.dict, "reportsV5.profit.metaTitle")} · ${t(view.dict, "shell.admin")}`,
    robots: { index: false, follow: false },
  };
}

export default async function ProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([
    adminView(deps),
    pageAccess("books.read", deps, MOTHER_STORE_ID),
    searchParams,
  ]);
  const view = withReportsV5(plain);
  const d = view.dict;
  if (access.kind === "login" || access.kind === "password")
    redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable")
    return <AdminNotice view={view} current={KEY} text={t(d, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z lm-rp" data-testid="rp-profit" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.profit.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.common.${k}`, v);
  const b = await loadBase(access.deps, sp);
  // PR 799: the category and area filters (the prototype's second toolbar row); they narrow the tables built from orders
  const catId =
    typeof sp.cat === "string" && /^[0-9a-f-]{36}$/i.test(sp.cat)
      ? sp.cat
      : "all";
  const divF =
    typeof sp.div === "string" && DIVISIONS.includes(sp.div) ? sp.div : "all";
  const [r, categories, geoNow, geoWas, catTree] = await Promise.all([
    loadProfit(access.deps, b),
    access.deps.db.category.findMany({
      where: { storeId: MOTHER_STORE_ID, archivedAt: null },
      select: { id: true, nameEn: true, nameBn: true, parentId: true },
      orderBy: { nameEn: "asc" },
    }),
    loadGeoOrders(access.deps, b.timeZone, b.period.q.from, b.period.q.to),
    loadGeoOrders(access.deps, b.timeZone, b.before.from, b.before.to),
    catId === "all"
      ? Promise.resolve(null)
      : categoryTree(access.deps.db, catId),
  ]);
  const f = makeFmt(view.locale, b.currency);
  const { q, notes } = b.period;
  const { now, was } = r;
  const cmp = sp.cmp !== "0";
  const views = await loadViews(access, "profit");
  const channelName = (k: string) => {
    const w = t(d, `reportsV5.channel.${k}`);
    return w === `reportsV5.channel.${k}` ? k.replace(/^source:/, "") : w;
  };

  const lineOk = (l: GeoLine) =>
    !catTree || (!!l.catId && catTree.has(l.catId));
  const filtered = catId !== "all" || divF !== "all";
  const ordersNow = filterOrders(geoNow, { cat: catId, div: divF }, catTree);
  const ordersWas = filterOrders(geoWas, { cat: catId, div: divF }, catTree);
  // PR 854: with a filter on, the top tiles follow it (the filtered orders' own profit; ads, office and other costs shared by sales)
  const whole = (x: typeof now) => ({
    sales: x.parts.sales,
    contribution: x.contributionMinor,
    net: x.netProfitMinor,
    ads: x.adsMinor,
    returnLoss: x.parts.returnLoss,
  });
  const fNow = filtered ? filteredFigures(ordersNow, geoNow, whole(now)) : null;
  const fWas = filtered ? filteredFigures(ordersWas, geoWas, whole(was)) : null;
  const perOrder =
    now.orders > 0 ? Math.round(now.contributionMinor / now.orders) : null;
  const perOrderWas =
    was.orders > 0 ? Math.round(was.contributionMinor / was.orders) : null;
  const marginNow =
    now.netProfitMinor === null || now.parts.sales <= 0
      ? null
      : now.netProfitMinor / now.parts.sales;
  const losing = leaves(r.styles.rows).filter(
    (x) => x.id !== null && Math.sign(x.profitMinor) === -1,
  ).length;
  const money = (
    id: string,
    label: string,
    minor: number | null,
    before: number | null,
    good?: "down",
    vs?: string,
  ): SummaryTile => ({
    key: id,
    label,
    value: minor ?? 0,
    shown: f.maybe(minor, cc("unknown")),
    format: f.format,
    ...(minor === null ? { word: true } : {}),
    delta: change(minor, before),
    ...(good ? { good } : {}),
    ...(vs ? { vs } : {}),
  });
  const T =
    fNow && fWas
      ? {
          net: fNow.net,
          netWas: fWas.net,
          before: fNow.before,
          beforeWas: fWas.before,
          margin: fNow.margin,
          perOrder: fNow.perOrder,
          perOrderWas: fWas.perOrder,
          ads: fNow.ads,
          adsWas: fWas.ads,
          returns: fNow.returns,
          returnsWas: fWas.returns,
          orders: fNow.orders,
          losing: losingProducts(profitGroups(ordersNow, (l) => l.pid, lineOk)),
        }
      : {
          net: now.netProfitMinor,
          netWas: was.netProfitMinor,
          before: now.contributionMinor,
          beforeWas: was.contributionMinor,
          margin: marginNow,
          perOrder,
          perOrderWas,
          ads: now.adsMinor,
          adsWas: was.adsMinor,
          returns: now.parts.returnLoss,
          returnsWas: was.parts.returnLoss,
          orders: now.orders,
          losing,
        };
  const tiles: SummaryTile[] = [
    money(
      "net",
      c("kNet"),
      T.net,
      T.netWas,
      undefined,
      c("kOrders", { n: T.orders }),
    ),
    money("before", c("kBefore"), T.before, T.beforeWas),
    T.margin === null
      ? {
          key: "margin",
          label: c("kMargin"),
          value: 0,
          shown: "—",
          format: { kind: "percent", locale: view.locale, digits: 1 },
          word: true,
        }
      : {
          key: "margin",
          label: c("kMargin"),
          value: T.margin,
          shown: f.pct(T.margin),
          format: { kind: "percent", locale: view.locale, digits: 1 },
        },
    money(
      "perOrder",
      c("kPerOrder"),
      T.perOrder,
      T.perOrderWas,
      undefined,
      c("beforeAds"),
    ),
    money("ads", c("kAds"), T.ads, T.adsWas, "down"),
    money("returns", c("kReturns"), T.returns, T.returnsWas, "down"),
    {
      key: "losing",
      label: c("kLosing"),
      value: T.losing,
      shown: f.num(T.losing),
      format: { kind: "number", locale: view.locale },
      tone: T.losing > 0 ? "bad" : undefined,
    },
  ];

  // "Margin, week by week": the period's days in blocks of seven, margin before ads = contribution ÷ delivered sales.
  const dayAsc = [...now.byDay].sort((x, y) => x.day.localeCompare(y.day));
  const weeks: { label: string; sales: number; contribution: number }[] = [];
  for (let i = 0; i < dayAsc.length; i += 7) {
    const chunk = dayAsc.slice(i, i + 7);
    weeks.push({
      label: f.dayShort(chunk[0]!.day),
      sales: chunk.reduce((a2, x) => a2 + x.salesMinor, 0),
      contribution: chunk.reduce((a2, x) => a2 + x.contributionMinor, 0),
    });
  }
  const weekPoints = weeks
    .slice(-8)
    .map((w) => ({
      label: w.label,
      value:
        w.sales > 0 ? Math.round((w.contribution / w.sales) * 1000) / 10 : null,
    }));
  const chRows = r.channels.rows.filter((x) => x.kind !== "total");
  const chValue = (x: (typeof chRows)[number]) =>
    x.profitMinor ?? x.contributionMinor;
  const chSorted = [...chRows].sort((x, y) => chValue(y) - chValue(x));
  const topCh = chSorted[0];
  const topChWas = topCh
    ? r.channelsWas.rows.find((x) => x.key === topCh.key)
    : undefined;
  const catTop = r.categories.rows.filter(
    (x) =>
      x.depth === 0 &&
      x.id !== null &&
      x.salesMinor > 0 &&
      marginPct(x) !== null,
  );
  const catSorted = [...catTop].sort(
    (x, y) => (marginPct(y) ?? 0) - (marginPct(x) ?? 0),
  );
  const lowCat = catSorted[catSorted.length - 1];
  const bestCat = catSorted[0];
  const lines: AnswerLine[] = [];
  if (lowCat && bestCat && lowCat.id !== bestCat.id)
    lines.push({
      text: c("ans.lowCat", {
        name: lowCat.name ?? "",
        pct: f.pctOf(marginPct(lowCat)),
        bestName: bestCat.name ?? "",
        bestPct: f.pctOf(marginPct(bestCat)),
      }),
      tone: (marginPct(lowCat) ?? 100) < 25 ? "bad" : undefined,
      act: { label: c("ans.checkPrices"), href: "/admin/products" },
    });
  if (topCh && chValue(topCh) > 0) {
    const was = topChWas
      ? (topChWas.profitMinor ?? topChWas.contributionMinor)
      : null;
    const ch = change(chValue(topCh), was);
    lines.push({
      text: c("ans.bestCh", {
        name: channelName(topCh.key),
        amount: f.amount(chValue(topCh)),
        change: ch === null ? "—" : f.pct(ch),
      }),
      tone: "good",
      act: { label: c("ans.raiseBudget"), href: "/admin/marketing" },
    });
  }
  if (losing > 0)
    lines.push({
      text: c("ans.losing", { n: losing }),
      tone: "bad",
      act: {
        label: c("byStyle"),
        href: `/admin/money/profit/groups?by=style&from=${q.from}&to=${q.to}`,
      },
    });

  const csv = `/api/admin/reports/export/profit?from=${q.from}&to=${q.to}`;
  const bnLang = view.lang === "bn";
  const catName = new Map(
    categories.map((x) => [x.id, bnLang && x.nameBn ? x.nameBn : x.nameEn]),
  );
  const tx = {
    more: cc("showAll", { n: "{n}" }),
    less: cc("showLess"),
    close: cc("close"),
    empty: cc("none"),
  };
  const drawerOf = (
    title: string,
    sub: string,
    os: typeof ordersNow,
    only?: (l: GeoLine) => boolean,
  ): ProfitTableRow["drawer"] => ({
    title,
    sub,
    empty: cc("none"),
    items: profitGroups(os, (l) => l.pid, only ?? lineOk)
      .sort((x, y) => y.profit - x.profit)
      .slice(0, 12)
      .map((g) => ({
        label: g.orders[0]?.lines.find((l) => l.pid === g.key)?.name ?? g.key,
        sub: c("drawerPieces", { n: f.num(g.pieces) }),
        value: f.amount(g.profit),
        href: `/admin/products/${g.key}`,
      })),
  });
  // By category: Money's own figure while no filter is on (top groups, profit before ads = profit plus the ad share); the orders' own lines when one is
  const topCat = r.categories.rows.filter((x) => x.depth === 0);
  const catWas = new Map(
    r.categoriesWas.rows.map((x) => [x.id, x.profitMinor + x.adsMinor]),
  );
  const kidsOf = new Map<string, string[]>();
  for (const x of categories)
    if (x.parentId)
      kidsOf.set(x.parentId, [...(kidsOf.get(x.parentId) ?? []), x.id]);
  const treeOf = (id: string) => {
    const set = new Set<string>([id]);
    const walk = (k: string) =>
      kidsOf.get(k)?.forEach((n) => !set.has(n) && (set.add(n), walk(n)));
    walk(id);
    return set;
  };
  const catRows: ProfitTableRow[] = filtered
    ? profitGroups(ordersNow, (l) => l.catId, lineOk).map((g) =>
        toTableRow({
          key: g.key,
          name: catName.get(g.key) ?? t(d, "reportsV5.channel.noCategory"),
          g,
          href: `${HERE}?${new URLSearchParams({ ...keepOf(sp, ["cat"]), cat: g.key }).toString()}`,
        }),
      )
    : topCat.map((x) => {
        const before = x.profitMinor + x.adsMinor;
        const ids = x.id ? treeOf(x.id) : null;
        return toTableRow({
          key: x.id ?? "none",
          name: x.name ?? t(d, "reportsV5.channel.noCategory"),
          g: {
            sales: x.salesMinor,
            profit: before,
            margin: x.costedSalesMinor
              ? (before / x.costedSalesMinor) * 100
              : 0,
          },
          was: x.id ? (catWas.get(x.id) ?? null) : null,
          href: x.id
            ? `${HERE}?${new URLSearchParams({ ...keepOf(sp, ["cat"]), cat: x.id }).toString()}`
            : undefined,
          drawer: ids
            ? drawerOf(
                x.name ?? "",
                c("drawerCat"),
                ordersNow,
                (l) => !!l.catId && ids.has(l.catId),
              )
            : undefined,
        });
      });
  // By area (division) and by product come from the orders (the filters apply)
  const wasDiv = new Map(
    profitGroups(ordersWas, (l, o) => divOfOrder(o), lineOk).map((g) => [
      g.key,
      g.profit,
    ]),
  );
  const divRows = profitGroups(ordersNow, (l, o) => divOfOrder(o), lineOk).map(
    (g) =>
      toTableRow({
        key: g.key,
        name: t(d, "reportsV5.areas.divisionName", { name: g.key }),
        g,
        was: wasDiv.get(g.key) ?? null,
        href: `/admin/reports/areas`,
        sub: c("drawerOrders", { n: f.num(g.orders.length) }),
      }),
  );
  const prodGroups = profitGroups(ordersNow, (l) => l.pid, lineOk).filter(
    (g) => g.pieces >= 2,
  );
  const nameOfPid = new Map(
    ordersNow.flatMap((o) => o.lines).map((l) => [l.pid, l.name] as const),
  );
  const prodRows = prodGroups.map((g) =>
    toTableRow({
      key: g.key,
      name: nameOfPid.get(g.key) ?? g.key,
      g,
      href: `/admin/products/${g.key}`,
      sub: c("drawerPieces", { n: f.num(g.pieces) }),
    }),
  );
  const styleRows = r.styles.rows
    .filter((x) => x.depth === 0 || x.id !== null)
    .filter((x) => !(x.depth > 1))
    .map((x) => {
      const before = x.profitMinor + x.adsMinor;
      return toTableRow({
        key: x.id ?? "none",
        name: x.name ?? t(d, "reportsV5.channel.noStyle"),
        g: {
          sales: x.salesMinor,
          profit: before,
          margin: x.costedSalesMinor ? (before / x.costedSalesMinor) * 100 : 0,
        },
        href: "/admin/reports/products",
      });
    });
  const keep = keepOf(sp, ["cat", "div"]);
  const catOptions = categories
    .filter((x) => !x.parentId)
    .map((x) => ({
      value: x.id,
      label: bnLang && x.nameBn ? x.nameBn : x.nameEn,
    }));
  const divOptions = DIVISIONS.map((x) => ({
    value: x,
    label: t(d, "reportsV5.areas.divisionName", { name: x }),
  }));

  return (
    <div
      className="a2-z lm-rp"
      data-testid="rp-profit"
      data-lm-ready=""
      data-from={q.from}
      data-to={q.to}
    >
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={cc("pageTitle")}
        sub={c("sub")}
      />
      <SectionTabs view={view} current={KEY} />
      <ReportBar
        dict={d}
        here={HERE}
        id="rp"
        from={q.from}
        to={q.to}
        today={b.today}
        p={typeof sp.p === "string" ? sp.p : undefined}
        cmp={cmp}
        before={b.before}
        reportKey="profit"
        views={views}
        day={f.dayShort}
        csv={csv}
        notes={notes}
        limitDays={b.limits.maxDays}
      />
      <ReportFilters
        action={HERE}
        keep={keep}
        testId="rp-filters"
        applyLabel={cc("apply")}
        clearLabel={cc("clear")}
        fields={[
          {
            name: "cat",
            label: c("fCategory"),
            all: c("fAllCategories"),
            options: catOptions,
            value: catId,
          },
          {
            name: "div",
            label: c("fArea"),
            all: c("fAllAreas"),
            options: divOptions,
            value: divF,
          },
        ]}
      />
      {filtered ? (
        <p className="a2-xs a2-mute a2-mt6" data-testid="rp-filter-note">
          {c("filterNote")}
        </p>
      ) : null}
      <ReportAnswers
        kicker={cc("answers")}
        question={c("ans.q")}
        lines={lines}
        empty={cc("answersNone")}
      />
      <SummaryTiles
        className="a2-mt12"
        tiles={tiles
          .slice(0, 4)
          .map((x) => (cmp ? x : { ...x, delta: undefined }))}
        label={cc("tilesLabel")}
        testId="rp-tiles"
      />
      {tiles.length > 4 ? (
        <div className="rp-kchips" data-testid="rp-chips">
          {tiles.slice(4).map((x) => (
            <div key={x.key}>
              <span>{x.label}</span>
              <b>{x.shown}</b>
            </div>
          ))}
        </div>
      ) : null}
      {T.net === null ? (
        <p className="a2-xs bk-warn a2-mt12" data-testid="rp-ads-unknown">
          {c("adsUnknown")}
        </p>
      ) : null}
      {now.uncosted.orders ? (
        <p className="a2-xs bk-warn a2-mt6" data-testid="rp-uncosted">
          {c("uncosted", { n: now.uncosted.orders })}
        </p>
      ) : null}

      <div className="rp-grid3 a2-mt12">
        <section
          className="a2-card"
          aria-labelledby="rp-wk"
          data-testid="rp-weeks"
        >
          <h2 className="a2-h3" id="rp-wk">
            {c("weeksTitle")}
          </h2>
          <p className="a2-cs">{c("weeksSub")}</p>
          {weekPoints.length ? (
            <MarginLine
              points={weekPoints}
              name={c("weeksSeries")}
              testId="rp-weeks-chart"
            />
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{cc("none")}</p>
          )}
        </section>
        <section
          className="a2-card"
          aria-labelledby="rp-ch"
          data-testid="rp-channels"
        >
          <h2 className="a2-h3" id="rp-ch">
            {c("byChannel")}
          </h2>
          <p className="a2-cs">{c("byChannelSub")}</p>
          {chSorted.length ? (
            <BarList
              testId="rp-channels-table"
              items={chSorted.map((x) => ({
                key: x.key,
                label: `${channelName(x.key)} · ${f.pctOf(channelMarginPct(x))}`,
                value: chValue(x),
                shown: f.amount(chValue(x)),
              }))}
            />
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{cc("none")}</p>
          )}
        </section>
      </div>

      <div className="a2-note a2-mt12" role="note">
        <span>
          {c("callout")}{" "}
          <Link
            className="a2-lnk cr-link"
            href={`/admin/money/profit?from=${q.from}&to=${q.to}`}
            data-testid="rp-open-pnl"
          >
            {c("open")}
          </Link>
        </span>
      </div>

      <div className="rp-grid2 a2-mt12">
        <section
          className="a2-card"
          aria-labelledby="rp-cat"
          data-testid="rp-categories"
        >
          <h2 className="a2-h3" id="rp-cat">
            {c("byCategory")}
          </h2>
          <p className="a2-cs">{c("byCategorySub")}</p>
          <ProfitTable
            id="rp-categories-table"
            rows={catRows}
            nameHead={c("colCategory")}
            c={c}
            f={f}
            cmp={cmp}
            texts={tx}
          />
        </section>
        <section
          className="a2-card"
          aria-labelledby="rp-area"
          data-testid="rp-areas"
        >
          <h2 className="a2-h3" id="rp-area">
            {c("byArea")}
          </h2>
          <p className="a2-cs">{c("byAreaSub")}</p>
          <ProfitTable
            id="rp-areas-table"
            rows={divRows}
            nameHead={c("colDivision")}
            c={c}
            f={f}
            cmp={cmp}
            texts={tx}
          />
          <MoreLink
            href="/admin/reports/areas"
            label={c("openAreas")}
            testId="rp-open-areas"
          />
        </section>
      </div>

      <div className="rp-grid2 a2-mt12">
        <section
          className="a2-card"
          aria-labelledby="rp-style"
          data-testid="rp-styles"
        >
          <h2 className="a2-h3" id="rp-style">
            {c("byStyle")}
          </h2>
          <p className="a2-cs">{c("byStyleSub")}</p>
          <ProfitTable
            id="rp-styles-table"
            rows={styleRows}
            nameHead={c("colStyle")}
            c={c}
            f={f}
            cmp={false}
            limit={8}
            texts={tx}
          />
        </section>
        <section
          className="a2-card"
          aria-labelledby="rp-prod"
          data-testid="rp-products"
        >
          <h2 className="a2-h3" id="rp-prod">
            {c("byProduct")}
          </h2>
          <p className="a2-cs">{c("byProductSub")}</p>
          <ProfitTable
            id="rp-products-table"
            rows={prodRows}
            nameHead={c("colProduct")}
            c={c}
            f={f}
            cmp={false}
            limit={8}
            texts={tx}
          />
        </section>
      </div>
    </div>
  );
}
