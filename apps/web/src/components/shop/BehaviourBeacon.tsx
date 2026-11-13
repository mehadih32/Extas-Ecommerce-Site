"use client";
// S28 · PR 701 — the shop's behaviour beacon, drawn by the shop layout only while `analytics.behaviour` collect is on (off by
// default). It gathers, per page, where visitors click (a spot on a grid over the page, never what was clicked), how far they
// scroll (0/25/50/75/100%) and which form fields they touch or leave empty (the field's name only, never what was typed), and
// sends them in one small message when the page is left or hidden. It reads nothing typed and never holds the page up.
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { beacon } from "@/lib/shop/beacon";
import { deviceOf } from "@/lib/analytics/visitors-pure";
import {
  BEHAVIOUR_MAX_EVENTS,
  fieldName,
  scrollMark,
} from "@/lib/analytics/behaviour-pure";
import { pageKindOf } from "@/lib/website/page-kind";

export const BEHAVIOUR_BEACON_URL = "/api/shop/behaviour";

type Ev =
  | { k: "click"; x: number; y: number }
  | { k: "scroll"; pct: number }
  | { k: "field"; name: string; empty?: boolean };

export function BehaviourBeacon({ cfg }: { cfg: { productPrefix: string } }) {
  const path = usePathname();
  useEffect(() => {
    if (!path) return;
    const events: Ev[] = [];
    const touched = new Set<string>();
    let reach = -1;
    const push = (e: Ev) => {
      if (events.length < BEHAVIOUR_MAX_EVENTS - 6) events.push(e); // leaves room for the scroll and field marks added on send
    };
    const docH = () => Math.max(document.documentElement.scrollHeight, 1);
    const onClick = (e: MouseEvent) => {
      const x = e.clientX / Math.max(window.innerWidth, 1);
      const y = (e.clientY + window.scrollY) / docH();
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) push({ k: "click", x, y });
    };
    const onScroll = () => {
      const pct = ((window.scrollY + window.innerHeight) / docH()) * 100;
      reach = Math.max(reach, scrollMark(Math.min(100, pct)));
    };
    const nameOf = (t: EventTarget | null): string =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement
        ? fieldName(t.name || t.id)
        : "";
    const onFocus = (e: FocusEvent) => {
      const n = nameOf(e.target);
      if (n && !touched.has(n)) {
        touched.add(n);
        push({ k: "field", name: n });
      }
    };
    const onBlur = (e: FocusEvent) => {
      const n = nameOf(e.target);
      const t = e.target;
      if (
        n &&
        (t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement) &&
        !t.value
      )
        push({ k: "field", name: n, empty: true });
    };
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      const all: Ev[] = [...events];
      if (reach >= 0) all.push({ k: "scroll", pct: reach });
      if (!all.length) return;
      beacon(BEHAVIOUR_BEACON_URL, {
        method: "POST",
        body: JSON.stringify({
          page: pageKindOf(path, cfg.productPrefix),
          device: deviceOf(window.innerWidth),
          events: all,
        }),
        credentials: "same-origin",
        headers: { "content-type": "text/plain" },
      });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") send();
    };
    onScroll();
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [path, cfg.productPrefix]);
  return null;
}
