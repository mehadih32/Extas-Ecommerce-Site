"use client";
// S28 · PR 667 (O-25) — "Move to the backup courier" on a courier's card on the With courier page: how the old bookings were
// cancelled with the first courier (the panel or the phone: there is no cancel through a courier's API) and the owner's PIN,
// then the parcels that courier has not picked up are booked again with the owner's backup courier. The PIN is typed here,
// sent once and never kept; every refusal is shown in words from the page's messages.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { call } from "@/components/admin/api";
import { showToast } from "@/components/admin/lumen/Toast";
import { fulError } from "@/lib/admin-fulfil/words";
import { t, type Dict } from "@/lib/i18n";

export function CourierMove({
  dict,
  url,
  shipmentIds,
  backupName,
}: {
  dict: Dict;
  url: string;
  shipmentIds: string[];
  backupName: string;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [via, setVia] = useState<"panel" | "phone">("phone");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setMsg(null);
    const a = await call("POST", url, {
      shipmentIds,
      cancelledVia: via,
      pin: pin.trim() || undefined,
    });
    setBusy(false);
    setPin("");
    if (!a.data.ok) {
      setMsg(
        a.status === 0
          ? fulError(dict, "network")
          : fulError(dict, a.data.error, (a.data.details ?? []).join(", ")),
      );
      return;
    }
    const moved = Array.isArray(a.data.moved) ? a.data.moved.length : 0;
    const skipped = Array.isArray(a.data.skipped) ? a.data.skipped.length : 0;
    showToast({
      text: t(dict, "ful.move.done", { moved, skipped }),
      tone: "ok",
    });
    setOpen(false);
    router.refresh();
  };
  if (!open)
    return (
      <button
        type="button"
        className="a2-btn sm"
        onClick={() => setOpen(true)}
        data-testid="move-open"
      >
        {t(dict, "ful.move.open", { name: backupName })}
      </button>
    );
  return (
    <span className="a2-stack" style={{ gap: 6 }} data-testid="move-form">
      <p className="a2-xs a2-mute">
        {t(dict, "ful.move.note", { name: backupName })}
      </p>
      <label className="a2-xs a2-mute" htmlFor={`${id}-v`}>
        {t(dict, "ful.move.via")}
      </label>
      <select
        id={`${id}-v`}
        className="a2-sel"
        value={via}
        onChange={(e) => setVia(e.target.value === "panel" ? "panel" : "phone")}
      >
        <option value="phone">{t(dict, "ful.move.viaPhone")}</option>
        <option value="panel">{t(dict, "ful.move.viaPanel")}</option>
      </select>
      <label className="a2-xs a2-mute" htmlFor={`${id}-p`}>
        {t(dict, "ful.pin.label")}
      </label>
      <input
        id={`${id}-p`}
        className="a2-inp"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={20}
        value={pin}
        placeholder={t(dict, "ful.pin.placeholder")}
        onChange={(e) => setPin(e.target.value)}
        data-testid="move-pin"
      />
      <span className="a2-gap8">
        <button
          type="button"
          className="a2-btn sm pri"
          onClick={go}
          disabled={busy || !pin.trim()}
          data-testid="move-go"
        >
          {t(dict, "ful.move.go", { n: shipmentIds.length })}
        </button>
        <button
          type="button"
          className="a2-btn sm ghost"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          {t(dict, "ful.cancel")}
        </button>
      </span>
      {msg ? (
        <span className="a2-xs" role="alert" style={{ color: "var(--bad)" }}>
          {msg}
        </span>
      ) : null}
    </span>
  );
}
