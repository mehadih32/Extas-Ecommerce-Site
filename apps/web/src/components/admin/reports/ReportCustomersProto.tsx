// PR 798 (prototype v5 Reports › Customers): the report as the prototype draws it — the answers box, four figures and two chips, new against
// returning customers over time, the lifetime-value card with the win-back button, sales by grade, repeat rate by first-order month, top
// customers, customers by district (a row opens its orders) and the at-risk customers. Server component; figures from lib/reports-v5/customers.ts.
import Link from "next/link";
import { LineChart } from "../look/kit";
import { SummaryTiles, type SummaryTile } from "../lumen/SummaryTiles";
import { ReportAnswers, type AnswerLine } from "./ReportAnswers";
import { SortTable, type STRow } from "./SortTable";
import {
  customerFacts,
  gradeRows,
  liveOrders,
  whoOrdered,
  type CustomersData,
} from "@/lib/reports-v5/customers";
import type { ReportFmt } from "@/lib/reports-v5/fmt";
import { change, daysBetween } from "@/lib/reports-v5/model";
import "./report-answers.css";
import "./report-areas.css";

type C = (k: string, v?: Record<string, string | number>) => string;
const sgn = (x: number | null) =>
  x === null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;
const BUCKET_CAP = 45; // hardcode-ok: the prototype's own rule — days up to 45 of them, else weeks

