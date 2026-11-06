"use client";
// S11 · PR 238 — Website › SEO › Organic report, its settings card (`seo.organic`): how many days the report covers,
// the owner's target share, how many searches each engine lists, whether an untagged visit from a listed site is kept,
// and the list of search engines, video sites and AI assistants (one box per kind, one site per line). Saved through
// PUT /api/admin/seo; seeing needs seo.read, saving seo.manage. Words: admin-seo.<lang>.json `seo.og.*`.
import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { parseSourcesText, sourcesText, type OrganicKindName, type OrganicSourceText } from "@/lib/seo/organic-text";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface OrganicValue {
  days: number;
  targetPct: number;
  top: number;
  keepReferrals: boolean;
  sources: OrganicSourceText[];
}
type Range = { min: number; max: number };
export interface OrganicLimits {
  days: Range;
  targetPct: Range;
  top: Range;
}

const KINDS: readonly OrganicKindName[] = ["search", "video", "ai"];
const og = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `og.${key}`, vars);

export function OrganicCard({ d, value, defaults, limits, version, canWrite }: { d: Dict; value: OrganicValue; defaults: OrganicValue; limits: OrganicLimits; version: number; canWrite: boolean }) {
  const s = useSeoSave(d, "seo.organic", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const [texts, setTexts] = useState<Record<OrganicKindName, string>>(() => ({ search: sourcesText(value.sources, "search"), video: sourcesText(value.sources, "video"), ai: sourcesText(value.sources, "ai") }));
  const parsed = KINDS.map((k) => ({ kind: k, ...parseSourcesText(texts[k], k) }));
  const bad = parsed.filter((p) => p.bad.length);
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  const num = (key: "days" | "targetPct" | "top") => (
    <div className="a2-fld a2-mt12" key={key}>
      <label className="a2-lbl" htmlFor={`og-${key}`}>
        {og(d, `set.${key}`)}
      </label>
      <input
        id={`og-${key}`}
        className="a2-inp"
        type="number"
        inputMode="numeric"
        min={limits[key].min}
        max={limits[key].max}
        value={v[key]}
        disabled={ro}
        onChange={(e) => {
          const x = Number.parseInt(e.target.value, 10);
          s.setValue({ ...v, [key]: Number.isFinite(x) ? x : v[key] });
        }}
        data-testid={`og-${key}`}
      />
      <span className="a2-def a2-blk">{og(d, `set.${key}Hint`, { v: defaults[key], min: limits[key].min, max: limits[key].max })}</span>
    </div>
  );
  const save = () => {
    if (bad.length) return;
    void s.saveValue({ ...v, sources: parsed.flatMap((p) => p.sources) });
  };
  return (
    <SeoCard id="a2s-seoog" testId="seo-og" where={og(d, "set.where")} title={og(d, "set.title")} desc={og(d, "set.desc")}>
      {num("days")}
      {num("targetPct")}
      {num("top")}
      <div className="a2-mt12">
        <SeoSwitch
          d={d}
          label={og(d, "set.keep")}
          hint={`${og(d, "set.keepHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.keepReferrals) })}`}
          on={v.keepReferrals}
          disabled={ro}
          onChange={(b) => s.setValue({ ...v, keepReferrals: b })}
          testId="og-keep"
        />
      </div>
      {KINDS.map((k) => (
        <div className="a2-fld a2-mt12" key={k}>
          <label className="a2-lbl" htmlFor={`og-src-${k}`}>
            {og(d, `set.sources.${k}`)}
          </label>
          <textarea id={`og-src-${k}`} className="a2-inp" rows={4} value={texts[k]} disabled={ro} onChange={(e) => setTexts({ ...texts, [k]: e.target.value })} data-testid={`og-src-${k}`} />
        </div>
      ))}
      <span className="a2-def a2-blk">{og(d, "set.sourcesHint")}</span>
      {bad.length ? (
        <p className="a2-sm a2-mt12 seo-over" role="alert" data-testid="og-bad">
          {bad.map((p) => og(d, "set.bad", { box: og(d, `set.sources.${p.kind}`), lines: p.bad.join(", ") })).join(" ")}
        </p>
      ) : null}
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy || bad.length > 0} note={s.note} onSave={save} testId="og" />
    </SeoCard>
  );
}
