"use client";
// PR 992: the prototype's layout (a select and a hint for each way; Save with the owner's PIN); the accounts list and the days sit in More options.
// PR 817 (prototype v5 Payments › "Where the money lands") — the owner's accounts (one a line) and, for bKash, Nagad, card and cash from
// couriers, which account the money settles into and in how many working days. Saved with one Save button through
// `PUT /api/admin/settings/settlement` (an owner only, through the settings history). A note the books read: it moves no money.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "../api";
import { showToast } from "../lumen/Toast";
import "./settlement.css";

const WAYS = ["bkash", "nagad", "card", "cod"] as const;
type Way = (typeof WAYS)[number];
export interface SettleValue {
  accounts: string[];
  bkash: { account: string; days: number };
  nagad: { account: string; days: number };
  card: { account: string; days: number };
  cod: { account: string; days: number };
}

export function SettlementCard({
  value,
  canEdit,
  texts: x,
}: {
  value: SettleValue;
  canEdit: boolean;
  texts: Record<string, string>;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(value.accounts.join("\n"));
  const [ways, setWays] = useState<
    Record<Way, { account: string; days: string }>
  >({
    bkash: { account: value.bkash.account, days: String(value.bkash.days) },
    nagad: { account: value.nagad.account, days: String(value.nagad.days) },
    card: { account: value.card.account, days: String(value.card.days) },
    cod: { account: value.cod.account, days: String(value.cod.days) },
  });
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const list = Array.from(
    new Set(
      accounts
        .split("\n")
        .map((a) => a.trim())
        .filter(Boolean),
    ),
  );
  const set = (w: Way, patch: Partial<{ account: string; days: string }>) =>
    setWays((s) => ({ ...s, [w]: { ...s[w], ...patch } }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const body = {
      pin,
      accounts: list,
      ...Object.fromEntries(
        WAYS.map((w) => [
          w,
          {
            account: list.includes(ways[w].account) ? ways[w].account : "",
            days: Number(ways[w].days) || 0,
          },
        ]),
      ),
    };
    const a = await call("PUT", "/api/admin/settings/settlement", body);
    setBusy(false);
    if (a.data.ok) {
      showToast({ text: x.saved ?? "", tone: "ok" });
      setPin("");
      router.refresh();
      return;
    }
    const code = typeof a.data.error === "string" ? a.data.error : "";
    showToast({ text: x[code] ?? x.failed ?? "", tone: "bad" });
  };

  const hint = (w: Way) =>
    w === "cod"
      ? x.daysCod
      : (x.daysN ?? "").replace("{n}", String(Number(ways[w].days) || 0));
  return (
    <section
      className="a2-card a2-mt12"
      data-testid="ck-settle"
      aria-labelledby="ck-settle-h"
    >
      <h2 className="a2-h3" id="ck-settle-h">
        {x.h}
      </h2>
      <div className="ck-settle-grid a2-mt12">
        {WAYS.map((w) => (
          <div className="ck-settle-way" key={w} data-testid={`ck-settle-${w}`}>
            <label htmlFor={`ck-settle-acc-${w}`}>
              <b>{x[w]}</b>
            </label>
            <select
              id={`ck-settle-acc-${w}`}
              className="a2-sel"
              value={list.includes(ways[w].account) ? ways[w].account : ""}
              disabled={!canEdit || busy}
              onChange={(e) => set(w, { account: e.target.value })}
            >
              <option value="">{x.pick}</option>
              {list.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <span className="a2-xs a2-mute">{hint(w)}</span>
          </div>
        ))}
      </div>
      <details
        className="st-more ck-settle-more a2-mt12"
        data-testid="ck-settle-more"
      >
        <summary>{x.more}</summary>
        <p className="a2-sm a2-mute">{x.d}</p>
        <label className="a2-sm a2-blk a2-mt12" htmlFor="ck-settle-accounts">
          {x.accounts}
        </label>
        <textarea
          id="ck-settle-accounts"
          className="a2-inp"
          rows={4}
          placeholder={x.accountsPh}
          value={accounts}
          disabled={!canEdit || busy}
          onChange={(e) => setAccounts(e.target.value)}
          data-testid="ck-settle-accounts"
        />
        <div className="ck-settle-grid a2-mt12">
          {WAYS.map((w) => (
            <div className="ck-settle-way" key={w}>
              <label className="a2-xs a2-mute" htmlFor={`ck-settle-days-${w}`}>
                {x[w]}: {w === "cod" ? x.daysCod : x.days}
              </label>
              <input
                id={`ck-settle-days-${w}`}
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                className="a2-inp"
                value={ways[w].days}
                disabled={!canEdit || busy}
                onChange={(e) => set(w, { days: e.target.value })}
                data-testid={`ck-settle-days-${w}`}
              />
            </div>
          ))}
        </div>
      </details>
      <div className="ck-settle-foot a2-mt12">
        <span className="a2-xs a2-mute">{canEdit ? x.note : x.readOnly}</span>
        {canEdit ? (
          <span className="ck-settle-save">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className="a2-inp"
              aria-label={x.pin}
              placeholder={x.pin}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              data-testid="ck-settle-pin"
            />
            <button
              type="button"
              className="a2-btn pri"
              disabled={busy || !pin}
              onClick={() => void save()}
              data-testid="ck-settle-save"
            >
              {x.save}
            </button>
          </span>
        ) : null}
      </div>
    </section>
  );
}
