"use client";
// PR 95 — each piece of a set picks its own colour and size (demo cb_pickerBody): the colours with the true-colour
// note, the sizes with the ones not made or sold out struck, "Same size as item 1" for a repeated product, the
// chosen size's measurements in inches or centimetres, "Only N left" and the reason a pick cannot go in the bag.
import { linkSource, stockOf } from "@extas/combos/page-model";
import { Icon } from "../Icon";
import { LookImage, pieceMinor } from "./ComboBits";
import { type ComboApi } from "./ComboRoot";

/** One piece's head: its picture, its place in the set, its name, fit and own price. */
export function ItemHead({
  api,
  i,
  label,
}: {
  api: ComboApi;
  i: number;
  label: string;
}) {
  const piece = api.env.pieces[i]!;
  const m = pieceMinor(api, i);
  const struck = api.price.offer && api.price.saving > 0;
  // "৳850 on its own" / "আলাদা কিনলে ৳850": the price sits where each language puts it, struck when the set saves
  const [before, after] = api.w("pick.own").split("{price}");
  return (
    <div className="row" style={{ gap: 12 }}>
      <LookImage api={api} i={i} cls="cb-mini" />
      <div className="grow">
        <div className="eyebrow">{label}</div>
        <button
          type="button"
          className="zc-look h3 zc-lookname"
          onClick={() => api.look(i)}
          aria-label={api.w("pick.lookName", { name: piece.name })}
        >
          {piece.name}
        </button>
        <div className="xs muted">
          {piece.fit ? `${piece.fit} · ` : ""}
          {m !== null ? (
            <>
              {before}
              <span className={struck ? "strike" : ""}>{api.money(m)}</span>
              {after}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function measureLine(api: ComboApi, i: number): string | null {
  const piece = api.env.pieces[i]!;
  if (!piece.chart) return null;
  const size = api.size(i);
  const row = size ? piece.chart.rows[size] : undefined;
  if (!row) return api.w("pick.measurePick");
  const vals = api.ui.cm ? row.cm : row.inch;
  return piece.chart.fields
    .map((f, k) =>
      vals[k] == null
        ? null
        : `${f} ${api.w(api.ui.cm ? "pick.measureCm" : "pick.measureIn", { v: api.num(vals[k]!) })}`,
    )
    .filter(Boolean)
    .join(" · ");
}

function ItemMsgs({ api, i }: { api: ComboApi; i: number }) {
  const { env, ui, w, num } = api;
  const slot = env.slots[i]!;
  const col = api.colourOf(i);
  const size = api.size(i);
  const linked = linkSource(env.slots, i) >= 0 && ui.st.same[i];
  const note = ui.notes.find((x) => x.slot === i);
  let box: string | null = null;
  let few: string | null = null;
  if (size) {
    const st = stockOf(slot, env.variants, ui.st.colours[i] ?? null, size);
    const label = api.sizeLabel(i, size);
    if (st <= 0)
      box = w(linked ? "pick.outLinked" : "pick.outOwn", {
        size: label,
        colour: col?.name ?? "",
      });
    else if (st <= env.lowStockAt)
      few = w("pick.few", { n: num(st), colour: col?.name ?? "", size: label });
  } else if (note) {
    const label = api.sizeLabel(i, note.size);
    const colour =
      env.pieces[i]?.colours.find((c) => c.id === note.colourId)?.name ?? "";
    box =
      note.kind === "SIZE_GONE_TOO"
        ? w("pick.goneToo", { size: label, colour })
        : note.kept.length
          ? w("pick.goneKept", {
              size: label,
              colour,
              items: note.kept.map((k) => num(k + 1)).join(w("pick.and")),
            })
          : w("pick.gone", { size: label, colour });
  }
  return (
    <>
      {box ? <div className="warnbox cb-warn">{box}</div> : null}
      {few ? (
        <div
          className="xs mt8"
          style={{ color: "var(--warn)", fontWeight: 600 }}
        >
          {few}
        </div>
      ) : null}
      {ui.err && ui.err.i === i ? (
        <div className="cb-errtxt zc-err" role="alert">
          {ui.err.msg}
        </div>
      ) : null}
    </>
  );
}

/** One piece's colour and size, "Same size as item 1" and the chosen size's measurements. */
export function PickerBody({ api, i }: { api: ComboApi; i: number }) {
  const { env, ui, w, num } = api;
  const slot = env.slots[i]!;
  const piece = env.pieces[i]!;
  const col = api.colourOf(i);
  const size = api.size(i);
  const src = linkSource(env.slots, i);
  const fixed = Boolean(slot.fixedVariantId);
  const colours = piece.colours.filter(
    (c) => !slot.colourIds.length || slot.colourIds.includes(c.id),
  );
  const sizes = piece.sizes.filter(
    (s) => !slot.sizeIds.length || slot.sizeIds.includes(s.id),
  );
  const measure = measureLine(api, i);
  return (
    <div>
      {colours.length ? (
        <div className="mt16">
          <div className="small">
            <span className="bold">{w("pick.colour")}</span> {col?.name ?? ""}
          </div>
          <div className="row wrap mt8" style={{ gap: 10 }}>
            {colours.map((c) => {
              const on = c.id === ui.st.colours[i];
              const out = !c.open;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`swatch${on ? " on" : ""}`}
                  style={{
                    background: c.hex,
                    ...(out ? { opacity: 0.35 } : {}),
                  }}
                  aria-label={out ? `${c.name} ${w("pick.soldOut")}` : c.name}
                  aria-pressed={on}
                  title={c.name}
                  disabled={out || fixed || colours.length === 1}
                  onClick={() => api.colour(i, c.id)}
                  data-testid="cb-swatch"
                />
              );
            })}
          </div>
          {col?.note ? <div className="xs muted mt8">{col.note}</div> : null}
        </div>
      ) : null}
      {sizes.length ? (
        <div className="mt16">
          <div className="row between">
            <div className="small">
              <span className="bold">{w("pick.size")}</span>{" "}
              {size ? (
                api.sizeLabel(i, size)
              ) : (
                <span className="muted">{w("pick.choose")}</span>
              )}
            </div>
          </div>
          {src >= 0 ? (
            <label className="check mt8">
              <input
                type="checkbox"
                checked={ui.st.same[i] ?? false}
                onChange={(e) => api.same(i, e.currentTarget.checked)}
                data-testid="cb-same"
              />{" "}
              {w("pick.same", { n: num(src + 1) })}
            </label>
          ) : null}
          <div
            className="cb-pills mt8"
            role="group"
            aria-label={w("pick.sizeAria", { n: num(i + 1) })}
            style={{ "--n": sizes.length } as React.CSSProperties}
          >
            {sizes.map((s) => {
              const out =
                stockOf(slot, env.variants, ui.st.colours[i] ?? null, s.id) <=
                0;
              const on = size === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`size-pill${on ? " on" : ""}${out ? " out" : ""}`}
                  aria-pressed={on}
                  disabled={out || fixed}
                  title={
                    out
                      ? w("pick.soldOutIn", { colour: col?.name ?? "" })
                      : undefined
                  }
                  onClick={() => api.setSize(i, s.id)}
                  data-testid="cb-size"
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {measure ? (
            <div className="cb-measure">
              <Icon name="ruler" size={16} />
              <span>
                {size && piece.chart?.rows[size] ? (
                  <b>
                    {w("pick.measureSize", { size: api.sizeLabel(i, size) })}
                  </b>
                ) : null}
                {size && piece.chart?.rows[size] ? " · " : null}
                {measure}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <ItemMsgs api={api} i={i} />
    </div>
  );
}
