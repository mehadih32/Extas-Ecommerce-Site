"use client";
// S11 · PR 221 — Website → SEO: the search titles and descriptions card (`seo.titles`, with the product templates and
// lengths of Names & links, PR 590) and the AI drafts card (`seo.aiDrafts`; the drafts list with Accept and Discard).
// Every word comes from messages/admin-seo.<lang>.json; the API checks the permission again.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call, errorText } from "@/components/admin/api";
import type { Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText } from "./SeoScreen";

type Pair = { en: string; bn: string };
type PageTemplate = { title: Pair; description: Pair };
type Lang = "en" | "bn";

/** The values the titles card saves, one setting each. */
export interface SeoTextsValues {
  "seo.titles": Record<string, PageTemplate>;
  "naming.seoTitleTemplate": Pair;
  "naming.metaDescriptionTemplate": Pair;
  "naming.seoTitleMaxChars": number;
  "naming.metaDescriptionMaxChars": number;
}
type TextsKey = keyof SeoTextsValues;
const TEXT_KEYS: TextsKey[] = ["seo.titles", "naming.seoTitleTemplate", "naming.metaDescriptionTemplate", "naming.seoTitleMaxChars", "naming.metaDescriptionMaxChars"];

/** Saves the changed settings of one card, one after another (each with its own version). */
function useSeoSaveKeys<T extends object>(d: Dict, initial: T, versions: Record<string, number>) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [ver, setVer] = useState(versions);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true);
    setNote(null);
    const keys = (Object.keys(value) as (keyof T & string)[]).filter((k) => JSON.stringify(value[k]) !== JSON.stringify(saved[k]));
    let next = { ...saved };
    let nextVer = { ...ver };
    for (const key of keys) {
      const a = await call("PUT", "/api/admin/seo", { key, value: value[key], version: nextVer[key] });
      if (!(a.status === 200 && a.data.ok)) {
        setBusy(false);
        setSaved(next);
        setVer(nextVer);
        if (a.data.error === "STALE") router.refresh();
        setNote({ ok: false, text: errorText((d.seo ?? {}) as Dict, a) });
        return;
      }
      const values = a.data.values as Record<string, unknown>;
      const versionsNow = a.data.versions as Record<string, number>;
      next = { ...next, [key]: values[key] };
      nextVer = { ...nextVer, [key]: versionsNow[key] ?? nextVer[key] ?? 0 };
    }
    setBusy(false);
    setSaved(next);
    setValue(next);
    setVer(nextVer);
    setNote({ ok: true, text: seoText(d, keys.length ? "indexing.saved" : "indexing.unchanged") });
    if (keys.length) router.refresh();
  };
  return { value, setValue, busy, note, save };
}

/** A template with sample words in place of its tokens (a preview, not the page's own words). */
function preview(tpl: string, sample: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => sample[k] ?? m).replace(/\s{2,}/g, " ").trim();
}

