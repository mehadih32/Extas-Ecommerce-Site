"use client";
// S02 · PR 602 — SET-08b Cache (demo V12.3 97y-adm2-settings.js "Cache", 89v-admin-server.js "admin-cache"): how long
// each layer keeps a page (the demo's choices, from the settings registry), the rare options under "More options",
// and "Clear all" behind its [confirm]. A person with `system.read` only sees the times; saving and clearing need
// `system.cache` (the API checks again). Every word comes from messages/admin-cache.<lang>.json.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call, errorText } from "@/components/admin/api";
import { t, type Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";
import { ConfirmDialog } from "./ConfirmDialog";

export interface CacheValues {
  "cache.pages": {
    server: boolean;
    cdn: boolean;
    categoryMinutes: number;
    productMinutes: number;
  };
  "cache.stockDisplaySeconds": number;
  "cache.tuning": {
    maxEntries: number;
    repeatSeconds: number;
    statsDays: number;
  };
}

export interface CacheChoices {
  pageMinutes: readonly number[];
  stockSeconds: readonly number[];
  maxEntries: readonly number[];
  repeatSeconds: readonly number[];
  statsDays: readonly number[];
}

const local = (
  d: Dict,
  key: string,
  vars: Record<string, string | number> = {},
) => t(d, `cache.${key}`, vars);

function Choice({
  id,
  label,
  value,
  options,
  unit,
  def,
  disabled,
  onChange,
  d,
}: {
  id: string;
  label: string;
  value: number;
  options: readonly number[];
  unit: string;
  def: number;
  disabled: boolean;
  onChange(v: number): void;
  d: Dict;
}) {
  return (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="a2-sel"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {local(d, `times.${unit}`, { n: o })}
          </option>
        ))}
      </select>
      <div className="a2-def">
        {local(d, "times.default", {
          v: local(d, `times.${unit}`, { n: def }),
        })}
      </div>
    </div>
  );
}

function Switch({
  label,
  hint,
  on,
  disabled,
  onChange,
  d,
  testId,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled: boolean;
  onChange(v: boolean): void;
  d: Dict;
  testId: string;
}) {
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
        aria-label={`${label}: ${local(d, on ? "times.on" : "times.off")}`}
        disabled={disabled}
        onClick={() => onChange(!on)}
        data-testid={testId}
      />
    </div>
  );
}

