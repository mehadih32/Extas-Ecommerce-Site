"use client";
// S29 · PR 754 (CN-054) — Reports › Geography map: the panel a click on an area opens (a bottom sheet on a phone).
// `GeoPanelView` only draws what `lib/geo-map/panel.ts` worked out (no data of its own); `GeoPanel` is the one the screen
// mounts: it asks the server for the area's top products (one area per click, `GET /api/admin/reports/geo-map/area`),
// shows loading and failure in words, and hands "Go deeper" and "Close" back to the screen. Numbers are always written
// out beside any colour (the Change colour is never the only sign). Words come in as `labels` (messages/admin-geo-panel.*).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  GeoAreaDetail,
  GeoDays,
  GeoLevel,
  GeoMapAreaApiResponse,
} from "@extas/metrics";
import {
  formatDiff,
  formatFigure,
  panelProducts,
  type PanelModel,
  type PanelProduct,
} from "@/lib/geo-map/panel";
import "./geo-panel.css";

/** The words the panel needs, already in the admin's language (see `geoPanelLabels`). */
export interface GeoPanelLabels {
  aria: string;
  close: string;
  now: string;
  before: string;
  change: string;
  pts: string;
  topCategory: string;
  noCategory: string;
  noProducts: string;
  loading: string;
  failed: string;
  retry: string;
  moneyHidden: string;
  openOrders: string;
  openOrdersHint: string;
  counted: string;
  up: string;
  down: string;
  same: string;
  /** Figure names by key (orders, sales, delivered, returned, returnRate). */
  fig: Record<string, string>;
  /** Level names for "Go deeper" (division, district, upazila, area). */
  level: Record<GeoLevel, string>;
  /** Templates: {from} {to} / {n} / {level}. */
  comparedWith: (from: string, to: string) => string;
  pcs: (n: string) => string;
  topProducts: (n: number) => string;
  tooFew: (n: number) => string;
  returnWarn: (n: number) => string;
  deeper: (level: string) => string;
}

export interface GeoPanelFormat {
  number: (n: number) => string;
  money: (minor: number) => string;
  /** A place, product or category name in the admin's language (Bengali when it has one and the page is Bengali). */
  name: (en: string, bn: string | null) => string;
}

export type ProductsState =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; items: PanelProduct[]; categoryName: string | null };

/** Which way the figure moved, for the arrow and the screen reader (the sign is also written out). */
const arrow = (diff: number | null) => (diff === null || diff === 0 ? "•" : diff > 0 ? "▲" : "▼");

