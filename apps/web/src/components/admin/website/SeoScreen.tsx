"use client";
// S11 · PR 220–222 — Website → SEO (docs/ADMIN-ARCHITECTURE.md §4.9): one card per part of the SEO engine, each saved on
// its own through PUT /api/admin/seo { key, value, version }. A person with `seo.read` only sees the values; saving
// needs `seo.manage` (the API checks again). Every word comes from messages/admin-seo.<lang>.json.
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { call, errorText } from "@/components/admin/api";
import { t, type Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";

export const seoText = (d: Dict, key: string, vars: Record<string, string | number> = {}) => t(d, `seo.${key}`, vars);

/** An on/off switch row (the shell's 44 px switch). */
export function SeoSwitch({ label, hint, on, disabled, onChange, d, testId }: { label: string; hint?: string; on: boolean; disabled: boolean; onChange(v: boolean): void; d: Dict; testId: string }) {
  return (
    <div className="a2-fld a2-swl">
      <span>
        {label}
        {hint ? <span className="a2-def a2-blk">{hint}</span> : null}
      </span>
      <button
        type="button"
        className={`a2-sw${on ? " on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${seoText(d, on ? "indexing.on" : "indexing.off")}`}
        disabled={disabled}
        onClick={() => onChange(!on)}
        data-testid={testId}
      />
    </div>
  );
}

/** The save button, the read-only line and the answer of one card. */
export function useSeoSave<V>(d: Dict, key: string, initial: V, version: number) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [ver, setVer] = useState(version);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true);
    setNote(null);
    const a = await call("PUT", "/api/admin/seo", { key, value, version: ver });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      const values = a.data.values as Record<string, V>;
      const versions = a.data.versions as Record<string, number>;
      const changed = versions[key] !== ver;
      setValue(values[key] as V);
      setVer(versions[key] ?? ver);
      setNote({ ok: true, text: seoText(d, changed ? "indexing.saved" : "indexing.unchanged") });
      router.refresh();
      return;
    }
    if (a.data.error === "STALE") router.refresh();
    setNote({ ok: false, text: errorText((d.seo ?? {}) as Dict, a) });
  };
  return { value, setValue, busy, note, save };
}

export function SeoSaveRow({ d, canWrite, busy, note, onSave, testId }: { d: Dict; canWrite: boolean; busy: boolean; note: { ok: boolean; text: string } | null; onSave(): void; testId: string }) {
  return (
    <>
      {canWrite ? (
        <div className="a2-gap8 a2-mt12">
          <button type="button" className="a2-btn pri" onClick={onSave} disabled={busy} aria-busy={busy || undefined} data-testid={`${testId}-save`}>
            {seoText(d, busy ? "indexing.saving" : "indexing.save")}
          </button>
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt12">{seoText(d, "indexing.readOnly")}</p>
      )}
      {note ? (
        <div className={`a2-note${note.ok ? "" : " bad"} a2-mt12`} role={note.ok ? "status" : "alert"} data-testid={`${testId}-note`}>
          <ShellIcon name={note.ok ? "check" : "alert"} size={15} />
          <span>{note.text}</span>
        </div>
      ) : null}
    </>
  );
}

export function SeoCard({ id, testId, where, title, desc, children }: { id: string; testId: string; where: string; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="a2-sc" id={id} data-testid={testId} aria-labelledby={`${id}-h`}>
      <div className="a2-sch">
        <div>
          <div className="a2-scw">{where}</div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {title}
          </h2>
          <p className="a2-scd">{desc}</p>
        </div>
      </div>
      <div className="a2-scb">{children}</div>
    </section>
  );
}

// ---- PR 220 · search engines (`seo.indexing`) ----

export interface SeoIndexingValue {
  searchEngines: boolean;
  pages: Record<string, boolean>;
  xDefault: "en" | "none";
}

