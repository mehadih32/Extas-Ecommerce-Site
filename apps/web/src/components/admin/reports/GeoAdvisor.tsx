"use client";
// S29 · PR 761 (CN-054) — Reports › Geography map: the AI advisor's box. It asks `GET /api/admin/reports/geo-map/advisor` where
// the advisor stands (no AI call), shows the drafts waiting in the approval queue, and has one "Run advisor" button that does
// `POST …/advisor` for the period on screen. No geo-specific switch (owner's decision 16 Nov 2026): the one gate is the global AI control (`ai.enabled`, off as shipped);
// while it is off this says so in words and the button is not drawn. Advice only: a draft asks a person to decide, and approving
// it changes nothing. Running needs the AI control permission (checked again on the server).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AdvisorApiResponse } from "@/lib/geo-map/advisor-api";
import "./geo-slices.css";
import "./geo-lens.css";

export interface GeoAdvisorLabels {
  title: string;
  sub: string;
  run: string;
  running: string;
  off: string;
  aiOff: string;
  needControl: string;
  ready: string;
  /** Template: {drafted} {waiting} {over} {nonote}. */
  result: string;
  draftsTitle: string;
  noDrafts: string;
  /** Template: {date}. */
  expires: string;
  queue: string;
  failed: string;
}

type Drafts = Extract<AdvisorApiResponse, { ok: true }>["drafts"];
type State =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "error" }
  | { kind: "ok"; status: "ready" | "aiOff"; drafts: Drafts; result: string | null };

export function GeoAdvisor({
  labels,
  period,
  lang,
  mayRun,
  fmtDate,
}: {
  labels: GeoAdvisorLabels;
  /** The period part of the screen's address (period, from, to), sent with a run. */
  period: string;
  lang: "en" | "bn";
  /** The viewer holds `ai.control` (the server checks it again). */
  mayRun: boolean;
  fmtDate: (iso: string) => string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/admin/reports/geo-map/advisor", { signal, headers: { accept: "application/json" } });
      const j = (await res.json()) as AdvisorApiResponse;
      if (j.ok) setState({ kind: "ok", status: j.status === "aiOff" ? "aiOff" : "ready", drafts: j.drafts, result: null });
      else if (j.status === "aiOff") setState({ kind: "ok", status: "aiOff", drafts: [], result: null });
      else setState({ kind: "off" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setState({ kind: "error" });
    }
  }, []);
  useEffect(() => {
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the advisor state is loaded when the box opens
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  async function run() {
    setBusy(true);
    try {
      const sp = new URLSearchParams(period);
      sp.set("lang", lang);
      const res = await fetch(`/api/admin/reports/geo-map/advisor?${sp}`, { method: "POST", headers: { accept: "application/json" } });
      const j = (await res.json()) as AdvisorApiResponse;
      if (j.ok && j.run) {
        const r = j.run;
        const text = labels.result
          .replace("{drafted}", String(r.drafted))
          .replace("{waiting}", String(r.alreadyWaiting))
          .replace("{over}", String(r.left.overCap))
          .replace("{nonote}", String(r.left.noNote));
        setState({ kind: "ok", status: "ready", drafts: j.drafts, result: text });
      } else if (!j.ok && j.status === "aiOff") setState({ kind: "ok", status: "aiOff", drafts: [], result: null });
      else setState({ kind: "error" });
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "off") {
    return (
      <section className="gst gadv" data-testid="geo-advisor" data-state="off">
        <h3 className="a2-h3">{labels.title}</h3>
        <p className="a2-xs a2-mute">{labels.off}</p>
      </section>
    );
  }
  return (
    <section className="gst gadv" data-testid="geo-advisor" data-state={state.kind === "ok" ? state.status : state.kind}>
      <h3 className="a2-h3">{labels.title}</h3>
      <p className="a2-xs a2-mute">{labels.sub}</p>
      {state.kind === "error" ? <p className="a2-xs" role="alert">{labels.failed}</p> : null}
      {state.kind === "ok" && state.status === "aiOff" ? <p className="a2-xs a2-mute">{labels.aiOff}</p> : null}
      {state.kind === "ok" && state.status === "ready" ? (
        <>
          {mayRun ? (
            <p>
              <button type="button" className="a2-btn pri" onClick={run} disabled={busy} data-testid="geo-advisor-run">
                {busy ? labels.running : labels.run}
              </button>{" "}
              <span className="a2-xs a2-mute">{labels.ready}</span>
            </p>
          ) : (
            <p className="a2-xs a2-mute">{labels.needControl}</p>
          )}
          {state.result ? <p className="a2-xs" role="status" data-testid="geo-advisor-result">{state.result}</p> : null}
          <h4 className="a2-h4">{labels.draftsTitle}</h4>
          {state.drafts.length === 0 ? (
            <p className="a2-xs a2-mute" data-testid="geo-advisor-none">{labels.noDrafts}</p>
          ) : (
            <ul className="gst-gaps" data-testid="geo-advisor-drafts">
              {state.drafts.map((d) => (
                <li key={d.id}>
                  <b>{d.title}</b>
                  <br />
                  <span className="a2-xs">{d.note}</span>
                  {d.expiresAt ? (
                    <>
                      <br />
                      <span className="a2-xs a2-mute">{labels.expires.replace("{date}", fmtDate(d.expiresAt))}</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="a2-xs">
            <Link href="/admin/ai/approvals">{labels.queue}</Link>
          </p>
        </>
      ) : null}
    </section>
  );
}
