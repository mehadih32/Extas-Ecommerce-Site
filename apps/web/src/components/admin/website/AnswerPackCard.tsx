"use client";
// S11 · PR 230 — Website → SEO "Summary for AI assistants" (`seo.answerPack`, Blueprint C4.3): whether the shop answers
// /llms.txt (on as shipped, App. answers #56), the owner's own one-paragraph summary at its top (empty as shipped), and
// what the file says now (closed until the shop is open to search engines on its own domain). Saved through
// PUT /api/admin/seo; seeing needs seo.read, saving seo.manage. Words: admin-seo.<lang>.json `seo.ap.*`.
import type { Dict } from "@/lib/i18n";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface AnswerPackValue {
  llmsTxt: boolean;
  summary: string;
}

const ap = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `ap.${key}`, vars);

export function AnswerPackCard({ d, value, defaults, max, version, canWrite, fileUrl }: { d: Dict; value: AnswerPackValue; defaults: AnswerPackValue; max: number; version: number; canWrite: boolean; fileUrl: string | null }) {
  const s = useSeoSave(d, "seo.answerPack", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  return (
    <SeoCard id="a2s-seoap" testId="seo-ap" where={seoText(d, "indexing.where")} title={ap(d, "title")} desc={ap(d, "desc")}>
      <SeoSwitch
        d={d}
        label={ap(d, "on")}
        hint={`${ap(d, "onHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.llmsTxt) })}`}
        on={v.llmsTxt}
        disabled={ro}
        onChange={(b) => s.setValue({ ...v, llmsTxt: b })}
        testId="ap-on"
      />
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="ap-summary">
          {ap(d, "summary")}
        </label>
        <textarea id="ap-summary" className="a2-inp" rows={4} maxLength={max} value={v.summary} disabled={ro} onChange={(e) => s.setValue({ ...v, summary: e.target.value })} data-testid="ap-summary" />
        <span className="a2-def a2-blk">{ap(d, "summaryHint", { n: max, used: v.summary.length })}</span>
      </div>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="ap" />
      <p className="a2-xs a2-mute a2-mt12" data-testid="ap-now" style={{ overflowWrap: "anywhere" }}>
        {fileUrl && v.llmsTxt ? `${ap(d, "open")} ${fileUrl}` : ap(d, "closed")}
      </p>
      {fileUrl && v.llmsTxt ? (
        <a className="a2-btn a2-mt6" href={fileUrl} target="_blank" rel="noopener" data-testid="ap-link">
          {ap(d, "openBtn")}
        </a>
      ) : null}
    </SeoCard>
  );
}
