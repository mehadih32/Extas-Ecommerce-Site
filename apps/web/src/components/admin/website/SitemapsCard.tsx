"use client";
// S11 · PR 228 — Website → SEO "Sitemaps" (`seo.sitemaps`): the address search engines read (/sitemap.xml), its files
// with how many addresses each holds and when they were made, "Make the sitemaps now" (POST /api/admin/seo/sitemaps:
// the kept set is made again at once), the switch, and under "More options" how long a set is kept and how many
// addresses go in one file and in all. Seeing needs seo.read; saving and making them now, seo.manage.
// Words: messages/admin-seo.<lang>.json `seo.sm.*`.
import { useState } from "react";
import { call, errorText } from "@/components/admin/api";
import type { Dict } from "@/lib/i18n";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface SitemapsValue {
  enabled: boolean;
  cacheMinutes: number;
  perFile: number;
  maxUrls: number;
}
export interface SitemapsLimits {
  cacheMinutes: { min: number; max: number };
  perFile: { min: number; max: number };
  maxUrls: { min: number; max: number };
}
export interface SitemapFileRow {
  name: string;
  kind: string;
  urls: number;
}
export interface SitemapsState {
  /** The index's full address, or null when the shop has no address yet. */
  index: string | null;
  files: SitemapFileRow[];
  /** When the kept set was made (ISO). */
  madeAt: string;
}

const sm = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `sm.${key}`, vars);
const NUMBERS = ["cacheMinutes", "perFile", "maxUrls"] as const;

export function SitemapsCard({
  d,
  value,
  defaults,
  limits,
  version,
  canWrite,
  initial,
  locale,
  timeZone,
}: {
  d: Dict;
  value: SitemapsValue;
  defaults: SitemapsValue;
  limits: SitemapsLimits;
  version: number;
  canWrite: boolean;
  initial: SitemapsState;
  locale: string;
  timeZone: string;
}) {
  const s = useSeoSave(d, "seo.sitemaps", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const [state, setState] = useState(initial);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<{ ok: boolean; text: string } | null>(null);
  const n = (x: number) => new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(x);
  const when = new Intl.DateTimeFormat(locale, { timeZone, numberingSystem: "latn", dateStyle: "medium", timeStyle: "short" }).format(new Date(state.madeAt));
  const total = state.files.reduce((a, f) => a + f.urls, 0);
  const makeNow = async () => {
    setMaking(true);
    setMade(null);
    const a = await call("POST", "/api/admin/seo/sitemaps", {});
    setMaking(false);
    if (a.status === 200 && a.data.ok) {
      setState(a.data.sitemaps as SitemapsState);
      setMade({ ok: true, text: sm(d, "madeNow") });
      return;
    }
    setMade({ ok: false, text: errorText((d.seo ?? {}) as Dict, a) });
  };
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  return (
    <SeoCard id="a2s-seomap" testId="seo-sitemaps" where={seoText(d, "indexing.where")} title={sm(d, "title")} desc={sm(d, "desc")}>
      <div className="a2-sm" data-testid="sm-index">
        <b>{sm(d, "index")}</b>{" "}
        {state.index && value.enabled ? (
          <a className="a2-mono seo-addr" href={state.index} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>
            {state.index}
          </a>
        ) : (
          <span className="a2-mute">{sm(d, value.enabled ? "noAddress" : "off")}</span>
        )}
      </div>
      <p className="a2-xs a2-mute a2-mt6">{sm(d, "madeAt", { when, n: n(total) })}</p>
      <div className="a2-tblw a2-mt12">
        <table className="a2-tbl" data-testid="sm-files">
          <thead>
            <tr>
              <th>{sm(d, "col.file")}</th>
              <th>{sm(d, "col.kind")}</th>
              <th className="r">{sm(d, "col.urls")}</th>
            </tr>
          </thead>
          <tbody>
            {state.files.map((f) => (
              <tr key={f.name} data-testid="sm-file" data-kind={f.kind}>
                <td className="a2-tdh">
                  <span className="a2-mono a2-sm">{f.name}</span>
                </td>
                <td data-l={sm(d, "col.kind")}>{sm(d, `kind.${f.kind}`)}</td>
                <td className="r" data-l={sm(d, "col.urls")}>
                  <span className="a2-num">{n(f.urls)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{sm(d, "twins")}</p>
      {canWrite ? (
        <div className="a2-gap8 a2-mt12">
          <button type="button" className="a2-btn" onClick={makeNow} disabled={making || !value.enabled} aria-busy={making || undefined} data-testid="sm-make">
            {sm(d, making ? "making" : "make")}
          </button>
        </div>
      ) : null}
      {made ? (
        <div className={`a2-note${made.ok ? "" : " bad"} a2-mt12`} role={made.ok ? "status" : "alert"} data-testid="sm-made">
          {made.text}
        </div>
      ) : null}
      <div className="a2-mt12">
        <SeoSwitch d={d} label={sm(d, "enabled")} hint={`${sm(d, "enabledHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.enabled) })}`} on={v.enabled} disabled={ro} onChange={(b) => s.setValue({ ...v, enabled: b })} testId="sm-enabled" />
      </div>
      <details className="a2-mt12 a2-more-opts" data-testid="sm-more">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        {NUMBERS.map((k) => (
          <div key={k} className="a2-fld a2-mt12">
            <label className="a2-lbl" htmlFor={`sm-${k}`}>
              {sm(d, `f.${k}`)}
            </label>
            <input
              id={`sm-${k}`}
              className="a2-inp"
              type="number"
              inputMode="numeric"
              min={limits[k].min}
              max={limits[k].max}
              value={v[k]}
              disabled={ro}
              onChange={(e) => {
                const x = Number.parseInt(e.target.value, 10);
                s.setValue({ ...v, [k]: Number.isFinite(x) ? x : v[k] });
              }}
              data-testid={`sm-${k}`}
            />
            <span className="a2-def a2-blk">{sm(d, `f.${k}Hint`, { v: n(defaults[k]), min: n(limits[k].min), max: n(limits[k].max) })}</span>
          </div>
        ))}
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="sm" />
    </SeoCard>
  );
}