export function GeoPanelView({
  model,
  name,
  parent,
  compared,
  products,
  labels,
  fmt,
  topN,
  onRetry,
  onClose,
  onDeeper,
  moneyHidden,
  minOrders,
  warnReturnPct,
}: {
  model: PanelModel;
  name: string;
  parent: string | null;
  /** The days of the earlier column (null while compare is off). */
  compared: GeoDays | null;
  products: ProductsState;
  labels: GeoPanelLabels;
  fmt: GeoPanelFormat;
  topN: number;
  onRetry: () => void;
  onClose: () => void;
  onDeeper: (level: GeoLevel) => void;
  moneyHidden: boolean;
  minOrders: number;
  warnReturnPct: number;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // the panel is mounted again for every area, so this runs once per click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.areaId]);
  const comparing = compared !== null;
  return (
    <aside
      className="gp"
      role="complementary"
      aria-label={`${labels.aria}: ${name}`}
      data-testid="geo-panel"
      data-area={model.areaId}
    >
      <header className="gp-head">
        <div className="gp-title">
          <h3 className="gp-name" data-testid="geo-panel-name">
            {name}
          </h3>
          {parent ? <p className="gp-parent">{parent}</p> : null}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="gp-x"
          onClick={onClose}
          aria-label={labels.close}
          data-testid="geo-panel-close"
        >
          ×
        </button>
      </header>

      {model.tooFew ? (
        <p className="gp-note gp-warn" data-testid="geo-panel-toofew">
          {labels.tooFew(minOrders)}
        </p>
      ) : null}
      {model.returnWarn ? (
        <p className="gp-note gp-bad" data-testid="geo-panel-returnwarn">
          {labels.returnWarn(warnReturnPct)}
        </p>
      ) : null}
      {comparing ? (
        <p className="gp-note" data-testid="geo-panel-compared">
          {labels.comparedWith(compared.from, compared.to)}
        </p>
      ) : null}

      <table className="gp-fig" data-testid="geo-panel-figures">
        <thead>
          <tr>
            <th scope="col" className="gp-sr">
              {labels.fig.orders}
            </th>
            <th scope="col">{labels.now}</th>
            {comparing ? <th scope="col">{labels.before}</th> : null}
            {comparing ? <th scope="col">{labels.change}</th> : null}
          </tr>
        </thead>
        <tbody>
          {model.lines.map((l) => (
            <tr key={l.key} data-fig={l.key}>
              <th scope="row">{labels.fig[l.key]}</th>
              <td className="gp-num">{formatFigure(l.kind, l.now, fmt)}</td>
              {comparing ? (
                <td className="gp-num gp-was">
                  {formatFigure(l.kind, l.before, fmt)}
                </td>
              ) : null}
              {comparing ? (
                <td
                  className={`gp-num gp-diff ${l.tone > 0 ? "gp-good" : l.tone < 0 ? "gp-badn" : ""}`}
                  data-tone={l.tone}
                >
                  <span aria-hidden="true">{arrow(l.diff)} </span>
                  {formatDiff(l.kind, l.diff, fmt, labels.pts)}
                  {l.percent !== null ? (
                    <span className="gp-pct">
                      {" "}
                      ({l.percent > 0 ? "+" : l.percent < 0 ? "−" : ""}
                      {Math.abs(Math.round(l.percent * 10) / 10).toFixed(1)}%)
                    </span>
                  ) : null}
                  <span className="gp-sr">
                    {" "}
                    {l.diff === null || l.diff === 0
                      ? labels.same
                      : l.diff > 0
                        ? labels.up
                        : labels.down}
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {moneyHidden ? <p className="gp-note">{labels.moneyHidden}</p> : null}

      <p className="gp-cat" data-testid="geo-panel-category">
        <span className="gp-k">{labels.topCategory}</span>{" "}
        <strong>
          {products.state === "ready" && products.categoryName
            ? products.categoryName
            : model.topCategory
              ? fmt.name(model.topCategory.nameEn, model.topCategory.nameBn)
              : labels.noCategory}
        </strong>
      </p>

      <section className="gp-prod" aria-live="polite">
        <h4 className="gp-h">{labels.topProducts(topN)}</h4>
        {products.state === "loading" ? (
          <p className="gp-note" data-testid="geo-panel-loading">
            {labels.loading}
          </p>
        ) : products.state === "error" ? (
          <p className="gp-note gp-bad" data-testid="geo-panel-failed">
            {labels.failed}{" "}
            <button
              type="button"
              className="a2-btn sm gp-retry"
              onClick={onRetry}
            >
              {labels.retry}
            </button>
          </p>
        ) : products.items.length === 0 ? (
          <p className="gp-note" data-testid="geo-panel-noproducts">
            {labels.noProducts}
          </p>
        ) : (
          <ol className="gp-list" data-testid="geo-panel-products">
            {products.items.map((p, i) => (
              <li key={p.productId}>
                <span className="gp-rank">{i + 1}</span>
                <span className="gp-pname">{fmt.name(p.nameEn, p.nameBn)}</span>
                <span className="gp-num">
                  {labels.pcs(fmt.number(p.pieces))}
                  {p.salesMinor !== null ? ` · ${fmt.money(p.salesMinor)}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="gp-acts">
        <Link
          className="a2-btn pri gp-btn"
          href={model.ordersHref}
          data-testid="geo-panel-orders"
          title={labels.openOrdersHint}
        >
          {labels.openOrders}
        </Link>
        {model.deeper ? (
          <button
            type="button"
            className="a2-btn gp-btn"
            onClick={() => onDeeper(model.deeper!)}
            data-testid="geo-panel-deeper"
          >
            {labels.deeper(labels.level[model.deeper])}
          </button>
        ) : null}
      </div>
      <p className="gp-foot" data-testid="geo-panel-counted">
        {labels.counted}
      </p>
    </aside>
  );
}

/** The panel the screen mounts: loads the area's top products and draws the view. Money stays off when hidden. */
export function GeoPanel({
  model,
  name,
  parent,
  compared,
  labels,
  fmt,
  query,
  topN,
  moneyHidden,
  minOrders,
  warnReturnPct,
  onClose,
  onDeeper,
}: {
  model: PanelModel;
  name: string;
  parent: string | null;
  compared: GeoDays | null;
  labels: GeoPanelLabels;
  fmt: GeoPanelFormat;
  /** The map's own query string (period, level, slices, compare): the area is added to it. */
  query: string;
  topN: number;
  moneyHidden: boolean;
  minOrders: number;
  warnReturnPct: number;
  onClose: () => void;
  onDeeper: (level: GeoLevel) => void;
}) {
  // One answer per (area, query, try): while the answer on hand is for another key the panel says "loading", so no state
  // is set at the start of a fetch and a click on another area never shows the last area's products.
  const [attempt, setAttempt] = useState(0);
  const key = `${model.areaId}|${query}|${topN}|${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; detail: GeoAreaDetail | null; hidden: boolean } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    const sp = new URLSearchParams(query);
    sp.set("areaId", model.areaId);
    sp.set("topProducts", String(topN));
    fetch(`/api/admin/reports/geo-map/area?${sp}`, { signal: c.signal, headers: { accept: "application/json" } })
      .then((res) => res.json())
      .then((json: unknown) => {
        const body = json as GeoMapAreaApiResponse;
        setAnswer({ key, detail: body.ok ? body.detail : null, hidden: body.ok ? body.moneyHidden : false });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") setAnswer({ key, detail: null, hidden: false });
      });
    return () => c.abort();
  }, [key, query, model.areaId, topN]);
  const products: ProductsState =
    answer?.key !== key
      ? { state: "loading" }
      : answer.detail
        ? {
            state: "ready",
            items: panelProducts(answer.detail.topProducts, topN, answer.hidden || moneyHidden),
            categoryName: answer.detail.topCategory ? fmt.name(answer.detail.topCategory.nameEn, answer.detail.topCategory.nameBn) : null,
          }
        : { state: "error" };
  return (
    <GeoPanelView
      model={model}
      name={name}
      parent={parent}
      compared={compared}
      products={products}
      labels={labels}
      fmt={fmt}
      topN={topN}
      onRetry={() => setAttempt((n) => n + 1)}
      onClose={onClose}
      onDeeper={onDeeper}
      moneyHidden={moneyHidden}
      minOrders={minOrders}
      warnReturnPct={warnReturnPct}
    />
  );
}
