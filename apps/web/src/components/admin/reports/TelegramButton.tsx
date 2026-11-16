"use client";
// S28 · PR 735 — "Send to Telegram" on Reports › Monthly review: runs the owner's own monthly digest (POST
// /api/admin/reports/analytics/digest {kind:'monthly'}, `reports.analytics.write`), which goes only to the owner's Telegram and only when
// the owner switched Telegram on in the digest settings. Without the key the button is disabled and says why. Nothing goes to a customer.
import { useState } from "react";

export interface TelegramTexts {
  label: string;
  sending: string;
  sent: string;
  skipped: string;
  failed: string;
}

export function TelegramButton({
  texts: x,
  disabledReason,
  testId,
  message,
}: {
  /** The message to send (PR 891: the monthly review as the page shows it). */
  message?: string;
  texts: TelegramTexts;
  disabledReason: string | null;
  testId: string;
}) {
  const [state, setState] = useState<
    "idle" | "busy" | "sent" | "skipped" | "failed"
  >("idle");
  const run = async () => {
    setState("busy");
    try {
      // PR 891: with a `message` the button sends that (the review the page shows); without it, the monthly digest as before.
      const res = await fetch(
        message
          ? "/api/admin/reports/review/telegram"
          : "/api/admin/reports/analytics/digest",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            message ? { text: message } : { kind: "monthly" },
          ),
        },
      );
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        sent?: { telegram?: string };
      } | null;
      setState(
        !res.ok || !j?.ok
          ? "failed"
          : j.sent?.telegram === "sent"
            ? "sent"
            : j.sent?.telegram === "failed"
              ? "failed"
              : "skipped",
      );
    } catch {
      setState("failed");
    }
  };
  return (
    <>
      <button
        type="button"
        className="a2-btn cr-tap"
        disabled={!!disabledReason || state === "busy"}
        title={disabledReason ?? undefined}
        onClick={run}
        data-testid={testId}
      >
        {state === "busy" ? x.sending : x.label}
      </button>
      {disabledReason ? (
        <span className="a2-xs a2-mute" data-testid={`${testId}-why`}>
          {disabledReason}
        </span>
      ) : state !== "idle" && state !== "busy" ? (
        <span
          className="a2-xs a2-mute"
          role="status"
          data-testid={`${testId}-result`}
        >
          {x[state]}
        </span>
      ) : null}
    </>
  );
}
