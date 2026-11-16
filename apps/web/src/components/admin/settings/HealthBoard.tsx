"use client";
// D10 · PR 1005 — Settings › Site health, the parts of prototype v5's page (m-settings.js `renderHealth`) that act:
// "AI Diagnose" (a plain check of what the server already knows, written out; with AI off it says it is the rule-based check),
// "Optimise now" (opens Cache & speed, where the saved pages are refreshed), and the "Alerts & checks" card (the Telegram alert
// switch and how often the full health and audit check runs; the setting `health.checks`, saved at once, through
// /api/admin/system-settings). Nothing here changes a product, a price or an order.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { call, type Answer } from "@/components/admin/api";
import { showToast } from "@/components/admin/lumen/Toast";
import { LmSwitch } from "./LmSwitch";
import { ShellIcon } from "../shell/ShellIcon";

type W = Record<string, string>;
const problem = (w: W, a: Answer) => w["err"] ?? String(a.data.error ?? "");

export function HealthHeadActions({ w, optimiseHref, diagnosis }: { w: W; optimiseHref: string; diagnosis: { aiOff: boolean; problems: number } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="a2-btn" onClick={() => setOpen((x) => !x)} aria-expanded={open} data-testid="hl-diag">
        <ShellIcon name="spark" size={14} />
        {w["ai"]}
      </button>
      <Link className="a2-btn pri" href={optimiseHref} data-testid="hl-opt">
        <ShellIcon name="refresh" size={14} />
        {w["optimiseNow"]}
      </Link>
      {open ? (
        <section className="a2-card a2-mt12" role="region" aria-label={w["diag.h"]} data-testid="hl-diag-panel" style={{ flexBasis: "100%" }}>
          <h2 className="a2-h3">{w["diag.h"]}</h2>
          {diagnosis.aiOff ? (
            <div className="a2-note a2-mt6">
              <ShellIcon name="alert" size={15} />
              <span>{w["diag.off"]}</span>
            </div>
          ) : null}
          <p className="a2-sm a2-mt12">
            <b>{w["diag.checked"]}</b>
            <br />
            {w["diag.checkedText"]}
          </p>
          <p className="a2-sm a2-mt6">
            <b>{w["diag.finding"]}</b>
            <br />
            {diagnosis.problems ? w["diag.problems"]!.replace("{n}", String(diagnosis.problems)) : w["diag.healthy"]}
          </p>
          <button type="button" className="a2-btn sm a2-mt12" onClick={() => setOpen(false)}>
            {w["diag.close"]}
          </button>
        </section>
      ) : null}
    </>
  );
}

export function HealthAlertsCard({ w, telegram, audit, options, canEdit }: { w: W; telegram: boolean; audit: string; options: readonly string[]; canEdit: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [tg, setTg] = useState(telegram);
  const [au, setAu] = useState(audit);
  const [busy, setBusy] = useState(false);
  const save = async (next: { tg: boolean; au: string }) => {
    setBusy(true);
    const a = await call("POST", "/api/admin/system-settings", { action: "healthChecks", telegramAlerts: next.tg, auditEvery: next.au });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      showToast({ text: w["saved"]!, tone: "ok" });
      router.refresh();
    } else {
      setTg(telegram);
      setAu(audit);
      showToast({ text: problem(w, a), tone: "bad" });
    }
  };
  return (
    <section className="a2-card" aria-labelledby={`${uid}-h`} data-testid="hl-alerts">
      <h2 className="a2-h3" id={`${uid}-h`}>
        {w["alerts.h"]}
      </h2>
      <div className="s28-row between a2-mt12" style={{ flexWrap: "nowrap", alignItems: "center" }}>
        <div className="s28-grow">
          <b>{w["alerts.telegram"]}</b>
          <div className="a2-xs a2-mute">{w["alerts.telegramSub"]}</div>
        </div>
        <LmSwitch
          testId="hl-telegram"
          on={tg}
          label={w["alerts.telegram"]!}
          disabled={!canEdit || busy}
          onFlip={async (next) => {
            setTg(next);
            await save({ tg: next, au });
          }}
        />
      </div>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor={`${uid}-a`}>
          {w["alerts.audit"]}
        </label>
        <select
          id={`${uid}-a`}
          className="a2-sel"
          value={au}
          disabled={!canEdit || busy}
          onChange={(e) => {
            setAu(e.target.value);
            void save({ tg, au: e.target.value });
          }}
          data-testid="hl-audit"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {w[`alerts.${o}`]}
            </option>
          ))}
        </select>
        <span className="a2-def a2-blk">{w["alerts.sub"]}</span>
      </div>
    </section>
  );
}
