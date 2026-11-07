"use client";
// S14 · PR 295 — one review's buttons on Products › Reviews: publish, hide, refuse, back to the queue, and the verified
// mark. Each calls the reviews API (PR 65), which checks `reviews.moderate` again; publishing a photo review pays the
// owner's photo reward only while he has switched it on with his own amount, and the answer says what went to the
// wallet. Shown only to someone with `reviews.moderate`. PR 635 (CN-036): the words after a button worked are the
// admin's one toast (showToast); a refusal stays beside the buttons. No Undo here: publishing can pay the photo reward
// (money), so it is never taken back by a toast.
// Follow-up 233: the shop's public reply — a box to write, change or take off the reply (POST …/:id/reply); it shows
// under the review on the product page only while the owner has "The shop's reply" on (More options).
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { showToast } from "@/components/admin/lumen/Toast";
import { t, type Dict } from "@/lib/i18n";

type State = "PENDING" | "APPROVED" | "HIDDEN" | "REJECTED";
type Action = "approve" | "hide" | "reject" | "restore";

/** The moves that make sense from each state (the API itself allows any). */
export const ACTIONS: Record<State, Action[]> = {
  PENDING: ["approve", "hide", "reject"],
  APPROVED: ["hide"],
  HIDDEN: ["approve", "restore"],
  REJECTED: ["restore"],
};

export interface ReviewActionsProps {
  dict: Dict;
  id: string;
  state: State;
  verified: boolean;
  /** The store's money format for the reward line. */
  currency: string;
  locale: string;
  /** Follow-up 233: the shop's public reply now (null: none). */
  reply?: string | null;
  /** The longest reply. */
  replyMax?: number;
}

export function ReviewActions({
  dict: d,
  id,
  state,
  verified,
  currency,
  locale,
  reply = null,
  replyMax = 1000,
}: ReviewActionsProps) {
  const router = useRouter();
  const uid = useId();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState(reply ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const money = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      numberingSystem: "latn",
    }).format(minor / 100);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/${path}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        error?: string;
        reward?: { amountMinor: number } | null;
      };
      if (!data.ok)
        return setMsg({
          ok: false,
          text: t(d, "rev.act.failed", {
            code: data.error ?? String(res.status),
          }),
        });
      showToast({
        text: data.reward
          ? t(d, "rev.act.paid", { amount: money(data.reward.amountMinor) })
          : t(d, "rev.act.saved"),
        tone: "ok",
      });
      if (path === "reply") setReplyOpen(false);
      router.refresh();
    } catch {
      setMsg({ ok: false, text: t(d, "rev.act.failed", { code: "network" }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {replyOpen ? (
        <div className="lm-fl rev-reply" data-testid="review-reply-box">
          <label htmlFor={`${uid}-r`}>{t(d, "rev.reply.label")}</label>
          <textarea
            id={`${uid}-r`}
            className="lm-inp"
            rows={3}
            maxLength={replyMax}
            value={replyText}
            placeholder={t(d, "rev.reply.ph")}
            disabled={busy}
            onChange={(e) => setReplyText(e.target.value)}
            data-testid="review-reply-text"
          />
          <div className="rev-acts">
            <button
              type="button"
              className="a2-btn pri"
              disabled={
                busy ||
                !replyText.trim() ||
                replyText.trim() === (reply ?? "").trim()
              }
              onClick={() => post("reply", { reply: replyText })}
              data-action="reply-save"
            >
              {t(d, "rev.reply.save")}
            </button>
            {reply ? (
              <button
                type="button"
                className="a2-btn"
                disabled={busy}
                onClick={() => post("reply", { reply: null })}
                data-action="reply-off"
              >
                {t(d, "rev.reply.off")}
              </button>
            ) : null}
            <button
              type="button"
              className="a2-btn"
              disabled={busy}
              onClick={() => {
                setReplyOpen(false);
                setReplyText(reply ?? "");
              }}
              data-action="reply-cancel"
            >
              {t(d, "rev.reply.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      <div className="rev-acts" data-testid="review-actions">
        {ACTIONS[state].map((a) => (
          <button
            key={a}
            type="button"
            className={`a2-btn${a === "approve" ? " pri" : ""}`}
            disabled={busy}
            onClick={() => post("moderate", { action: a })}
            data-action={a}
          >
            {t(d, `rev.act.${a}`)}
          </button>
        ))}
        <button
          type="button"
          className="a2-btn"
          disabled={busy}
          onClick={() => post("verified", { verified: !verified })}
          data-action={verified ? "unverify" : "verify"}
        >
          {t(d, verified ? "rev.act.unverify" : "rev.act.verify")}
        </button>
        {!replyOpen ? (
          <button
            type="button"
            className="a2-btn"
            disabled={busy}
            onClick={() => setReplyOpen(true)}
            data-action="reply"
          >
            {t(d, reply ? "rev.reply.edit" : "rev.reply.write")}
          </button>
        ) : null}
        {msg ? (
          <p
            className="a2-xs"
            role={msg.ok ? "status" : "alert"}
            style={msg.ok ? undefined : { color: "var(--bad)" }}
          >
            {msg.text}
          </p>
        ) : null}
      </div>
    </>
  );
}
