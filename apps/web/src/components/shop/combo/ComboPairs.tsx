"use client";
// PR 94 — popular pairs on a set of one product (demo cb_pairs): one tap sets every piece's colour; a pair not made
// in the size already picked is greyed with the reason; on a rule's set each pair is a link to its own set.
import { pairFits } from "@extas/combos/page-model";
import { useCombo } from "./ComboRoot";

/** PR 94 · popular pairs: one tap sets every colour; a pair not made in the size already picked is greyed. */
export function ComboPairs() {
  const api = useCombo();
  const { env, ui, w, num } = api;
  if (!env.pairs.length) return null;
  const cur = ui.st.colours.join("+");
  const nameOf = (ids: readonly string[]) =>
    ids
      .map(
        (id, k) => env.pieces[k]?.colours.find((c) => c.id === id)?.name ?? "",
      )
      .join(" + ");
  const fits = env.pairs.map((pr) =>
    pr.href
      ? { ok: true, size: null }
      : pairFits(env.slots, env.variants, ui.st, pr.colourIds),
  );
  const out = fits.find((f) => !f.ok && f.size)?.size ?? null;
  const linked = env.pairs.some((p) => p.href);
  const chips = env.pairs.map((pr, idx) => {
    const on = pr.colourIds.join("+") === cur && !pr.href;
    const fit = fits[idx]!;
    const nm = nameOf(pr.colourIds);
    const sizeWord = fit.size ? api.sizeLabel(0, fit.size) || fit.size : "";
    const inner = (
      <>
        <span className="cb-dots" aria-hidden="true">
          {pr.colourIds.map((id, k) => (
            <span
              key={k}
              className="cb-dot"
              style={{
                background: env.pieces[k]?.colours.find((c) => c.id === id)
                  ?.hex,
              }}
            />
          ))}
        </span>
        <span className="cb-pairname">{nm}</span>
      </>
    );
    return pr.href ? (
      <a
        key={idx}
        className="chip"
        href={pr.href}
        title={nm}
        data-testid="cb-pair"
      >
        {inner}
      </a>
    ) : (
      <button
        key={idx}
        type="button"
        className={`chip${on ? " on" : ""}${fit.ok ? "" : " zc-out"}`}
        aria-pressed={on}
        title={fit.ok ? nm : w("pairs.notIn", { names: nm, size: sizeWord })}
        disabled={!fit.ok}
        aria-disabled={!fit.ok || undefined}
        onClick={() => api.pair(pr.colourIds)}
        data-testid="cb-pair"
      >
        {inner}
      </button>
    );
  });
  const n = env.slots.length;
  const outLabel = out ? api.sizeLabel(0, out) || out : "";
  return (
    <div className="zo-pairs" data-testid="cb-pairs">
      <div className="row between">
        <div className="label" style={{ margin: 0 }}>
          {w("pairs.title")}
        </div>
        <span className="xs muted">
          {linked
            ? w("pairs.tapLink")
            : n === 2
              ? w("pairs.tapTwo")
              : w("pairs.tapMany", { n: num(n) })}
        </span>
      </div>
      <div className={`cb-pairs mt8${n >= 3 ? " cb-pairs3" : ""}`}>{chips}</div>
      {out ? (
        <div className="xs muted mt8" data-testid="cb-pairs-note">
          {w("pairs.greyed", { size: outLabel })}
        </div>
      ) : null}
    </div>
  );
}