/** The times card: the demo's "How long each layer keeps a page". */
export function CacheTimes({
  d,
  values,
  defaults,
  choices,
  version,
  canWrite,
}: {
  d: Dict;
  values: CacheValues;
  defaults: CacheValues;
  choices: CacheChoices;
  version: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(values);
  const [ver, setVer] = useState(version);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const pages = v["cache.pages"];
  const tuning = v["cache.tuning"];
  const setPages = (p: Partial<CacheValues["cache.pages"]>) =>
    setV((x) => ({ ...x, "cache.pages": { ...x["cache.pages"], ...p } }));
  const setTuning = (p: Partial<CacheValues["cache.tuning"]>) =>
    setV((x) => ({ ...x, "cache.tuning": { ...x["cache.tuning"], ...p } }));
  const ro = !canWrite || busy;
  const save = async () => {
    setBusy(true);
    setNote(null);
    const a = await call("PUT", "/api/admin/cache", {
      version: ver,
      pages: v["cache.pages"],
      stockDisplaySeconds: v["cache.stockDisplaySeconds"],
      tuning: v["cache.tuning"],
    });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      const changed = (a.data.changed as string[] | undefined) ?? [];
      setVer(String(a.data.version));
      setV(a.data.values as CacheValues);
      setNote({
        ok: true,
        text: local(d, changed.length ? "times.saved" : "times.unchanged"),
      });
      return;
    }
    if (a.data.error === "STALE") router.refresh();
    setNote({ ok: false, text: errorText((d.cache ?? {}) as Dict, a) });
  };
  return (
    <section className="a2-sc" id="a2s-cachedur" data-testid="cache-times">
      <div className="a2-sch">
        <div>
          <div className="a2-scw">{local(d, "times.where")}</div>
          <h2 className="a2-h3">{local(d, "times.title")}</h2>
          <p className="a2-scd">{local(d, "times.desc")}</p>
        </div>
      </div>
      <div className="a2-scb">
        <div className="a2-scv">
          <Switch
            d={d}
            label={local(d, "times.server")}
            on={pages.server}
            disabled={ro}
            onChange={(server) => setPages({ server })}
            testId="cache-server"
          />
          <Choice
            d={d}
            id="cache-cat"
            label={local(d, "times.category")}
            value={pages.categoryMinutes}
            options={choices.pageMinutes}
            unit="minutes"
            def={defaults["cache.pages"].categoryMinutes}
            disabled={ro}
            onChange={(categoryMinutes) => setPages({ categoryMinutes })}
          />
          <Choice
            d={d}
            id="cache-pdp"
            label={local(d, "times.product")}
            value={pages.productMinutes}
            options={choices.pageMinutes}
            unit="minutes"
            def={defaults["cache.pages"].productMinutes}
            disabled={ro}
            onChange={(productMinutes) => setPages({ productMinutes })}
          />
          <Choice
            d={d}
            id="cache-stock"
            label={local(d, "times.stock")}
            value={v["cache.stockDisplaySeconds"]}
            options={choices.stockSeconds}
            unit="seconds"
            def={defaults["cache.stockDisplaySeconds"]}
            disabled={ro}
            onChange={(n) =>
              setV((x) => ({ ...x, "cache.stockDisplaySeconds": n }))
            }
          />
          <Switch
            d={d}
            label={local(d, "times.cdn")}
            hint={local(d, "times.cdnHint")}
            on={pages.cdn}
            disabled={ro}
            onChange={(cdn) => setPages({ cdn })}
            testId="cache-cdn"
          />
          <div className="a2-fld a2-swl">
            <span>
              {local(d, "times.files")}
              <span className="a2-def a2-blk">
                {local(d, "times.filesHint")}
              </span>
            </span>
            <span className="a2-pill line">{local(d, "times.filesValue")}</span>
          </div>
        </div>
        <details className="a2-mt12 a2-more-opts">
          <summary className="a2-sm a2-b">{local(d, "times.more")}</summary>
          <div className="a2-scv a2-mt12">
            <Choice
              d={d}
              id="cache-max"
              label={local(d, "times.maxEntries")}
              value={tuning.maxEntries}
              options={choices.maxEntries}
              unit="pages"
              def={defaults["cache.tuning"].maxEntries}
              disabled={ro}
              onChange={(maxEntries) => setTuning({ maxEntries })}
            />
            <Choice
              d={d}
              id="cache-repeat"
              label={local(d, "times.repeat")}
              value={tuning.repeatSeconds}
              options={choices.repeatSeconds}
              unit="seconds"
              def={defaults["cache.tuning"].repeatSeconds}
              disabled={ro}
              onChange={(repeatSeconds) => setTuning({ repeatSeconds })}
            />
            <Choice
              d={d}
              id="cache-days"
              label={local(d, "times.statsDays")}
              value={tuning.statsDays}
              options={choices.statsDays}
              unit="days"
              def={defaults["cache.tuning"].statsDays}
              disabled={ro}
              onChange={(statsDays) => setTuning({ statsDays })}
            />
          </div>
        </details>
        {canWrite ? (
          <div className="a2-gap8 a2-mt12">
            <button
              type="button"
              className="a2-btn pri"
              onClick={save}
              disabled={busy}
              aria-busy={busy || undefined}
              data-testid="cache-save"
            >
              {local(d, busy ? "times.saving" : "times.save")}
            </button>
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12">{local(d, "times.readOnly")}</p>
        )}
        {note ? (
          <div
            className={`a2-note${note.ok ? "" : " bad"} a2-mt12`}
            role={note.ok ? "status" : "alert"}
            data-testid="cache-note"
          >
            <ShellIcon name={note.ok ? "check" : "alert"} size={15} />
            <span>{note.text}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** "Clear all" and its [confirm] dialog. */
export function ClearAllButton({ d }: { d: Dict }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="a2-btn"
        onClick={() => setOpen(true)}
        data-testid="cache-clear"
      >
        <ShellIcon name="refresh" size={15} />
        {local(d, "clearAll")}
      </button>
      {done ? (
        <span
          className="a2-xs a2-mute"
          role="status"
          data-testid="cache-cleared"
        >
          {done}
        </span>
      ) : null}
      {open ? (
        <ConfirmDialog
          testId="dlg-cache-clear"
          texts={{
            title: local(d, "clear.title"),
            effects: ["pages", "slow", "cdn", "safe"].map((k) =>
              local(d, `clear.effects.${k}`),
            ),
            reason: local(d, "clear.reason"),
            cancel: local(d, "clear.cancel"),
            ok: local(d, "clear.ok"),
            working: local(d, "clear.working"),
            close: local(d, "clear.close"),
          }}
          onClose={() => setOpen(false)}
          onConfirm={async (reason) => {
            const a = await call(
              "POST",
              "/api/admin/cache/clear",
              reason ? { reason } : {},
            );
            if (a.status !== 200 || !a.data.ok)
              return errorText((d.cache ?? {}) as Dict, a);
            const cdn = a.data.cdn as { ok: boolean } | null;
            setDone(local(d, cdn && !cdn.ok ? "clear.doneCdn" : "clear.done"));
            setOpen(false);
            router.refresh();
            return null;
          }}
        />
      ) : null}
    </>
  );
}
