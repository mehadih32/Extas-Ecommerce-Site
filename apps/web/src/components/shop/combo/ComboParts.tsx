"use client";
// PR 91 — the parts of the combo page around the pickers (demo 40-combo.js, the "customise" layout): the price box,
// inches or centimetres, the banner when a set in the bag is being changed, template C1 (one card per piece) and
// the layout switch, the set summary, the buttons, the WhatsApp question and the phone's bar. They all read the one
// state of ComboRoot; nothing here works out a price. The gallery (PR 93), the pairs (PR 94), each piece's picker
// (PR 95) and C2 (PR 92) have their own files.
import { stockOf, type PriceCell } from "@extas/combos/page-model";
import { colourNames, savePct } from "@/lib/shop/combo-model";
import { waHref } from "@/lib/shop/links";
import { Icon, WaGlyph } from "../Icon";
import { Dots, LookImage, pieceMinor } from "./ComboBits";
import { ItemHead, PickerBody } from "./ComboItem";
import { useCombo, type ComboApi } from "./ComboRoot";
import { ComboSteps } from "./ComboSteps";

/** The one set price, what the pieces cost separately and the saving (demo cb_priceBox). */
export function ComboPriceBox() {
  const api = useCombo();
  const { env, w, money, num } = api;
  const p: PriceCell = api.price;
  const save = p.offer && p.saving > 0 && p.regular !== null;
  const pct = savePct(p.saving, p.regular);
  return (
    <div className="card cb-pricebox" data-testid="cb-pricebox">
      <div
        className="row between top cb-pbrow"
        style={{ alignItems: "flex-start", gap: 12 }}
      >
        <div>
          <div className="eyebrow">
            {save ? w("price.setPrice") : w("price.forSet")}
          </div>
          <div className="price cb-big" data-testid="cb-price">
            {p.pay !== null ? money(p.pay) : ""}
          </div>
          {save ? (
            <div className="small mt8">
              <span className="muted">{w("price.separately")}</span>{" "}
              <span className="strike">{money(p.regular!)}</span>
            </div>
          ) : null}
        </div>
        {save ? (
          <span
            className="tag sale"
            style={{
              fontSize: 12.5,
              padding: "6px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {w("price.youSave", { amount: money(p.saving), pct: num(pct) })}
          </span>
        ) : null}
      </div>
      {env.parts.itemPrices ? (
        <div className="cb-reg zc-reglist">
          <div className="xs muted bold">{w("price.eachTitle")}</div>
          {env.pieces.map((piece, i) => {
            const m = pieceMinor(api, i);
            return (
              <div key={i} className="row between small">
                <span className="text2">
                  {w("price.eachLine", { n: num(i + 1), name: piece.name })}
                </span>
                <span className={save ? "strike" : ""}>
                  {m !== null ? money(m) : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {env.autoApply && save ? (
        <div className="xs muted mt12 row zc-auto" style={{ gap: 6 }}>
          <Icon name="check" size={14} />
          {w("price.auto")}
        </div>
      ) : null}
    </div>
  );
}

/** Inches or centimetres for every piece's measurements. */
export function ComboUnits() {
  const { ui, w, unit } = useCombo();
  return (
    <div className="seg" role="group" aria-label={w("pick.units")}>
      <button
        type="button"
        className={ui.cm ? "" : "on"}
        aria-pressed={!ui.cm}
        onClick={() => unit(false)}
      >
        {w("pick.inch")}
      </button>
      <button
        type="button"
        className={ui.cm ? "on" : ""}
        aria-pressed={ui.cm}
        onClick={() => unit(true)}
      >
        {w("pick.cm")}
      </button>
    </div>
  );
}

/** The set in the bag being changed (`?from=`): what to do (demo cb_editBanner). */
export function ComboEditBanner() {
  const { env, w } = useCombo();
  if (!env.editGroupKey) return null;
  return (
    <div className="zc-edit" data-testid="cb-edit-banner">
      <Icon name="swap" size={16} />
      <span>
        <b>{w("edit.banner", { name: env.name })}</b> {w("edit.how")}
      </span>
    </div>
  );
}

/** C1 (the shop's default): one card per piece (demo cb_c1). */
function C1({ api }: { api: ComboApi }) {
  const n = api.env.pieces.length;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {api.env.pieces.map((_, i) => (
        <div
          key={i}
          className={`card cb-item${api.ui.err?.i === i ? " err" : ""}`}
          id={`cb-item-${i}`}
          data-testid="cb-item"
        >
          <ItemHead
            api={api}
            i={i}
            label={api.w("pick.itemOf", {
              n: api.num(i + 1),
              total: api.num(n),
            })}
          />
          <PickerBody api={api} i={i} />
        </div>
      ))}
    </div>
  );
}

/** The pickers of the layout the owner chose (`combos.page.layout`). */
export function ComboPickers() {
  const api = useCombo();
  return api.env.layout === "C2" ? <ComboSteps api={api} /> : <C1 api={api} />;
}

/** The set summary (demo cb_summary): each piece, its pick and own price, then the set price. */
export function ComboSummary() {
  const api = useCombo();
  const { env, ui, w, money, num } = api;
  const n = env.pieces.length;
  const p = api.price;
  const save = p.offer && p.saving > 0 && p.regular !== null;
  const c2 = env.layout === "C2";
  const review = c2 && ui.step >= n;
  const title = c2
    ? review && api.check.ok
      ? w("summary.ready")
      : w("summary.yours")
    : w("summary.title");
  return (
    <div
      className={`card p16 zo-sum ${review ? "cb-review" : ""}`}
      id="cb-summary"
      data-testid="cb-summary"
    >
      <div className="row between">
        <div className="h3" style={{ fontSize: 16 }}>
          {title}
        </div>
        <span className="xs muted">
          {w(n === 1 ? "summary.items.one" : "summary.items.other", {
            n: num(n),
          })}
        </span>
      </div>
      {env.pieces.map((piece, i) => {
        const col = api.colourOf(i);
        const size = api.size(i);
        const ok =
          size !== null &&
          stockOf(env.slots[i]!, env.variants, ui.st.colours[i] ?? null, size) >
            0;
        const m = pieceMinor(api, i);
        return (
          <div key={i} className="cb-sum-line">
            <LookImage api={api} i={i} cls="cb-sum-img" />
            <div className="grow">
              <div className="small bold">{piece.name}</div>
              <div className={`xs ${ok ? "muted" : "sale bold"}`}>
                {size
                  ? w(ok ? "summary.line" : "summary.lineOut", {
                      colour: col?.name ?? "",
                      size: api.sizeLabel(i, size),
                    })
                  : `${col?.name ? `${col.name} · ` : ""}${w("summary.noSize")}`}
              </div>
            </div>
            <span className={`${save ? "strike " : ""}small`}>
              {m !== null ? money(m) : ""}
            </span>
          </div>
        );
      })}
      {save ? (
        <div className="row between mt12 small">
          <span className="muted">{w("summary.separately")}</span>
          <span className="strike">{money(p.regular!)}</span>
        </div>
      ) : null}
      <div className="row between mt8">
        <span className="bold">
          {save ? w("summary.setPrice") : w("summary.total")}
        </span>
        <span className="price" style={{ fontSize: 21 }}>
          {p.pay !== null ? money(p.pay) : ""}
        </span>
      </div>
      {save ? (
        <div className="row between mt8 small brandc bold">
          <span>{w("summary.youSave")}</span>
          <span>{money(p.saving)}</span>
        </div>
      ) : null}
      {c2 && !api.check.ok ? (
        <div className="xs muted mt12">{w("steps.finish")}</div>
      ) : null}
    </div>
  );
}

/** "Add set to Bag" and "Order Now" (or, changing a set in the bag, "Update set in bag" and "Back to bag"). */
export function ComboCtas() {
  const api = useCombo();
  const { env, w, busy } = api;
  if (env.editGroupKey)
    return (
      <div className="cb-ctas">
        <button
          type="button"
          className="btn btn-addbag"
          onClick={(e) => api.add(e.currentTarget, false)}
          aria-busy={busy || undefined}
          data-testid="cb-update"
        >
          <Icon name="check" size={18} />
          {w("cta.update")}
        </button>
        <a className="btn btn-ghost" href={env.hrefs.bag}>
          {w("cta.back")}
        </a>
      </div>
    );
  return (
    <div className="cb-ctas">
      <button
        type="button"
        className="btn btn-addbag"
        onClick={(e) => api.add(e.currentTarget, false)}
        aria-busy={busy || undefined}
        data-testid="cb-add"
      >
        <Icon name="bag" size={18} />
        {w("cta.add")}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={(e) => api.add(e.currentTarget, true)}
        aria-busy={busy || undefined}
        data-testid="cb-order"
      >
        {w("cta.order")}
      </button>
    </div>
  );
}

/** "Ask about this set on WhatsApp", naming the colours and sizes picked (demo cb_waText). */
export function ComboWhatsApp() {
  const api = useCombo();
  const { env, w } = api;
  if (!env.whatsapp) return null;
  const pieces = env.pieces
    .map((p, i) => {
      const size = api.size(i);
      const colour = api.colourOf(i)?.name ?? "";
      return size
        ? w("wa.piece", { colour, name: p.name, size: api.sizeLabel(i, size) })
        : w("wa.pieceNoSize", { colour, name: p.name });
    })
    .join(" + ");
  const href = waHref(
    env.whatsapp,
    w("wa.message", { store: env.store, name: env.name, pieces }),
  );
  if (!href) return null;
  return (
    <a
      className="wa-btn cb-wabtn btn-block"
      href={href}
      target="_blank"
      rel="noopener"
      data-testid="cb-wa"
    >
      <WaGlyph size={19} />
      <span>{w("wa.button")}</span>
    </a>
  );
}

/** The phone's bar: the set price, the saving, the colours and the two buttons (demo zc-mbar). */
export function ComboBar() {
  const api = useCombo();
  const { w, money } = api;
  const p = api.price;
  const save = p.offer && p.saving > 0 && p.regular !== null;
  return (
    <div className="mbar dm-hide cb-mbar zc-mbar" data-testid="cb-mbar">
      <div className="zc-mrow">
        <span className="price zc-mprice">
          {p.pay !== null ? money(p.pay) : ""}
        </span>
        {save ? <span className="strike xs">{money(p.regular!)}</span> : null}
        {save ? (
          <span className="xs brandc bold">
            {w("card.save", { amount: money(p.saving) })}
          </span>
        ) : null}
        <span className="zc-mcol">
          <Dots api={api} />
          <span className="zc-mnames xs muted">
            {colourNames(api.env.pieces, api.ui.st.colours)}
          </span>
        </span>
      </div>
      <ComboCtas />
    </div>
  );
}