export function TitlesCard({
  d,
  value,
  defaults,
  versions,
  canWrite,
  kinds,
  tokens,
}: {
  d: Dict;
  value: SeoTextsValues;
  defaults: SeoTextsValues;
  versions: Record<string, number>;
  canWrite: boolean;
  /** The kinds with their own template (`seo.titles`), after "product". */
  kinds: readonly string[];
  /** The tokens of each kind, "product" included. */
  tokens: Record<string, readonly string[]>;
}) {
  const s = useSeoSaveKeys(d, value, Object.fromEntries(TEXT_KEYS.map((k) => [k, versions[k] ?? 0])));
  const v = s.value;
  const ro = !canWrite || s.busy;
  const [kind, setKind] = useState<string>("product");
  const isProduct = kind === "product";
  const tplOf = (src: SeoTextsValues): PageTemplate => (isProduct ? { title: src["naming.seoTitleTemplate"], description: src["naming.metaDescriptionTemplate"] } : src["seo.titles"][kind]!);
  const cur = tplOf(v);
  const def = tplOf(defaults);
  const put = (field: "title" | "description", lang: Lang, text: string) => {
    if (isProduct) {
      const key = field === "title" ? "naming.seoTitleTemplate" : "naming.metaDescriptionTemplate";
      s.setValue({ ...v, [key]: { ...v[key], [lang]: text } });
      return;
    }
    const pageTpl = v["seo.titles"][kind]!;
    s.setValue({ ...v, "seo.titles": { ...v["seo.titles"], [kind]: { ...pageTpl, [field]: { ...pageTpl[field], [lang]: text } } } });
  };
  const sample = Object.fromEntries((tokens[kind] ?? []).map((tk) => [tk, seoText(d, `titles.sample.${tk}`)]));
  const max = { title: v["naming.seoTitleMaxChars"], description: v["naming.metaDescriptionMaxChars"] };
  const field = (f: "title" | "description", lang: Lang) => {
    const id = `seo-${f}-${lang}`;
    const shown = preview(cur[f][lang], sample);
    const n = [...shown].length;
    return (
      <div className="a2-fld" key={id}>
        <label className="a2-lbl" htmlFor={id}>
          {seoText(d, `titles.field.${f}.${lang}`)}
        </label>
        {f === "title" ? (
          <input id={id} className="a2-inp" value={cur[f][lang]} disabled={ro} onChange={(e) => put(f, lang, e.target.value)} data-testid={id} />
        ) : (
          <textarea id={id} className="a2-ta" rows={2} value={cur[f][lang]} disabled={ro} onChange={(e) => put(f, lang, e.target.value)} data-testid={id} />
        )}
        <div className="a2-def">
          {shown ? seoText(d, "titles.preview", { text: shown }) : seoText(d, f === "title" ? "titles.emptyTitle" : "titles.emptyDescription")}{" "}
          <span className={n > max[f] ? "seo-over" : undefined}>{seoText(d, "titles.chars", { n, max: max[f] })}</span>
        </div>
        <div className="a2-def">{seoText(d, "indexing.default", { v: def[f][lang] || seoText(d, "titles.none") })}</div>
      </div>
    );
  };
  return (
    <SeoCard id="a2s-seotitles" testId="seo-titles" where={seoText(d, "indexing.where")} title={seoText(d, "titles.title")} desc={seoText(d, "titles.desc")}>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="seo-kind">
          {seoText(d, "titles.kind")}
        </label>
        <select id="seo-kind" className="a2-sel" value={kind} onChange={(e) => setKind(e.target.value)} data-testid="seo-titles-kind">
          {["product", ...kinds].map((k) => (
            <option key={k} value={k}>
              {seoText(d, `indexing.page.${k}`)}
            </option>
          ))}
        </select>
        <div className="a2-def">{seoText(d, isProduct ? "titles.productHint" : "titles.kindHint")}</div>
      </div>
      <div className="a2-sm a2-b a2-mt12">{seoText(d, "titles.words")}</div>
      <ul className="a2-gap8 seo-tokens" data-testid="seo-titles-tokens" aria-label={seoText(d, "titles.words")}>
        {(tokens[kind] ?? []).map((tk) => (
          <li key={tk} className="a2-pill line">
            <code>{`{${tk}}`}</code> {seoText(d, `titles.token.${tk}`)}
          </li>
        ))}
      </ul>
      <div className="a2-scv a2-mt12">
        {field("title", "en")}
        {field("title", "bn")}
        {field("description", "en")}
        {field("description", "bn")}
      </div>
      <details className="a2-mt12 a2-more-opts">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        <div className="a2-scv a2-mt12">
          {(["title", "description"] as const).map((f) => {
            const key = f === "title" ? "naming.seoTitleMaxChars" : "naming.metaDescriptionMaxChars";
            return (
              <div className="a2-fld" key={key}>
                <label className="a2-lbl" htmlFor={`seo-max-${f}`}>
                  {seoText(d, `titles.max.${f}`)}
                </label>
                <input
                  id={`seo-max-${f}`}
                  className="a2-inp"
                  type="number"
                  inputMode="numeric"
                  value={v[key]}
                  disabled={ro}
                  onChange={(e) => s.setValue({ ...v, [key]: Number(e.target.value) })}
                  data-testid={`seo-max-${f}`}
                />
                <div className="a2-def">{seoText(d, "indexing.default", { v: defaults[key] })}</div>
              </div>
            );
          })}
        </div>
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="seo-titles" />
    </SeoCard>
  );
}

// ---- AI drafts ----

export interface SeoAiDraftsValue {
  enabled: boolean;
  batchMax: number;
  subjects: { product: boolean; category: boolean };
}

export interface SeoDraftView {
  id: string;
  subject: "product" | "category";
  locale: Lang;
  name: string;
  title: string;
  description: string;
  practice: boolean;
}

export interface SeoDraftsView {
  aiOn: boolean;
  enabled: boolean;
  waiting: SeoDraftView[];
  waitingTotal: number;
  missing: { product: number; category: number };
}

