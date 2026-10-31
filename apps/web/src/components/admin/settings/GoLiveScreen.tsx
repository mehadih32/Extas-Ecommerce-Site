"use client";
// S19 · PR 393 (CN-031) — Settings → System → Go-live: the checklist before real orders. Automatic items say what the
// server and the shop's records show; items a person checks have "Confirm" (permission `system.golive`, the API checks
// again) and say who confirmed them and when; the owner's own steps are shown as his. Every word is from
// messages/admin-golive.<lang>.json; the rows come from lib/go-live.ts.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call, errorText } from "@/components/admin/api";
import { dateTime } from "@/components/admin/stock/text";
import { t, type Dict } from "@/lib/i18n";
import type { GoLiveResult } from "@/lib/go-live";
import { ShellIcon } from "../shell/ShellIcon";

export interface GoLiveView {
  ready: boolean;
  done: number;
  total: number;
  items: GoLiveResult[];
  people: Record<string, string>;
}

const API = "/api/admin/go-live";

const local = (
  d: Dict,
  key: string,
  vars: Record<string, string | number> = {},
) => t(d, `golive.${key}`, vars);

export function GoLiveList({
  d,
  locale,
  timeZone,
  initial,
  canSign,
}: {
  d: Dict;
  locale: string;
  timeZone: string;
  initial: GoLiveView;
  canSign: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const when = (iso: string) => dateTime(iso, locale, timeZone);

  const sign = async (key: string, done: boolean) => {
    setBusy(key);
    setNote(null);
    const a = await call("POST", `${API}/signoff`, { key, done });
    setBusy(null);
    if (a.status === 200 && a.data.ok) {
      setView(a.data as unknown as GoLiveView);
      router.refresh();
      return;
    }
    setNote(errorText((d.golive ?? {}) as Dict, a));
  };

  const foot = (i: GoLiveResult) => {
    if (i.kind === "signoff" && i.ok && i.at)
      return local(d, "confirmedBy", {
        name: (i.by && view.people[i.by]) || local(d, "someone"),
        at: when(i.at),
      });
    if (i.kind === "auto" && i.ok)
      return [local(d, `item.${i.key}.ok`, i.vars ?? {}), i.at ? local(d, "lastAt", { at: when(i.at) }) : ""]
        .filter(Boolean)
        .join(" · ");
    return local(d, `item.${i.key}.how`, i.vars ?? {});
  };

  return (
    <section
      className="a2-card a2-mt12"
      aria-labelledby="gl-list"
      data-testid="gl-list"
      data-ready={view.ready ? "yes" : "no"}
    >
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3" id="gl-list">
            {local(d, "listTitle")}
          </h2>
          <div className="a2-cs">
            {local(d, "progress", { done: view.done, total: view.total })}
          </div>
        </div>
        <span className={`a2-pill ${view.ready ? "ok" : "warn"}`}>
          {local(d, view.ready ? "ready" : "notReady", {
            n: view.total - view.done,
          })}
        </span>
      </div>
      {note ? (
        <div className="a2-note bad" role="alert" data-testid="gl-note">
          <ShellIcon name="alert" size={15} />
          <span>{note}</span>
        </div>
      ) : null}
      {view.items.map((i) => (
        <div
          key={i.key}
          className="a2-rule"
          data-testid={`gl-${i.key}`}
          data-ok={i.ok ? "yes" : "no"}
        >
          <span>
            <b className="a2-blk">
              {local(d, `item.${i.key}.title`)}{" "}
              <span className="a2-xs a2-mute">
                · {local(d, `kind.${i.kind}`)} · PR {i.pr}
              </span>
            </b>
            <span className="a2-xs a2-mute">{foot(i)}</span>
          </span>
          {i.kind === "signoff" && canSign ? (
            <button
              type="button"
              className={`a2-btn sm${i.ok ? " ghost" : ""}`}
              onClick={() => sign(i.key, !i.ok)}
              disabled={busy !== null}
              aria-busy={busy === i.key || undefined}
              data-testid={`gl-sign-${i.key}`}
            >
              {local(d, i.ok ? "undo" : "confirm")}
            </button>
          ) : null}
          <span className={`a2-pill ${i.ok ? "ok" : "line"}`}>
            {local(d, i.ok ? "ok" : "todo")}
          </span>
        </div>
      ))}
      {!canSign ? (
        <p className="a2-xs a2-mute a2-mt12">{local(d, "readOnly")}</p>
      ) : null}
    </section>
  );
}
