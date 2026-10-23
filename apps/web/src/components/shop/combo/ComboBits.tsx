"use client";
// PR 91 — the small pieces every part of the combo page shares: a piece's picture of one view in its picked colour,
// the colour dots, a piece's own price in its picks and its small front picture. Nothing here works out a set price.
import { piecePrice } from "@extas/combos/page-model";
import { type ComboPiece, type PieceView } from "@/lib/shop/combo-model";
import { ShotPicture } from "../product/ShotPicture";
import { type ComboApi } from "./ComboRoot";

export const NO_COLOUR = "*";

export function shotOf(
  piece: ComboPiece,
  colourId: string | null | undefined,
  view: PieceView,
) {
  return (piece.shots[colourId ?? NO_COLOUR] ??
    Object.values(piece.shots)[0])?.[view];
}

/** The picked colours as overlapping dots. */
export function Dots({ api }: { api: ComboApi }) {
  return (
    <span className="cb-dots" aria-hidden="true">
      {api.env.pieces.map((_, i) => (
        <span
          key={i}
          className="cb-dot"
          style={{ background: api.colourOf(i)?.hex }}
        />
      ))}
    </span>
  );
}

/** One piece's own price in its picked colour and size (the engine's rule). */
export const pieceMinor = (api: ComboApi, i: number) =>
  piecePrice(
    api.env.slots[i]!,
    api.ui.st.colours[i] ?? null,
    api.check.variants[i] ?? null,
    api.env.variants,
  );

/** A piece's front in its picked colour, small. */
export function LookImage({
  api,
  i,
  cls,
}: {
  api: ComboApi;
  i: number;
  cls: string;
}) {
  const piece = api.env.pieces[i]!;
  const col = api.colourOf(i);
  return (
    <button
      type="button"
      className="zc-look zc-lookimg"
      onClick={() => api.look(i)}
      aria-label={api.w("pick.look", { n: api.num(i + 1) })}
    >
      <div className={cls}>
        <ShotPicture
          shot={shotOf(piece, col?.id, "front")!}
          garment={piece.garment}
          hex={col?.hex ?? ""}
          slot="thumb"
          sizes="56px"
          alt=""
          lang={api.env.lang}
          ratio="ratio-11"
        />
      </div>
    </button>
  );
}
