"use client";
// S28 · PR 701 — Website → Analytics → Behaviour: the click heat map, how far visitors scroll, which form fields they leave
// empty, the counts of three shop buttons and the settings (collect on or off, keep days, grid) with the owner's PIN. Data is made
// on the server (lib/analytics/behaviour.ts); the settings write to /api/admin/analytics-behaviour/settings.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { t, type Dict } from "@/lib/i18n";
import type { BehaviourView } from "@/lib/analytics/behaviour";
import { call } from "../api";
import { showToast } from "../lumen/Toast";

export interface BehaviourScreenProps {
  dict: Dict;
  view: BehaviourView;
  canEdit: boolean;
  span: number;
}

const SPANS = [7, 30, 60]; // hardcode-ok: the choices of the range buttons, not business numbers

export function BehaviourScreen(p: BehaviourScreenProps) {
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) =>
    t(p.dict, `webAnalytics.behaviour.${k}`, vars);
  const v = p.view;
  const [collect, setCollect] = useState(v.cfg.collect);
  const [keep, setKeep] = useState(String(v.cfg.keepDays));
  const [grid, setGrid] = useState(String(v.cfg.grid));
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const href = (o: { days?: number; page?: string; device?: string }) =>
    `/admin/website/analytics/behaviour?days=${o.days ?? p.span}&page=${o.page ?? v.page}&device=${o.device ?? v.device}`;
  const label = (group: string, key: string) => {
    const k = `webAnalytics.behaviour.${group}.${key}`;
    const m = t(p.dict, k);
    return m === k ? key : m;
  };
  async function save() {
    setBusy(true);
    setSaid(null);
    const a = await call("POST", "/api/admin/analytics-behaviour/settings", {
      collect,
      keepDays: Number(keep),
      grid: Number(grid),
      pin,
    });
    setBusy(false);
    if (a.data.ok) {
      setPin("");
      showToast({ text: c("settings.saved"), tone: "ok" });
      router.refresh();
    } else {
      const k = `webAnalytics.errors.${a.status === 0 ? "network" : (a.data.error ?? "server-error")}`;
      const m = t(p.dict, k);
      setSaid(m === k ? t(p.dict, "webAnalytics.errors.server-error") : m);
    }
  }
  const chips = (
    items: readonly string[],
    now: string,
    group: string,
    make: (k: string) => string,
  ) => (
    <div className="s28-row">
      {items.map((k) => (
        <Link
          key={k}
          className="s28-chip"
          href={make(k)}
          aria-current={now === k ? "true" : undefined}
          style={now === k ? { fontWeight: 700 } : undefined}
        >
          {label(group, k)}
        </Link>
      ))}
    </div>
  );
  const g = v.cfg.grid;
  return (
    <>
      <div className="s28-row a2-mt12" role="tablist">
        <Link className="s28-chip" href="/admin/website/analytics">
          {t(p.dict, "webAnalytics.tabs.overview")}
        </Link>
        <span className="s28-chip" aria-current="page">
          {t(p.dict, "webAnalytics.tabs.behaviour")}
        </span>
        <span className="a2-xs a2-mute grow" />
        <span className="a2-xs a2-mute">
          {t(p.dict, "webAnalytics.range.label")}
        </span>
        {SPANS.map((n) => (
          <Link
            key={n}
            className="s28-chip"
            href={href({ days: n })}
            aria-current={p.span === n ? "true" : undefined}
            style={p.span === n ? { fontWeight: 700 } : undefined}
          >
            {t(p.dict, "webAnalytics.range.days", { n })}
          </Link>
        ))}
      </div>
      {!v.cfg.collect ? (
        <p className="a2-sm a2-mt12" data-testid="vb-off">
          {c("off")}
        </p>
      ) : null}
      <section className="a2-card a2-mt12" data-testid="vb-heat">
        <h2 className="a2-h3">{c("heat.title")}</h2>
        <p className="a2-xs a2-mute">{c("heat.sub")}</p>
        <div className="s28-row a2-mt6">
          <span className="a2-xs a2-mute">{c("filters.page")}</span>
          {chips(v.pages, v.page, "pages", (k) => href({ page: k }))}
        </div>
        <div className="s28-row a2-mt6">
          <span className="a2-xs a2-mute">{c("filters.device")}</span>
          {chips(["all", ...v.devices], v.device, "devices", (k) =>
            href({ device: k }),
          )}
        </div>
        {v.heat.length ? (
          <>
            <div
              className="s28-heat a2-mt12"
              style={{ height: 360, maxWidth: 520 }}
              role="img"
              aria-label={c("heat.title")}
            >
              {v.heat.map((h) => (
                <i
                  key={`${h.col},${h.row}`}
                  title={c("heat.cell", { n: h.count })}
                  style={{
                    left: `${((h.col + 0.5) / g) * 100}%`,
                    top: `${((h.row + 0.5) / g) * 100}%`,
                    width: `${100 / g + 1.5}%`,
                    height: `${(100 / g + 1.5) * 0.7}%`,
                    opacity: 0.15 + (h.level / 100) * 0.85,
                  }}
                />
              ))}
            </div>
            <p className="a2-xs a2-mute a2-mt6">
              {c("heat.total", { n: v.clicks })}
            </p>
          </>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{c("empty")}</p>
        )}
      </section>
      <div className="s28-grid">
        <section className="a2-card" data-testid="vb-reach">
          <h2 className="a2-h3">{c("reach.title")}</h2>
          <p className="a2-xs a2-mute">{c("reach.sub")}</p>
          <div className="s28-list a2-mt6">
            {v.reach.map((r) => (
              <div key={r.mark} className="a2-mt6">
                <div className="s28-row between">
                  <span>{c("reach.mark", { n: r.mark })}</span>
                  <b>{r.pct}%</b>
                </div>
                <div className="s28-bar">
                  <i style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="a2-card" data-testid="vb-fields">
          <h2 className="a2-h3">{c("fields.title")}</h2>
          <p className="a2-xs a2-mute">{c("fields.sub")}</p>
          {v.fields.length ? (
            <div className="s28-list a2-mt6">
              {v.fields.map((f) => (
                <div key={f.name} className="a2-mt6">
                  <div className="s28-row between">
                    <span>{f.name}</span>
                    <b
                      className={
                        f.pct >= 50 ? "s28-bad" : f.pct >= 25 ? "s28-warn" : ""
                      }
                    >
                      {c("fields.left", { n: f.empty, of: f.touched })}
                    </b>
                  </div>
                  <div className="s28-bar">
                    <i style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{c("empty")}</p>
          )}
        </section>
        <section className="a2-card" data-testid="vb-buttons">
          <h2 className="a2-h3">{c("buttons.title")}</h2>
          <div className="s28-list a2-mt6">
            {v.buttons.map((b) => (
              <div key={b.name} className="s28-row between a2-mt6">
                <span>{label("buttons", b.name)}</span>
                <b>{b.count}</b>
              </div>
            ))}
          </div>
          <p className="a2-xs a2-mute a2-mt6">{c("buttons.note")}</p>
        </section>
        <section className="a2-card" data-testid="vb-more">
          <h2 className="a2-h3">{c("more.title")}</h2>
          <div className="s28-list a2-mt6">
            <Link href="/admin/reports/funnels">{c("more.funnels")}</Link>
            <Link href="/admin/reports/searches">{c("more.searches")}</Link>
          </div>
        </section>
      </div>
      {p.canEdit ? (
        <section className="a2-card a2-mt12" data-testid="vb-settings">
          <h2 className="a2-h3">{c("settings.title")}</h2>
          <label className="s28-row a2-mt6">
            <input
              type="checkbox"
              checked={collect}
              onChange={(e) => setCollect(e.target.checked)}
              data-testid="vb-collect"
            />{" "}
            {c("settings.collect")}
          </label>
          <p className="a2-xs a2-mute">{c("settings.privacy")}</p>
          <div className="s28-row a2-mt6">
            <label>
              {c("settings.keep")}
              <input
                className="a2-inp"
                inputMode="numeric"
                value={keep}
                style={{ width: 90 }}
                onChange={(e) => setKeep(e.target.value)}
              />
            </label>
            <label>
              {c("settings.grid")}
              <input
                className="a2-inp"
                inputMode="numeric"
                value={grid}
                style={{ width: 90 }}
                onChange={(e) => setGrid(e.target.value)}
              />
            </label>
          </div>
          <div className="s28-row a2-mt12">
            <input
              className="a2-inp"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              value={pin}
              placeholder={c("settings.pin")}
              aria-label={c("settings.pin")}
              onChange={(e) => setPin(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <button
              type="button"
              className="a2-btn"
              disabled={busy || !pin.trim()}
              onClick={save}
              data-testid="vb-save"
            >
              {c("settings.save")}
            </button>
          </div>
          {said ? (
            <p className="a2-sm a2-mt6 s28-bad" role="alert">
              {said}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
