// PR 863 (prototype v5 Reports › Products, the rest of the page): size-demand heat maps (tops and bottoms), colour demand, "Looked at a lot,
// bought little", the restock list with its "Send N to ERP reorder list" button, return rate by product and the All products table.
// Server component: the page hands it the figures (lib/reports-v5/products-extra.ts) and the words; nothing is counted in here.
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BOTTOM_SIZES,
  TOP_SIZES,
  type DemandRow,
  type ProductsExtra,
} from "@/lib/reports-v5/products-extra";
import { ReorderButton, type ReorderTexts } from "./ReorderButton";
import { SortTable, type STRow } from "./SortTable";
import "./report-products.css";

export interface MoreFmt {
  num: (n: number) => string;
  amount: (minor: number) => string;
  pctOf: (n: number | null) => string;
}
export interface MoreRestock {
  productId: string;
  name: string;
  stockDays: number | null;
  sold30: number;
  sizesInStock: number;
  sizesTotal: number;
}
export interface MoreProps {
  extra: ProductsExtra;
  /** The Report library's "restock now" list (already narrowed by the category filter); null = no `reports.read` key. */
  restock: readonly MoreRestock[] | null;
  /** The list rows the page already built for the restock table. */
  restockTable: ReactNode;
  lang: string;
  f: MoreFmt;
  c: (key: string, vars?: Record<string, string | number>) => string;
  tableTexts: { more: string; less: string; close: string; empty: string };
  rows: number;
  reorder: ReorderTexts;
}

/** The prototype's heat colour: the share of the row's pieces, scaled up so a third of the row is already strong. */
export function heatStyle(
  piece: number,
  total: number,
): { background?: string; color?: string } {
  if (piece <= 0 || total <= 0) return {};
  const pct = (piece / total) * 100; // hardcode-ok: a share in percent
  const strength = Math.min(100, Math.round(pct * 1.6)); // hardcode-ok: the prototype's own scale
  return {
    background: `color-mix(in srgb, var(--lm-ac) ${strength}%, transparent)`,
    color: pct > 30 ? "var(--lm-on-ac)" : undefined, // hardcode-ok: the prototype's switch to light text on a strong cell
  };
}

