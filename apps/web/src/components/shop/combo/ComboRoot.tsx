"use client";
// PR 91–95 — the combo page's one client state (demo 40-combo.js cb_state and its actions): the colour and size of each
// piece, "Same size as item 1", which picture the gallery shows, inches or centimetres, the step of C2, and what the
// page has to say (a size gone in a new colour, what is still missing). Every rule is @extas/combos/page-model's, the
// same pure check the bag runs again on the server; the set price is read from the server's price table by the pieces'
// own prices (or asked of the server when the page carries none). The parts of the page read it with `useCombo()`.
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  checkPicks,
  choicesOf,
  picksKey,
  sizeOf,
  withColours,
  withSame,
  withSize,
  type PickNote,
  type PickState,
  type PriceCell,
  type SetCheck,
} from "@extas/combos/page-model";
import {
  colourNames,
  wordOf,
  type ComboEnv,
  type ComboView,
} from "@/lib/shop/combo-model";
import { beacon } from "@/lib/shop/beacon";
import { formatMoney, toBnDigits } from "@/lib/shop/lang";
import { showLinkToast, showToast } from "../toast";

/** How long the "added to your bag · View bag" message stays (demo cb_toast). */
const ADDED_TOAST_MS = 4_500;

interface Ui {
  st: PickState;
  notes: PickNote[];
  view: ComboView;
  gal: number;
  cm: boolean;
  err: { i: number; msg: string } | null;
  step: number;
  done: boolean[];
}

export interface ComboApi {
  env: ComboEnv;
  ui: Ui;
  check: SetCheck;
  price: PriceCell;
  busy: boolean;
  w: (key: string, vars?: Record<string, string | number>) => string;
  money: (minor: number) => string;
  num: (n: number) => string;
  /** The size a piece uses (its own, or the one it follows). */
  size: (i: number) => string | null;
  colourOf: (
    i: number,
  ) => ComboEnv["pieces"][number]["colours"][number] | undefined;
  sizeLabel: (i: number, sizeId: string | null) => string;
  /** What piece i still needs, in words (the first of its problems), or null. */
  problemOf: (i: number) => string | null;
  colour: (i: number, id: string) => void;
  setSize: (i: number, id: string) => void;
  same: (i: number, on: boolean) => void;
  pair: (colourIds: readonly string[]) => void;
  tab: (i: number) => void;
  show: (v: ComboView) => void;
  unit: (cm: boolean) => void;
  look: (i: number) => void;
  goStep: (i: number) => void;
  next: (i: number) => void;
  add: (from: Element, checkout: boolean) => void;
}

const Ctx = createContext<ComboApi | null>(null);

export function useCombo(): ComboApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCombo outside ComboRoot");
  return c;
}

const scrollToId = (id: string) =>
  setTimeout(
    () =>
      document
        .getElementById(id)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    30,
  );

