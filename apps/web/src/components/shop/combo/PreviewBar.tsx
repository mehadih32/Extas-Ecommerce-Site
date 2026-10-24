// PR 572 — the template bar shown under a combo list, a pair page or the bag while the owner's previews are on
// (`?tpl=` / `?btpl=`): every template as a chip, the one shown marked, and a link back to the chosen one. Kept apart from
// the list (RuleList) so the bag and the pair page do not load the list's styles; its rules sit in combo-list.css (which
// combo-pair.css takes in) and bag.css.
import type { ShopContext } from "@/lib/shop/context";

export function PreviewBar({
  c,
  kind,
  list,
  current,
  hrefOf,
  chosen,
}: {
  c: ShopContext;
  kind: "list" | "page" | "bag";
  list: readonly string[];
  current: string;
  hrefOf: (t: string) => string;
  chosen: string;
}) {
  return (
    <div className="ca-tplbar" data-testid="ca-tplbar">
      <div className="xs muted">
        {c.t("ctpl.tpl.bar", { what: c.t(`ctpl.tpl.${kind}`) })}
      </div>
      <div className="ca-tplrow">
        {list.map((t) => (
          <a
            key={t}
            className={`chip${t === current ? " on" : ""}`}
            href={hrefOf(t)}
            aria-current={t === current || undefined}
          >
            {t === "current"
              ? c.t("ctpl.tpl.current")
              : `${t} · ${c.t(`ctpl.tpl.${t}`)}`}
          </a>
        ))}
        <a className="link xs" href={chosen}>
          {c.t("ctpl.tpl.chosen")}
        </a>
      </div>
    </div>
  );
}
