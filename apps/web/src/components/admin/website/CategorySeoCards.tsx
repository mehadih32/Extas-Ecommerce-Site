"use client";
// S11 · PR 227 — Website › SEO › Collection pages: the two cards of the page.
// - "Words for search engines" (`category.seo`, PR 45's owner words): pick a collection or sub-collection and write its
//   search title, search line, the heading and the text block under its grid, in both languages (a field written in one
//   language only is refused: both, or neither). Saved for that collection; the others stay as they are.
// - "Filter pages in search engines" (`seo.filterPages`): the few filtered pages that may be listed (one size, colour or
//   fit on one collection, with its own name), the switch, the fewest styles such a page needs and the most rows.
// Both save through PUT /api/admin/seo with the card's version (a save in between is STALE); seeing needs seo.read,
// saving seo.manage. Words: messages/admin-seo.<lang>.json `seo.cs.*`.
import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

type Pair = { en: string; bn: string };
type Entry = Partial<Record<(typeof FIELDS)[number], Pair>>;
export type CategorySeoValue = Record<string, Entry> | null;

export interface FilterPageRow {
  category: string;
  filter: "size" | "colour" | "fit";
  value: string;
  label: Pair;
}
export interface FilterPagesValue {
  enabled: boolean;
  minProducts: number;
  maxPages: number;
  pages: FilterPageRow[];
}

export interface CatOption {
  slug: string;
  name: string;
  /** A sub-collection's parent name, else null. */
  parent: string | null;
}

const FIELDS = ["title", "meta", "heading", "text"] as const;
/** The setting's own limits (`CATEGORY_SEO_MAX`, `SEO_FILTER_LIMITS`), handed down by the page. */
export type FieldMax = Record<(typeof FIELDS)[number], number>;
export interface FilterLimits {
  value: number;
  label: number;
  minProducts: { min: number; max: number };
  maxPages: { min: number; max: number };
}
const FILTERS = ["size", "colour", "fit"] as const;

const cs = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `cs.${key}`, vars);
const blank = (): Record<(typeof FIELDS)[number], Pair> => ({ title: { en: "", bn: "" }, meta: { en: "", bn: "" }, heading: { en: "", bn: "" }, text: { en: "", bn: "" } });
const draftOf = (e: Entry | undefined) => {
  const b = blank();
  for (const f of FIELDS) if (e?.[f]) b[f] = { ...e[f]! };
  return b;
};
const label = (c: CatOption) => (c.parent ? `${c.parent} › ${c.name}` : c.name);