function Heat({
  title,
  sub,
  sizes,
  rows,
  none,
  totalLabel,
  lang,
  f,
}: {
  title: string;
  sub: string;
  sizes: readonly string[];
  rows: DemandRow[];
  none: string;
  totalLabel: string;
  lang: string;
  f: MoreFmt;
}) {
  return (
    <section className="a2-card" data-testid="rp-heat">
      <h2 className="a2-h3">{title}</h2>
      <p className="a2-cs">{sub}</p>
      {rows.length ? (
        <div className="rp-heat-wrap">
          <table className="rp-heat">
            <thead>
              <tr>
                <th scope="col" />
                {sizes.map((s) => (
                  <th key={s} scope="col">
                    {s}
                  </th>
                ))}
                <th scope="col">{totalLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.categoryId}>
                  <th scope="row">
                    {lang === "bn" && r.nameBn ? r.nameBn : r.nameEn}
                  </th>
                  {r.pieces.map((p, i) => (
                    <td
                      key={sizes[i]}
                      style={heatStyle(p, r.total)}
                      data-testid="rp-heat-cell"
                    >
                      {f.num(p)}
                    </td>
                  ))}
                  <td className="rp-heat-tot">{f.num(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="a2-sm a2-mute">{none}</p>
      )}
    </section>
  );
}

export function ReportProductsMore({
  extra,
  restock,
  restockTable,
  lang,
  f,
  c,
  tableTexts,
  rows,
  reorder,
}: MoreProps) {
  const maxColour = Math.max(1, ...extra.colours.map((x) => x.pieces));
  const reorderIds = (restock ?? []).map((x) => x.productId);
  const restockDays = new Map(
    (restock ?? []).map((x) => [x.productId, x.stockDays]),
  );
  const reorderSet = new Set(reorderIds);
  const allRows: STRow[] = extra.all.map((x) => ({
    key: x.productId,
    cells: [
      <Link
        key="n"
        className="a2-lnk cr-link"
        href={`/admin/products/${x.productId}`}
      >
        {x.name}
      </Link>,
      x.category
        ? lang === "bn" && x.category.bn
          ? x.category.bn
          : x.category.en
        : "—",
      f.num(x.pieces),
      f.amount(x.salesMinor),
      f.pctOf(x.marginPct),
      f.pctOf(x.returnPct),
      <span key="s">
        {x.stockDays === null ? "—" : c("daysLeft", { n: f.num(x.stockDays) })}
        {reorderSet.has(x.productId) ? (
          <span className="a2-pill bad rp-rb">{c("reorderBadge")}</span>
        ) : null}
      </span>,
    ],
    sort: [
      x.name,
      x.category?.en ?? "",
      x.pieces,
      x.salesMinor,
      x.marginPct ?? -1,
      x.returnPct ?? -1,
      x.stockDays ?? restockDays.get(x.productId) ?? Number.MAX_SAFE_INTEGER,
    ],
    href: `/admin/products/${x.productId}`,
  }));
  return (
    <>
      <div className="rp-grid3 a2-mt12" data-testid="rp-demand">
        <div className="rp-span2">
          <Heat
            title={c("heatTops")}
            sub={c("heatTopsSub")}
            sizes={TOP_SIZES}
            rows={extra.tops}
            none={c("heatNone")}
            totalLabel={c("heatTotal")}
            lang={lang}
            f={f}
          />
        </div>
        <section
          className="a2-card"
          aria-labelledby="rp-col"
          data-testid="rp-colours"
        >
          <h2 className="a2-h3" id="rp-col">
            {c("colours")}
          </h2>
          <p className="a2-cs">{c("coloursSub")}</p>
          {extra.colours.length ? (
            <ul className="rt-bars">
              {extra.colours.map((x) => (
                <li key={x.name} className="rt-bar" data-testid="rp-colour-row">
                  <b>{x.name}</b>
                  <span>{f.num(x.pieces)}</span>
                  <span className="rt-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.max(2, (x.pieces / maxColour) * 100)}%`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute">{c("coloursNone")}</p>
          )}
        </section>
      </div>

      <div className="rp-grid2 a2-mt12">
        <Heat
          title={c("heatBottoms")}
          sub={c("heatBottomsSub")}
          sizes={BOTTOM_SIZES}
          rows={extra.bottoms}
          none={c("heatNone")}
          totalLabel={c("heatTotal")}
          lang={lang}
          f={f}
        />
        <section
          className="a2-card"
          aria-labelledby="rp-lk"
          data-testid="rp-lookers"
        >
          <h2 className="a2-h3" id="rp-lk">
            {c("lookers")}
          </h2>
          <p className="a2-cs">{c("lookersSub")}</p>
          {extra.lookers.length ? (
            <SortTable
              testId="rp-lookers-table"
              rowId="rp-looker-row"
              texts={tableTexts}
              sortCol={1}
              limit={6}
              cols={[
                { h: c("colProduct") },
                { h: c("colViews"), right: true },
                { h: c("colBought"), right: true },
                { h: c("colBuyRate"), right: true },
              ]}
              rows={extra.lookers.map((x): STRow => ({
                key: x.productId,
                cells: [
                  <Link
                    key="n"
                    className="a2-lnk cr-link"
                    href={`/admin/products/${x.productId}`}
                  >
                    {x.name}
                  </Link>,
                  f.num(x.views),
                  f.num(x.sold),
                  f.pctOf(x.conv * 100), // hardcode-ok: a share in percent
                ],
                sort: [x.name, x.views, x.sold, x.conv],
                href: `/admin/products/${x.productId}`,
              }))}
            />
          ) : (
            <p className="a2-sm a2-mute">{c("lookersNone")}</p>
          )}
        </section>
      </div>

      {restock ? (
        <div className="rp-grid2 a2-mt12">
          <section
            className="a2-card"
            aria-labelledby="rp-rn"
            data-testid="rp-restock"
          >
            <h2 className="a2-h3" id="rp-rn">
              {c("restock")}
            </h2>
            <p className="a2-cs">{c("restockSub")}</p>
            {restockTable}
            <div className="ct-actions a2-mt12">
              <ReorderButton ids={reorderIds} texts={reorder} />
            </div>
          </section>
          <section
            className="a2-card"
            aria-labelledby="rp-rt"
            data-testid="rp-returns"
          >
            <h2 className="a2-h3" id="rp-rt">
              {c("returnsBy")}
            </h2>
            <p className="a2-cs">{c("returnsSub")}</p>
            {extra.returns.length ? (
              <SortTable
                testId="rp-returns-table"
                rowId="rp-return-row"
                texts={tableTexts}
                sortCol={3}
                limit={6}
                cols={[
                  { h: c("colProduct") },
                  { h: c("colFinished"), right: true, hide: true },
                  { h: c("colReturned"), right: true },
                  { h: c("colReturnPct"), right: true },
                ]}
                rows={extra.returns.map((x): STRow => ({
                  key: x.productId,
                  cells: [
                    <Link
                      key="n"
                      className="a2-lnk cr-link"
                      href={`/admin/products/${x.productId}`}
                    >
                      {x.name}
                    </Link>,
                    f.num(x.finished),
                    f.num(x.returned),
                    f.pctOf(x.pct),
                  ],
                  sort: [x.name, x.finished, x.returned, x.pct],
                  href: `/admin/products/${x.productId}`,
                }))}
              />
            ) : (
              <p className="a2-sm a2-mute">{c("returnsNone")}</p>
            )}
          </section>
        </div>
      ) : null}

      <section
        className="a2-card a2-mt12"
        aria-labelledby="rp-all"
        data-testid="rp-all"
      >
        <h2 className="a2-h3" id="rp-all">
          {c("allTitle")}
        </h2>
        <p className="a2-cs">{c("allSub")}</p>
        <SortTable
          testId="rp-all-table"
          rowId="rp-all-row"
          texts={tableTexts}
          sortCol={3}
          limit={rows}
          cols={[
            { h: c("colProduct") },
            { h: c("colCategory"), hide: true },
            { h: c("colPieces"), right: true, hide: true },
            { h: c("colSales"), right: true },
            { h: c("colMarginPct"), right: true, hide: true },
            { h: c("colReturnPct"), right: true, hide: true },
            { h: c("colStock"), right: true },
          ]}
          rows={allRows}
        />
      </section>
    </>
  );
}
