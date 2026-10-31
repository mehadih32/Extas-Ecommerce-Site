"use client";
// S11 · PR 235 — Website › SEO › Redirects & 404 (demo WEB-04a): the parts that act. Adding a forward, the import of
// the owner's list of old links (check first, then write), a forward's on/off, the 404 report's one-click fix and
// ignore, the WordPress map's switch and the page's settings. Every call goes to /api/admin/seo/redirects (or, for the
// settings, PUT /api/admin/seo); the API checks `seo.manage` again. Every word comes from messages/admin-seo.<lang>.json.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call, errorText } from "@/components/admin/api";
import type { Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";
import { SeoCard, SeoSaveRow, SeoSwitch, seoText, useSeoSave } from "./SeoScreen";

const r = (d: Dict, key: string, vars: Record<string, string | number> = {}) => seoText(d, `rd.${key}`, vars);
const errs = (d: Dict) => (d.seo ?? {}) as Dict;

type Note = { ok: boolean; text: string } | null;

function NoteLine({ note, testId }: { note: Note; testId: string }) {
  if (!note) return null;
  return (
    <div className={`a2-note${note.ok ? "" : " bad"} a2-mt12`} role={note.ok ? "status" : "alert"} data-testid={testId}>
      <ShellIcon name={note.ok ? "check" : "alert"} size={15} />
      <span>{note.text}</span>
    </div>
  );
}

/** "Add a redirect": an old address and where it goes. */
export function AddRedirect({ d, canWrite }: { d: Dict; canWrite: boolean }) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  if (!canWrite) return null;
  const save = async () => {
    setBusy(true);
    setNote(null);
    const a = await call("POST", "/api/admin/seo/redirects", { fromPath: from, toPath: to });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      const row = a.data.row as { fromPath: string; toPath: string };
      setNote({ ok: true, text: r(d, "add.done", { from: row.fromPath, to: row.toPath }) });
      setFrom("");
      setTo("");
      router.refresh();
      return;
    }
    setNote({ ok: false, text: errorText(errs(d), a) });
  };
  return (
    <SeoCard id="a2s-rdadd" testId="rd-add" where={r(d, "where")} title={r(d, "add.title")} desc={r(d, "add.desc")}>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="rd-from">
          {r(d, "add.from")}
        </label>
        <input id="rd-from" className="a2-inp a2-mono" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={r(d, "add.fromPh")} autoComplete="off" spellCheck={false} data-testid="rd-add-from" />
      </div>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="rd-to">
          {r(d, "add.to")}
        </label>
        <input id="rd-to" className="a2-inp a2-mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder={r(d, "add.toPh")} autoComplete="off" spellCheck={false} data-testid="rd-add-to" />
        <span className="a2-def a2-blk">{r(d, "add.toHint")}</span>
      </div>
      <div className="a2-gap8 a2-mt12">
        <button type="button" className="a2-btn pri" onClick={save} disabled={busy || !from.trim() || !to.trim()} aria-busy={busy || undefined} data-testid="rd-add-save">
          <ShellIcon name="plus" size={15} />
          {r(d, busy ? "saving" : "add.save")}
        </button>
      </div>
      <NoteLine note={note} testId="rd-add-note" />
    </SeoCard>
  );
}

