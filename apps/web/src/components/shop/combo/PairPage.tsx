"use client";
// PR 573 — a pair an auto rule made, on its own page in the template its combo, its rule or the shop chose (Blueprint
// D8.4; demo 42-combo-auto.js ca_P1 … ca_P5, r12-zauto.css, r12-zcombo2.css). "current" (the shop's default) keeps the
// page PR 91–95 built; these are the others:
//   P1 pair page    — the set picture, the price line, "Size for both" (or a size for each piece), "Make it 3 pcs",
//                     "Add both to bag · ৳…", the other pairs of the style, each colour, the size chart;
//   P2 pick colours — the 2 / 3 piece switch, the colours to pick from, one size for all;
//   P3 top + bottom — the set colour (or a colour per piece), a size row per piece; the top's size fills the others;
//   P4 mixed set    — a row per piece (colour, size) that folds to one line once done; "Same size for all tops";
//   P5 fixed pack   — the packs of the style as colour circles, one size for the pack.
// The button always says what is still missing, and a tap on it scrolls there. What goes in the bag is checked again
// on the server (stock, price); while a set in the bag is being changed (`?from=`), the new pair takes its place.
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  commonColours,
  findPair,
  type ListPair,
  type ListPiece,
} from "@extas/combos/rule-page-model";
import type { PriceCell } from "@extas/combos/page-model";
import { beacon } from "@/lib/shop/beacon";
import { waHref } from "@/lib/shop/links";
import { formatMoney, toBnDigits } from "@/lib/shop/lang";
import {
  bothSizes,
  choicesFor,
  colourOf,
  leftOf,
  mixColours,
  otherPairsOf,
  pickGroups,
  pieceNouns,
  pieceOk,
  priceIn,
  productOf,
  resolvePicks,
  sameSizeGroup,
  slotSizes,
  togglePick,
  upsellOptions,
  wordIn,
  type PairEnv,
  type PairSide,
} from "@/lib/shop/combo-pair-model";
import { Icon } from "../Icon";
import { showLinkToast, showToast } from "../toast";
import { HubPicture, type HubLayout, type SetPart } from "./SetPicture";

const ADDED_TOAST_MS = 4_500;
const scrollToId = (id: string) =>
  setTimeout(
    () =>
      document
        .getElementById(id)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    30,
  );
const newKey = () => {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};
const keyOf = (p: ListPiece) => `${p.productId}|${p.colourId}`;

interface Missing {
  label: string;
  at: string;
  msg: string | null;
}

/** The page's helpers: its words, money and numbers, the pictures of pieces, and the add to bag. */
function usePage(env: PairEnv) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const w = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      wordIn(env.words, `ctpl.${key}`, vars),
    [env.words],
  );
  const num = useCallback(
    (n: number) => (env.bnDigits ? toBnDigits(String(n)) : String(n)),
    [env.bnDigits],
  );
  const money = useCallback(
    (minor: number) => formatMoney(minor, env.currency, env.lang, env.bnDigits),
    [env.currency, env.lang, env.bnDigits],
  );
  const plural = useCallback(
    (key: string, n: number) =>
      w(`${key}.${n === 1 ? "one" : "other"}`, { n: num(n) }),
    [w, num],
  );
  const parts = useCallback(
    (pieces: readonly ListPiece[]): SetPart[] =>
      pieces.map((p) => {
        const product = productOf(env, p.productId);
        const col = colourOf(env, p);
        return {
          garment: product?.garment ?? null,
          hex: col?.hex ?? "",
          photo: product?.photos[p.colourId] ?? null,
          name: [col?.name, product?.name].filter(Boolean).join(" "),
        };
      }),
    [env],
  );
  const title = useCallback(
    (pieces: readonly ListPiece[]) =>
      pieces.map((p) => colourOf(env, p)?.name ?? "").join(" + "),
    [env],
  );
  const href = useCallback(
    (slug: string, tpl?: string) =>
      `${env.hrefs.combo}${encodeURIComponent(slug)}${tpl ? `?tpl=${tpl}` : env.hrefs.query}`,
    [env.hrefs],
  );

  const add = (
    pair: ListPair,
    slotKeys: (string | null)[],
    from: Element,
    checkout: boolean,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const body = {
      slug: pair.slug,
      choices: choicesFor(env, pair, slotKeys),
      addKey: newKey(),
      ...(env.editGroupKey ? { replaceGroupKey: env.editGroupKey } : {}),
    };
    void fetch("/api/bag/sets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean };
        if (!r.ok || !d.ok) {
          showToast(from, w("pair.error"));
          router.refresh();
          return;
        }
        if (env.editGroupKey || checkout || env.behaviour === "page")
          return void window.location.assign(
            checkout ? env.hrefs.checkout : env.hrefs.bag,
          );
        showLinkToast(
          from,
          w("pair.added", { name: title(pair.pieces) }),
          {
            href: env.hrefs.bag,
            label: w("pair.view"),
            testId: "ca-toast-bag",
          },
          ADDED_TOAST_MS,
        );
        router.refresh();
      })
      .catch(() => showToast(from, w("pair.error")))
      .finally(() => {
        lock.current = false;
        setBusy(false);
      });
  };
  return { w, num, money, plural, parts, title, href, add, busy };
}
type Page = ReturnType<typeof usePage>;

function Badges({ g, cell, n }: { g: Page; cell: PriceCell; n: number }) {
  return (
    <>
      {cell.offer && cell.saving > 0 ? (
        <span className="ca-bdg save">
          {g.w("pair.save", { amount: g.money(cell.saving) })}
        </span>
      ) : null}
      <span className="ca-bdg pcs">{g.w("pair.pcs", { n: g.num(n) })}</span>
    </>
  );
}

function Hero({
  env,
  g,
  pieces,
  cell,
  layout,
}: {
  env: PairEnv;
  g: Page;
  pieces: readonly ListPiece[];
  cell: PriceCell | null;
  layout: HubLayout;
}) {
  return (
    <div className="ca-hero" data-testid="ca-hero">
      <HubPicture
        parts={g.parts(pieces)}
        lang={env.lang}
        alt={g.title(pieces)}
        layout={layout}
      >
        {cell ? <Badges g={g} cell={cell} n={pieces.length} /> : null}
      </HubPicture>
    </div>
  );
}

