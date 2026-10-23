"use client";
// PR 93 — the combo page's gallery (demo cb_gallery): the set picture of the picked colours, a tab per piece with
// its colour, and the views of the chosen piece (front, back, detail, true colour), each its own photo or else the
// drawing of that view; and the colour names under the title.
import { COMBO_VIEWS, colourNames, savePct } from "@/lib/shop/combo-model";
import { Icon } from "../Icon";
import { ShotPicture } from "../product/ShotPicture";
import { Dots, shotOf } from "./ComboBits";
import { useCombo, type ComboApi } from "./ComboRoot";
import { SetPicture, type SetPart } from "./SetPicture";

function partsOf(api: ComboApi): SetPart[] {
  return api.env.pieces.map((p, i) => {
    const col = api.colourOf(i);
    const shot = shotOf(p, col?.id, "front");
    return {
      garment: p.garment,
      hex: col?.hex ?? "",
      photo: shot?.photo ?? null,
      name: `${col?.name ?? ""} ${p.name}`.trim(),
    };
  });
}

/** PR 93 · the big picture, a tab per piece and the views of the chosen piece (demo cb_gallery). */
export function ComboGallery() {
  const api = useCombo();
  const { env, ui, w, num } = api;
  const gi = Math.min(ui.gal, env.pieces.length - 1);
  const piece = env.pieces[gi]!;
  const col = api.colourOf(gi);
  const pct = savePct(api.price.saving, api.price.regular);
  const parts = partsOf(api);
  const setAlt = w("card.alt", { pieces: parts.map((p) => p.name).join(", ") });
  const viewWord = (v: string) => w(`gallery.${v}`);
  const stage =
    ui.view === "set" ? (
      <SetPicture
        parts={parts}
        lang={env.lang}
        alt={setAlt}
        sizes="(min-width: 1024px) 50vw, 100vw"
        slot="main"
      >
        {pct ? (
          <span className="badge-img sale">
            {w("gallery.save", { pct: num(pct) })}
          </span>
        ) : null}
      </SetPicture>
    ) : (
      <div className="pimg-wrap" style={{ position: "relative" }}>
        <ShotPicture
          shot={shotOf(piece, col?.id, ui.view)!}
          garment={piece.garment}
          hex={col?.hex ?? ""}
          slot="main"
          sizes="(min-width: 1024px) 50vw, 100vw"
          alt={w("gallery.alt", { colour: col?.name ?? "", name: piece.name })}
          lang={env.lang}
        />
        <span className="badge-img">
          {w("gallery.badge", {
            n: num(gi + 1),
            colour: col?.name ?? "",
            view: viewWord(ui.view),
          })}
        </span>
        <button
          type="button"
          className="cb-stagebtn"
          onClick={() => api.show("set")}
        >
          <Icon name="layers" size={15} />
          {w("gallery.seeSet")}
        </button>
      </div>
    );
  return (
    <div className="cb-gal" id="cb-gallery" data-testid="cb-gallery">
      <div className="cb-stage">{stage}</div>
      <div className="cb-tabs" role="tablist" aria-label={w("gallery.aria")}>
        <span className="cb-tabs-lbl hide-m">{w("gallery.seeEach")}</span>
        {env.pieces.map((p, i) => {
          const on = i === gi && ui.view !== "set";
          const c = api.colourOf(i);
          return (
            <button
              key={i}
              type="button"
              className={`chip${on ? " on" : ""}`}
              role="tab"
              aria-selected={on}
              onClick={() => api.tab(i)}
              data-testid="cb-tab"
            >
              <span className="cb-dot" style={{ background: c?.hex }} />
              {w("gallery.tab", { n: num(i + 1), colour: c?.name ?? "" })}
            </button>
          );
        })}
      </div>
      <div className="cb-rail">
        {COMBO_VIEWS.map((v) => {
          const on = ui.view === v;
          const label = viewWord(v);
          return (
            <button
              key={v}
              type="button"
              className={`cb-thumb${on ? " on" : ""}`}
              aria-pressed={on}
              aria-label={
                v === "set"
                  ? w("gallery.showSet")
                  : w("gallery.showView", { n: num(gi + 1), view: label })
              }
              onClick={() => api.show(v)}
            >
              {v === "set" ? (
                <SetPicture
                  parts={parts}
                  lang={env.lang}
                  alt=""
                  ratio="ratio-11"
                  sizes="90px"
                />
              ) : (
                <ShotPicture
                  shot={shotOf(piece, col?.id, v)!}
                  garment={piece.garment}
                  hex={col?.hex ?? ""}
                  slot="thumb"
                  sizes="90px"
                  alt=""
                  lang={env.lang}
                  ratio="ratio-11"
                />
              )}
              <span className="cb-cap">
                <span className="cb-cap-l">{label}</span>
                {v === "flat" ? (
                  <span className="cb-cap-s" aria-hidden="true">
                    {w("gallery.flatShort")}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The picked colours under the title, "Navy + Khaki" (demo cb_titleBlock). */
export function ComboColours() {
  const api = useCombo();
  return (
    <div className="row mt8" style={{ gap: 10 }}>
      <Dots api={api} />
      <span className="text2 bold" data-testid="cb-colors">
        {colourNames(api.env.pieces, api.ui.st.colours)}
      </span>
    </div>
  );
}
