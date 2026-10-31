"use client";
// S11 · PR 236 — Website → SEO "Language pairs (hreflang)" (`seo.hreflang`): how many Bengali-ready pages name their
// English and Bengali twins, the tags such a page carries in its head, each ready page and whether it names its pair,
// and under "More options" whether the sitemaps name the pairs too (off: the head only). Seeing needs seo.read;
// saving, seo.manage. Words: messages/admin-seo.<lang>.json `hl.*`.
import type { Dict } from "@/lib/i18n";
import type { LanguagePair } from "@/lib/seo/hreflang";
import { hrefIn } from "@/lib/shop/lang";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

export interface HreflangValue {
  inSitemaps: boolean;
}

/** How many pages the list shows before "and N more" (the screen stays short; the count above is the whole number). */
const SHOWN = 25;

const hl = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `hl.${key}`, vars);

export function HreflangCard({ d, value, defaults, version, canWrite, bengaliOn, pairs, tags, xDefault, locale }: { d: Dict; value: HreflangValue; defaults: HreflangValue; version: number; canWrite: boolean; bengaliOn: boolean; pairs: LanguagePair[]; tags: { code: string; href: string }[]; xDefault: boolean; locale: string }) {
  const s = useSeoSave(d, "seo.hreflang", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const n = (x: number) => new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(x);
  const named = pairs.filter((p) => p.named).length;
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  const status = !bengaliOn ? hl(d, "off") : !pairs.length ? hl(d, "noneReady") : hl(d, "count", { n: n(named), m: n(pairs.length) });
  return (
    <SeoCard id="a2s-seohl" testId="seo-hreflang" where={seoText(d, "indexing.where")} title={hl(d, "title")} desc={hl(d, "desc")}>
      <p className="a2-sm" data-testid="hl-status" data-named={named}>
        {status}
      </p>
      <div className="a2-sm a2-b a2-mt12">{hl(d, "tags")}</div>
      <p className="a2-xs a2-mute">{hl(d, xDefault ? "tagsHint" : "tagsHintNoDefault")}</p>
      <pre className="a2-mono a2-xs a2-card a2-mt6" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }} data-testid="hl-tags">
        {tags.map((t) => `<link rel="alternate" hreflang="${t.code}" href="${t.href}">`).join("\n")}
      </pre>
      {pairs.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="hl-list">
            <thead>
              <tr>
                <th>{hl(d, "col.en")}</th>
                <th>{hl(d, "col.bn")}</th>
                <th>{hl(d, "col.named")}</th>
              </tr>
            </thead>
            <tbody>
              {pairs.slice(0, SHOWN).map((p) => (
                <tr key={p.key} data-testid="hl-row" data-named={String(p.named)}>
                  <td className="a2-tdh a2-mono" data-l={hl(d, "col.en")} style={{ overflowWrap: "anywhere" }}>
                    {p.path}
                  </td>
                  <td className="a2-mono" data-l={hl(d, "col.bn")} style={{ overflowWrap: "anywhere" }}>
                    {hrefIn("bn", p.path)}
                  </td>
                  <td data-l={hl(d, "col.named")} style={p.named ? { color: "var(--ok)" } : undefined}>
                    {hl(d, p.named ? "yes" : "hidden")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pairs.length > SHOWN ? (
            <p className="a2-xs a2-mute a2-mt6" data-testid="hl-more">
              {hl(d, "more", { n: n(pairs.length - SHOWN) })}
            </p>
          ) : null}
        </div>
      ) : null}
      <details className="a2-mt12 a2-more-opts" data-testid="hl-options">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        <div className="a2-mt12">
          <SeoSwitch d={d} label={hl(d, "inSitemaps")} hint={`${hl(d, "inSitemapsHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.inSitemaps) })}`} on={v.inSitemaps} disabled={ro} onChange={(b) => s.setValue({ ...v, inSitemaps: b })} testId="hl-sitemaps" />
        </div>
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="hl" />
    </SeoCard>
  );
}
