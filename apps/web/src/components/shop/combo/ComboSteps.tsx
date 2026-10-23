"use client";
// PR 92 — template C2, step by step (demo cb_c2; `combos.page.layout` = C2): numbered steps, one piece open at a
// time with "Next: <piece>", the done ones folded to a line with "Edit", then a review; the same pickers as C1.
import { Icon } from "../Icon";
import { ItemHead, PickerBody } from "./ComboItem";
import { type ComboApi } from "./ComboRoot";

/** C2: step by step, then a review (demo cb_c2). */
export function ComboSteps({ api }: { api: ComboApi }) {
  const { env, ui, w, num } = api;
  const n = env.pieces.length;
  const firstUndone = ui.done.findIndex((d) => !d);
  const first = firstUndone < 0 ? n : firstUndone;
  const head = (
    <ol className="cb-steps" aria-label={w("steps.aria")}>
      {env.pieces.map((p, i) => {
        const now = ui.step === i;
        const done = ui.done[i] && !now;
        const reach = ui.done[i] || i === first || now;
        return (
          <li key={i} className={i > 0 && ui.done[i - 1] ? "ldone" : ""}>
            <button
              type="button"
              className="cb-stepbtn"
              disabled={!reach}
              aria-current={now ? "step" : undefined}
              onClick={() => api.goStep(i)}
            >
              <span className={`cb-num${done ? " done" : now ? " now" : ""}`}>
                {done ? <Icon name="check" size={16} /> : num(i + 1)}
              </span>
              <span className="cb-slabel">
                <span className="xs muted">
                  {w("steps.step", { n: num(i + 1) })}
                </span>
                <span className="bold">{p.label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
  const rows = env.pieces.map((p, i) => {
    if (i === ui.step) {
      const tmp = ui.done.map((d, k) => d || k === i);
      let nx = n;
      for (let k = i + 1; k < n && nx === n; k++) if (!tmp[k]) nx = k;
      for (let k = 0; k < i && nx === n; k++) if (!tmp[k]) nx = k;
      return (
        <div
          key={i}
          className={`card cb-panel${ui.err?.i === i ? " err" : ""}`}
          id={`cb-item-${i}`}
          data-testid="cb-item"
        >
          <ItemHead
            api={api}
            i={i}
            label={w("steps.stepOf", {
              n: num(i + 1),
              total: num(n),
              label: p.label,
            })}
          />
          <PickerBody api={api} i={i} />
          <button
            type="button"
            className="btn btn-primary btn-block mt16"
            onClick={() => api.next(i)}
            data-testid="cb-next"
          >
            {nx < n
              ? w("steps.next", { label: env.pieces[nx]!.label })
              : w("steps.review")}
            <Icon name="right" size={16} />
          </button>
        </div>
      );
    }
    if (ui.done[i]) {
      const ok = !api.problemOf(i);
      const col = api.colourOf(i);
      const size = api.size(i);
      return (
        <div key={i} className="card cb-row" id={`cb-item-${i}`}>
          <span className={`cb-num sm ${ok ? "done" : ""}`}>
            {ok ? <Icon name="check" size={14} /> : num(i + 1)}
          </span>
          <div className="grow small">
            <span className="bold">{p.name}</span> — {col?.name ?? ""}
            {size ? `, ${api.sizeLabel(i, size)}` : ""}
            {ok ? null : (
              <span className="sale bold"> {w("steps.needsSize")}</span>
            )}
          </div>
          <button
            type="button"
            className="link"
            onClick={() => api.goStep(i)}
            aria-label={w("steps.editAria", { n: num(i + 1) })}
          >
            {w("steps.edit")}
          </button>
        </div>
      );
    }
    return (
      <div key={i} className="cb-row todo" id={`cb-item-${i}`}>
        <span className="cb-num sm">{num(i + 1)}</span>
        <div className="grow small">{p.name}</div>
        <span className="xs">{p.label}</span>
      </div>
    );
  });
  return (
    <div className="stack" style={{ gap: 14 }}>
      {head}
      <div className="stack" style={{ gap: 10 }}>
        {rows}
      </div>
    </div>
  );
}
