// S28 · PR 701 — the pure side of the behaviour view (no database, no server imports, so the beacon, the ingest and the
// tests all use it): what one beacon may say, and how it is shaped before anything is counted. A click is only a cell of a
// grid laid over the page (never what was clicked), a scroll is one of five reach marks, a form field is only its name
// (never what was typed).

export const BEHAVIOUR_KINDS = [
  "CLICK",
  "SCROLL",
  "FIELD",
  "FIELD_EMPTY",
] as const;
export type BehaviourKind = (typeof BEHAVIOUR_KINDS)[number];
export const SCROLL_MARKS = [0, 25, 50, 75, 100] as const; // hardcode-ok: the five reach marks of the scroll bar, not business numbers
export const BEHAVIOUR_PAGES = [
  "home",
  "category",
  "product",
  "bag",
  "checkout",
  "other",
] as const;
export const BEHAVIOUR_DEVICES = ["mobile", "tablet", "desktop"] as const;
/** The most events one beacon may carry. */
export const BEHAVIOUR_MAX_EVENTS = 40; // hardcode-ok: a body guard, not a business number

export interface BehaviourCount {
  kind: BehaviourKind;
  key: string;
  count: number;
}

export interface Shaped {
  pageType: string;
  device: string;
  counts: BehaviourCount[];
}

const unit = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;

/** The key of a click cell: `col,row`, each from 0 to grid-1. */
export const cellKey = (x: number, y: number, grid: number): string =>
  `${Math.min(grid - 1, Math.floor(x * grid))},${Math.min(grid - 1, Math.floor(y * grid))}`;
export const parseCell = (key: string): { col: number; row: number } | null => {
  const m = /^(\d{1,2}),(\d{1,2})$/.exec(key);
  return m ? { col: Number(m[1]), row: Number(m[2]) } : null;
};
/** A form field's name as it may be kept: letters, digits, dash, underscore; anything else (an address, a phone) is dropped. */
export const fieldName = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[a-z][a-z0-9_-]{0,39}$/.test(s) ? s : "";
};
/** The nearest scroll mark at or under a percentage. */
export const scrollMark = (pct: number): number =>
  [...SCROLL_MARKS].reverse().find((m) => pct >= m) ?? 0;

/**
 * One beacon body `{page, device, events:[{k:'click',x,y}|{k:'scroll',pct}|{k:'field',name,empty?}]}` as counts to add. Unknown
 * pages become "other", unknown devices are refused (null), a bad event is skipped, extra events past the cap are ignored.
 */
export function shapeBeacon(raw: unknown, grid: number): Shaped | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const device = typeof r.device === "string" ? r.device : "";
  if (!(BEHAVIOUR_DEVICES as readonly string[]).includes(device)) return null;
  const pageType =
    typeof r.page === "string" &&
    (BEHAVIOUR_PAGES as readonly string[]).includes(r.page)
      ? r.page
      : "other";
  if (!Array.isArray(r.events)) return null;
  const acc = new Map<string, BehaviourCount>();
  const add = (kind: BehaviourKind, key: string) => {
    const id = `${kind}|${key}`;
    const c = acc.get(id);
    if (c) c.count += 1;
    else acc.set(id, { kind, key, count: 1 });
  };
  for (const e of r.events.slice(0, BEHAVIOUR_MAX_EVENTS)) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (o.k === "click") {
      const x = unit(o.x);
      const y = unit(o.y);
      if (x !== null && y !== null) add("CLICK", cellKey(x, y, grid));
    } else if (o.k === "scroll") {
      if (
        typeof o.pct === "number" &&
        Number.isFinite(o.pct) &&
        o.pct >= 0 &&
        o.pct <= 100
      )
        add("SCROLL", String(scrollMark(o.pct)));
    } else if (o.k === "field") {
      const n = fieldName(o.name);
      if (n) add(o.empty === true ? "FIELD_EMPTY" : "FIELD", n);
    }
  }
  return { pageType, device, counts: [...acc.values()] };
}

export interface HeatCell {
  col: number;
  row: number;
  count: number;
  /** 0 to 100 of the hottest cell. */
  level: number;
}

/** The click cells with their heat, hottest first, only those inside the grid. */
export function heatOf(
  rows: readonly { key: string; count: number }[],
  grid: number,
): HeatCell[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const c = parseCell(r.key);
    if (c && c.col < grid && c.row < grid)
      sums.set(r.key, (sums.get(r.key) ?? 0) + r.count);
  }
  const max = Math.max(1, ...sums.values());
  return [...sums.entries()]
    .map(([k, count]) => ({
      ...parseCell(k)!,
      count,
      level: Math.round((count / max) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Scroll reach: of the people who reached the 0 mark, the share who reached each mark. */
export function reachOf(
  rows: readonly { key: string; count: number }[],
): { mark: number; count: number; pct: number }[] {
  const by = new Map<number, number>();
  for (const r of rows)
    by.set(Number(r.key), (by.get(Number(r.key)) ?? 0) + r.count);
  const base = Math.max(
    1,
    by.get(0) ?? 0,
    ...SCROLL_MARKS.map((m) => by.get(m) ?? 0),
  );
  return SCROLL_MARKS.map((m) => ({
    mark: m,
    count: by.get(m) ?? 0,
    pct: Math.round(((by.get(m) ?? 0) / base) * 100),
  }));
}

/** Field drop-off: the touches of each field and how many of them were left empty, worst first. */
export function dropOffOf(
  touched: readonly { key: string; count: number }[],
  empty: readonly { key: string; count: number }[],
): { name: string; touched: number; empty: number; pct: number }[] {
  const t = new Map<string, number>();
  const e = new Map<string, number>();
  for (const r of touched) t.set(r.key, (t.get(r.key) ?? 0) + r.count);
  for (const r of empty) e.set(r.key, (e.get(r.key) ?? 0) + r.count);
  return [...new Set([...t.keys(), ...e.keys()])]
    .map((name) => {
      const touch = Math.max(t.get(name) ?? 0, e.get(name) ?? 0);
      return {
        name,
        touched: touch,
        empty: e.get(name) ?? 0,
        pct: touch > 0 ? Math.round(((e.get(name) ?? 0) / touch) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct || b.touched - a.touched);
}