export function AiDraftsCard({ d, value, defaults, version, canWrite, initial }: { d: Dict; value: SeoAiDraftsValue; defaults: SeoAiDraftsValue; version: number; canWrite: boolean; initial: SeoDraftsView }) {
  const router = useRouter();
  const s = useSeoSaveKeys(d, { "seo.aiDrafts": value }, { "seo.aiDrafts": version });
  const v = s.value["seo.aiDrafts"];
  const set = (next: SeoAiDraftsValue) => s.setValue({ "seo.aiDrafts": next });
  const ro = !canWrite || s.busy;
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  const missing = state.missing.product + state.missing.category;
  const later = Math.max(0, state.waitingTotal - state.waiting.length);
  const run = async (what: string, path: string, body: unknown) => {
    setBusy(what);
    setNote(null);
    const a = await call("POST", path, body);
    setBusy(null);
    if (a.status === 200 && a.data.ok) {
      setState(a.data as unknown as SeoDraftsView);
      const made = typeof a.data.made === "number" ? a.data.made : null;
      setNote({ ok: true, text: made === null ? seoText(d, "ai.decided") : seoText(d, "ai.made", { n: made }) });
      router.refresh();
      return;
    }
    setNote({ ok: false, text: errorText((d.seo ?? {}) as Dict, a) });
  };
  const canDraft = canWrite && state.aiOn && state.enabled && missing > 0 && busy === null;
  return (
    <SeoCard id="a2s-seoai" testId="seo-ai" where={seoText(d, "indexing.where")} title={seoText(d, "ai.title")} desc={seoText(d, "ai.desc")}>
      {!state.aiOn ? (
        <div className="a2-note" data-testid="seo-ai-off">
          <ShellIcon name="info" size={15} />
          <span>{seoText(d, "ai.shopOff")}</span>
        </div>
      ) : null}
      <SeoSwitch
        d={d}
        label={seoText(d, "ai.enabled")}
        hint={`${seoText(d, "ai.enabledHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.enabled) })}`}
        on={v.enabled}
        disabled={ro}
        onChange={(enabled) => set({ ...v, enabled })}
        testId="seo-ai-on"
      />
      <details className="a2-mt12 a2-more-opts">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        <div className="a2-scv a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="seo-ai-max">
              {seoText(d, "ai.batchMax")}
            </label>
            <input id="seo-ai-max" className="a2-inp" type="number" inputMode="numeric" value={v.batchMax} disabled={ro} onChange={(e) => set({ ...v, batchMax: Number(e.target.value) })} />
            <div className="a2-def">{seoText(d, "indexing.default", { v: defaults.batchMax })}</div>
          </div>
          <div className="a2-ckgrid">
            {(["product", "category"] as const).map((k) => (
              <label key={k} className="a2-ckb">
                <input type="checkbox" checked={v.subjects[k]} disabled={ro} onChange={(e) => set({ ...v, subjects: { ...v.subjects, [k]: e.target.checked } })} />
                <span>
                  {seoText(d, `indexing.page.${k}`)}
                  <span className="a2-def a2-blk">{seoText(d, "indexing.default", { v: onOff(defaults.subjects[k]) })}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="seo-ai" />

      <div className="a2-sm a2-b a2-mt12">{seoText(d, "ai.list")}</div>
      <p className="a2-xs a2-mute" data-testid="seo-ai-missing">
        {seoText(d, "ai.missing", { products: state.missing.product, categories: state.missing.category })}
      </p>
      {canWrite ? (
        <div className="a2-gap8 a2-mt6">
          <button type="button" className="a2-btn" disabled={!canDraft} aria-busy={busy === "draft" || undefined} onClick={() => run("draft", "/api/admin/seo/drafts", {})} data-testid="seo-ai-draft">
            {seoText(d, busy === "draft" ? "ai.drafting" : "ai.draft")}
          </button>
        </div>
      ) : null}
      {state.waiting.length ? (
        <ul className="seo-drafts" data-testid="seo-ai-list">
          {state.waiting.map((w) => (
            <li key={w.id} className="a2-card seo-draft" data-testid={`seo-ai-row-${w.id}`}>
              <div className="a2-xs a2-mute">
                {seoText(d, `ai.subject.${w.subject}`)} · {w.name} · {seoText(d, `ai.lang.${w.locale}`)}
                {w.practice ? <span className="a2-pill warn">{seoText(d, "ai.practice")}</span> : null}
              </div>
              <div className="a2-sm a2-b a2-mt6">{w.title || seoText(d, "titles.none")}</div>
              <div className="a2-xs a2-mt6">{w.description || seoText(d, "titles.none")}</div>
              {canWrite ? (
                <div className="a2-gap8 a2-mt6">
                  <button type="button" className="a2-btn pri" disabled={busy !== null} onClick={() => run(w.id, `/api/admin/seo/drafts/${w.id}`, { decision: "accept" })} data-testid={`seo-ai-accept-${w.id}`}>
                    {seoText(d, "ai.accept")}
                  </button>
                  <button type="button" className="a2-btn" disabled={busy !== null} onClick={() => run(w.id, `/api/admin/seo/drafts/${w.id}`, { decision: "discard" })} data-testid={`seo-ai-discard-${w.id}`}>
                    {seoText(d, "ai.discard")}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-xs a2-mute a2-mt6" data-testid="seo-ai-empty">
          {seoText(d, "ai.none")}
        </p>
      )}
      {later ? <p className="a2-xs a2-mute">{seoText(d, "ai.more", { n: later })}</p> : null}
      {note ? (
        <div className={`a2-note${note.ok ? "" : " bad"} a2-mt12`} role={note.ok ? "status" : "alert"} data-testid="seo-ai-note">
          <ShellIcon name={note.ok ? "check" : "alert"} size={15} />
          <span>{note.text}</span>
        </div>
      ) : null}
    </SeoCard>
  );
}