function tell(body: Record<string, unknown>) {
  beacon("/api/shop/combo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
}

const newKey = () => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

export function ComboRoot({
  env,
  children,
}: {
  env: ComboEnv;
  children: ReactNode;
}) {
  const router = useRouter();
  const n = env.slots.length;
  const [ui, setUi] = useState<Ui>(() => ({
    st: env.initial,
    notes: [],
    view: "set",
    gal: 0,
    cm: false,
    err: null,
    step: 0,
    done: env.slots.map(() => Boolean(env.editGroupKey)),
  }));
  const [asked, setAsked] = useState<Record<string, PriceCell>>({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const num = useCallback(
    (x: number) => (env.bnDigits ? toBnDigits(String(x)) : String(x)),
    [env.bnDigits],
  );
  const money = useCallback(
    (minor: number) => formatMoney(minor, env.currency, env.lang, env.bnDigits),
    [env.currency, env.lang, env.bnDigits],
  );
  const w = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      wordOf(env.words, key, vars),
    [env.words],
  );

  const check = useMemo(
    () =>
      checkPicks({
        slots: env.slots,
        variants: env.variants,
        st: ui.st,
        inBag: env.inBag,
        needsMix: env.needsMix,
        onSale: env.onSale,
      }),
    [env, ui.st],
  );
  const key = useMemo(
    () => picksKey(env.slots, env.variants, ui.st, check),
    [env, ui.st, check],
  );
  const price = (env.prices ? env.prices[key] : asked[key]) ?? env.firstPrice;

  // The page carries no price table (too many mixes): ask the server for the price of these picks.
  useEffect(() => {
    if (env.prices || asked[key]) return;
    const t = setTimeout(() => {
      void fetch("/api/shop/combo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "price",
          comboId: env.comboId,
          choices: choicesOf(env.slots, ui.st),
          ...(env.editGroupKey ? { editGroupKey: env.editGroupKey } : {}),
        }),
        credentials: "same-origin",
      })
        .then((r) => r.json())
        .then(
          (d: { ok?: boolean; price?: PriceCell | null }) =>
            d.ok && d.price && setAsked((a) => ({ ...a, [key]: d.price! })),
        )
        .catch(() => null);
    }, 250);
    return () => clearTimeout(t);
  }, [env, key, asked, ui.st]);

  // PR 104 · the page was opened, and each full set of colours picked (once each), for the combo report
  const picked = useRef<Set<string>>(new Set());
  useEffect(() => {
    picked.current.add(ui.st.colours.join("+"));
    tell({ event: "view", comboId: env.comboId });
  }, [env.comboId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = ui.st.colours.join("+");
    if (picked.current.has(k) || ui.st.colours.some((c) => !c)) return;
    picked.current.add(k);
    tell({ event: "pick", comboId: env.comboId, colourIds: ui.st.colours });
  }, [ui.st.colours, env.comboId]);

  const size = useCallback(
    (i: number) => sizeOf(env.slots, ui.st, i),
    [env.slots, ui.st],
  );
  const colourOf = useCallback(
    (i: number) =>
      env.pieces[i]?.colours.find((c) => c.id === ui.st.colours[i]),
    [env.pieces, ui.st.colours],
  );
  const sizeLabel = useCallback(
    (i: number, id: string | null) =>
      env.pieces[i]?.sizes.find((s) => s.id === id)?.label ?? "",
    [env.pieces],
  );

  const problemWords = useCallback(
    (p: SetCheck["problems"][number]) => {
      const i = p.slot ?? 0;
      const piece = env.pieces[i];
      const item = env.itemWords
        .replace("{n}", num(i + 1))
        .replace("{name}", piece?.name ?? "");
      const code =
        p.code === "NOT_ENOUGH" && (p.inBag ?? 0) > 0
          ? "NOT_ENOUGH_BAG"
          : p.code;
      const vars: Record<string, string> = {
        item,
        colour: colourOf(i)?.name ?? "",
        size: sizeLabel(i, size(i)),
        stock: num(p.stock ?? 0),
        need: num(p.need ?? 0),
        inBag: num(p.inBag ?? 0),
      };
      return (env.problems[code] ?? code).replace(
        /\{(\w+)\}/g,
        (m: string, k: string) => vars[k] ?? m,
      );
    },
    [env, num, colourOf, sizeLabel, size],
  );
  const problemOf = useCallback(
    (i: number) => {
      const p = check.problems.find((x) => x.slot === i);
      return p ? problemWords(p) : null;
    },
    [check, problemWords],
  );

  const focusErr = (i: number) => {
    scrollToId(`cb-item-${i}`);
    setTimeout(() => {
      const el = document.getElementById(`cb-item-${i}`);
      el?.classList.remove("zc-flash");
      void el?.getBoundingClientRect();
      el?.classList.add("zc-flash");
    }, 60);
  };

  const api: ComboApi = {
    env,
    ui,
    check,
    price,
    busy,
    w,
    money,
    num,
    size,
    colourOf,
    sizeLabel,
    problemOf,
    colour: (i, id) =>
      setUi((u) => {
        const r = withColours(
          env.slots,
          env.variants,
          u.st,
          u.st.colours.map((c, k) => (k === i ? id : c)),
        );
        return { ...u, st: r.state, notes: r.notes, gal: i, err: null };
      }),
    setSize: (i, id) =>
      setUi((u) => ({
        ...u,
        st: withSize(env.slots, u.st, i, id),
        notes: u.notes.filter((x) => x.slot !== i),
        err: null,
      })),
    same: (i, on) =>
      setUi((u) => ({
        ...u,
        st: withSame(env.slots, env.variants, u.st, i, on),
        err: null,
      })),
    pair: (colourIds) =>
      setUi((u) => {
        const r = withColours(env.slots, env.variants, u.st, colourIds);
        return { ...u, st: r.state, notes: r.notes, err: null, view: "set" };
      }),
    tab: (i) =>
      setUi((u) => ({
        ...u,
        gal: i,
        view: u.view === "set" ? "front" : u.view,
      })),
    show: (v) => setUi((u) => ({ ...u, view: v })),
    unit: (cm) => setUi((u) => ({ ...u, cm })),
    look: (i) => {
      setUi((u) => ({ ...u, gal: i, view: "front" }));
      setTimeout(() => {
        const g = document.getElementById("cb-gallery");
        if (!g) return;
        const r = g.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight * 0.5)
          window.scrollTo({
            top: Math.max(0, window.scrollY + r.top - 70),
            behavior: "smooth",
          });
      }, 30);
    },
    goStep: (i) => {
      setUi((u) => ({ ...u, step: i, gal: i, err: null }));
      scrollToId(`cb-item-${i}`);
    },
    next: (i) => {
      const msg = problemOf(i);
      if (msg) {
        setUi((u) => ({ ...u, err: { i, msg } }));
        focusErr(i);
        return;
      }
      const done = ui.done.map((d, k) => d || k === i);
      let nx = n;
      for (let k = i + 1; k < n && nx === n; k++) if (!done[k]) nx = k;
      for (let k = 0; k < i && nx === n; k++) if (!done[k]) nx = k;
      setUi((u) => ({
        ...u,
        done,
        err: null,
        step: nx,
        gal: nx < n ? nx : u.gal,
      }));
      scrollToId(nx < n ? `cb-item-${nx}` : "cb-summary");
    },
    add: (from, checkout) => {
      if (busyRef.current) return;
      if (!check.ok) {
        const p = check.first ?? check.problems[0];
        const i = p?.slot ?? 0;
        if (p)
          setUi((u) => ({
            ...u,
            err: { i, msg: problemWords(p) },
            gal: i,
            step: env.layout === "C2" ? i : u.step,
          }));
        focusErr(i);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      const choices = choicesOf(env.slots, ui.st);
      const editing = env.editGroupKey;
      void fetch("/api/bag/sets", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editing
            ? { groupKey: editing, choices }
            : { slug: env.slug, choices, addKey: newKey() },
        ),
        credentials: "same-origin",
      })
        .then(async (r) => {
          const d = (await r.json().catch(() => ({}))) as {
            ok?: boolean;
            lineId?: string | null;
            added?: boolean;
          };
          if (!r.ok || !d.ok) {
            showToast(from, w("cta.error"));
            router.refresh();
            return;
          }
          if (editing || checkout || env.behaviour === "page")
            return void window.location.assign(
              checkout ? env.hrefs.checkout : env.hrefs.bag,
            );
          const desk = window.matchMedia("(min-width: 1024px)").matches;
          if (desk && env.behaviour === "sheet" && d.lineId) {
            const q = new URLSearchParams(window.location.search);
            q.set("added", d.lineId);
            return void router.push(
              `${window.location.pathname}?${q.toString()}`,
              { scroll: false },
            );
          }
          showLinkToast(
            from,
            w("cta.added", {
              name: env.name,
              colours: colourNames(env.pieces, ui.st.colours),
            }),
            {
              href: env.hrefs.bag,
              label: w("cta.view"),
              testId: "cb-toast-bag",
            },
            ADDED_TOAST_MS,
          );
          router.refresh();
        })
        .catch(() => showToast(from, w("cta.error")))
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
        });
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
