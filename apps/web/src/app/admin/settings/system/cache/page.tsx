// S02 · PR 602 — SET-08b Cache at /admin/settings/system/cache (docs/BACKEND-ARCHITECTURE.md, demo V12.3 Settings ›
// System › Cache): the hit rate today, Cloudflare's connection, the last clear; how long each layer keeps a page (the
// settings `cache.pages`, `cache.stockDisplaySeconds`, `cache.tuning`); the purge rules that are always on and the
// pages never kept; the four layers. Seeing needs `system.read`; saving and "Clear all" need `system.cache`.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { registry } from "@extas/settings";
import { AdminNotice } from "@/components/admin/AdminFrame";
import {
  CacheTimes,
  ClearAllButton,
  type CacheValues,
} from "@/components/admin/settings/CacheScreen";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { ShellIcon } from "@/components/admin/shell/ShellIcon";
import { dateTime } from "@/components/admin/stock/text";
import { formatNumber } from "@/components/admin/products/model";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { cacheDay, cacheRuntime } from "@/lib/cache";
import { t, type Dict } from "@/lib/i18n";
import bn from "../../../../../../messages/admin-cache.bn.json";
import en from "../../../../../../messages/admin-cache.en.json";
import "../../settings.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/settings/system/cache";
const KEY = "cache";

/** The admin dictionary with this screen's own messages under `cache.*`. */
function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: { ...view.dict, cache: (view.lang === "bn" ? bn : en) as Dict },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: t(view.dict, "cache.metaTitle"),
    robots: { index: false, follow: false },
  };
}

const DEFAULTS: CacheValues = {
  "cache.pages": registry["cache.pages"].default,
  "cache.stockDisplaySeconds": registry["cache.stockDisplaySeconds"].default,
  "cache.tuning": registry["cache.tuning"].default,
};

export default async function CachePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([
    adminView(deps),
    pageAccess("system.read", deps, MOTHER_STORE_ID),
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
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="system.read" />
      </div>
    );
  const rt = cacheRuntime();
  if (!rt)
    return (
      <AdminNotice view={view} current={KEY} text={t(view.dict, "page.noDb")} />
    );
  const s = await rt.service.status(
    { actor: access.guard.actor, storeId: MOTHER_STORE_ID },
    cacheDay(),
  );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) =>
    t(d, `cache.${k}`, vars);
  const canWrite = access.guard.permissions?.has("system.cache") ?? false;
  const pct = (n: number | null) =>
    n === null
      ? c("kpi.none")
      : c("kpi.pct", { n: formatNumber(n, view.locale) });
  const pages = s.values["cache.pages"];
  const rules = ["price", "stock", "setting", "product"] as const;
  const never = [
    ["bag", "bag"],
    ["checkout", "wallet"],
    ["account", "users"],
    ["admin", "lock"],
  ] as const;
  const layers = ["browser", "cdn", "server", "redis"] as const;

  return (
    <div className="a2-z" data-testid="cache-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={c("title")}
        sub={c("sub")}
        right={canWrite ? <ClearAllButton d={d} /> : null}
      />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="cache-kpi-page">
          <div className="a2-kl">{c("kpi.page")}</div>
          <div className="a2-kv">{pct(s.hitRate.page)}</div>
          <div className="a2-kf">
            <span className="a2-kn">
              {s.shared ? c("kpi.pageSub") : c("kpi.here")}
            </span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c("kpi.stock")}</div>
          <div className="a2-kv">{pct(s.hitRate.stock)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c("kpi.stockSub")}</span>
          </div>
        </div>
        <div
          className="a2-card a2-kpi"
          data-testid="cache-kpi-cdn"
          data-mode={s.cdn?.mode ?? "none"}
        >
          <div className="a2-kl">{c("kpi.cdn")}</div>
          <div className="a2-kv a2-sm a2-kvw">
            {c(`mode.${s.cdn?.mode ?? "none"}`)}
          </div>
          <div className="a2-kf">
            <span className="a2-kn">
              {c(pages.cdn ? "kpi.cdnPages" : "kpi.cdnFiles")}
            </span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c("kpi.last")}</div>
          <div className="a2-kv a2-sm a2-kvw">
            {s.lastCleared
              ? dateTime(s.lastCleared.at, view.locale, view.timeZone)
              : c("kpi.never")}
          </div>
        </div>
      </div>

      <div className="a2-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>
          <b>{c("safe.title")}</b> {c("safe.text")}
        </div>
      </div>

      <div className="a2-row a2-r21 a2-mt12">
        <div>
          <CacheTimes
            d={d}
            values={s.values}
            defaults={DEFAULTS}
            choices={s.choices}
            version={s.version}
            canWrite={canWrite}
          />
        </div>
        <section className="a2-card" aria-labelledby="cache-rules">
          <div className="a2-ch">
            <div>
              <h2 className="a2-h3" id="cache-rules">
                {c("rules.title")}
              </h2>
              <div className="a2-cs">{c("rules.sub")}</div>
            </div>
          </div>
          {rules.map((r) => (
            <div key={r} className="a2-rule">
              <span>
                <b className="a2-blk">{c(`rules.${r}`)}</b>
                <span className="a2-xs a2-mute">{c(`rules.${r}Text`)}</span>
              </span>
              <span className="a2-pill ok">
                <ShellIcon name="check" size={12} />
                {c("rules.always")}
              </span>
            </div>
          ))}
          <div className="a2-sm a2-b a2-mt12">{c("rules.never")}</div>
          <div className="a2-chips a2-mt12">
            {never.map(([k, icon]) => (
              <span key={k} className="a2-chipn">
                <ShellIcon name={icon} size={13} />
                {c(`rules.${k}`)}
              </span>
            ))}
          </div>
          <p className="a2-xs a2-mute a2-mt12">{c("rules.neverText")}</p>
        </section>
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="cache-layers">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="cache-layers">
              {c("layers.title")}
            </h2>
            <div className="a2-cs">{c("layers.sub")}</div>
          </div>
        </div>
        <div className="a2-tblw">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{c("layers.layer")}</th>
                <th>{c("layers.keeps")}</th>
                <th>{c("layers.howLong")}</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((l) => (
                <tr key={l}>
                  <td className="a2-tdh">
                    <b>{c(`layers.${l}`)}</b>
                  </td>
                  <td data-l={c("layers.keeps")}>{c(`layers.${l}Keeps`)}</td>
                  <td data-l={c("layers.howLong")}>{c(`layers.${l}Long`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
