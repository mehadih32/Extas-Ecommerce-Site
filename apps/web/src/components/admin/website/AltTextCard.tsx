"use client";
// S11 · PR 232 — Website → SEO "Photo descriptions" (`seo.altText`): how many product photos still have no description
// for search engines and screen readers, "Write them now" (POST /api/admin/seo/alt-text: every missing one is written,
// a description typed in Media is never changed), the switch that writes one as each photo is added, an example, and
// under "More options" the longest description. English goes live; Bengali comes from the dictionary words.
// Seeing needs seo.read; saving and writing them now, seo.manage. Words: messages/admin-seo.<lang>.json `at.*`.
import { useState } from "react";
import { call, errorText } from "@/components/admin/api";
import type { Dict } from "@/lib/i18n";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface AltTextValue {
  autoApply: boolean;
  maxLength: number;
}
export interface AltTextLimits {
  maxLength: { min: number; max: number };
}

const at = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `at.${key}`, vars);

export function AltTextCard({ d, value, defaults, limits, version, canWrite, missing, example, locale }: { d: Dict; value: AltTextValue; defaults: AltTextValue; limits: AltTextLimits; version: number; canWrite: boolean; missing: number; example: string; locale: string }) {
  const s = useSeoSave(d, "seo.altText", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const [left, setLeft] = useState(missing);
  const [filling, setFilling] = useState(false);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const n = (x: number) => new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(x);
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  const fillNow = async () => {
    setFilling(true);
    setDone(null);
    const a = await call("POST", "/api/admin/seo/alt-text", {});
    setFilling(false);
    if (a.status === 200 && a.data.ok) {
      setLeft(Number(a.data.missing));
      setDone({ ok: true, text: at(d, "filled", { n: n(Number(a.data.filled)) }) });
      return;
    }
    setDone({ ok: false, text: errorText((d.seo ?? {}) as Dict, a) });
  };
  return (
    <SeoCard id="a2s-seoalt" testId="seo-alt" where={seoText(d, "indexing.where")} title={at(d, "title")} desc={at(d, "desc")}>
      <div className="a2-sm" data-testid="at-missing" data-n={left}>
        <b>{at(d, "missing")}</b> <span className="a2-num">{n(left)}</span>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{at(d, left ? "missingHint" : "none")}</p>
      {canWrite ? (
        <div className="a2-gap8 a2-mt12">
          <button type="button" className="a2-btn" onClick={fillNow} disabled={filling || left === 0} aria-busy={filling || undefined} data-testid="at-fill">
            {at(d, filling ? "filling" : "fill")}
          </button>
        </div>
      ) : null}
      {done ? (
        <div className={`a2-note${done.ok ? "" : " bad"} a2-mt12`} role={done.ok ? "status" : "alert"} data-testid="at-filled">
          {done.text}
        </div>
      ) : null}
      <div className="a2-sm a2-b a2-mt12">{at(d, "example")}</div>
      <p className="a2-sm a2-mono a2-mt6" style={{ overflowWrap: "anywhere" }} data-testid="at-example">
        {example}
      </p>
      <p className="a2-xs a2-mute">{at(d, "bengali")}</p>
      <div className="a2-mt12">
        <SeoSwitch d={d} label={at(d, "auto")} hint={`${at(d, "autoHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.autoApply) })}`} on={v.autoApply} disabled={ro} onChange={(b) => s.setValue({ ...v, autoApply: b })} testId="at-auto" />
      </div>
      <details className="a2-mt12 a2-more-opts" data-testid="at-more">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        <div className="a2-fld a2-mt12">
          <label className="a2-lbl" htmlFor="at-maxLength">
            {at(d, "max")}
          </label>
          <input
            id="at-maxLength"
            className="a2-inp"
            type="number"
            inputMode="numeric"
            min={limits.maxLength.min}
            max={limits.maxLength.max}
            value={v.maxLength}
            disabled={ro}
            onChange={(e) => {
              const x = Number.parseInt(e.target.value, 10);
              s.setValue({ ...v, maxLength: Number.isFinite(x) ? x : v.maxLength });
            }}
            data-testid="at-maxLength"
          />
          <span className="a2-def a2-blk">{at(d, "maxHint", { v: n(defaults.maxLength), min: n(limits.maxLength.min), max: n(limits.maxLength.max) })}</span>
        </div>
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="at" />
    </SeoCard>
  );
}