function PriceLine({ g, cell, n }: { g: Page; cell: PriceCell; n: number }) {
  if (cell.pay === null) return null;
  return (
    <div className="ca-pline" data-testid="ca-price">
      {g.w("pair.pcs", { n: g.num(n) })}{" "}
      {cell.was !== null ? (
        <span className="strike">{g.money(cell.was)}</span>
      ) : null}{" "}
      → <b className="price">{g.money(cell.pay)}</b>
      {cell.offer && cell.saving > 0 ? (
        <>
          {" · "}
          <b className="ca-savetxt">
            {g.w("pair.save", { amount: g.money(cell.saving) })}
          </b>
        </>
      ) : null}
    </div>
  );
}

/** One line: pay on delivery · free delivery · size swap, each only while that rule is on (demo ca_trust). */
function Trust({ env, g, cell }: { env: PairEnv; g: Page; cell: PriceCell }) {
  const pay = cell.pay;
  const segs = [
    env.trust.cod && pay !== null ? (
      <span key="cod" className="ca-tseg">
        <Icon name="cash" size={15} />
        <span>{g.w("pair.payOn", { price: g.money(pay) })}</span>
      </span>
    ) : null,
    env.trust.freeOverMinor !== null &&
    pay !== null &&
    pay >= env.trust.freeOverMinor ? (
      <span key="free" className="ca-tseg">
        <Icon name="truck" size={15} />
        <span>{g.w("pair.free")}</span>
      </span>
    ) : null,
    env.trust.exchangeHours ? (
      <span key="swap" className="ca-tseg">
        <Icon name="swap" size={15} />
        <span>
          {g.w("pair.swap", {
            h: env.bnDigits
              ? toBnDigits(env.trust.exchangeHours)
              : env.trust.exchangeHours,
          })}
        </span>
      </span>
    ) : null,
  ].filter(Boolean);
  if (!segs.length) return null;
  return (
    <div className="ca-trust" data-testid="ca-trust">
      {segs.flatMap((s, i) =>
        i
          ? [
              <span key={`s${i}`} className="ca-sep" aria-hidden="true">
                ·
              </span>,
              s,
            ]
          : [s],
      )}
    </div>
  );
}

function Ctas({
  g,
  label,
  onAdd,
}: {
  g: Page;
  label: string;
  onAdd: (from: Element, checkout: boolean) => void;
}) {
  return (
    <div className="ca-ctas">
      <button
        type="button"
        className="btn btn-primary btn-block hide-m"
        aria-busy={g.busy || undefined}
        onClick={(e) => onAdd(e.currentTarget, false)}
        data-testid="ca-cta-d"
      >
        {label}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        aria-busy={g.busy || undefined}
        onClick={(e) => onAdd(e.currentTarget, true)}
        data-testid="ca-order"
      >
        {g.w("pair.order")}
      </button>
    </div>
  );
}

function MBar({
  g,
  cell,
  label,
  onAdd,
}: {
  g: Page;
  cell: PriceCell;
  label: string;
  onAdd: (from: Element, checkout: boolean) => void;
}) {
  return (
    <div className="mbar dm-hide ca-mbar" data-testid="ca-mbar">
      <div className="ca-mprice">
        {cell.pay !== null ? (
          <b className="price">{g.money(cell.pay)}</b>
        ) : null}
        {cell.offer && cell.saving > 0 ? (
          <span className="ca-savetxt">
            {g.w("pair.save", { amount: g.money(cell.saving) })}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-primary ca-mbtn"
        aria-busy={g.busy || undefined}
        onClick={(e) => onAdd(e.currentTarget, false)}
        data-testid="ca-cta"
      >
        {label}
      </button>
    </div>
  );
}

function EditNote({ env, g }: { env: PairEnv; g: Page }) {
  if (!env.editGroupKey) return null;
  return (
    <div className="ca-editnote" data-testid="ca-editnote">
      <Icon name="edit" size={14} />
      <span>{g.w("pair.edit")}</span>
    </div>
  );
}

function ErrLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="ca-err" role="alert" data-testid="ca-err">
      <Icon name="info" size={14} />
      <span>{msg}</span>
    </div>
  );
}

