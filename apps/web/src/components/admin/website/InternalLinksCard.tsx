"use client";
// S11 · PR 231 — Website → SEO "Links between pages" (`seo.internalLinks`): the "More collections" links under a
// collection page (off as shipped: the demo has no such row) and how many at most. Saved through PUT /api/admin/seo;
// seeing needs seo.read, saving seo.manage. Words: admin-seo.<lang>.json `seo.il.*`.
import type { Dict } from "@/lib/i18n";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface InternalLinksValue {
  relatedCollections: boolean;
  max: number;
}

const il = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `il.${key}`, vars);

export function InternalLinksCard({ d, value, defaults, limits, version, canWrite }: { d: Dict; value: InternalLinksValue; defaults: InternalLinksValue; limits: { min: number; max: number }; version: number; canWrite: boolean }) {
  const s = useSeoSave(d, "seo.internalLinks", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  return (
    <SeoCard id="a2s-seoil" testId="seo-il" where={seoText(d, "indexing.where")} title={il(d, "title")} desc={il(d, "desc")}>
      <SeoSwitch
        d={d}
        label={il(d, "collections")}
        hint={`${il(d, "collectionsHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.relatedCollections) })}`}
        on={v.relatedCollections}
        disabled={ro}
        onChange={(b) => s.setValue({ ...v, relatedCollections: b })}
        testId="il-collections"
      />
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="il-max">
          {il(d, "max")}
        </label>
        <input
          id="il-max"
          className="a2-inp"
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          value={v.max}
          disabled={ro}
          onChange={(e) => {
            const x = Number.parseInt(e.target.value, 10);
            s.setValue({ ...v, max: Number.isFinite(x) ? x : v.max });
          }}
          data-testid="il-max"
        />
        <span className="a2-def a2-blk">{il(d, "maxHint", { v: defaults.max, min: limits.min, max: limits.max })}</span>
      </div>
      <p className="a2-xs a2-mute a2-mt12">{il(d, "also")}</p>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="il" />
    </SeoCard>
  );
}
