"use client";
// PR 863 (prototype v5 Reports › Products, "Send N to ERP reorder list"): the button under the restock list. It asks first (a small
// window: what will be sent), then saves a reorder request through POST /api/admin/reports/reorder (`inventory.erp`). Nothing is
// bought and nothing goes to a supplier from here.
import { useId, useRef, useState } from "react";
import { call } from "../api";
import { showToast } from "../lumen/Toast";

export interface ReorderTexts {
  /** Has `{n}`. */
  button: string;
  title: string;
  /** Has `{n}`. */
  body: string;
  confirm: string;
  cancel: string;
  /** Has `{n}`. */
  done: string;
  failed: string;
}

export function ReorderButton({
  ids,
  texts,
}: {
  ids: string[];
  texts: ReorderTexts;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const n = ids.length;
  const fill = (s: string, v: number) => s.replace("{n}", String(v));

  async function send() {
    setBusy(true);
    setBad(false);
    const a = await call("POST", "/api/admin/reports/reorder", {
      productIds: ids,
    });
    setBusy(false);
    if (a.status >= 200 && a.status < 300 && a.data.ok) {
      dlg.current?.close();
      showToast({
        text: fill(texts.done, Number(a.data.queued ?? n)),
        tone: "ok",
      });
    } else setBad(true);
  }

  return (
    <>
      <button
        type="button"
        className="a2-btn pri cr-tap"
        data-testid="rp-reorder"
        disabled={n === 0}
        onClick={() => dlg.current?.showModal()}
      >
        {fill(texts.button, n)}
      </button>
      <dialog
        ref={dlg}
        className="rp-dlg"
        aria-labelledby={`${uid}t`}
        data-testid="rp-reorder-dialog"
        onClose={() => setBad(false)}
      >
        <h3 id={`${uid}t`}>{texts.title}</h3>
        <p className="a2-sm">{fill(texts.body, n)}</p>
        {bad ? (
          <p className="rp-dlg-err" role="alert">
            {texts.failed}
          </p>
        ) : null}
        <div className="rp-dlg-foot">
          <button
            type="button"
            className="a2-btn cr-tap"
            onClick={() => dlg.current?.close()}
          >
            {texts.cancel}
          </button>
          <button
            type="button"
            className="a2-btn pri cr-tap"
            disabled={busy}
            data-testid="rp-reorder-confirm"
            onClick={() => void send()}
          >
            {texts.confirm}
          </button>
        </div>
      </dialog>
    </>
  );
}
