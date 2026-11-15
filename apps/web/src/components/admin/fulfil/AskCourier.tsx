"use client";
// PR 827 (prototype v5, Orders › With courier) — "Ask courier" (a parcel the courier's pickup report does not list, or
// one that has not moved) and "Ask to send back" (a cancelled order whose parcel is still booked). A person presses it;
// the ask is written on the order's timeline and in the audit log with the courier and the consignment id. Nothing is
// sent to the courier by this button, nothing is cancelled and no parcel or money moves.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "@/components/admin/api";
import { showToast } from "@/components/admin/lumen/Toast";
import { fulError } from "@/lib/admin-fulfil/words";
import { t, type Dict } from "@/lib/i18n";

export function AskCourier({
  dict,
  url,
  orderId,
  kind,
  testId,
}: {
  dict: Dict;
  url: string;
  orderId: string;
  kind: "missing" | "stuck" | "sendBack";
  testId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const a = await call("POST", url, { orderId, kind });
    setBusy(false);
    if (!a.data.ok) {
      showToast({
        text:
          a.status === 0
            ? fulError(dict, "network")
            : fulError(dict, a.data.error, (a.data.details ?? []).join(", ")),
        tone: "bad",
      });
      return;
    }
    showToast({
      text: t(dict, "ful.withCourier.ask.done", {
        courier: String(a.data.courierName ?? ""),
        id: String(a.data.consignmentId ?? "-"),
      }),
      tone: "ok",
    });
    router.refresh();
  };
  return (
    <button
      type="button"
      className="a2-btn sm"
      onClick={go}
      disabled={busy}
      data-testid={testId ?? "ask-courier"}
    >
      {t(dict, kind === "sendBack" ? "ful.withCourier.ask.sendBack" : "ful.withCourier.ask.courier")}
    </button>
  );
}
