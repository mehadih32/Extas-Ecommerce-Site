"use client";
// S11 · PR 229 — Website → SEO "Robots and AI assistants" (`seo.robots`): whether AI robots may read the shop (on as
// shipped, App. answers #56), which AI robots are kept out when it is off, more paths no robot reads, and the
// robots.txt the shop answers now (shown as it is; closed until the shop is open to search engines on its own domain).
// Saved through PUT /api/admin/seo; seeing needs seo.read, saving seo.manage. Words: admin-seo.<lang>.json `seo.rb.*`.
import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface RobotsValue {
  aiCrawlers: boolean;
  aiBots: string[];
  disallow: string[];
}
export interface RobotsLimits {
  bots: number;
  botName: number;
  paths: number;
  path: number;
}

const rb = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `rb.${key}`, vars);
/** One entry per line, blanks dropped (the server checks each). */
const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export function RobotsCard({ d, value, defaults, limits, version, canWrite, preview }: { d: Dict; value: RobotsValue; defaults: RobotsValue; limits: RobotsLimits; version: number; canWrite: boolean; preview: string }) {
  const s = useSeoSave(d, "seo.robots", value, version);
  const v = s.value;
  // the boxes keep what is typed (a new empty line too); the setting gets the lines
  const [botsText, setBotsText] = useState(value.aiBots.join("\n"));
  const [pathsText, setPathsText] = useState(value.disallow.join("\n"));
  const ro = !canWrite || s.busy;
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  return (
    <SeoCard id="a2s-seorobots" testId="seo-robots" where={seoText(d, "indexing.where")} title={rb(d, "title")} desc={rb(d, "desc")}>
      <SeoSwitch
        d={d}
        label={rb(d, "ai")}
        hint={`${rb(d, "aiHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.aiCrawlers) })}`}
        on={v.aiCrawlers}
        disabled={ro}
        onChange={(b) => s.setValue({ ...v, aiCrawlers: b })}
        testId="rb-ai"
      />
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="rb-bots">
          {rb(d, "bots")}
        </label>
        <textarea
          id="rb-bots"
          className="a2-inp a2-mono"
          rows={4}
          value={botsText}
          disabled={ro}
          onChange={(e) => {
            setBotsText(e.target.value);
            s.setValue({ ...v, aiBots: lines(e.target.value).slice(0, limits.bots) });
          }}
          data-testid="rb-bots"
        />
        <span className="a2-def a2-blk">{rb(d, "botsHint", { n: limits.bots, v: defaults.aiBots.join(", ") })}</span>
      </div>
      <details className="a2-mt12 a2-more-opts" data-testid="rb-more">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        <div className="a2-fld a2-mt12">
          <label className="a2-lbl" htmlFor="rb-paths">
            {rb(d, "paths")}
          </label>
          <textarea
            id="rb-paths"
            className="a2-inp a2-mono"
            rows={4}
            value={pathsText}
            disabled={ro}
            onChange={(e) => {
              setPathsText(e.target.value);
              s.setValue({ ...v, disallow: lines(e.target.value).slice(0, limits.paths) });
            }}
            data-testid="rb-paths"
          />
          <span className="a2-def a2-blk">{rb(d, "pathsHint", { n: limits.paths })}</span>
        </div>
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="rb" />
      <div className="a2-sm a2-b a2-mt12">{rb(d, "now")}</div>
      <p className="a2-xs a2-mute">{rb(d, "nowHint")}</p>
      <pre className="a2-mono a2-xs a2-card a2-mt6" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }} data-testid="rb-preview">
        {preview}
      </pre>
    </SeoCard>
  );
}