export function IndexingCard({ d, value, defaults, version, canWrite, pageTypes }: { d: Dict; value: SeoIndexingValue; defaults: SeoIndexingValue; version: number; canWrite: boolean; pageTypes: readonly string[] }) {
  const s = useSeoSave(d, "seo.indexing", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  return (
    <SeoCard id="a2s-seoindex" testId="seo-indexing" where={seoText(d, "indexing.where")} title={seoText(d, "indexing.title")} desc={seoText(d, "indexing.desc")}>
      <SeoSwitch
        d={d}
        label={seoText(d, "indexing.engines")}
        hint={`${seoText(d, "indexing.enginesHint")} ${seoText(d, "indexing.default", { v: onOff(defaults.searchEngines) })}`}
        on={v.searchEngines}
        disabled={ro}
        onChange={(searchEngines) => s.setValue({ ...v, searchEngines })}
        testId="seo-engines"
      />
      <div className="a2-sm a2-b a2-mt12">{seoText(d, "indexing.pages")}</div>
      <p className="a2-xs a2-mute">{seoText(d, "indexing.pagesHint")}</p>
      <div className="a2-ckgrid a2-mt12" data-testid="seo-page-types">
        {pageTypes.map((k) => (
          <label key={k} className="a2-ckb">
            <input type="checkbox" checked={Boolean(v.pages[k])} disabled={ro} onChange={(e) => s.setValue({ ...v, pages: { ...v.pages, [k]: e.target.checked } })} data-testid={`seo-page-${k}`} />
            <span>
              {seoText(d, `indexing.page.${k}`)}
              <span className="a2-def a2-blk">{seoText(d, "indexing.default", { v: onOff(Boolean(defaults.pages[k])) })}</span>
            </span>
          </label>
        ))}
      </div>
      <details className="a2-mt12 a2-more-opts">
        <summary className="a2-sm a2-b">{seoText(d, "indexing.more")}</summary>
        <div className="a2-scv a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="seo-xdefault">
              {seoText(d, "indexing.xDefault")}
            </label>
            <select id="seo-xdefault" className="a2-sel" value={v.xDefault} disabled={ro} onChange={(e) => s.setValue({ ...v, xDefault: e.target.value === "none" ? "none" : "en" })}>
              <option value="en">{seoText(d, "indexing.xDefaultEn")}</option>
              <option value="none">{seoText(d, "indexing.xDefaultNone")}</option>
            </select>
            <div className="a2-def">
              {seoText(d, "indexing.xDefaultHint")} {seoText(d, "indexing.default", { v: seoText(d, defaults.xDefault === "en" ? "indexing.xDefaultEn" : "indexing.xDefaultNone") })}
            </div>
          </div>
        </div>
      </details>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="seo-indexing" />
    </SeoCard>
  );
}

// ---- PR 222 · data for search engines (`seo.structuredData`) ----

/** The parts of the structured data, in the order the card lists them. */
export const SD_PARTS = ["breadcrumbs", "itemList", "product", "wasPrice", "combo", "organization", "website"] as const;
export type SeoStructuredValue = Record<(typeof SD_PARTS)[number], boolean>;

export function StructuredDataCard({ d, value, defaults, version, canWrite }: { d: Dict; value: SeoStructuredValue; defaults: SeoStructuredValue; version: number; canWrite: boolean }) {
  const s = useSeoSave(d, "seo.structuredData", value, version);
  const v = s.value;
  const ro = !canWrite || s.busy;
  const onOff = (b: boolean) => seoText(d, b ? "indexing.on" : "indexing.off");
  return (
    <SeoCard id="a2s-seosd" testId="seo-sd" where={seoText(d, "indexing.where")} title={seoText(d, "sd.title")} desc={seoText(d, "sd.desc")}>
      <div className="a2-ckgrid" data-testid="seo-sd-parts">
        {SD_PARTS.map((k) => (
          <label key={k} className="a2-ckb">
            <input type="checkbox" checked={v[k]} disabled={ro} onChange={(e) => s.setValue({ ...v, [k]: e.target.checked })} data-testid={`seo-sd-${k}`} />
            <span>
              {seoText(d, `sd.part.${k}`)}
              <span className="a2-def a2-blk">{seoText(d, "indexing.default", { v: onOff(defaults[k]) })}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="a2-xs a2-mute a2-mt12">{seoText(d, "sd.never")}</p>
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="seo-sd" />
    </SeoCard>
  );
}