/** "Other pairs in Polo" (demo ca_otherPairs): the style's other colour pairs, this one marked. */
function Others({ env, g, me }: { env: PairEnv; g: Page; me: ListPair }) {
  const list = otherPairsOf(env.side.pairs, me, env.otherPairs);
  if (list.length < 2) return null;
  const style =
    productOf(env, me.pieces[0]!.productId)?.name ?? env.side.rule.title;
  return (
    <section className="ca-sec ca-others">
      <div className="h3">
        {g.w(me.pieces.length === 3 ? "pair.othersSets" : "pair.others", {
          style,
        })}
      </div>
      <div className="ca-strip3" data-testid="ca-others">
        {list.map((x) => {
          const on = x.slug === me.slug;
          return (
            <a
              key={x.slug}
              className={`ca-mini${on ? " on" : ""}`}
              href={g.href(x.slug)}
              aria-current={on ? "page" : undefined}
              title={g.title(x.pieces)}
            >
              <HubPicture
                parts={g.parts(x.pieces)}
                lang={env.lang}
                alt={g.title(x.pieces)}
                layout="thumb"
              />
              <span>{g.title(x.pieces)}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

/** "Each colour" (demo ca_gallery): each piece on its own. */
function Gallery({
  env,
  g,
  pieces,
}: {
  env: PairEnv;
  g: Page;
  pieces: readonly ListPiece[];
}) {
  const seen = new Set<string>();
  const list = pieces.filter(
    (p) => !seen.has(keyOf(p)) && Boolean(seen.add(keyOf(p))),
  );
  return (
    <section className="ca-sec" data-testid="ca-gallery">
      <div className="h3">{g.w("pair.gallery")}</div>
      <div className="ca-gal">
        {list.map((p) => {
          const part = g.parts([p])[0]!;
          return (
            <div key={keyOf(p)} className="ca-gt">
              <HubPicture
                parts={[part]}
                lang={env.lang}
                alt={part.name}
                layout="thumb"
              />
              <span>{part.name}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The size chart, folded (demo ca_chart): one table per product, the picked size marked. */
function Chart({
  env,
  g,
  pieces,
  picked,
}: {
  env: PairEnv;
  g: Page;
  pieces: readonly ListPiece[];
  picked: string | null;
}) {
  const [open, setOpen] = useState(false);
  const products = [...new Set(pieces.map((p) => p.productId))].flatMap(
    (id) => {
      const p = productOf(env, id);
      return p?.chart ? [p] : [];
    },
  );
  if (!products.length) return null;
  return (
    <section className="ca-sec" data-testid="ca-chart">
      <button
        type="button"
        className="ca-acc"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="ruler" size={18} />
        <span className="grow">
          {g.w(
            products.length === 1 &&
              new Set(pieces.map((p) => p.productId)).size > 1
              ? "pair.chartOne"
              : "pair.chart",
          )}
        </span>
        <Icon name={open ? "up" : "down"} size={16} />
      </button>
      {open
        ? products.map((p) => (
            <div key={p.id}>
              {products.length > 1 ? (
                <div className="xs bold mt12">{p.name}</div>
              ) : null}
              <div className="tbl-wrap mt8">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{g.w("pair.size")}</th>
                      {p.chart!.fields.map((f) => (
                        <th key={f}>{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.sizes
                      .filter((s) => p.chart!.rows[s.id])
                      .map((s) => (
                        <tr
                          key={s.id}
                          className={s.key === picked ? "sel" : undefined}
                        >
                          <td>{s.label}</td>
                          {p.chart!.rows[s.id]!.inch.map((v, i) => (
                            <td key={i}>{v === null ? "" : g.num(v)}</td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        : null}
    </section>
  );
}

function Ask({
  env,
  g,
  pieces,
  sizes,
}: {
  env: PairEnv;
  g: Page;
  pieces: readonly ListPiece[];
  sizes: readonly (string | null)[];
}) {
  if (!env.whatsapp) return null;
  const picked = sizes.filter(Boolean);
  const href = waHref(
    env.whatsapp,
    g.w("pair.askText", {
      store: env.store,
      name: g.title(pieces),
      sizes: picked.length === pieces.length ? ` (${picked.join("/")})` : "",
    }),
  );
  if (!href) return null;
  return (
    <section className="ca-sec">
      <a
        className="wa-btn btn-block"
        href={href}
        target="_blank"
        rel="noopener"
        data-testid="ca-wa"
      >
        <span>{g.w("pair.ask")}</span>
      </a>
    </section>
  );
}

/** The sold-out box with the style's pairs still in stock (demo ca_soldOut). */
function SoldOut({ env, g, me }: { env: PairEnv; g: Page; me: ListPair }) {
  const alt = env.side.pairs.filter((p) => p.openSizes > 0).slice(0, 6);
  return (
    <>
      <div className="ca-soldout" data-testid="ca-soldout">
        <div className="h2">{g.w("pair.soldOut")}</div>
        <p className="small text2 mt8">
          {g.w("pair.soldOutText", { name: g.title(me.pieces) })}
        </p>
      </div>
      <div className="ca-grid mt16">
        {alt.map((x) => (
          <a
            key={x.slug}
            className="ca-card"
            href={g.href(x.slug)}
            data-testid="ca-card"
          >
            <HubPicture
              parts={g.parts(x.pieces)}
              lang={env.lang}
              alt={g.title(x.pieces)}
            />
            <div className="ca-cinfo">
              <div className="ca-ctitle">{g.title(x.pieces)}</div>
              {x.price.pay !== null ? (
                <div className="ca-cprice">
                  <b className="price">{g.money(x.price.pay)}</b>
                </div>
              ) : null}
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

/** A row of size pills (a size of all pieces, or of one piece). */
function Pills({
  sizes,
  value,
  onPick,
  onOut,
  label,
  id,
}: {
  sizes: { key: string; label: string; ok: boolean; why?: string }[];
  value: string | null;
  onPick: (k: string) => void;
  onOut?: (k: string) => void;
  label: string;
  id?: string;
}) {
  return (
    <div
      className={`ca-sizes n${sizes.length}`}
      role="group"
      aria-label={label}
      id={id}
    >
      {sizes.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`size-pill${s.key === value ? " on" : ""}${s.ok ? "" : " out"}`}
          aria-pressed={s.key === value}
          aria-disabled={!s.ok || undefined}
          aria-label={s.ok ? undefined : (s.why ?? s.label)}
          onClick={() => (s.ok ? onPick(s.key) : onOut?.(s.key))}
          data-testid="ca-size"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// P1 pair page and P5 fixed pack (one size for the set, or one per piece)
// ---------------------------------------------------------------------------------------------------------------

function PairOrPack({
  env,
  g,
  pack,
}: {
  env: PairEnv;
  g: Page;
  pack: boolean;
}) {
  const me = env.me;
  const shared = bothSizes(env, me.pieces);
  const [mode, setMode] = useState<"both" | "each">(
    shared.length ? "both" : "each",
  );
  const [size, setSize] = useState<string | null>(null);
  const [sizes, setSizes] = useState<(string | null)[]>(() =>
    me.pieces.map(() => null),
  );
  const [up, setUp] = useState(false);
  const [upColour, setUpColour] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ups = !pack && env.upsell ? upsellOptions(env) : [];
  const upPick = up ? ups.find((x) => x.colourId === upColour) : undefined;
  const T = upPick?.pair ?? me;
  const side: PairSide = upPick && env.companion ? env.companion : env.side;
  // each piece of T: its size (in "each" mode the 3rd piece takes the first piece's size, demo ca_sizesFor)
  const pieceKeys =
    mode === "both"
      ? T.pieces.map(() => size)
      : slotSizes({ slots: T.pieces }, me.pieces, sizes);
  const slotKeys = slotSizes(T, T.pieces, pieceKeys);
  const complete = pieceKeys.every((k) => k !== null);
  const cell = priceIn(env, side, T, complete ? slotKeys : null);
  const n = T.pieces.length;
  const tSizes = bothSizes(env, T.pieces);
  const missing = ((): Missing | null => {
    if (up && !upPick)
      return { label: g.w("pair.pickThird"), at: "ca-upsell", msg: null };
    if (!complete)
      return {
        label: g.w(mode === "each" ? "pair.chooseEach" : "pair.chooseSize"),
        at: "ca-sizes",
        msg: null,
      };
    for (let i = 0; i < n; i++) {
      if (!pieceOk(env, T.pieces, i, pieceKeys[i]!)) {
        const label =
          productOf(env, T.pieces[i]!.productId)?.sizes.find(
            (s) => s.key === pieceKeys[i],
          )?.label ?? pieceKeys[i]!;
        return {
          label: g.w("pair.chooseSize"),
          at: "ca-sizes",
          msg: g.w("pair.soldOutSize", {
            colour: colourOf(env, T.pieces[i]!)?.name ?? "",
            size: label,
          }),
        };
      }
    }
    return null;
  })();
  const label = missing
    ? missing.label
    : cell.pay !== null
      ? g.w(n === 3 ? "list.add3" : "list.add2", { price: g.money(cell.pay) })
      : g.w("pair.chooseSize");
  const onAdd = (from: Element, checkout: boolean) => {
    if (missing) {
      setErr(missing.msg ?? missing.label);
      scrollToId(missing.at);
      return;
    }
    g.add(T, slotKeys, from, checkout);
  };
  if (me.openSizes === 0) return <SoldOut env={env} g={g} me={me} />;

  const sizeBox = (
    <div id="ca-sizes" className={`ca-sizebox${err ? " err" : ""}`}>
      {mode === "both" ? (
        <>
          <div className="ca-lbl">
            {g.w(n === 3 ? "list.sizeFor3" : "list.sizeFor2")}
          </div>
          <Pills
            sizes={tSizes.map((s) => ({
              ...s,
              why: g.w("list.outWhy", { size: s.label }),
            }))}
            value={size}
            label={g.w(n === 3 ? "list.sizeFor3" : "list.sizeFor2")}
            onPick={(k) => {
              setSize(k);
              setErr(null);
            }}
            onOut={(k) =>
              setErr(
                g.w("list.outWhy", {
                  size: tSizes.find((s) => s.key === k)?.label ?? k,
                }),
              )
            }
          />
          {tSizes.some((s) => !s.ok) ? (
            <div className="ca-why" data-testid="ca-why">
              {tSizes
                .filter((s) => !s.ok)
                .map((s) => g.w("list.outWhy", { size: s.label }))
                .join(" · ")}
            </div>
          ) : null}
          {size && tSizes.find((s) => s.key === size)?.ok
            ? (() => {
                const left = Math.min(
                  ...T.pieces.map((p) => leftOf(env, p, size)),
                );
                return left <= 2 ? (
                  <div className="ca-low">
                    {g.w("pair.low", {
                      n: g.num(left),
                      size: tSizes.find((s) => s.key === size)!.label,
                    })}
                  </div>
                ) : null;
              })()
            : null}
          <ErrLine msg={err} />
          <button
            type="button"
            className="link xs"
            onClick={() => setMode("each")}
            data-testid="ca-each"
          >
            {g.w("pair.diff")}
          </button>
        </>
      ) : (
        <>
          <div className="ca-lbl">{g.w("pair.sizeEach")}</div>
          {me.pieces.map((p, i) => {
            const product = productOf(env, p.productId);
            const col = colourOf(env, p);
            return (
              <div key={i} className="ca-eachrow">
                <div className="ca-lbl">
                  <i className="ca-dot" style={{ background: col?.hex }} />
                  {[col?.name, me.sameProduct ? null : product?.name]
                    .filter(Boolean)
                    .join(" ")}
                </div>
                <Pills
                  sizes={(product?.sizes ?? []).map((s) => ({
                    key: s.key,
                    label: s.label,
                    ok: pieceOk(env, me.pieces, i, s.key),
                    why: g.w("list.outWhy", { size: s.label }),
                  }))}
                  value={sizes[i] ?? null}
                  label={[col?.name, product?.name].filter(Boolean).join(" ")}
                  onPick={(k) => {
                    setSizes((a) => a.map((x, j) => (j === i ? k : x)));
                    setErr(null);
                  }}
                />
              </div>
            );
          })}
          {T !== me
            ? (() => {
                const extra = T.pieces.find(
                  (p) => !me.pieces.some((x) => x.colourId === p.colourId),
                );
                return extra ? (
                  <div className="xs muted">
                    {g.w("pair.comesIn", {
                      colour: colourOf(env, extra)?.name ?? "",
                      other: colourOf(env, me.pieces[0]!)?.name ?? "",
                    })}
                  </div>
                ) : null;
              })()
            : null}
          <ErrLine msg={err} />
          {shared.length ? (
            <button
              type="button"
              className="link xs"
              onClick={() => setMode("both")}
            >
              {g.w(n === 3 ? "pair.same3" : "pair.same2")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );

  const upsell = ups.length ? (
    <div
      id="ca-upsell"
      className={`ca-up${up ? " on" : ""}`}
      data-testid="ca-upsell"
    >
      <button
        type="button"
        className="ca-uptick"
        aria-pressed={up}
        onClick={() => {
          setUp((u) => !u);
          setErr(null);
        }}
      >
        <span className="ca-box">
          {up ? <Icon name="check" size={14} /> : null}
        </span>
        <span>
          {(() => {
            const t0 = ups[0]!.pair.price;
            return g.w("pair.upsell", {
              add: g.money(Math.max(0, (t0.pay ?? 0) - (me.price.pay ?? 0))),
              total: g.money(t0.pay ?? 0),
              each: g.money(Math.round((t0.pay ?? 0) / (me.pieces.length + 1))),
              save: g.money(t0.saving),
            });
          })()}
        </span>
      </button>
      {up ? (
        <div
          className="ca-upcols"
          role="group"
          aria-label={g.w("pair.upLabel")}
        >
          {ups.map((x) => {
            const col = productOf(env, me.pieces[0]!.productId)?.colours.find(
              (c) => c.id === x.colourId,
            );
            const ok =
              mode !== "both" ||
              !size ||
              pieceOk(
                env,
                [
                  ...me.pieces,
                  { productId: me.pieces[0]!.productId, colourId: x.colourId },
                ],
                me.pieces.length,
                size,
              );
            return (
              <button
                key={x.colourId}
                type="button"
                className={`ca-sw${upColour === x.colourId ? " on" : ""}${ok ? "" : " out"}`}
                aria-pressed={upColour === x.colourId}
                aria-disabled={!ok || undefined}
                onClick={() => {
                  if (!ok) return;
                  setUpColour(x.colourId);
                  setErr(null);
                }}
                data-testid="ca-upcol"
              >
                <i style={{ background: col?.hex }} />
                <span>{col?.name}</span>
                {ok ? null : (
                  <em>
                    {g.w("pair.upOut", {
                      size:
                        tSizes.find((s) => s.key === size)?.label ?? size ?? "",
                    })}
                  </em>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  ) : null;

  const packs = pack
    ? (() => {
        const others = otherPairsOf(
          env.side.pairs,
          me,
          Number.MAX_SAFE_INTEGER,
        ).filter((x) => x.slug !== me.slug);
        const shown = [me, ...others].slice(0, env.packSwatches);
        const total = others.length + 1;
        return (
          <>
            <div className="ca-lbl">{g.w("pair.packColours")}</div>
            <div className="ca-packs" data-testid="ca-packs">
              {shown.map((x) => {
                const on = x.slug === me.slug;
                const stops = x.pieces
                  .map(
                    (p, i) =>
                      `${colourOf(env, p)?.hex ?? "transparent"} ${Math.round((i * 100) / x.pieces.length)}% ${Math.round(((i + 1) * 100) / x.pieces.length)}%`,
                  )
                  .join(",");
                return (
                  <a
                    key={x.slug}
                    className={`ca-pack${on ? " on" : ""}`}
                    href={g.href(x.slug)}
                    aria-current={on ? "page" : undefined}
                    aria-label={g.title(x.pieces)}
                  >
                    <i style={{ background: `conic-gradient(${stops})` }} />
                    <span>
                      {x.pieces
                        .map(
                          (p) => (colourOf(env, p)?.name ?? "").split(" ")[0],
                        )
                        .join(" + ")}
                    </span>
                  </a>
                );
              })}
              {total > shown.length ? (
                <a className="ca-pack ca-packmore" href={env.hrefs.rule}>
                  <i>
                    <Icon name="right" size={16} />
                  </i>
                  <span>{g.w("pair.allPacks", { n: g.num(total) })}</span>
                </a>
              ) : null}
            </div>
          </>
        );
      })()
    : null;

  const style =
    productOf(env, me.pieces[0]!.productId)?.name ?? env.side.rule.title;
  return (
    <>
      <div className="ca-pp">
        <div className="ca-left">
          <Hero env={env} g={g} pieces={T.pieces} cell={cell} layout="fan" />
        </div>
        <div className="ca-info">
          <EditNote env={env} g={g} />
          <div className="eyebrow">
            {pack
              ? g.w("pair.packEyebrow", { n: g.num(n) })
              : g.w("pair.eyebrow", { style, rule: env.side.rule.title })}
          </div>
          <h1 className="h1 ca-h1">
            {pack
              ? g.w("pair.packTitle", {
                  style,
                  colours: T.pieces
                    .map((p) => colourOf(env, p)?.name ?? "")
                    .join(", "),
                })
              : g.title(T.pieces)}
          </h1>
          <PriceLine g={g} cell={cell} n={n} />
          {packs}
          {sizeBox}
          <Trust env={env} g={g} cell={cell} />
          <Ctas g={g} label={label} onAdd={onAdd} />
          {upsell}
        </div>
      </div>
      {pack ? null : <Others env={env} g={g} me={me} />}
      <Gallery env={env} g={g} pieces={T.pieces} />
      <Chart env={env} g={g} pieces={T.pieces} picked={size} />
      <Ask env={env} g={g} pieces={T.pieces} sizes={pieceKeys} />
      <MBar g={g} cell={cell} label={label} onAdd={onAdd} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// P2 pick your colours
// ---------------------------------------------------------------------------------------------------------------

function PickColours({ env, g }: { env: PairEnv; g: Page }) {
  const me = env.me;
  const tiers = env.companion
    ? [env.side, env.companion].sort((a, b) => a.rule.pieces - b.rule.pieces)
    : null;
  const [n, setN] = useState(env.side.rule.pieces);
  const side = tiers?.find((t) => t.rule.pieces === n) ?? env.side;
  const across = side.rule.pairing === "ACROSS";
  const [picks, setPicks] = useState<string[]>(() => me.pieces.map(keyOf));
  const [size, setSize] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const res = resolvePicks(side, picks);
  const T = res.pair;
  const groups = pickGroups(env, side, me);
  const sizes = bothSizes(
    env,
    T ? T.pieces : res.pieces.length ? res.pieces : me.pieces,
  );
  const sizeOk = Boolean(size && sizes.find((s) => s.key === size)?.ok);
  const slotKeys = T ? T.slots.map(() => size) : null;
  const cell = T
    ? priceIn(env, side, T, sizeOk ? slotKeys : null)
    : (side.pairs.find((p) => p.openSizes > 0)?.price ?? me.price);
  const left = res.need - res.pieces.length;
  const missing: Missing | null =
    left > 0
      ? { label: g.plural("pair.pickMore", left), at: "ca-pick", msg: null }
      : !T
        ? {
            label: g.w("pair.chooseAnother"),
            at: "ca-pick",
            msg: g.w("pair.notOffered"),
          }
        : !sizeOk
          ? { label: g.w("pair.chooseSize"), at: "ca-sizes", msg: null }
          : null;
  const label = missing
    ? missing.label
    : g.w(res.need === 3 ? "list.add3" : "list.add2", {
        price: g.money(cell.pay ?? 0),
      });
  const onAdd = (from: Element, checkout: boolean) => {
    if (missing || !T) {
      setErr(missing?.msg ?? missing?.label ?? null);
      scrollToId(missing?.at ?? "ca-pick");
      return;
    }
    g.add(T, slotKeys!, from, checkout);
  };
  const slots: (ListPiece | null)[] = Array.from(
    { length: res.need },
    (_, i) => res.pieces[i] ?? null,
  );
  const shownPieces = slots.filter((p): p is ListPiece => p !== null);
  const style =
    productOf(env, me.pieces[0]!.productId)?.name ?? side.rule.title;
  return (
    <>
      <div className="ca-pp">
        <div className="ca-left">
          <Hero
            env={env}
            g={g}
            pieces={shownPieces.length ? shownPieces : me.pieces}
            cell={T ? cell : null}
            layout="fan"
          />
        </div>
        <div className="ca-info">
          <EditNote env={env} g={g} />
          <div className="eyebrow">{g.w("pair.pickEyebrow", { style })}</div>
          <h1 className="h1 ca-h1">
            {T ? g.title(T.pieces) : g.w("pair.pickTitle")}
          </h1>
          <PriceLine g={g} cell={cell} n={res.need} />
          {tiers ? (
            <div
              className="ca-tiers"
              role="radiogroup"
              aria-label={g.w("pair.howMany")}
              data-testid="ca-tiers"
            >
              {tiers.map((t) => {
                const first = t.pairs.find((p) => p.openSizes > 0);
                if (!first || first.price.pay === null) return null;
                const on = t.rule.pieces === n;
                return (
                  <button
                    key={t.rule.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`ca-tierc${on ? " on" : ""}`}
                    onClick={() => {
                      setN(t.rule.pieces);
                      setPicks((p) => p.slice(0, t.rule.pieces));
                      setErr(null);
                    }}
                  >
                    <span className="ca-radio" />
                    <span>
                      <b>
                        {g.w("pair.tier", {
                          n: g.num(t.rule.pieces),
                          price: g.money(first.price.pay),
                        })}
                      </b>
                      {first.price.offer && first.price.saving > 0 ? (
                        <span className="xs">
                          {g.w("pair.save", {
                            amount: g.money(first.price.saving),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {groups.map((gr, gi) => {
            const product = productOf(env, gr.productId);
            return (
              <div
                key={`${gr.productId}-${gi}`}
                className="ca-pickg"
                id={gi === 0 ? "ca-pick" : undefined}
              >
                <div className="ca-lbl">
                  {across
                    ? g.w("pair.pieceColour", { noun: product?.name ?? "" })
                    : g.w("pair.pickN", { n: g.num(gr.pick) })}
                </div>
                <div className="ca-swgrid">
                  {(product?.colours ?? [])
                    .filter((c) => gr.colours.includes(c.id))
                    .map((c) => {
                      const k = `${gr.productId}|${c.id}`;
                      const ix = across
                        ? picks[gi] === k
                          ? gi
                          : -1
                        : picks.indexOf(k);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`ca-swb${ix >= 0 ? " on" : ""}`}
                          aria-pressed={ix >= 0}
                          onClick={() => {
                            setPicks((p) =>
                              togglePick(p, k, gi, across, res.need),
                            );
                            setErr(null);
                          }}
                          data-testid="ca-swb"
                        >
                          <i style={{ background: c.hex }}>
                            {ix >= 0 && !across ? <b>{g.num(ix + 1)}</b> : null}
                          </i>
                          <span>{c.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
          <div id="ca-sizes" className={`ca-sizebox${err ? " err" : ""}`}>
            <div className="ca-lbl">
              {g.w(res.need === 3 ? "list.sizeFor3" : "list.sizeFor2")}
            </div>
            <Pills
              sizes={sizes.map((s) => ({
                ...s,
                why: g.w("list.outWhy", { size: s.label }),
              }))}
              value={size}
              label={g.w(res.need === 3 ? "list.sizeFor3" : "list.sizeFor2")}
              onPick={(k) => {
                setSize(k);
                setErr(null);
              }}
            />
            <ErrLine msg={err} />
          </div>
          <Trust env={env} g={g} cell={cell} />
          <Ctas g={g} label={label} onAdd={onAdd} />
        </div>
      </div>
      {T ? <Gallery env={env} g={g} pieces={T.pieces} /> : null}
      <Chart env={env} g={g} pieces={me.pieces} picked={size} />
      <MBar g={g} cell={cell} label={label} onAdd={onAdd} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// P3 top + bottom and P4 mixed set (a colour and a size per piece)
// ---------------------------------------------------------------------------------------------------------------

function MixSet({ env, g, rows }: { env: PairEnv; g: Page; rows: boolean }) {
  const me = env.me;
  const [cols, setCols] = useState<string[]>(() =>
    me.pieces.map((p) => p.colourId),
  );
  const [sizes, setSizes] = useState<(string | null)[]>(() =>
    me.pieces.map(() => null),
  );
  const [auto, setAuto] = useState<boolean[]>(() => me.pieces.map(() => false));
  const [mix, setMix] = useState(
    () => !me.pieces.every((p) => p.colourId === me.pieces[0]!.colourId),
  );
  const [same, setSame] = useState(false);
  const [open, setOpen] = useState(-1);
  const [err, setErr] = useState<{ at: number; msg: string } | null>(null);
  const pcs: ListPiece[] = me.pieces.map((p, i) => ({
    productId: p.productId,
    colourId: cols[i] ?? p.colourId,
  }));
  const T = findPair(env.side.pairs, pcs);
  const nouns = pieceNouns(
    pcs.map((p) => productOf(env, p.productId)?.name ?? ""),
    g.num,
  );
  const common = commonColours(env.side.pairs, me, (id) =>
    (productOf(env, id)?.colours ?? []).map((c) => c.id),
  );
  const allSame = pcs.every((p) => p.colourId === pcs[0]!.colourId);
  const group = rows ? sameSizeGroup(env, pcs) : [];
  const okAt = (i: number, k: string) => pieceOk(env, pcs, i, k);
  const slotKeys = T ? slotSizes(T, pcs, sizes) : null;
  const complete = sizes.every((s, i) => s !== null && okAt(i, s));
  const cell = T
    ? priceIn(env, env.side, T, complete ? slotKeys : null)
    : me.price;
  const missingAt = pcs.findIndex((_, i) => !sizes[i] || !okAt(i, sizes[i]!));
  const missN = pcs.filter((_, i) => !sizes[i] || !okAt(i, sizes[i]!)).length;
  const missing: Missing | null = !T
    ? {
        label: g.w("pair.chooseAnother"),
        at: "ca-mx-0",
        msg: g.w("pair.notOffered"),
      }
    : missingAt < 0
      ? null
      : {
          label:
            pcs.length === 1
              ? g.w("pair.chooseSize")
              : !rows
                ? g.w("pair.chooseNoun", { noun: nouns[missingAt]! })
                : missN === pcs.length
                  ? g.w("pair.chooseN", { n: g.num(missN) })
                  : g.plural("pair.chooseMore", missN),
          at: `ca-mx-${missingAt}`,
          msg:
            sizes[missingAt] && !okAt(missingAt, sizes[missingAt]!)
              ? g.w("pair.soldOutSize", {
                  colour: `${colourOf(env, pcs[missingAt]!)?.name ?? ""} ${nouns[missingAt]}`,
                  size: sizeLabel(missingAt, sizes[missingAt]!),
                })
              : g.w("pair.sizeFor", { noun: nouns[missingAt]! }),
        };
  function sizeLabel(i: number, k: string) {
    return (
      productOf(env, pcs[i]!.productId)?.sizes.find((s) => s.key === k)
        ?.label ?? k
    );
  }
  const label = missing
    ? missing.label
    : g.w(pcs.length === 3 ? "list.add3" : "list.add2", {
        price: g.money(cell.pay ?? 0),
      });
  const onAdd = (from: Element, checkout: boolean) => {
    if (missing || !T) {
      const at = missing ? Number(missing.at.replace("ca-mx-", "")) : 0;
      setErr({ at, msg: missing?.msg ?? "" });
      if (rows) setOpen(-1);
      scrollToId(missing?.at ?? "ca-mx-0");
      return;
    }
    g.add(T, slotKeys!, from, checkout);
  };
  // a colour changed: sizes the new colour does not have go
  const withCols = (next: string[]) => {
    setCols(next);
    setErr(null);
    const nextPcs = me.pieces.map((p, i) => ({
      productId: p.productId,
      colourId: next[i] ?? p.colourId,
    }));
    setSizes((a) =>
      a.map((s, i) => (s && pieceOk(env, nextPcs, i, s) ? s : null)),
    );
  };
  const pickSize = (i: number, k: string) => {
    setErr(null);
    if (open === i) setOpen(-1);
    const out = sizes.map((x, j) => (j === i ? k : x));
    const nextAuto = auto.map((x, j) => (j === i ? false : x));
    // P3: the first piece's size fills the others still open or filled the same way ("Same as top")
    if (!rows && i === 0)
      pcs.forEach((_, j) => {
        if (j > 0 && (auto[j] || !sizes[j]) && okAt(j, k)) {
          out[j] = k;
          nextAuto[j] = true;
        }
      });
    // P4: "Same size for all tops"
    if (rows && same && group.includes(i))
      for (const j of group) if (j !== i && okAt(j, k)) out[j] = k;
    setSizes(out);
    setAuto(nextAuto);
  };
  const swatch = (
    i: number,
    c: { id: string; ok: boolean },
    on: boolean,
    act: () => void,
  ) => {
    const col = productOf(env, pcs[Math.max(i, 0)]!.productId)?.colours.find(
      (x) => x.id === c.id,
    );
    return (
      <button
        key={c.id}
        type="button"
        className={`ca-mxc${on ? " on" : ""}${c.ok ? "" : " out"}`}
        aria-pressed={on}
        aria-disabled={!c.ok || undefined}
        aria-label={
          c.ok
            ? col?.name
            : g.w("pair.notAvailable", { colour: col?.name ?? "" })
        }
        onClick={() => c.ok && act()}
        data-testid="ca-mxc"
      >
        <i style={{ background: col?.hex }} />
      </button>
    );
  };
  const colourRow = (i: number, lbl: string) => (
    <div key={`c${i}`} className="ca-mxblk">
      <div className="ca-lbl">
        {lbl} <span className="ca-mxv">· {colourOf(env, pcs[i]!)?.name}</span>
      </div>
      <div className="ca-mxsw" role="group" aria-label={lbl}>
        {mixColours(env, env.side.pairs, pcs, i).map((c) =>
          swatch(i, c, c.id === pcs[i]!.colourId, () =>
            withCols(cols.map((x, j) => (j === i ? c.id : x))),
          ),
        )}
      </div>
    </div>
  );
  const sizeRow = (i: number, lbl: string, note: string) => {
    const product = productOf(env, pcs[i]!.productId);
    const outs = (product?.sizes ?? []).filter((s) => !okAt(i, s.key));
    const left =
      sizes[i] && okAt(i, sizes[i]!) ? leftOf(env, pcs[i]!, sizes[i]!) : 0;
    return (
      <div
        key={`s${i}`}
        className={`ca-mxblk ca-sizebox${err?.at === i ? " err" : ""}`}
        id={`ca-mx-${i}`}
      >
        <div className="ca-lbl">
          {lbl}
          {sizes[i] ? (
            <span className="ca-mxv"> · {sizeLabel(i, sizes[i]!)}</span>
          ) : null}
        </div>
        <Pills
          sizes={(product?.sizes ?? []).map((s) => ({
            key: s.key,
            label: s.label,
            ok: okAt(i, s.key),
            why: g.w("list.outWhy", { size: s.label }),
          }))}
          value={sizes[i] ?? null}
          label={lbl}
          onPick={(k) => pickSize(i, k)}
          onOut={(k) =>
            setErr({
              at: i,
              msg: g.w("pair.soldOutSize", {
                colour: `${colourOf(env, pcs[i]!)?.name ?? ""} ${nouns[i]}`,
                size: sizeLabel(i, k),
              }),
            })
          }
        />
        {outs.length ? (
          <div className="ca-why">
            {outs.map((s) => g.w("list.outWhy", { size: s.label })).join(" · ")}
          </div>
        ) : null}
        {left && left <= 2 ? (
          <div className="ca-low">
            {g.w("pair.low", { n: g.num(left), size: sizeLabel(i, sizes[i]!) })}
          </div>
        ) : null}
        {note ? <div className="xs muted mt4">{note}</div> : null}
        {err?.at === i ? <ErrLine msg={err.msg} /> : null}
      </div>
    );
  };

  let body: ReactNode;
  if (!rows) {
    const colour =
      !mix && allSame && common.length >= 2 ? (
        <div className="ca-mxblk">
          <div className="ca-lblrow">
            <div className="ca-lbl">
              {g.w("pair.setColour")}{" "}
              <span className="ca-mxv">· {colourOf(env, pcs[0]!)?.name}</span>
            </div>
            <button
              type="button"
              className="link xs"
              onClick={() => setMix(true)}
              data-testid="ca-mxmix"
            >
              {g.w("pair.mix")}
            </button>
          </div>
          <div
            className="ca-mxsw"
            role="group"
            aria-label={g.w("pair.setColour")}
          >
            {common.map((c) =>
              swatch(0, { id: c, ok: true }, c === pcs[0]!.colourId, () =>
                withCols(pcs.map(() => c)),
              ),
            )}
          </div>
        </div>
      ) : (
        <>
          {pcs.map((_, i) =>
            colourRow(i, g.w("pair.pieceColour", { noun: nouns[i]! })),
          )}
          {common.length >= 2 ? (
            <button
              type="button"
              className="link xs"
              onClick={() => {
                setMix(false);
                const c = common.includes(cols[0]!) ? cols[0]! : common[0]!;
                withCols(pcs.map(() => c));
              }}
            >
              {g.w(pcs.length === 3 ? "pair.sameColour3" : "pair.sameColour2")}
            </button>
          ) : null}
        </>
      );
    body = (
      <>
        {colour}
        {!T ? <ErrLine msg={g.w("pair.notOffered")} /> : null}
        {pcs.map((_, i) =>
          sizeRow(
            i,
            g.w("pair.pieceSize", { noun: nouns[i]! }),
            i > 0 && auto[i] && sizes[i]
              ? g.w("pair.sameAs", { noun: nouns[0]! })
              : "",
          ),
        )}
      </>
    );
  } else {
    body = (
      <>
        {!T ? <ErrLine msg={g.w("pair.notOffered")} /> : null}
        {group.length ? (
          <button
            type="button"
            className="ca-uptick ca-mxsame"
            aria-pressed={same}
            onClick={() => {
              const on = !same;
              setSame(on);
              const first = group.map((j) => sizes[j]).find(Boolean);
              if (on && first)
                setSizes((a) =>
                  a.map((s, j) =>
                    group.includes(j) && okAt(j, first) ? first : s,
                  ),
                );
            }}
          >
            <span className="ca-box">
              {same ? <Icon name="check" size={14} /> : null}
            </span>
            <span>{g.w("pair.sameTops")}</span>
          </button>
        ) : null}
        <div className="ca-prows">
          {pcs.map((p, i) => {
            const part = g.parts([p])[0]!;
            const thumb = (
              <div className="ca-prth">
                <HubPicture
                  parts={[part]}
                  lang={env.lang}
                  alt={part.name}
                  layout="thumb"
                />
              </div>
            );
            const done = Boolean(sizes[i] && okAt(i, sizes[i]!) && T);
            if (done && open !== i)
              return (
                <div
                  key={i}
                  className="ca-prow done"
                  id={`ca-mx-${i}`}
                  data-testid="ca-prow"
                >
                  {thumb}
                  <div className="ca-prdone">
                    <span className="ca-prok">
                      <Icon name="check" size={14} />
                    </span>
                    <span className="ca-prtxt">
                      <b>{nouns[i]}</b> · {colourOf(env, p)?.name} ·{" "}
                      {sizeLabel(i, sizes[i]!)}
                    </span>
                    <button
                      type="button"
                      className="link xs"
                      onClick={() => setOpen(i)}
                    >
                      {g.w("pair.change")}
                    </button>
                  </div>
                </div>
              );
            return (
              <div key={i} className="ca-prow" data-testid="ca-prow">
                <div className="ca-prhd">
                  {thumb}
                  <div className="ca-prnm">
                    <b>{nouns[i]}</b>
                    <span className="xs muted">{colourOf(env, p)?.name}</span>
                  </div>
                </div>
                <div
                  className="ca-mxsw"
                  role="group"
                  aria-label={g.w("pair.pieceColour", { noun: nouns[i]! })}
                >
                  {mixColours(env, env.side.pairs, pcs, i).map((c) =>
                    swatch(i, c, c.id === p.colourId, () =>
                      withCols(cols.map((x, j) => (j === i ? c.id : x))),
                    ),
                  )}
                </div>
                {sizeRow(i, g.w("pair.pieceSize", { noun: nouns[i]! }), "")}
              </div>
            );
          })}
        </div>
      </>
    );
  }
  const name = `${allSame ? `${colourOf(env, pcs[0]!)?.name ?? ""} ` : ""}${env.side.rule.title || nouns.join(" + ")}`;
  return (
    <>
      <div className={`ca-pp ${rows ? "ca-pp4" : "ca-pp3"}`}>
        <div className="ca-left">
          <Hero
            env={env}
            g={g}
            pieces={pcs}
            cell={T ? cell : null}
            layout="tb"
          />
        </div>
        <div className="ca-info">
          <EditNote env={env} g={g} />
          <div className="eyebrow hide-m">
            {g.w("pair.setOf", {
              nouns: nouns.join(" + "),
              n: g.num(pcs.length),
            })}
          </div>
          <h1 className="h1 ca-h1" data-testid="ca-h1">
            {name}
          </h1>
          <PriceLine g={g} cell={cell} n={pcs.length} />
          {body}
          <Trust env={env} g={g} cell={cell} />
          <Ctas g={g} label={label} onAdd={onAdd} />
        </div>
      </div>
      <Gallery env={env} g={g} pieces={pcs} />
      <Chart env={env} g={g} pieces={pcs} picked={sizes[0] ?? null} />
      <Ask env={env} g={g} pieces={pcs} sizes={sizes} />
      <MBar g={g} cell={cell} label={label} onAdd={onAdd} />
    </>
  );
}

/** The pair page in its template (a pair whose pieces share no size is sized piece by piece: P3's rows). */
export function PairPage({ env }: { env: PairEnv }) {
  const g = usePage(env);
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    beacon("/api/shop/combo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "view", comboId: env.me.comboId }),
      credentials: "same-origin",
    });
  }, [env.me.comboId]);
  const tpl = env.tpl === "P2" && !env.me.sizes.length ? "P3" : env.tpl;
  if (tpl === "P2") return <PickColours env={env} g={g} />;
  if (tpl === "P3") return <MixSet env={env} g={g} rows={false} />;
  if (tpl === "P4") return <MixSet env={env} g={g} rows />;
  return <PairOrPack env={env} g={g} pack={tpl === "P5"} />;
}
