"use client";
// S11 · PR 234 — Website → SEO "Real visitors' speed" (`seo.vitals`): the 75th percentile of the last days for each
// Core Web Vital on a phone and on a desktop against PR 10's targets, LCP per kind of page, the newest monthly lab run
// (a phone over 4G) page by page, the switch, how many visits report, and under "More options" the span and the targets.
// Seeing needs seo.read; saving, seo.manage. Words: messages/admin-seo.<lang>.json `vt.*`.
import type { Dict } from "@/lib/i18n";
import { formatVital, targetOf, VITAL_METRICS, type VitalMetric, type VitalTargets } from "@/lib/seo/vitals";
import type { LabReport, VitalCell, VitalsReport } from "@/lib/seo/vitals-data";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface VitalsValue {
  collect: boolean;
  share: number;
  days: number;
  targets: VitalTargets;
}
type Range = { min: number; max: number };
export type VitalsLimits = { share: Range; days: Range } & Record<keyof VitalTargets, Range>;

const vt = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `vt.${key}`, vars);
const TARGETS = ["lcpMs", "clsThousandths", "inpMs", "ttfbMs", "categoryKb", "adminMs"] as const;

function Cell({ d, metric, c, locale }: { d: Dict; metric: VitalMetric; c: VitalCell; locale: string }) {
  if (c.p75 == null) return <span className="a2-mute">{vt(d, "none")}</span>;
  const v = `${c.over ? "> " : ""}${formatVital(metric, c.p75, locale)}`;
  return (
    <span style={c.ok == null ? undefined : { color: c.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }} data-ok={c.ok == null ? undefined : String(c.ok)}>
      {v}
    </span>
  );
}

