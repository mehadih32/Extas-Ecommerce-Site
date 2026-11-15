"use client";
// PR 798 (prototype v5 Reports): the prototype's sortable table. A tap on a heading sorts by it (a second tap turns it round); a row
// opens the list behind its figure in a side drawer (or goes to its own page); "Show all" opens the rest. The page works the
// cells and the sort values out; nothing is counted in here.
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Drawer } from "../shell/Drawer";
import "./report-sort.css";

export interface STCol {
  h: string;
  right?: boolean;
  /** Left out on a phone (the prototype's "hide" columns). */
  hide?: boolean;
}

export interface STDrawerItem {
  label: string;
  sub?: string;
  href?: string;
  value?: string;
}

export interface STRow {
  key: string;
  cells: ReactNode[];
  /** One sort value per column. */
  sort: (number | string)[];
  href?: string;
  /** `body` (PR 799) is a figure block above the list; `foot` a link row under it; a drawer with a `body` and no items shows no "empty" line. */
  drawer?: {
    title: string;
    sub?: string;
    items: STDrawerItem[];
    empty: string;
    body?: ReactNode;
    foot?: ReactNode;
  };
}

export interface STTexts {
  more: string;
  less: string;
  close: string;
  empty: string;
}

export function SortTable({
  cols,
  rows,
  sortCol = 0,
  sortDir = "desc",
  limit = 12,
  texts,
  testId,
  rowId,
}: {
  cols: readonly STCol[];
  rows: readonly STRow[];
  sortCol?: number;
  sortDir?: "asc" | "desc";
  limit?: number;
  texts: STTexts;
  testId: string;
  rowId: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<{ c: number; d: "asc" | "desc" }>({
    c: sortCol,
    d: sortDir,
  });
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<STRow | null>(null);
  const sorted = useMemo(() => {
    const k = sort.d === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a.sort[sort.c] ?? 0;
      const y = b.sort[sort.c] ?? 0;
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y))) * k
      );
    });
  }, [rows, sort]);
  if (!rows.length)
    return (
      <p className="a2-sm a2-mute" data-testid={`${testId}-empty`}>
        {texts.empty}
      </p>
    );
  const shown = all ? sorted : sorted.slice(0, limit);
  const go = (r: STRow) => {
    if (r.drawer) setOpen(r);
    else if (r.href) router.push(r.href);
  };
  const live = (r: STRow) => !!(r.drawer || r.href);
  return (
    <div data-testid={testId}>
      <div className="rp-frame">
        <table className="rp-tbl rp-sort">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={c.h}
                  className={`${c.right ? "r" : ""}${c.hide ? " hide-sm" : ""}${sort.c === i ? " sorted" : ""}`}
                  aria-sort={
                    sort.c === i
                      ? sort.d === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="rp-sb"
                    onClick={() =>
                      setSort((s) => ({
                        c: i,
                        d: s.c === i && s.d === "desc" ? "asc" : "desc",
                      }))
                    }
                    data-testid={`${testId}-sort-${i}`}
                  >
                    {c.h}
                    <span aria-hidden="true">
                      {sort.c === i ? (sort.d === "asc" ? " ▲" : " ▼") : " ↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.key}
                data-testid={rowId}
                className={live(r) ? "rp-live" : undefined}
                tabIndex={live(r) ? 0 : undefined}
                onClick={() => go(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && live(r)) go(r);
                }}
              >
                {r.cells.map((v, n) => (
                  <td
                    key={n}
                    className={`${cols[n]?.right ? "r" : ""}${cols[n]?.hide ? " hide-sm" : ""}`}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit ? (
        <button
          type="button"
          className="a2-btn sm ghost cr-tap rp-more"
          onClick={() => setAll((v) => !v)}
          data-testid={`${testId}-more`}
        >
          {all ? texts.less : texts.more.replace("{n}", String(rows.length))}
        </button>
      ) : null}
      {open?.drawer ? (
        <Drawer
          title={open.drawer.title}
          sub={open.drawer.sub}
          closeLabel={texts.close}
          onClose={() => setOpen(null)}
          foot={open.drawer.foot}
          testId={`${testId}-drawer`}
        >
          {open.drawer.body}
          {open.drawer.items.length ? (
            <ul className="cr-rows">
              {open.drawer.items.map((x, i) => (
                <li key={i}>
                  <div>
                    {x.href ? (
                      <a className="cr-link" href={x.href}>
                        {x.label}
                      </a>
                    ) : (
                      <b>{x.label}</b>
                    )}
                    {x.sub ? (
                      <span className="a2-xs a2-mute a2-blk">{x.sub}</span>
                    ) : null}
                  </div>
                  {x.value ? <b>{x.value}</b> : null}
                </li>
              ))}
            </ul>
          ) : open.drawer.body ? null : (
            <p className="a2-sm a2-mute">{open.drawer.empty}</p>
          )}
        </Drawer>
      ) : null}
    </div>
  );
}
