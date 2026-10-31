"use client";
// S11 · PR 233 — Website → SEO "Search Console and Bing" (`seo.verification`): the steps, the verification codes the
// owner pastes (a whole tag is turned into its code), the meta tags the shop's pages then carry, which engine is
// connected (Keys & connections), and "Send the sitemap" (POST /api/admin/seo/search-engines). Seeing needs seo.read;
// saving and sending, seo.manage. Words: messages/admin-seo.<lang>.json `se.*`.
import Link from "next/link";
import { useState } from "react";
import { call, errorText } from "@/components/admin/api";
import type { Dict } from "@/lib/i18n";
import { verificationLines, verificationTags, type Engine } from "@/lib/seo/verification";
import { SeoCard, SeoSaveRow, seoText, useSeoSave } from "./SeoScreen";

export interface VerificationValue {
  google: string[];
  bing: string[];
}
export interface EngineRow {
  engine: Engine;
  connected: boolean;
}
type Outcome = { engine: Engine; status: "sent" | "practice" | "noProperty" | "unreachable" | "failed"; property?: string; error?: string };

const se = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `se.${key}`, vars);
const ENGINES: readonly Engine[] = ["google", "bing"];

export function SearchEnginesCard({ d, value, limits, version, canWrite, engines, site, sitemap }: { d: Dict; value: VerificationValue; limits: { entries: number }; version: number; canWrite: boolean; engines: EngineRow[]; site: string | null; sitemap: string | null }) {
  const s = useSeoSave(d, "seo.verification", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  // the boxes keep what is typed; the setting gets each line's code
  const [text, setText] = useState<Record<Engine, string>>({ google: value.google.join("\n"), bing: value.bing.join("\n") });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const tags = verificationTags(value);
  const send = async () => {
    setSending(true);
    setSent(null);
    const a = await call("POST", "/api/admin/seo/search-engines", {});
    setSending(false);
    if (a.status === 200 && a.data.ok) {
      if (a.data.blocked) return setSent({ ok: false, lines: [se(d, `blocked.${String(a.data.blocked)}`)] });
      const results = a.data.results as Outcome[];
      return setSent({ ok: results.some((r) => r.status === "sent"), lines: results.map((r) => `${se(d, `engine.${r.engine}`)}: ${se(d, `out.${r.status}`, { property: r.property ?? "", error: r.error ?? "" })}`) });
    }
    setSent({ ok: false, lines: [errorText((d.seo ?? {}) as Dict, a)] });
  };
  return (
    <SeoCard id="a2s-seose" testId="seo-console" where={seoText(d, "indexing.where")} title={se(d, "title")} desc={se(d, "desc")}>
      <ol className="a2-sm a2-mt6" style={{ listStyle: "decimal", paddingInlineStart: 20, margin: 0, display: "grid", gap: 4, overflowWrap: "anywhere" }} data-testid="se-steps">
        <li>{se(d, "step1", { site: site ?? se(d, "noSite") })}</li>
        <li>{se(d, "step2")}</li>
        <li>{se(d, "step3")}</li>
        <li>{se(d, "step4", { sitemap: sitemap ?? se(d, "noSite") })}</li>
      </ol>
      {ENGINES.map((e) => (
        <div key={e} className="a2-fld a2-mt12">
          <label className="a2-lbl" htmlFor={`se-${e}`}>
            {se(d, `codes.${e}`)}
          </label>
          <textarea
            id={`se-${e}`}
            className="a2-inp a2-mono"
            rows={2}
            value={text[e]}
            disabled={ro}
            onChange={(ev) => {
              setText({ ...text, [e]: ev.target.value });
              s.setValue({ ...v, [e]: verificationLines(ev.target.value).slice(0, limits.entries) });
            }}
            data-testid={`se-${e}`}
          />
          <span className="a2-def a2-blk">{se(d, "codesHint", { n: limits.entries })}</span>
        </div>
      ))}
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="se" />
      <div className="a2-sm a2-b a2-mt12">{se(d, "tags")}</div>
      {tags.length ? (
        <pre className="a2-mono a2-xs a2-card a2-mt6" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }} data-testid="se-tags">
          {tags.join("\n")}
        </pre>
      ) : (
        <p className="a2-xs a2-mute" data-testid="se-tags">
          {se(d, "noTags")}
        </p>
      )}
      <div className="a2-tblw a2-mt12">
        <table className="a2-tbl" data-testid="se-engines">
          <thead>
            <tr>
              <th>{se(d, "col.engine")}</th>
              <th>{se(d, "col.link")}</th>
            </tr>
          </thead>
          <tbody>
            {engines.map((r) => (
              <tr key={r.engine} data-testid="se-engine" data-engine={r.engine} data-connected={r.connected ? "1" : "0"}>
                <td className="a2-tdh">{se(d, `engine.${r.engine}`)}</td>
                <td data-l={se(d, "col.link")}>
                  {r.connected ? (
                    se(d, "connected")
                  ) : (
                    <Link href="/admin/integrations" className="a2-sm seo-cell-link">
                      {se(d, "practice")}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite ? (
        <div className="a2-gap8 a2-mt12">
          <button type="button" className="a2-btn" onClick={send} disabled={sending} aria-busy={sending || undefined} data-testid="se-send">
            {se(d, sending ? "sending" : "send")}
          </button>
        </div>
      ) : null}
      <p className="a2-xs a2-mute a2-mt6">{se(d, "sendHint")}</p>
      {sent ? (
        <div className={`a2-note${sent.ok ? "" : " bad"} a2-mt12`} role={sent.ok ? "status" : "alert"} data-testid="se-sent">
          {sent.lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      ) : null}
    </SeoCard>
  );
}