export function VitalsCard({ d, value, defaults, limits, version, canWrite, report, lab, locale, timeZone }: { d: Dict; value: VitalsValue; defaults: VitalsValue; limits: VitalsLimits; version: number; canWrite: boolean; report: VitalsReport; lab: LabReport | null; locale: string; timeZone: string }) {
  const s = useSeoSave(d, "seo.vitals", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const n = (x: number) => new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(x);
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  const target = (m: VitalMetric) => {
    const t = targetOf(m, value.targets);
    return t == null ? "—" : formatVital(m, t, locale);
  };
  const num = (key: "share" | "days", set: (x: number) => VitalsValue) => (
    <div className="a2-fld a2-mt12">
      <label className="a2-lbl" htmlFor={`vt-${key}`}>
        {vt(d, `f.${key}`)}
      </label>
      <input
        id={`vt-${key}`}
        className="a2-inp"
        type="number"
        inputMode="numeric"
        min={limits[key].min}
        max={limits[key].max}
        value={v[key]}
        disabled={ro}
        onChange={(e) => {
          const x = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(x)) s.setValue(set(x));
        }}
        data-testid={`vt-${key}`}
      />
      <span className="a2-def a2-blk">{vt(d, `f.${key}Hint`, { v: n(defaults[key]), min: n(limits[key].min), max: n(limits[key].max) })}</span>
    </div>
  );
  const labWhen = lab ? new Intl.DateTimeFormat(locale, { timeZone, numberingSystem: "latn", dateStyle: "medium" }).format(new Date(lab.at)) : "";
  return (
    <SeoCard id="a2s-seovt" testId="seo-vitals" where={seoText(d, "indexing.where")} title={vt(d, "title")} desc={vt(d, "desc")}>
      <p className="a2-xs a2-mute" data-testid="vt-span">
        {vt(d, report.total ? "span" : "noReadings", { days: n(report.days), n: n(report.total) })}
      </p>
      <div className="a2-tblw a2-mt6">
        <table className="a2-tbl" data-testid="vt-field">
          <thead>
            <tr>
              <th>{vt(d, "col.metric")}</th>
              <th className="r">{vt(d, "col.phone")}</th>
              <th className="r">{vt(d, "col.desktop")}</th>
              <th className="r">{vt(d, "col.target")}</th>
            </tr>
          </thead>
          <tbody>
            {VITAL_METRICS.map((m) => (
              <tr key={m} data-testid="vt-row" data-metric={m}>
                <td className="a2-tdh">
                  <b>{m}</b> <span className="a2-xs a2-mute">{vt(d, `m.${m}`)}</span>
                </td>
                <td className="r" data-l={vt(d, "col.phone")}>
                  <Cell d={d} metric={m} c={report.overall[m].phone} locale={locale} />
                </td>
                <td className="r" data-l={vt(d, "col.desktop")}>
                  <Cell d={d} metric={m} c={report.overall[m].desktop} locale={locale} />
                </td>
                <td className="r" data-l={vt(d, "col.target")}>
                  {target(m)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.lcpByKind.length ? (
        <p className="a2-xs a2-mt6" data-testid="vt-kinds">
          <b>{vt(d, "byKind")}</b> {report.lcpByKind.map((k) => `${vt(d, `kind.${k.kind}`)} ${k.cell.p75 == null ? "—" : formatVital("LCP", k.cell.p75, locale)}`).join(" · ")}
        </p>
      ) : null}
      <div className="a2-sm a2-b a2-mt12">{vt(d, "lab")}</div>
      {lab ? (
        <div data-testid="vt-lab" data-ok={String(lab.ok)}>
          <p className="a2-xs a2-mute">{vt(d, lab.ok ? "labOk" : "labMiss", { when: labWhen, profile: lab.profile ?? "" })}</p>
          <ul className="a2-xs" style={{ margin: 0, paddingInlineStart: 18, overflowWrap: "anywhere" }}>
            {lab.pages.map((p) => (
              <li key={`${p.kind}${p.path}`} style={p.misses.length ? { color: "var(--bad)" } : undefined}>
                <span className="a2-mono">{p.path}</span>
                {" — "}
                {[p.lcpMs != null ? `LCP ${formatVital("LCP", p.lcpMs, locale)}` : null, p.cls != null ? `CLS ${formatVital("CLS", Math.round(p.cls * 1000), locale)}` : null, p.ttfbMs != null ? `TTFB ${formatVital("TTFB", p.ttfbMs, locale)}` : null, p.kb != null ? vt(d, "kb", { n: n(Math.round(p.kb)) }) : null, p.loadMs != null ? vt(d, "load", { v: formatVital("LCP", p.loadMs, locale) }) : null].filter(Boolean).join(" · ")}
                {p.misses.length ? ` (${vt(d, "misses", { list: p.misses.join(", ") })})` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="a2-xs a2-mute" data-testid="vt-lab">
          {vt(d, "noLab")}
        </p>
      )}
      <div className="a2-mt12">
        <SeoSwitch d={d} label={vt(d, "collect")} hint={`${vt(d, "collectHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.collect) })}`} on={v.collect} disabled={ro} onChange={(b) => s.setValue({ ...v, collect: b })} testId="vt-collect" />
      </div>
      {num("share", (x) => ({ ...v, share: x }))}
      <details className="a2-mt12 a2-more-opts" data-testid="vt-more">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        {num("days", (x) => ({ ...v, days: x }))}
        {TARGETS.map((k) => (
          <div key={k} className="a2-fld a2-mt12">
            <label className="a2-lbl" htmlFor={`vt-t-${k}`}>
              {vt(d, `t.${k}`)}
            </label>
            <input
              id={`vt-t-${k}`}
              className="a2-inp"
              type="number"
              inputMode="numeric"
              min={limits[k].min}
              max={limits[k].max}
              value={v.targets[k]}
              disabled={ro}
              onChange={(e) => {
                const x = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(x)) s.setValue({ ...v, targets: { ...v.targets, [k]: x } });
              }}
              data-testid={`vt-t-${k}`}
            />
            <span className="a2-def a2-blk">{vt(d, "t.hint", { v: n(defaults.targets[k]), min: n(limits[k].min), max: n(limits[k].max) })}</span>
          </div>
        ))}
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="vt" />
    </SeoCard>
  );
}
