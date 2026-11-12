// S28 · PR 661 (CN-048, admin prototype v5; GAP-MAP O-12..O-16) — Orders › Batch at /admin/orders/batch. "Current" is every
// order not yet handed to the courier, counted along the pipeline (To confirm, Confirmed, Booked, Packed), with what is
// stuck (No stock, No answer, Suspicious, Merge needed), "Your work" (oldest first, leftovers tagged "From last batch") and
// "Moved on by itself" (what the rules confirmed, with their reason in one line). It shows no clock time of a batch run:
// the batch is simply what is not yet handed over. "Past" is the handed-over sheets (`?view=past`), read from the
// handover history. Read only; seeing needs `orders.read` (Past also `fulfilment.read`). Guide: docs/admin-guide/pages/orders/batch.md.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
      <div className="a2-note" role="note">
        <span>{g("note")}</span>
      </div>
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
          {pastBatches.length ? (
            <ul className="a2-list">
              {pastBatches.map((x) => (
                <li key={x.batchId} data-testid="batch-past-row">
                  <p>
                    <b>{x.courier}</b> · {when(x.handedOverAt)}
                  </p>
                  <p className="a2-sm a2-mute">
                    {g("pastRow", {
                      parcels: n(x.parcels),
                      pieces: n(x.pieces),
                      collect: formatMoney(
                        x.collectMinor,
                        moneyOf(x.currency || currency, view.locale),
                      ),
                    })}
                    {x.receivedBy
                      ? ` · ${g("pastBy", { rider: x.receivedBy })}`
                      : ""}
                    {x.leftOut
                      ? ` · ${g("pastMissing", { n: n(x.leftOut) })}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
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
          <section
            className="a2-sc"
            aria-label={g("pipelineH")}
            data-testid="batch-pipeline"
          >
            <h2 className="a2-h2">{g("pipelineH")}</h2>
            <ul className="a2-stats">
              {(["toConfirm", "confirmed", "booked", "packed"] as const).map(
                (k) => (
                  <li key={k} data-stage={k}>
                    <b>{n(b.pipeline[k])}</b>{" "}
                    <span className="a2-mute">{g(`stage.${k}`)}</span>
                  </li>
                ),
              )}
            </ul>
          </section>
          <section
            className="a2-sc"
            aria-label={g("stuckH")}
            data-testid="batch-stuck"
          >
            <h2 className="a2-h2">{g("stuckH")}</h2>
            {Object.values(b.stuck).some((x) => x > 0) ? (
              <ul className="a2-stats">
                {od.STUCK_KINDS.filter((k) => b.stuck[k] > 0).map((k) => (
                  <li key={k} data-stuck={k} title={g(`stuckWhy.${k}`)}>
                    <span className="a2-pill warn">{g(`stuck.${k}`)}</span>{" "}
                    <b>{n(b.stuck[k])}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{g("stuckNone")}</p>
            )}
          </section>
          <section
            className="a2-sc"
            aria-label={g("yoursH")}
            data-testid="batch-yours"
          >
            <h2 className="a2-h2">{g("yoursH")}</h2>
            {b.yours.length ? (
              <ul className="a2-list">
                {b.yours.map((r) => (
                  <li key={r.id} data-testid="batch-row">
                    <p>
                      <Link href={orderHref(r.id)}>
                        <b>{r.number}</b>
                      </Link>{" "}
                      <span className="a2-pill line">
                        {g(`stage.${r.stage}`)}
                      </span>
                      {r.fromLast ? (
                        <span className="a2-pill info"> {g("fromLast")}</span>
                      ) : null}
                      {r.stuck.map((k) => (
                        <span
                          key={k}
                          className="a2-pill warn"
                          title={g(`stuckWhy.${k}`)}
                        >
                          {" "}
                          {g(`stuck.${k}`)}
                        </span>
                      ))}
                    </p>
                    <p className="a2-sm a2-mute">
                      {formatMoney(
                        r.totalMinor,
                        moneyOf(r.currency || currency, view.locale),
                      )}{" "}
                      ·{" "}
                      {g("ago", {
                        age: ageText(view, new Date(r.placedAt), now),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
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
            <h2 className="a2-h2">{g("movedH")}</h2>
            {b.moved.length ? (
              <ul className="a2-list">
                {b.moved.map((x) => (
                  <li key={x.id}>
                    <Link href={orderHref(x.id)}>
                      <b>{x.number}</b>
                    </Link>{" "}
                    <span className="a2-sm a2-mute">{x.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{g("movedNone")}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