/** A forward's on/off (switched off, never deleted). */
export function RedirectToggle({ d, id, enabled, canWrite, label }: { d: Dict; id: string; enabled: boolean; canWrite: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const flip = async () => {
    setBusy(true);
    setErr(null);
    const a = await call("POST", `/api/admin/seo/redirects/${id}`, { enabled: !enabled });
    setBusy(false);
    if (a.status === 200 && a.data.ok) router.refresh();
    else setErr(errorText(errs(d), a));
  };
  return (
    <>
      <button type="button" className={`a2-sw${enabled ? " on" : ""}`} role="switch" aria-checked={enabled} aria-label={`${label}: ${r(d, enabled ? "on" : "off")}`} disabled={!canWrite || busy} onClick={flip} data-testid="rd-toggle" />
      {err ? (
        <span className="a2-xs seo-over" role="alert">
          {err}
        </span>
      ) : null}
    </>
  );
}

type Line = { line: number; from: string; to: string; status: string };

/** The owner's list of old links: paste, check, then import. */
export function ImportCard({ d, canWrite, keepMonths }: { d: Dict; canWrite: boolean; keepMonths: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"wordpress" | "manual">("wordpress");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<{ lines: Line[]; tally: Record<string, number> } | null>(null);
  const [note, setNote] = useState<Note>(null);
  if (!canWrite) return null;
  const send = async (commit: boolean) => {
    setBusy(true);
    setNote(null);
    const a = await call("POST", "/api/admin/seo/redirects/import", { text, kind, commit });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      if (commit) {
        setNote({ ok: true, text: r(d, "imp.done", { n: Number(a.data.written ?? 0) }) });
        setChecked(null);
        setText("");
        router.refresh();
      } else setChecked({ lines: a.data.lines as Line[], tally: a.data.tally as Record<string, number> });
      return;
    }
    setNote({ ok: false, text: errorText(errs(d), a) });
  };
  const ready = checked ? (checked.tally.ok ?? 0) + (checked.tally.update ?? 0) : 0;
  const shown = checked ? checked.lines.filter((l) => l.status !== "ok" && l.status !== "same").slice(0, 30) : [];
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setChecked(null);
  };
  return (
    <SeoCard id="a2s-rdimp" testId="rd-import" where={r(d, "where")} title={r(d, "imp.title")} desc={r(d, "imp.desc", { months: keepMonths })}>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="rd-kind">
          {r(d, "imp.kind")}
        </label>
        <select id="rd-kind" className="a2-sel" value={kind} onChange={(e) => {
            setKind(e.target.value === "manual" ? "manual" : "wordpress");
            setChecked(null);
          }} data-testid="rd-imp-kind">
          <option value="wordpress">{r(d, "kind.wordpress")}</option>
          <option value="manual">{r(d, "kind.manual")}</option>
        </select>
      </div>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="rd-text">
          {r(d, "imp.text")}
        </label>
        <textarea id="rd-text" className="a2-inp a2-mono" rows={6} value={text} onChange={(e) => {
            setText(e.target.value);
            setChecked(null);
          }} placeholder={r(d, "imp.textPh")} spellCheck={false} data-testid="rd-imp-text" />
        <span className="a2-def a2-blk">{r(d, "imp.textHint")}</span>
      </div>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="rd-file">
          {r(d, "imp.file")}
        </label>
        <input id="rd-file" type="file" accept=".csv,.txt,text/csv,text/plain" className="a2-inp" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="rd-imp-file" />
      </div>
      <div className="a2-gap8 a2-mt12">
        <button type="button" className="a2-btn" onClick={() => send(false)} disabled={busy || !text.trim()} data-testid="rd-imp-check">
          {r(d, busy && !checked ? "checking" : "imp.check")}
        </button>
        {checked && ready > 0 ? (
          <button type="button" className="a2-btn pri" onClick={() => send(true)} disabled={busy} aria-busy={busy || undefined} data-testid="rd-imp-commit">
            {r(d, busy ? "saving" : "imp.commit", { n: ready })}
          </button>
        ) : null}
      </div>
      {checked ? (
        <div className="a2-mt12" data-testid="rd-imp-result">
          <ul className="seo-tokens">
            {Object.entries(checked.tally)
              .filter(([, n]) => n > 0)
              .map(([s, n]) => (
                <li key={s} className={`a2-pill${s === "ok" || s === "update" ? " ok" : s === "same" ? "" : " warn"}`} data-status={s}>
                  {r(d, `imp.st.${s}`)}: {n}
                </li>
              ))}
          </ul>
          {shown.length ? (
            <ul className="seo-drafts">
              {shown.map((l) => (
                <li key={l.line} className="a2-xs">
                  <span className="a2-mute">{r(d, "imp.line", { n: l.line })}</span> <span className="a2-mono">{l.from || "—"}</span> → <span className="a2-mono">{l.to || "—"}</span> · <b>{r(d, `imp.st.${l.status}`)}</b>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <NoteLine note={note} testId="rd-imp-note" />
    </SeoCard>
  );
}

/** One open 404: send it somewhere (the suggestion filled in) or set it aside. */
export function NotFoundActions({ d, id, path, suggestion, canWrite }: { d: Dict; id: string; path: string; suggestion: string | null; canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(suggestion ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!canWrite) return null;
  const act = async (action: "fix" | "ignore") => {
    setBusy(true);
    setErr(null);
    const a = await call("POST", `/api/admin/seo/redirects/not-found/${id}`, action === "fix" ? { action, toPath: to } : { action });
    setBusy(false);
    if (a.status === 200 && a.data.ok) router.refresh();
    else setErr(errorText(errs(d), a));
  };
  return (
    <div className="a2-mt6">
      {open ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`nf-${id}`}>
            {r(d, "nf.sendTo", { path })}
          </label>
          <input id={`nf-${id}`} className="a2-inp a2-mono" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} data-testid="nf-to" />
        </div>
      ) : null}
      <div className="a2-gap8 a2-mt6">
        {open ? (
          <button type="button" className="a2-btn sm pri" onClick={() => act("fix")} disabled={busy || !to.trim()} data-testid="nf-save">
            {r(d, busy ? "saving" : "nf.save")}
          </button>
        ) : (
          <button type="button" className="a2-btn sm pri" onClick={() => setOpen(true)} data-testid="nf-fix">
            {r(d, "nf.fix")}
          </button>
        )}
        <button type="button" className="a2-btn sm" onClick={() => act("ignore")} disabled={busy} data-testid="nf-ignore">
          {r(d, "nf.ignore")}
        </button>
      </div>
      {err ? (
        <p className="a2-xs seo-over" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

export interface RedirectSettings {
  "seo.redirects": { wordpressMapLive: boolean; keepMonths: number; listShown: number };
  "seo.notFound": { record: boolean; maxRows: number; suggestMatchAtLeast: number };
  /** PR 586: old demo `#/…` links. */
  "seo.hashLinks": { forward: boolean };
}

/** The WordPress map's switch (go-live day) — its own card, saved on its own. */
export function WordpressCard({ d, value, version, canWrite, rows }: { d: Dict; value: RedirectSettings["seo.redirects"]; version: number; canWrite: boolean; rows: number }) {
  const s = useSeoSave(d, "seo.redirects", value, version);
  return (
    <SeoCard id="a2s-rdwp" testId="rd-wordpress" where={r(d, "where")} title={r(d, "wp.title")} desc={r(d, "wp.desc", { n: rows })}>
      <SeoSwitch d={d} label={r(d, "wp.live")} hint={r(d, "wp.liveHint")} on={s.value.wordpressMapLive} disabled={!canWrite || s.busy} onChange={(v) => s.setValue({ ...s.value, wordpressMapLive: v })} testId="rd-wp-live" />
      <SeoSaveRow d={d} canWrite={canWrite} busy={s.busy} note={s.note} onSave={s.save} testId="rd-wp" />
    </SeoCard>
  );
}

const num = (v: string, fallback: number) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** "More options": how long imported links are kept, the list length, the 404 counter. */
export function RedirectOptions({ d, values, versions, defaults, canWrite }: { d: Dict; values: RedirectSettings; versions: Record<keyof RedirectSettings, number>; defaults: RedirectSettings; canWrite: boolean }) {
  const red = useSeoSave(d, "seo.redirects", values["seo.redirects"], versions["seo.redirects"]);
  const nf = useSeoSave(d, "seo.notFound", values["seo.notFound"], versions["seo.notFound"]);
  const hash = useSeoSave(d, "seo.hashLinks", values["seo.hashLinks"], versions["seo.hashLinks"]);
  const ro = !canWrite;
  const field = (id: string, label: string, hint: string, value: number, min: number, max: number, set: (n: number) => void) => (
    <div className="a2-fld a2-mt12">
      <label className="a2-lbl" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="a2-inp" type="number" inputMode="numeric" min={min} max={max} value={value} disabled={ro} onChange={(e) => set(num(e.target.value, value))} data-testid={id} />
      <span className="a2-def a2-blk">{hint}</span>
    </div>
  );
  return (
    <details className="a2-sc" id="a2s-rdmore" data-testid="rd-more">
      <summary className="a2-sch">
        <h2 className="a2-h3">{seoText(d, "indexing.more")}</h2>
      </summary>
      <div className="a2-scb">
        {field("rd-keep", r(d, "opt.keep"), r(d, "opt.default", { v: defaults["seo.redirects"].keepMonths }), red.value.keepMonths, 1, 120, (n) => red.setValue({ ...red.value, keepMonths: n }))}
        {field("rd-shown", r(d, "opt.shown"), r(d, "opt.default", { v: defaults["seo.redirects"].listShown }), red.value.listShown, 10, 500, (n) => red.setValue({ ...red.value, listShown: n }))}
        <SeoSaveRow d={d} canWrite={canWrite} busy={red.busy} note={red.note} onSave={red.save} testId="rd-opt" />
        <div className="a2-mt12">
          <SeoSwitch d={d} label={r(d, "opt.record")} hint={r(d, "opt.recordHint")} on={nf.value.record} disabled={ro || nf.busy} onChange={(v) => nf.setValue({ ...nf.value, record: v })} testId="rd-nf-record" />
        </div>
        {field("rd-max", r(d, "opt.maxRows"), r(d, "opt.default", { v: defaults["seo.notFound"].maxRows }), nf.value.maxRows, 100, 100000, (n) => nf.setValue({ ...nf.value, maxRows: n }))}
        {field("rd-pct", r(d, "opt.percent"), r(d, "opt.default", { v: defaults["seo.notFound"].suggestMatchAtLeast }), nf.value.suggestMatchAtLeast, 10, 100, (n) => nf.setValue({ ...nf.value, suggestMatchAtLeast: n }))}
        <SeoSaveRow d={d} canWrite={canWrite} busy={nf.busy} note={nf.note} onSave={nf.save} testId="rd-nf" />
        <div className="a2-mt12">
          <SeoSwitch
            d={d}
            label={r(d, "opt.hash")}
            hint={`${r(d, "opt.hashHint")} ${r(d, "opt.default", { v: seoText(d, defaults["seo.hashLinks"].forward ? "indexing.on" : "indexing.off") })}`}
            on={hash.value.forward}
            disabled={ro || hash.busy}
            onChange={(v) => hash.setValue({ forward: v })}
            testId="rd-hash"
          />
        </div>
        <SeoSaveRow d={d} canWrite={canWrite} busy={hash.busy} note={hash.note} onSave={hash.save} testId="rd-hash" />
      </div>
    </details>
  );
}
