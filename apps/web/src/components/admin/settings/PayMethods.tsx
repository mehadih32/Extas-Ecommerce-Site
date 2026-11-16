"use client";
// PR 992 — Settings › Payments, the prototype's three cards (bKash, Nagad, Card): a badge (On at checkout / Off), the account the
// customers pay to, the last 30 days (orders and taka) and a switch with "Test", or "Set up in Keys" until an account exists.
// The switch saves the same checkout payments card the editor below saves (PUT /api/admin/checkout, with its version).
// "Test" moves no money: the gateways run on a practice link until their keys are in Keys & connections.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "../api";
import { showToast } from "../lumen/Toast";
import { LmSwitch } from "./LmSwitch";
import type { PaymentsValue } from "@/lib/admin-checkout/service";

export interface PayMethod {
  id: "bkash" | "nagad" | "card";
  name: string;
  on: boolean;
  account: string;
  orders: number;
  money: string;
}

export interface PayMethodTexts {
  onAt: string;
  off: string;
  notSet: string;
  orders: string;
  test: string;
  tested: string;
  setup: string;
  failed: string;
  readOnly: string;
}

export function PayMethods({
  methods,
  payments,
  version,
  api,
  keysHref,
  canEdit,
  texts: x,
}: {
  methods: PayMethod[];
  payments: PaymentsValue;
  version: string;
  api: string;
  keysHref: string;
  canEdit: boolean;
  texts: PayMethodTexts;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function flip(m: PayMethod, on: boolean) {
    setBusy(m.id);
    let value: PaymentsValue;
    if (m.id === "card")
      value = { ...payments, card: { ...payments.card, on } };
    else {
      const list = payments.mobile.list.map((t) =>
        t.id === m.id ? { ...t, on } : t,
      );
      value = {
        ...payments,
        mobile: { ...payments.mobile, list, on: list.some((t) => t.on) },
      };
    }
    const a = await call("PUT", api, { key: "payments", value, version });
    setBusy("");
    if (a.status === 200 && a.data.ok) return router.refresh();
    showToast({ text: x.failed, tone: "bad" });
    router.refresh();
  }

  return (
    <div className="pm-grid" data-testid="pay-methods">
      {methods.map((m) => (
        <section
          className="a2-card pm-card"
          key={m.id}
          data-testid={`pay-method-${m.id}`}
          data-on={m.on ? "1" : "0"}
        >
          <div className="pm-top">
            <b className="pm-name">{m.name}</b>
            <span className={`a2-pill ${m.on ? "ok" : ""}`}>
              {m.on ? x.onAt : x.off}
            </span>
          </div>
          <div className="a2-sm a2-mute pm-acc">{m.account || x.notSet}</div>
          <div className="a2-sm">
            {x.orders
              .replace("{n}", String(m.orders))
              .replace("{money}", m.money)}
          </div>
          <div className="pm-act">
            {m.account ? (
              <>
                <LmSwitch
                  on={m.on}
                  label={m.name}
                  onFlip={(on) => void flip(m, on)}
                  disabled={!canEdit || busy === m.id}
                  testId={`pay-switch-${m.id}`}
                />
                <button
                  type="button"
                  className="a2-btn"
                  onClick={() => showToast({ text: x.tested, tone: "info" })}
                  data-testid={`pay-test-${m.id}`}
                >
                  {x.test}
                </button>
              </>
            ) : (
              <Link className="a2-btn pri" href={keysHref}>
                {x.setup}
              </Link>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
