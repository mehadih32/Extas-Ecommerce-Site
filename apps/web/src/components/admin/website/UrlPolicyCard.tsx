"use client";
// S11 · PR 527 — Website → SEO "Pages that stay" (`seo.urlPolicy`): a page that was on the shop never answers "page not
// found". The card holds the "Available now" row (on, how many), whether sold-out and retired pages stay listed in
// search engines, and whether an archived collection keeps a resting page. Saved through PUT /api/admin/seo like every
// SEO card; seeing needs seo.read, saving seo.manage. Words: messages/admin-seo.<lang>.json `seo.up.*`.
import type { Dict } from "@/lib/i18n";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface UrlPolicyValue {
  alternatives: boolean;
  alternativesMax: number;
  soldOutIndexed: boolean;
  retiredIndexed: boolean;
  retiredCategoryPage: boolean;
}

const u = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `up.${key}`, vars);

const SWITCHES = ["soldOutIndexed", "retiredIndexed", "retiredCategoryPage"] as const;

export function UrlPolicyCard({ d, value, defaults, version, canWrite }: { d: Dict; value: UrlPolicyValue; defaults: UrlPolicyValue; version: number; canWrite: boolean }) {
  const s = useSeoSave(d, "seo.urlPolicy", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  return (
    <SeoCard id="a2s-seourl" testId="seo-url" where={seoText(d, "indexing.where")} title={u(d, "title")} desc={u(d, "desc")}>
      <SeoSwitch
        d={d}
        label={u(d, "alternatives")}
        hint={`${u(d, "alternativesHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.alternatives) })}`}
        on={v.alternatives}
        disabled={ro}
        onChange={(b) => s.setValue({ ...v, alternatives: b })}
        testId="seo-url-alternatives"
      />
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="seo-url-max">
          {u(d, "max")}
        </label>
        <input
          id="seo-url-max"
          className="a2-inp"
          type="number"
          inputMode="numeric"
          min={2}
          max={12}
          value={v.alternativesMax}
          disabled={ro || !v.alternatives}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            s.setValue({ ...v, alternativesMax: Number.isFinite(n) ? n : v.alternativesMax });
          }}
          data-testid="seo-url-max"
        />
        <span className="a2-def a2-blk">{u(d, "maxHint", { v: defaults.alternativesMax })}</span>
      </div>
      {SWITCHES.map((k) => (
        <div key={k} className="a2-mt12">
          <SeoSwitch
            d={d}
            label={u(d, k)}
            hint={`${u(d, `${k}Hint`)} ${seoText(d, "indexing.default", { v: onOff(defaults[k]) })}`}
            on={v[k]}
            disabled={ro}
            onChange={(b) => s.setValue({ ...v, [k]: b })}
            testId={`seo-url-${k}`}
          />
        </div>
      ))}
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="seo-url" />
    </SeoCard>
  );
}