export function ReportCustomersProto({
  data,
  from,
  to,
  cmp,
  c,
  f,
  locale,
  now,
  monthName,
}: {
  data: CustomersData;
  from: string;
  to: string;
  cmp: boolean;
  c: C;
  f: ReportFmt;
  locale: string;
  now: number;
  monthName: (ym: string) => string;
}) {
  const { cur, prev, first, buyers } = data;
  const s = whoOrdered(cur, first);
  const sq = whoOrdered(prev, first);
  const facts = customerFacts(cur, buyers, first, now, data.quietDays);
  const dl = (x: number | null) => (cmp ? x : undefined);
  const nf = { kind: "number", locale } as const;
  const pct0 = (x: number) => `${Math.round(x)}%`;

  const lines: AnswerLine[] = [];
  if (s.n || sq.n)
    lines.push({
      text: c("ans.who", {
        n: f.num(s.n),
        nw: f.num(s.nw),
        ret: f.num(s.ret),
        cnw: sgn(change(s.nw, sq.nw)),
        cret: sgn(change(s.ret, sq.ret)),
      }),
      tone: s.n >= sq.n ? "good" : "bad",
      act: { label: c("ans.list"), href: "/admin/customers" },
    });
  if (buyers.length)
    lines.push({
      text: c("ans.repeat", {
        pct: pct0(facts.repeat),
        v: f.amount(facts.avgValue),
      }),
      act: { label: c("ans.grades"), href: "/admin/rules" },
    });
  if (buyers.length)
    lines.push({
      text: c("ans.risk", {
        n: f.num(facts.atRisk.length),
        days: data.quietDays,
      }),
      tone: facts.atRisk.length > 10 ? "bad" : undefined,
      act: { label: c("ans.winback"), href: "/admin/marketing/campaigns" },
    }); // hardcode-ok: the prototype turns the line red above 10 buyers

  const tiles: SummaryTile[] = [
    {
      key: "who",
      label: c("kWho"),
      value: s.n,
      shown: f.num(s.n),
      format: nf,
      delta: dl(change(s.n, sq.n)),
    },
    {
      key: "new",
      label: c("kNew"),
      value: s.nw,
      shown: f.num(s.nw),
      format: nf,
      delta: dl(change(s.nw, sq.nw)),
    },
    {
      key: "ret",
      label: c("kReturning"),
      value: s.ret,
      shown: f.num(s.ret),
      format: nf,
      delta: dl(change(s.ret, sq.ret)),
    },
    {
      key: "rep",
      label: c("kRepeat"),
      value: facts.repeat,
      shown: pct0(facts.repeat),
      format: nf,
      vs: c("allTime"),
    },
  ];

  // new against returning orders over the period (days, or weeks past 45 days)
  const span = daysBetween(from, to, 4000);
  const size = span.length > BUCKET_CAP ? 7 : 1;
  const buckets: { a: string; b: string }[] = [];
  for (let i = 0; i < span.length; i += size)
    buckets.push({
      a: span[i]!,
      b: span[Math.min(span.length - 1, i + size - 1)]!,
    });
  const live = liveOrders(cur);
  const inB = (o: { day: string }, x: { a: string; b: string }) =>
    o.day >= x.a && o.day <= x.b;
  const isNew = (o: { customerId: string; at: number }) =>
    first.get(o.customerId) === o.at;
  const newV = buckets.map(
    (x) => live.filter((o) => inB(o, x) && isNew(o)).length,
  );
  const retV = buckets.map(
    (x) => live.filter((o) => inB(o, x) && !isNew(o)).length,
  );
  const lbl = (x: { a: string; b: string }) =>
    size > 1 ? `${f.dayShort(x.a)} – ${f.dayShort(x.b)}` : f.dayShort(x.a);

  const texts = {
    more: c("showAll"),
    less: c("showLess"),
    close: c("close"),
    empty: c("none"),
  };
  const grade = gradeRows(cur, buyers);
  const gradeTotal = grade.reduce((n, x) => n + x.sales, 0) || 1;
  const gradeTable: STRow[] = grade.map((g) => ({
    key: String(g.rank),
    cells: [
      <span key="g">
        <b>{g.name ?? c("noGrade")}</b>
        <span className="a2-xs a2-mute a2-blk">
          {f.num(g.customers)} {c("customers")}
        </span>
      </span>,
      <span key="s">
        {f.amount(g.sales)}
        <span className="a2-xs a2-mute a2-blk">
          {pct0((g.sales / gradeTotal) * 100)}
        </span>
      </span>,
      f.num(g.orders),
      f.amount(g.ltv),
      pct0(g.repeat),
    ],
    sort: [g.rank, g.sales, g.orders, g.ltv, g.repeat],
    href: "/admin/customers",
  }));

  const cell = (x: number | null) =>
    x === null ? (
      <td className="h a2-mute">·</td>
    ) : (
      <td
        className="h"
        style={{
          background: `color-mix(in srgb, var(--lm-ac) ${Math.round(Math.min(100, x * 3))}%, var(--lm-sf))`,
          color: x > 22 ? "var(--lm-on-hero)" : undefined,
        }}
      >
        {pct0(x)}
      </td>
    ); // hardcode-ok: the prototype's heat scale
  const top: STRow[] = facts.topCustomers.map((x) => ({
    key: x.customerId,
    cells: [
      <span key="c">
        <b>{x.buyer?.name ?? "—"}</b>{" "}
        {x.isNew ? <span className="a2-pill ok">{c("newBadge")}</span> : null}
      </span>,
      f.num(x.n),
      f.amount(x.v),
      f.amount(x.buyer?.spentMinor ?? 0),
    ],
    sort: [x.buyer?.name ?? "", x.n, x.v, x.buyer?.spentMinor ?? 0],
    href: `/admin/customers/${x.customerId}`,
  }));
  const districts: STRow[] = facts.byDistrict.map((x) => ({
    key: x.d,
    cells: [<b key="d">{x.d}</b>, f.num(x.n), f.num(x.o), f.amount(x.v)],
    sort: [x.d, x.n, x.o, x.v],
    drawer: {
      title: x.d,
      sub: c("drawerSub", { n: f.num(x.orders.length) }),
      items: x.orders.map((o) => ({
        label: o.number,
        sub: `${o.day} · ${o.status}`,
        value: f.amount(o.totalMinor),
        href: `/admin/orders/${o.id}`,
      })),
      empty: c("none"),
    },
  }));
  const risk: STRow[] = facts.atRisk.map((x) => ({
    key: x.id,
    cells: [
      <span key="n">
        <b>{x.name}</b>
        <span className="a2-xs a2-mute a2-blk">{x.phone ?? "—"}</span>
      </span>,
      f.num(x.orders),
      f.amount(x.spentMinor),
      x.lastOrderAt
        ? c("daysAgo", { n: Math.floor((now - x.lastOrderAt) / 86_400_000) })
        : "—", // hardcode-ok: milliseconds in a day
    ],
    sort: [x.name, x.orders, x.spentMinor, -(x.lastOrderAt ?? 0)],
    href: `/admin/customers/${x.id}`,
  }));

  return (
    <div data-testid="customers-proto">
      <ReportAnswers
        kicker={c("answers")}
        question={c("ans.q")}
        lines={lines}
        empty={c("ansNone")}
      />
      <SummaryTiles
        className="a2-mt12"
        tiles={tiles}
        label={c("tilesLabel")}
        testId="customers-proto-tiles"
      />
      <div className="rp-ks" data-testid="customers-chips">
        <div>
          <span>{c("kAvg")}</span>
          <b>{f.amount(facts.avgValue)}</b>
          <span>{c("deliveredAll")}</span>
        </div>
        <div>
          <span>{c("kRisk")}</span>
          <b>{f.num(facts.atRisk.length)}</b>
          <span>{c("noOrderDays", { n: data.quietDays })}</span>
        </div>
      </div>

      <div className="rp-grid3 a2-mt12">
        <section className="a2-card" data-testid="cu-newret">
          <h2 className="a2-h3">{c("newRetTitle")}</h2>
          <p className="a2-cs">{c("newRetSub")}</p>
          <LineChart
            id="rp-cu-over"
            labels={buckets.map(lbl)}
            series={[
              {
                v: newV,
                color: "var(--a3-c1)",
                name: c("sNew"),
                shown: newV.map((x) => f.num(x)),
              },
              {
                v: retV,
                color: "var(--a3-s2)",
                name: c("sReturning"),
                shown: retV.map((x) => f.num(x)),
              },
            ]}
            h={200}
            label={c("newRetTitle")}
            yfmt={(v) => f.num(Math.round(v))}
          />
        </section>
        <section className="a2-card" data-testid="cu-ltv">
          <h2 className="a2-h3">{c("ltvTitle")}</h2>
          <p className="a2-cs">{c("ltvSub")}</p>
          <div className="rp-mini">
            <div>
              <b>{f.amount(facts.avgValue)}</b>
              <span>{c("avgPerBuyer")}</span>
            </div>
            <div>
              <b>{pct0(facts.repeat)}</b>
              <span>{c("boughtAgain")}</span>
            </div>
            <div>
              <b>{f.num(facts.atRisk.length)}</b>
              <span>{c("atRiskShort")}</span>
            </div>
          </div>
          <Link
            className="a2-btn sm cr-tap a2-mt12"
            href="/admin/marketing/campaigns"
            data-testid="cu-winback"
          >
            {c("winback", { n: f.num(facts.atRisk.length) })}
          </Link>
          <p className="a2-xs a2-mute a2-mt6">{c("winbackNote")}</p>
        </section>
      </div>

      <div className="rp-grid2 a2-mt12">
        <section className="a2-card" data-testid="cu-grade">
          <h2 className="a2-h3">{c("gradeTitle")}</h2>
          <p className="a2-cs">{c("gradeSub")}</p>
          <SortTable
            cols={[
              { h: c("colGrade") },
              { h: c("colSalesDel"), right: true },
              { h: c("colOrders"), right: true, hide: true },
              { h: c("colLtv"), right: true },
              { h: c("colRepeat"), right: true, hide: true },
            ]}
            rows={gradeTable}
            sortCol={0}
            texts={texts}
            testId="cu-grade-table"
            rowId="cu-grade-row"
          />
          <Link className="a2-btn sm cr-tap a2-mt12" href="/admin/rules">
            {c("gradeOffers")} →
          </Link>
        </section>
        <section className="a2-card" data-testid="cu-cohort">
          <h2 className="a2-h3">{c("cohortTitle")}</h2>
          {data.cohorts.length ? (
            <div className="rp-frame">
              <table className="rp-tbl rp-coh">
                <thead>
                  <tr>
                    <th>{c("cFirst")}</th>
                    <th className="r">{c("customers")}</th>
                    <th className="r">{c("cSame")}</th>
                    <th className="r">{c("cNext")}</th>
                    <th className="r">{c("cNext2")}</th>
                    <th className="r hide-sm">{c("cAvg")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((x) => (
                    <tr key={x.month} data-testid="cu-cohort-row">
                      <td>
                        <b>{monthName(x.month)}</b>
                      </td>
                      <td className="r">{f.num(x.customers)}</td>
                      {x.back.map((v, i) => (
                        <CohortCell key={i} v={v} cell={cell} />
                      ))}
                      <td className="r hide-sm">{f.amount(x.avgValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{c("none")}</p>
          )}
          <p className="a2-xs a2-mute a2-mt6">{c("cohortNote")}</p>
        </section>
      </div>

      <div className="rp-grid2 a2-mt12">
        <section className="a2-card" data-testid="cu-top">
          <h2 className="a2-h3">{c("topTitle")}</h2>
          <p className="a2-cs">{c("topSub")}</p>
          <SortTable
            cols={[
              { h: c("colCustomer") },
              { h: c("colOrders"), right: true },
              { h: c("colSpent"), right: true },
              { h: c("colAllTime"), right: true, hide: true },
            ]}
            rows={top}
            sortCol={2}
            limit={8}
            texts={texts}
            testId="cu-top-table"
            rowId="cu-top-row"
          />
        </section>
        <section className="a2-card" data-testid="cu-dist">
          <h2 className="a2-h3">{c("distTitle")}</h2>
          <SortTable
            cols={[
              { h: c("colDistrict") },
              { h: c("customers"), right: true },
              { h: c("colOrders"), right: true, hide: true },
              { h: c("colOrderValue"), right: true },
            ]}
            rows={districts}
            sortCol={3}
            limit={8}
            texts={texts}
            testId="cu-dist-table"
            rowId="cu-dist-row"
          />
        </section>
      </div>

      <section className="a2-card a2-mt12" data-testid="cu-risk">
        <h2 className="a2-h3">{c("riskTitle")}</h2>
        <p className="a2-cs">{c("riskSub", { n: data.quietDays })}</p>
        <SortTable
          cols={[
            { h: c("colCustomer") },
            { h: c("colOrders"), right: true },
            { h: c("colSpent"), right: true },
            { h: c("colLast"), right: true },
          ]}
          rows={risk}
          sortCol={2}
          limit={8}
          texts={{ ...texts, empty: c("riskNone") }}
          testId="cu-risk-table"
          rowId="cu-risk-row"
        />
      </section>
    </div>
  );
}

function CohortCell({
  v,
  cell,
}: {
  v: number | null;
  cell: (x: number | null) => React.ReactNode;
}) {
  return <>{cell(v)}</>;
}
