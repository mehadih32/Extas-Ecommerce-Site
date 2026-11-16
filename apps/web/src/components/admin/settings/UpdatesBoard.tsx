"use client";
// D10 · PR 1006 — Settings › Updates, the parts of prototype v5's page that act: the "Install updates by themselves" switch (the setting
// `updates.auto`, saved at once through /api/admin/system-settings), "Check for updates" (reads the server's state again) and
// "Go back to previous version" (the server does this by itself when a check fails; a manual rollback is not offered here, so the button says so).
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { call } from "@/components/admin/api";
import { showToast } from "@/components/admin/lumen/Toast";
import { LmSwitch } from "./LmSwitch";

type W = Record<string, string>;

export function UpdatesHow({ w, auto, canEdit }: { w: W; auto: boolean; canEdit: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [on, setOn] = useState(auto);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(false);
  const flip = async (next: boolean) => {
    setOn(next);
    setBusy(true);
    const a = await call("POST", "/api/admin/system-settings", { action: "updatesAuto", auto: next });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      showToast({ text: w["saved"]!, tone: "ok" });
      router.refresh();
    } else {
      setOn(auto);
      showToast({ text: w["err"]!, tone: "bad" });
    }
  };
  return (
    <section className="a2-card" aria-labelledby={`${uid}-h`} data-testid="up-how">
      <h2 className="a2-h3" id={`${uid}-h`}>
        {w["h"]}
      </h2>
      <div className="s28-row between a2-mt12" style={{ flexWrap: "nowrap", alignItems: "center" }}>
        <div className="s28-grow">
          <b>{w["auto"]}</b>
          <div className="a2-xs a2-mute">{w["autoSub"]}</div>
        </div>
        <LmSwitch testId="up-auto" on={on} label={w["auto"]!} disabled={!canEdit || busy} onFlip={flip} />
      </div>
      <div className="s28-row a2-mt12">
        <button
          type="button"
          className="a2-btn"
          data-testid="up-check"
          onClick={() => {
            router.refresh();
            showToast({ text: w["checked"]!, tone: "ok" });
          }}
        >
          {w["check"]}
        </button>
        <button type="button" className="a2-btn" data-testid="up-back" aria-expanded={note} onClick={() => setNote((x) => !x)}>
          {w["back"]}
        </button>
      </div>
      {note ? (
        <p className="a2-sm a2-mute a2-mt12" data-testid="up-back-note">
          {w["backNote"]}
        </p>
      ) : null}
    </section>
  );
}
