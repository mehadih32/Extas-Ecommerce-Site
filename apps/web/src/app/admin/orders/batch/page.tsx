// S28 · PR 661 (CN-048, admin prototype v5; GAP-MAP O-12..O-16) — Orders › Batch at /admin/orders/batch. "Current" is every
// order not yet handed to the courier, counted along the pipeline (To confirm, Confirmed, Booked, Packed), with what is
// stuck (No stock, No answer, Suspicious, Merge needed), "Your work" (oldest first, leftovers tagged "From last batch") and
// "Moved on by itself" (what the rules confirmed, with their reason in one line). It shows no clock time of a batch run:
// the batch is simply what is not yet handed over. "Past" is the handed-over sheets (`?view=past`), read from the
// handover history. Read only; seeing needs `orders.read` (Past also `fulfilment.read`). Guide: docs/admin-guide/pages/orders/batch.md.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { MOTHER_STORE_ID } from "@extas/db/client";
import * as od from "@extas/orders";
import * as sh from "@extas/shipping";
import { AdminNotice } from "@/components/admin/AdminFrame";
import {
  formatMoney,
  formatNumber,
  moneyOf,
} from "@/components/admin/products/model";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { readDeps } from "@/components/admin/orders/OrderListPage";
import { ageText } from "@/lib/admin-orders/list";
import { adminView, pageAccess } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { shippingDeps } from "@/lib/shipping-api";
import { t } from "@/lib/i18n";
import "../../settings-cards.css";
import "../../parity-d6.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/orders/batch";
const KEY = "ordersBatch";
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return {
    title: `${t(view.dict, "orders.batch.metaTitle")} · ${t(view.dict, "shell.admin")}`,
    robots: { index: false, follow: false },
  };
}

