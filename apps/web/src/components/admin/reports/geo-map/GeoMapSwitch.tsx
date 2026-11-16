"use client";
// S29 · PR 753 — the button of the "Geography map is off" card: it switches the map on through the setting route of PR 752
// (`settings.write`, audited there). Only drawn for a person who holds that permission; the server checks it again.
import { useState } from "react";

export function GeoMapSwitch({ label, failed }: { label: string; failed: string }) {
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  async function turnOn() {
    setBusy(true);
    setBad(false);
    try {
      const card = await fetch("/api/admin/reports/geo-map/setting").then((r) => r.json());
      const r = await fetch("/api/admin/reports/geo-map/setting", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: true, version: card?.card?.version }),
      });
      if (r.ok) window.location.reload();
      else setBad(true);
    } catch {
      setBad(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" className="a2-btn pri cr-tap" onClick={turnOn} disabled={busy} data-testid="geo-map-switch-on">
        {label}
      </button>
      {bad ? (
        <p className="a2-xs bk-warn" role="alert">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
