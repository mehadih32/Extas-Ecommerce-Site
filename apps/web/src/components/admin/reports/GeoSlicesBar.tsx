"use client";
// S29 · PR 756 (CN-054) — Reports › Geography map: the slices in ONE filter bar. Every slice is drawn (no on/off
// switch, owner's decision 16 Nov 2026); each is a plain choice (channel, payment, courier, customer type) in a GET form,
// so the mix lives in the address and a view can keep it. A phone gets the same bar behind one "Filters (n)" button
// (a sheet that opens under it); a bigger screen shows it in a row. Category and product are the screen's own pickers:
// they are carried along untouched. No filter needs a script to work: the button only opens and closes the bar.
import Link from "next/link";
import { useState } from "react";
import type { GeoSlices } from "@extas/metrics/geo-types";
import { CHANNELS, ORDER_SLICE_KEYS, slicesToParams, type SliceKey } from "@extas/metrics/geo-slices-pure";
import "./geo-slices.css";

export interface GeoSlicesLabels {
  aria: string;
  toggle: string;
  toggleN: (n: number) => string;
  apply: string;
  clear: string;
  note: string;
  channel: { label: string; any: string; names: Record<string, string> };
  payment: { label: string; any: string; COD: string; ONLINE: string };
  courier: { label: string; any: string };
  customer: { label: string; any: string; NEW: string; REPEAT: string };
}

export function GeoSlicesBar({
  shown,
  slices,
  couriers,
  base,
  path,
  labels,
}: {
  /** The slices the setting switches on (the others are not drawn). */
  shown: readonly SliceKey[];
  slices: GeoSlices;
  /** The shop's couriers for the Courier choice. */
  couriers: readonly { id: string; name: string }[];
  /** The rest of the address (period, level, compare …) kept when the filters change; slice parts in it are replaced. */
  base: Record<string, string>;
  path: string;
  labels: GeoSlicesLabels;
}) {
  const [open, setOpen] = useState(false);
  const on = new Set<string>(shown);
  // how many of the drawn choices are set (category and product are the screen's own pickers)
  const n = ORDER_SLICE_KEYS.filter((k) => on.has(k) && slices[k]).length;
  // the order-level choices drawn here; category and product (the screen's own pickers) ride along as hidden fields
  const keep = { ...base };
  for (const k of ["channel", "pay", "courier", "cust"]) delete keep[k];
  const carried = slicesToParams({ categoryId: slices.categoryId, productId: slices.productId });
  const clear = new URLSearchParams({ ...keep, ...carried }).toString();
  if (!shown.some((k) => k === "channel" || k === "paymentType" || k === "courierId" || k === "customerType")) return null;
  return (
    <div className={`gsb${open ? " gsb-open" : ""}`} role="group" aria-label={labels.aria} data-testid="geo-slices">
      <button type="button" className="a2-btn sm gsb-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="geo-slices-toggle">
        {n ? labels.toggleN(n) : labels.toggle}
      </button>
      <form className="gsb-form" method="get" action={path} data-testid="geo-slices-form">
        {Object.entries({ ...keep, ...carried }).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {on.has("channel") ? (
          <label>
            <span>{labels.channel.label}</span>
            <select name="channel" defaultValue={slices.channel ?? ""} className="a2-inp">
              <option value="">{labels.channel.any}</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {labels.channel.names[c] ?? c}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {on.has("paymentType") ? (
          <label>
            <span>{labels.payment.label}</span>
            <select name="pay" defaultValue={slices.paymentType ?? ""} className="a2-inp">
              <option value="">{labels.payment.any}</option>
              <option value="COD">{labels.payment.COD}</option>
              <option value="ONLINE">{labels.payment.ONLINE}</option>
            </select>
          </label>
        ) : null}
        {on.has("courierId") ? (
          <label>
            <span>{labels.courier.label}</span>
            <select name="courier" defaultValue={slices.courierId ?? ""} className="a2-inp">
              <option value="">{labels.courier.any}</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {on.has("customerType") ? (
          <label>
            <span>{labels.customer.label}</span>
            <select name="cust" defaultValue={slices.customerType ?? ""} className="a2-inp">
              <option value="">{labels.customer.any}</option>
              <option value="NEW">{labels.customer.NEW}</option>
              <option value="REPEAT">{labels.customer.REPEAT}</option>
            </select>
          </label>
        ) : null}
        <div className="gsb-acts">
          <button type="submit" className="a2-btn sm pri" data-testid="geo-slices-apply">
            {labels.apply}
          </button>
          {n ? (
            <Link className="a2-btn sm" href={clear ? `${path}?${clear}` : path} scroll={false} data-testid="geo-slices-clear">
              {labels.clear}
            </Link>
          ) : null}
        </div>
      </form>
      <p className="gsb-note">{labels.note}</p>
    </div>
  );
}
