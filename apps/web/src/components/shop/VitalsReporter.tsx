"use client";
// S11 · PR 234 — a real visitor's page reports how fast it loaded (Core Web Vitals, through Next's own web-vitals
// reporter) to /api/shop/vitals: the metric, its value, the page's address (the server keeps only its kind) and phone or
// desktop. Nothing about the visitor. `share` of a hundred page loads report (`seo.vitals.share`); the shop layout only
// draws this while `seo.vitals.collect` is on. Fire and forget: the page never waits.
import { useCallback, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { beacon } from "@/lib/shop/beacon";
import { deviceOf, isVitalMetric } from "@/lib/seo/vitals";

export function VitalsReporter({ share }: { share: number }) {
  // one draw per page load: this load reports every metric, or none
  const picked = useRef<boolean | null>(null);
  const report = useCallback(
    (m: { name: string; value: number }) => {
      picked.current ??= Math.random() * 100 < share;
      if (!picked.current || !isVitalMetric(m.name)) return;
      beacon("/api/shop/vitals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ m: m.name, v: m.value, p: window.location.pathname, d: deviceOf(window.innerWidth) }),
      });
    },
    [share],
  );
  useReportWebVitals(report);
  return null;
}