export function CategoryTextsCard({ d, cats, value, version, canWrite, max }: { d: Dict; cats: CatOption[]; value: CategorySeoValue; version: number; canWrite: boolean; max: FieldMax }) {
  const s = useSeoSave<Record<string, Entry>>(d, "category.seo", value ?? {}, version);
  const [slug, setSlug] = useState(cats[0]?.slug ?? "");
  const [draft, setDraft] = useState(() => draftOf(s.value[cats[0]?.slug ?? ""]));
  const [half, setHalf] = useState("");
  const ro = !canWrite || s.busy;
  const pick = (next: string) => {
    setSlug(next);
    setDraft(draftOf(s.value[next]));
    setHalf("");
  };
  const apply = () => {
    const entry: Entry = {};
    for (const f of FIELDS) {
      const en = draft[f].en.trim();
      const bn = draft[f].bn.trim();
      if (!!en !== !!bn) {
        setHalf(cs(d, "half", { field: cs(d, `f.${f}`) }));
        return null;
      }
      if (en) entry[f] = { en, bn };
    }
    setHalf("");
    const next = { ...s.value };
    if (Object.keys(entry).length) next[slug] = entry;
    else delete next[slug];
    return next;
  };
  if (!cats.length)
    return (
      <SeoCard id="a2s-cstexts" testId="cs-texts" where={seoText(d, "indexing.where")} title={cs(d, "texts.title")} desc={cs(d, "texts.desc")}>
        <p className="a2-sm a2-mute">{cs(d, "texts.none")}</p>
      </SeoCard>
    );
  return (
    <SeoCard id="a2s-cstexts" testId="cs-texts" where={seoText(d, "indexing.where")} title={cs(d, "texts.title")} desc={cs(d, "texts.desc")}>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="cs-cat">
          {cs(d, "texts.pick")}
        </label>
        <select id="cs-cat" className="a2-sel" value={slug} onChange={(e) => pick(e.target.value)} data-testid="cs-cat">
          {cats.map((c) => (
            <option key={c.slug} value={c.slug}>
              {label(c)}
              {s.value[c.slug] ? ` · ${cs(d, "texts.has")}` : ""}
            </option>
          ))}
        </select>
      </div>
      {FIELDS.map((f) => (
        <div key={f} className="a2-fld a2-mt12">
          <span className="a2-lbl">{cs(d, `f.${f}`)}</span>
          {(["en", "bn"] as const).map((lang) => {
            const id = `cs-${f}-${lang}`;
            const common = {
              id,
              className: "a2-inp",
              maxLength: max[f],
              value: draft[f][lang],
              disabled: ro,
              onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [f]: { ...draft[f], [lang]: e.target.value } }),
              "data-testid": id,
            };
            return (
              <span key={lang} className="a2-stack a2-mt6" style={{ gap: 4 }}>
                <label className="a2-xs a2-mute" htmlFor={id}>
                  {cs(d, `lang.${lang}`)}
                </label>
                {f === "text" ? <textarea rows={5} {...common} /> : <input {...common} />}
              </span>
            );
          })}
          <span className="a2-def a2-blk">{cs(d, `f.${f}Hint`, { n: max[f] })}</span>
        </div>
      ))}
      {half ? (
        <p className="a2-sm a2-mt12" role="alert" data-testid="cs-half">
          {half}
        </p>
      ) : null}
      <SeoSaveRow
        d={d}
        canWrite={canWrite}
        busy={s.busy}
        note={s.note}
        onSave={() => {
          const next = apply();
          if (next) s.saveValue(next);
        }}
        testId="cs-texts"
      />
    </SeoCard>
  );
}

const emptyRow = (cat: string): FilterPageRow => ({ category: cat, filter: "colour", value: "", label: { en: "", bn: "" } });

