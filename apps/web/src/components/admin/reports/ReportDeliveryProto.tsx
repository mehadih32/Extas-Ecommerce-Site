// PR 797 (prototype v5 Reports › Delivery & returns): the top of the report as the prototype draws it — the answers box, six figures, success by
// courier, average days by zone (against each band's promise), COD money with couriers by age, why parcels came back, returns by size and by
// product, partial deliveries, exchange reasons and the courier-and-zone grid. Server component; every figure is passed in from the page.
import Link from "next/link";
import { ReportAnswers, type AnswerLine } from "./ReportAnswers";
import { BarList } from "./ReportCharts";
import { SortTable, type STRow } from "./SortTable";
import { SummaryTiles, type SummaryTile } from "../lumen/SummaryTiles";
import type { DeliveryFacts } from "@/lib/reports-v5/delivery";
import "./report-answers.css";

type C = (k: string, v?: Record<string, string | number>) => string;
const nice = (code: string) =>
  code === "—"
    ? code
    : code
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^./, (x) => x.toUpperCase());

export function ReportDeliveryProto({
  f,
  c,
  num,
  money,
  dec,
  locale,
}: {
  f: DeliveryFacts;
  c: C;
  num: (x: number) => string;
  money: (minor: number) => string;
  dec: (x: number) => string;
  locale: string;
}) {
  const pc = (x: number | null) => (x === null ? "—" : `${dec(x)}%`);
  const worst = f.byCourier.length
    ? f.byCourier[f.byCourier.length - 1]!
    : null;
  const topReason = f.reasons[0];
  const lines: AnswerLine[] = [];
  if (f.finished)
    lines.push({
      text: c("proto.ans.success", {
        pct: pc(f.success),
        n: num(f.delivered),
        of: num(f.finished),
      }),
      tone: (f.success ?? 0) >= 85 ? "good" : "bad",
    });
  if (worst && f.byCourier.length > 1)
    lines.push({
      text: c("proto.ans.worst", { name: worst.name, pct: pc(worst.success) }),
      tone: worst.success < 85 ? "bad" : undefined,
      act: { label: c("proto.ans.courier"), href: "/admin/couriers" },
    });
  if (topReason)
    lines.push({
      text: c("proto.ans.reason", {
        reason: nice(topReason.code),
        n: num(topReason.n),
      }),
      act: { label: c("proto.ans.returns"), href: "/admin/orders/returns" },
    });
  if (f.cod.ages[2]!.parcels)
    lines.push({
      text: c("proto.ans.cod", {
        n: num(f.cod.ages[2]!.parcels),
        v: money(f.cod.ages[2]!.minor),
      }),
      tone: "bad",
      act: { label: c("proto.ans.codAct"), href: "/admin/accounts/cod" },
    });
  const nf = { kind: "number", locale } as const;
  const tiles: SummaryTile[] = [
    {
      key: "success",
      label: c("proto.kSuccess"),
      value: f.success ?? 0,
      shown: pc(f.success),
      format: nf,
    },
    {
      key: "days",
      label: c("proto.kDays"),
      value: f.avgDays ?? 0,
      shown: f.avgDays === null ? "—" : c("proto.days", { n: dec(f.avgDays) }),
      format: nf,
    },
    {
      key: "ret",
      label: c("proto.kReturned"),
      value: f.returned,
      shown: num(f.returned),
      format: nf,
    },
    {
      key: "cod",
      label: c("proto.kCod"),
      value: f.cod.minor,
      shown: money(f.cod.minor),
      format: nf,
    },
    {
      key: "way",
      label: c("proto.kWay"),
      value: f.onTheWay,
      shown: num(f.onTheWay),
      format: nf,
    },
  ];
  const courierItems = f.byCourier.map((x) => ({
    key: x.id,
    label: x.name,
    value: x.success,
    shown: `${dec(x.success)}%`,
  }));
  const zoneItems = f.byZone.map((z) => ({
    key: z.key,
    label: z.promise ? c("proto.zonePromise", { z: z.en, d: z.promise }) : z.en,
    value: z.days,
    shown: c("proto.days", { n: dec(z.days) }),
  }));
  const codItems = f.cod.ages.map((a) => ({
    key: a.key,
    label: c(`proto.age.${a.key}`),
    value: a.minor,
    shown: `${money(a.minor)} · ${c("proto.parcels", { n: num(a.parcels) })}`,
  }));
  const reasonItems = f.reasons.map((r) => ({
    key: r.code,
    label: nice(r.code),
    value: r.n,
    shown: num(r.n),
  }));
  const sizeItems = f.bySize.map((s) => ({
    key: s.size,
    label: s.size,
    value: s.fin ? (s.ret / s.fin) * 100 : 0,
    shown: `${dec(s.fin ? (s.ret / s.fin) * 100 : 0)}% · ${num(s.ret)}/${num(s.fin)}`,
  }));
  const prodItems = f.byProduct
    .slice(0, 8)
    .map((s) => ({
      key: s.name,
      label: s.name,
      value: s.fin ? (s.ret / s.fin) * 100 : 0,
      shown: `${dec(s.fin ? (s.ret / s.fin) * 100 : 0)}% · ${num(s.ret)}/${num(s.fin)}`,
    }));
  const exItems = f.exchangeReasons.map((r) => ({
    key: r.code,
    label: nice(r.code),
    value: r.n,
    shown: num(r.n),
  }));
  const none = <p className="a2-sm a2-mute a2-mt6">{c("proto.none")}</p>;
  const card = (
    id: string,
    title: string,
    sub: string | null,
    body: React.ReactNode,
  ) => (
    <section className="a2-card" data-testid={id}>
      <h2 className="a2-h3">{title}</h2>
      {sub ? <p className="a2-cs">{sub}</p> : null}
      {body}
    </section>
  );
  return (
    <div data-testid="delivery-proto">
      <ReportAnswers
        kicker={c("proto.answers")}
        question={c("proto.ans.q")}
        lines={lines}
        empty={c("proto.ansNone")}
      />
      <SummaryTiles
        className="a2-mt12"
        tiles={tiles}
        label={c("proto.tilesLabel")}
        testId="delivery-proto-tiles"
      />
      <div className="rp-grid3e a2-mt12">
        {card(
          "dp-courier",
          c("proto.cCourier"),
          c("proto.cCourierSub"),
          courierItems.length ? (
            <BarList items={courierItems} testId="dp-courier-bars" />
          ) : (
            none
          ),
        )}
        {card(
          "dp-zone",
          c("proto.cZone"),
          c("proto.cZoneSub"),
          zoneItems.length ? (
            <BarList items={zoneItems} testId="dp-zone-bars" />
          ) : (
            none
          ),
        )}
        {card(
          "dp-cod",
          c("proto.cCod"),
          c("proto.cCodSub"),
          f.cod.parcels ? (
            <BarList items={codItems} testId="dp-cod-bars" />
          ) : (
            none
          ),
        )}
      </div>
      <div className="rp-grid3e a2-mt12">
        {card(
          "dp-reasons",
          c("proto.cReasons"),
          c("proto.cReasonsSub"),
          reasonItems.length ? (
            <BarList items={reasonItems} testId="dp-reason-bars" />
          ) : (
            none
          ),
        )}
        {card(
          "dp-size",
          c("proto.cSize"),
          c("proto.cSizeSub"),
          sizeItems.length ? (
            <BarList items={sizeItems} testId="dp-size-bars" />
          ) : (
            none
          ),
        )}
        {card(
          "dp-product",
          c("proto.cProduct"),
          c("proto.cProductSub"),
          prodItems.length ? (
            <BarList items={prodItems} testId="dp-product-bars" />
          ) : (
            none
          ),
        )}
      </div>
      <div className="rp-grid3e a2-mt12">
        {card(
          "dp-partial",
          c("proto.cPartial"),
          c("proto.cPartialSub", {
            n: num(f.partial.orders),
            p: num(f.partial.piecesBack),
          }),
          f.partial.rows.length ? (
            <ul className="cr-rows">
              {f.partial.rows.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/orders/${r.id}`}>{r.number}</Link> ·{" "}
                  {r.district ?? "—"} ·{" "}
                  {c("proto.kept", { k: num(r.kept), t: num(r.total) })}
                </li>
              ))}
            </ul>
          ) : (
            none
          ),
        )}
        {card(
          "dp-exchange",
          c("proto.cExchange"),
          c("proto.cExchangeSub"),
          exItems.length ? (
            <BarList items={exItems} testId="dp-exchange-bars" />
          ) : (
            none
          ),
        )}
        {card(
          "dp-exprod",
          c("proto.cExProd"),
          c("proto.cExProdSub"),
          f.exchangeByProduct.length ? (
            <ul className="cr-rows">
              {f.exchangeByProduct.slice(0, 8).map((r) => (
                <li key={r.name}>
                  {r.name} · {num(r.n)} · {nice(r.top)}
                </li>
              ))}
            </ul>
          ) : (
            none
          ),
        )}
      </div>
      <section className="a2-card a2-mt12" data-testid="dp-grid">
        <h2 className="a2-h3">{c("proto.cGrid")}</h2>
        <p className="a2-cs">{c("proto.gridSub")}</p>
        <SortTable
          testId="dp-grid-table"
          rowId="dp-grid-row"
          texts={{
            more: c("proto.more", { n: "{n}" }),
            less: c("proto.less"),
            close: c("proto.close"),
            empty: c("proto.none"),
          }}
          sortCol={1}
          cols={[
            { h: c("proto.colCourier") },
            { h: c("proto.colParcels"), right: true },
            { h: c("proto.colDelivered"), right: true, hide: true },
            { h: c("proto.colReturned"), right: true, hide: true },
            { h: c("proto.colSuccess"), right: true },
            { h: c("proto.colDays"), right: true },
          ]}
          rows={f.grid.map((g): STRow => ({
            key: `${g.courierId}-${g.zoneKey}`,
            cells: [
              <span key="n">
                <b>{g.courier}</b>
                <span className="a2-xs a2-mute a2-blk">{g.zoneEn}</span>
              </span>,
              num(g.n),
              num(g.d),
              num(g.rt),
              <span
                key="s"
                className={`a2-pill ${g.success >= 90 ? "ok" : g.success >= 85 ? "warn" : "bad"}`}
              >
                {`${Math.round(g.success)}%`}
              </span>,
              g.days === null ? "—" : dec(g.days),
            ],
            sort: [g.courier, g.n, g.d, g.rt, g.success, g.days ?? 0],
            drawer: {
              title: `${g.courier} · ${g.zoneEn}`,
              sub: c("proto.gridDrawerSub", { n: num(g.n) }),
              empty: c("proto.none"),
              items: g.orders.map((o) => ({
                label: o.number,
                sub: `${o.district ?? "—"} · ${nice(o.status)}`,
                value: money(o.totalMinor),
                href: `/admin/orders/${o.id}`,
              })),
            },
          }))}
        />
      </section>
    </div>
  );
}
