"use client";
// S28 · PR 689 (admin prototype v5) — Reports › Report library: the monthly review callout on top, one card per question (value and
// change against the period before, pin to Home) in the prototype's seven groups, then Downloads & report packs and a line to Finance.
// Words: messages/admin-reports-library.*.json (`reportsLibrary.*`). Read-only reports: nothing here moves money.
// PR 854 (prototype parity, round 3): the period bar, saved views, Excel / PDF / Print / Report packs / Schedule are the shared Reports
// toolbar of the page (ReportBar). The old restock and unsold lists, orders by weekday and hour, the last-month lines and the saved-views
// section are gone: the prototype's library has none of them (the same lists live on Reports › Products and › Sales).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { t, type Dict } from "@/lib/i18n";
import { call } from "../api";
import { DownloadsPanel } from "./DownloadsPanel";
import { showToast } from "../lumen/Toast";
import { ShellIcon } from "../shell/ShellIcon";
import type { ShellIconName } from "@/lib/admin-shell/icons";
import "./library-cards.css";

export interface LibraryScreenProps {
  dict: Dict;
  pins: string[];
  /** The question cards in the prototype's groups, already worded by the page. */
  groups: {
    id: string;
    title: string;
    cards: {
      id: string;
      q: string;
      v: string;
      d: { text: string; tone: "good" | "bad" } | null;
      s: string;
      href: string;
      small: boolean;
    }[];
  }[];
  /** The admin's language (the files speak it). */
  lang: string;
  /** The period of the files (a preset's key, or the two dates). */
  filePeriod: { preset: string } | { from: string; to: string };
  /** "October 2026 review is ready" and its line, with the review's own address. */
  review: { title: string; line: string; href: string };
}

type Say = (k: string, vars?: Record<string, string | number>) => string;

/** The group's icon, the nearest of the admin's own line icons to the prototype's (finance, products, customers, truck, marketing, search, customers). */
const ICON: Record<string, ShellIconName> = {
  sales: "wallet",
  products: "shirt",
  customers: "users",
  delivery: "truck",
  marketing: "mega",
  areas: "search",
  team: "users",
};

export function LibraryScreen(p: LibraryScreenProps) {
  const router = useRouter();
  const c: Say = (k, vars) => t(p.dict, `reportsLibrary.${k}`, vars);
  const [said, setSaid] = useState<string | null>(null);
  const err = (status: number, error?: string) =>
    status === 403
      ? c("err.forbidden")
      : c(
          `err.${["INVALID_INPUT", "CONFLICT"].includes(error ?? "") ? error : "other"}`,
        );

  async function pin(cardId: string, pinned: boolean) {
    const a = await call("POST", "/api/admin/reports/library", {
      action: "pin",
      cardId,
      pinned,
    });
    if (a.status === 200) {
      showToast({
        text: pinned ? c("pinnedToast") : c("unpinnedToast"),
        tone: "ok",
      });
      return router.refresh();
    }
    setSaid(err(a.status, (a.data as { error?: string }).error));
  }

  type GCard = LibraryScreenProps["groups"][number]["cards"][number];
  const cardView = (k: GCard) => {
    const pinned = p.pins.includes(k.id);
    return (
      <div key={k.id} className="lc-card" data-testid={`lib-${k.id}`}>
        <Link
          href={k.href}
          className="lc-link"
          data-testid={`lib-open-${k.id}`}
        >
          <span className="lc-q">{k.q}</span>
          <span className="lc-v">
            <b className={k.small ? "sm" : undefined}>{k.v}</b>
            {k.d ? (
              <span className={`lc-d ${k.d.tone}`}>{k.d.text}</span>
            ) : null}
          </span>
          <span className="lc-s">{k.s}</span>
          <span className="lc-o">{c("open")} →</span>
        </Link>
        <button
          type="button"
          className={`a2-btn sm${pinned ? " pri" : ""}`}
          aria-pressed={pinned}
          onClick={() => pin(k.id, !pinned)}
          data-testid={`lib-pin-${k.id}`}
        >
          <ShellIcon name={pinned ? "check" : "plus"} size={14} />{" "}
          {pinned ? c("unpin") : c("pin")}
        </button>
      </div>
    );
  };
  const pinnedCards = p.groups
    .flatMap((g) => g.cards)
    .filter((k) => p.pins.includes(k.id));

  return (
    <div className="w4-stack" data-testid="library-screen">
      <div className="a2-note a2-mt12" role="note" data-testid="lib-review">
        <span className="lc-rv">
          <span>
            <b>{p.review.title}</b> · {p.review.line}
          </span>
          <Link
            className="a2-btn sm pri cr-tap"
            href={p.review.href}
            data-testid="lib-review-open"
          >
            {c("reviewRead")} →
          </Link>
        </span>
      </div>
      {said ? (
        <p className="a2-sm bk-warn" role="alert">
          {said}
        </p>
      ) : null}

      {pinnedCards.length ? (
        <section className="lc-g" data-testid="lib-pinned">
          <h3 className="a2-h4">
            <ShellIcon name="home" size={16} />{" "}
            {c("pinnedN", { n: pinnedCards.length })}
          </h3>
          <div className="lc-grid a2-mt6">{pinnedCards.map(cardView)}</div>
        </section>
      ) : null}

      {p.groups.map((g) => (
        <section key={g.id} className="lc-g" data-testid={`lib-group-${g.id}`}>
          <h3 className="a2-h4">
            <ShellIcon name={ICON[g.id] ?? "chart"} size={16} /> {g.title}
          </h3>
          <div className="lc-grid a2-mt6">{g.cards.map(cardView)}</div>
        </section>
      ))}

      <DownloadsPanel dict={p.dict} lang={p.lang} period={p.filePeriod} />

      <p className="a2-xs a2-mute" data-testid="lib-footer">
        {c("footerNote")}{" "}
        <Link className="a2-lnk cr-link" href="/admin/money/profit">
          {c("footerOpen")}
        </Link>
      </p>
    </div>
  );
}