export function FilterPagesCard({ d, cats, value, defaults, version, canWrite, limits }: { d: Dict; cats: CatOption[]; value: FilterPagesValue; defaults: FilterPagesValue; version: number; canWrite: boolean; limits: FilterLimits }) {
  const s = useSeoSave(d, "seo.filterPages", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const [row, setRow] = useState<FilterPageRow>(emptyRow(cats[0]?.slug ?? ""));
  const nameOf = (slug: string) => {
    const c = cats.find((x) => x.slug === slug);
    return c ? label(c) : slug;
  };
  const num = (k: "minProducts" | "maxPages", raw: string) => {
    const n = Number.parseInt(raw, 10);
    s.setValue({ ...v, [k]: Number.isFinite(n) ? n : v[k] });
  };
  // the same collection, filter and value twice is refused on save; say so before
  const twin = v.pages.some((p) => p.category === row.category && p.filter === row.filter && p.value.toLowerCase() === row.value.trim().toLowerCase());
  const full = v.pages.length >= v.maxPages;
  const ready = row.category && row.value.trim() && row.label.en.trim() && row.label.bn.trim() && !twin && !full;
  return (
    <SeoCard id="a2s-csfilter" testId="cs-filters" where={seoText(d, "indexing.where")} title={cs(d, "fp.title")} desc={cs(d, "fp.desc")}>
      <SeoSwitch
        d={d}
        label={cs(d, "fp.enabled")}
        hint={`${cs(d, "fp.enabledHint")} ${seoText(d, "indexing.default", { v: seoText(d, defaults.enabled ? "indexing.on" : "indexing.off") })}`}
        on={v.enabled}
        disabled={ro}
        onChange={(b) => s.setValue({ ...v, enabled: b })}
        testId="cs-fp-enabled"
      />
      <div className="a2-fg a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="cs-fp-min">
            {cs(d, "fp.min")}
          </label>
          <input id="cs-fp-min" className="a2-inp" type="number" inputMode="numeric" min={limits.minProducts.min} max={limits.minProducts.max} value={v.minProducts} disabled={ro} onChange={(e) => num("minProducts", e.target.value)} data-testid="cs-fp-min" />
          <span className="a2-def a2-blk">{cs(d, "fp.minHint", { v: defaults.minProducts })}</span>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="cs-fp-max">
            {cs(d, "fp.max")}
          </label>
          <input id="cs-fp-max" className="a2-inp" type="number" inputMode="numeric" min={limits.maxPages.min} max={limits.maxPages.max} value={v.maxPages} disabled={ro} onChange={(e) => num("maxPages", e.target.value)} data-testid="cs-fp-max" />
          <span className="a2-def a2-blk">{cs(d, "fp.maxHint", { v: defaults.maxPages })}</span>
        </div>
      </div>
      {v.pages.length ? (
        <ul className="a2-stack a2-mt12" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }} data-testid="cs-fp-rows">
          {v.pages.map((p, i) => (
            <li key={`${p.category}|${p.filter}|${p.value}`} className="a2-card a2-row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <b>{p.label.en}</b> · {p.label.bn}
                <span className="a2-xs a2-mute a2-blk">
                  {nameOf(p.category)} · {cs(d, `fp.kind.${p.filter}`)}: {p.value}
                </span>
              </span>
              {canWrite ? (
                <button type="button" className="a2-btn" disabled={ro} onClick={() => s.setValue({ ...v, pages: v.pages.filter((_, j) => j !== i) })}>
                  {cs(d, "fp.remove")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-sm a2-mute a2-mt12">{cs(d, "fp.none")}</p>
      )}
      {canWrite && cats.length ? (
        <div className="a2-mt12" data-testid="cs-fp-add">
          <h3 className="a2-h4">{cs(d, "fp.addTitle")}</h3>
          <div className="a2-fg a2-mt6">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cs-fp-cat">
                {cs(d, "fp.cat")}
              </label>
              <select id="cs-fp-cat" className="a2-sel" value={row.category} disabled={ro} onChange={(e) => setRow({ ...row, category: e.target.value })}>
                {cats.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cs-fp-kind">
                {cs(d, "fp.filter")}
              </label>
              <select id="cs-fp-kind" className="a2-sel" value={row.filter} disabled={ro} onChange={(e) => setRow({ ...row, filter: e.target.value as FilterPageRow["filter"] })}>
                {FILTERS.map((k) => (
                  <option key={k} value={k}>
                    {cs(d, `fp.kind.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cs-fp-value">
                {cs(d, "fp.value")}
              </label>
              <input id="cs-fp-value" className="a2-inp" maxLength={limits.value} value={row.value} disabled={ro} onChange={(e) => setRow({ ...row, value: e.target.value })} data-testid="cs-fp-value" />
              <span className="a2-def a2-blk">{cs(d, "fp.valueHint")}</span>
            </div>
            {(["en", "bn"] as const).map((lang) => (
              <div key={lang} className="a2-fld">
                <label className="a2-lbl" htmlFor={`cs-fp-label-${lang}`}>
                  {cs(d, `fp.label.${lang}`)}
                </label>
                <input id={`cs-fp-label-${lang}`} className="a2-inp" maxLength={limits.label} value={row.label[lang]} disabled={ro} onChange={(e) => setRow({ ...row, label: { ...row.label, [lang]: e.target.value } })} data-testid={`cs-fp-label-${lang}`} />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="a2-btn a2-mt6"
            disabled={ro || !ready}
            onClick={() => {
              s.setValue({ ...v, pages: [...v.pages, { ...row, value: row.value.trim(), label: { en: row.label.en.trim(), bn: row.label.bn.trim() } }] });
              setRow(emptyRow(row.category));
            }}
            data-testid="cs-fp-addgo"
          >
            {cs(d, "fp.add")}
          </button>
          <span className="a2-def a2-blk" data-testid="cs-fp-addhint">
            {cs(d, twin ? "fp.twin" : full ? "fp.full" : "fp.addHint")}
          </span>
        </div>
      ) : null}
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="cs-filters" />
    </SeoCard>
  );
}