export default async function BatchPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const deps = adminDeps();
  const [view, sp, access] = await Promise.all([
    adminView(deps),
    searchParams,
    pageAccess("orders.read", deps, MOTHER_STORE_ID),
  ]);
  const d = view.dict;
  const past = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "past";
  if (access.kind === "login" || access.kind === "password")
    redirect(
      `${ADMIN_LOGIN}?next=${encodeURIComponent(past ? `${HERE}?view=past` : HERE)}`,
    );
  if (access.kind === "unavailable")
    return <AdminNotice view={view} current={KEY} text={t(d, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z" data-testid="orders-batch" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="orders.read" />
      </div>
    );
  const perms = access.guard.permissions ?? new Set<string>();
  const who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  const now = (access.deps.now ?? (() => new Date()))();
  const b = await od.batchOverview(readDeps(access.deps), who, now);
  const canPast = perms.has("fulfilment.read");
  const handed =
    past && canPast
      ? await sh.handoverHistory(await shippingDeps(access.deps), who)
      : [];
  const currency = await access.deps.resolver.value("store.currency", {
    storeId: MOTHER_STORE_ID,
  });
  const m = moneyOf(currency, view.locale);
  const g = (k: string, vars?: Record<string, string | number>) =>
    t(d, `orders.batch.${k}`, vars);
  const n = (x: number) => formatNumber(x, view.locale);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(view.locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: view.timeZone,
      numberingSystem: "latn",
    }).format(new Date(iso));
  const orderHref = (id: string) => `/admin/orders/${id}`;
  const pastBatches = handed
    .flatMap((c) =>
      c.batches.map((x) => ({
        ...x,
        courier: c.courierName,
        currency: c.currency,
      })),
    )
    .sort((a, z) => z.handedOverAt.localeCompare(a.handedOverAt));
  const pastTotal = canPast ? b.pastCount : 0;

  const stuckRows = b.yours.filter((r) => r.stuck.length);
  const decided = b.pipeline.confirmed + b.pipeline.booked + b.pipeline.packed;
  const pct = decided ? Math.round((b.moved.length / decided) * 100) : 0;
  const fromLastN = b.yours.filter((r) => r.fromLast).length;
  const insights = [
    decided && b.moved.length
      ? g("insight.rules", {
          pct: n(pct),
          n: n(Math.max(0, decided - b.moved.length)),
        })
      : null,
    stuckRows.length ? g("insight.stuck", { n: n(stuckRows.length) }) : null,
    fromLastN ? g("insight.fromLast", { n: n(fromLastN) }) : null,
  ].filter((x): x is string => !!x);
  const stuckSubLine = od.STUCK_KINDS.filter((k) => b.stuck[k] > 0)
    .map((k) => `${g(`stuck.${k}`)} ${n(b.stuck[k])}`)
    .join(" · ");
  const pipeCards = [
    {
      key: "all",
      label: g("pipe.all"),
      value: b.total,
      sub: g("pipe.allSub"),
      href: "/admin/orders?view=batch",
    },
    {
      key: "toConfirm",
      label: g("stage.toConfirm"),
      value: b.pipeline.toConfirm,
      sub: g("pipe.stuckN", { n: n(stuckRows.length) }),
      href: "/admin/orders/confirm",
    },
    {
      key: "confirmed",
      label: g("stage.confirmed"),
      value: b.pipeline.confirmed,
      sub: g("pipe.confirmedSub"),
      href: "/admin/orders/packing",
    },
    {
      key: "booked",
      label: g("stage.booked"),
      value: b.pipeline.booked,
      sub: g("pipe.bookedSub"),
      href: "/admin/orders/packing",
    },
    {
      key: "packed",
      label: g("stage.packed"),
      value: b.pipeline.packed,
      sub: g("pipe.packedSub"),
      href: "/admin/orders/packing",
    },
    {
      key: "stuck",
      label: g("pipe.stuck"),
      value: stuckRows.length,
      sub: stuckSubLine,
      href: "/admin/orders/confirm",
    },
  ];
  type Row = (typeof b.yours)[number];
  const stuckExtra = (r: Row) => (
    <>
      {r.stuck.map((k) => (
        <span key={k} className="a2-pill warn" title={g(`stuckWhy.${k}`)}>
          {g(`stuck.${k}`)}
        </span>
      ))}{" "}
      {g(`stuckWhy.${r.stuck[0]!}`)}
    </>
  );
  const yourExtra = (r: Row) => (
    <>
      {r.stuck[0] ? (
        <>
          <span className="a2-pill warn" title={g(`stuckWhy.${r.stuck[0]}`)}>
            {g(`stuck.${r.stuck[0]}`)}
          </span>{" "}
        </>
      ) : null}
      {g(`stage.${r.stage}`)}
    </>
  );
  // PR 1128 (prototype v5): "Merge" sits right on the stuck rows that need it; it opens the order's own merge dialog
  // (`?do=merge` on the order page: the same checks and `orders.merge` as there)
  const canMerge = perms.has("orders.merge");
  const OrderLine = ({ r, extra, merge = false }: { r: Row; extra: ReactNode; merge?: boolean }) => (
    <div className="o6-li" data-testid="batch-row">
      <div className="o6-grow">
        <p>
          <Link href={orderHref(r.id)}>
            <b>{r.number}</b>
          </Link>{" "}
          {r.fromLast ? (
            <span className="o6-tag last">{g("fromLast")}</span>
          ) : null}
          {r.customerName ? (
            <span className="a2-sm"> {r.customerName}</span>
          ) : null}
        </p>
        <p className="o6-sub">{extra}</p>
      </div>
      {merge && canMerge && r.stuck.includes("merge") ? (
        <Link className="a2-btn sm" href={`${orderHref(r.id)}?do=merge`} data-testid="batch-merge">
          {g("merge")}
        </Link>
      ) : null}
      <div className="o6-r">
        <b>
          {formatMoney(
            r.totalMinor,
            moneyOf(r.currency || currency, view.locale),
          )}
        </b>
        <p className="o6-sub">{ageText(view, new Date(r.placedAt), now)}</p>
      </div>
    </div>
  );

  return (
    <div className="a2-z" data-testid="orders-batch" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={g("title")}
        sub={g("sub", { n: n(b.total), past: n(pastTotal) })}
        right={
          perms.has("fulfilment.read") ? (
            <Link
              className="a2-btn pri"
              href="/admin/orders/packing/print"
              title={g("printHelp")}
              data-testid="batch-print"
            >
              {g("printAll")}
            </Link>
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />
      <nav
        className="a2-views"
        aria-label={g("viewsAria")}
        data-testid="batch-views"
      >
        <Link
          className={`a2-view${past ? "" : " on"}`}
          href={HERE}
          scroll={false}
          aria-current={past ? undefined : "page"}
          data-view="current"
        >
          {g("view.current")}
          <span className="a2-cnt">{n(b.total)}</span>
        </Link>
        {canPast ? (
          <Link
            className={`a2-view${past ? " on" : ""}`}
            href={`${HERE}?view=past`}
            scroll={false}
            aria-current={past ? "page" : undefined}
            data-view="past"
          >
            {g("view.past")}
            <span className="a2-cnt">{n(pastTotal)}</span>
          </Link>
        ) : null}
      </nav>

      {past ? (
        <section
          className="a2-sc"
          aria-label={g("pastH")}
          data-testid="batch-past"
        >
          <h2 className="a2-h2">{g("pastH")}</h2>
          <p className="a2-xs a2-mute">{g("pastSub")}</p>
          {pastBatches.length ? (
            <div className="a2-tblw o6-tw">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{g("col.batch")}</th>
                    <th>{g("col.when")}</th>
                    <th>{g("col.courier")}</th>
                    <th>{g("col.parcels")}</th>
                    <th>{g("col.cod")}</th>
                    <th>{g("col.taken")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pastBatches.map((x, i) => (
                    <tr key={x.batchId} data-testid="batch-past-row">
                      <td>
                        <Link href="/admin/orders/packing/handover">
                          <b>{n(pastBatches.length - i)}</b>
                        </Link>
                      </td>
                      <td>{when(x.handedOverAt)}</td>
                      <td>
                        {x.courier}
                        {x.receivedBy ? (
                          <span className="a2-xs a2-mute">
                            {" "}
                            · {g("pastBy", { rider: x.receivedBy })}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {g("pastParcels", {
                          parcels: n(x.parcels),
                          pieces: n(x.pieces),
                        })}
                      </td>
                      <td>
                        {formatMoney(
                          x.collectMinor,
                          moneyOf(x.currency || currency, view.locale),
                        )}
                      </td>
                      <td>
                        <span className="a2-pill good">
                          {g("takenN", { n: n(x.parcels) })}
                        </span>
                        {x.leftOut ? (
                          <>
                            {" "}
                            <span className="a2-pill bad">
                              {g("missingN", { n: n(x.leftOut) })}
                            </span>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute" data-testid="batch-past-empty">
              {g("pastEmpty")}
            </p>
          )}
          <p>
            <Link className="a2-sm" href="/admin/orders/packing/handover">
              {g("pastLink")}
            </Link>
          </p>
        </section>
      ) : (
        <>
          <ul
            className="o6-pipe"
            aria-label={g("pipelineH")}
            data-testid="batch-pipeline"
          >
            {pipeCards.map((c) => (
              <li key={c.key} data-stage={c.key}>
                <Link
                  className={`o6-pc${c.key === "stuck" ? " stuck" : ""}`}
                  href={c.href}
                >
                  <span className="o6-l">{c.label}</span>
                  <b>{n(c.value)}</b>
                  <span className="o6-s">{c.sub || "\u00a0"}</span>
                </Link>
              </li>
            ))}
          </ul>
          {insights.length ? (
            <div className="a2-note" role="note" data-testid="batch-insight">
              <span>
                {insights.map((x, i) => (
                  <Fragment key={i}>
                    {i ? <br /> : null}
                    {x}
                  </Fragment>
                ))}
              </span>
            </div>
          ) : null}
          {stuckRows.length ? (
            <section
              className="a2-sc a2-mt12"
              aria-label={g("stuckH")}
              data-testid="batch-stuck"
            >
              <h2 className="a2-h2">{g("stuckH")}</h2>
              <p className="a2-xs a2-mute" data-testid="batch-stuck-sub">
                {g("stuckSub")}{" "}
                <Link href="/admin/orders/confirm">{g("openProcessing")}</Link>
              </p>
              <div className="o6-chips">
                {od.STUCK_KINDS.filter((k) => b.stuck[k] > 0).map((k) => (
                  <span
                    key={k}
                    className="a2-pill"
                    data-stuck={k}
                    title={g(`stuckWhy.${k}`)}
                  >
                    {g(`stuck.${k}`)} · {n(b.stuck[k])}
                  </span>
                ))}
              </div>
              {stuckRows.map((r) => (
                <OrderLine key={r.id} r={r} extra={stuckExtra(r)} merge />
              ))}
            </section>
          ) : null}
          <div className="o6-half">
            <section
              className="a2-sc"
              aria-label={g("yoursH")}
              data-testid="batch-yours"
            >
              <h2 className="a2-h2">{g("yoursT", { n: n(b.yours.length) })}</h2>
              <p className="a2-xs a2-mute">{g("yoursSub")}</p>
              {b.yours.length ? (
                b.yours
                  .slice(0, 12)
                  .map((r) => (
                    <OrderLine key={r.id} r={r} extra={yourExtra(r)} />
                  ))
              ) : (
                <p className="a2-sm a2-mute">
                  {b.total ? g("yoursNone") : g("empty")}
                </p>
              )}
            </section>
            <section
              className="a2-sc"
              aria-label={g("movedH")}
              data-testid="batch-moved"
            >
              <h2 className="a2-h2">{g("movedT", { n: n(b.moved.length) })}</h2>
              <p className="a2-xs a2-mute">
                {g("movedSub")}{" "}
                <Link href="/admin/rules">{g("changeRules")}</Link>
              </p>
              {b.moved.length ? (
                b.moved.slice(0, 14).map((x) => (
                  <div className="o6-li" key={x.id}>
                    <div className="o6-grow">
                      <p>
                        <Link href={orderHref(x.id)}>
                          <b>{x.number}</b>
                        </Link>
                        {x.customerName ? (
                          <span className="a2-sm"> {x.customerName}</span>
                        ) : null}
                      </p>
                      <p className="o6-sub">
                        <span className="a2-pill good">{g("rulesTag")}</span>{" "}
                        {x.reason}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="a2-sm a2-mute">{g("movedNone")}</p>
              )}
            </section>
          </div>
          <p className="a2-sm a2-mute o6-note" data-testid="batch-note">
            {g("note")}
          </p>
        </>
      )}
    </div>
  );
}
