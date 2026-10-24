// PR 91–95, 102, 103 — one combo's page at /combo/<link> (demo 40-combo.js PAGES.combo, the "current" layout): on a
// computer the gallery on the left (sticky) and on the right the title with the picked colours, the price box, the
// popular pairs, the pickers (C1 one card per piece, or C2 step by step: `combos.page.layout`), the set summary, the
// buttons with the WhatsApp question and the Size exchange · Delivery · Cash on Delivery card; "More sets" under it. On
// a phone the same parts in the demo's order C (a short photo, the title, price, pickers, pairs, buttons in the bar
// held at the bottom). A set that is not on sale now keeps its page: "This set isn't available right now", its pieces
// to buy separately and the sets on sale now. A link to a set being changed in the bag (`?from=<set>`) opens on its
// picks with "Update set in bag". No price is worked out here: every price is @extas/combos'. PR 573: a pair an auto
// rule made opens in its template (P1–P5, `PairPage`) once the owner picks one; "current" (the default) is this page.
// While previews are on, `?tpl=P3` shows another template with the template bar (never indexed).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { bagSettings, currentBag } from "@/lib/shop/bag";
import { buildEntry } from "@/lib/shop/build";
import { reassurance } from "@/lib/shop/bag-model";
import { bagPickCards, cardsByIds } from "@/lib/shop/catalogue";
import {
  comboPage,
  setCardGroups,
  type ComboPageResult,
  type SetCardGroups,
} from "@/lib/shop/combo";
import { shopContext, type ShopContext } from "@/lib/shop/context";
import { hrefIn } from "@/lib/shop/lang";
import { shopMetadata } from "@/lib/shop/meta";
import { ROUTES } from "@/lib/shop/routes";
import { AddedPanel } from "../bag/AddedPanel";
// PR 573 (follow-up 358): the rules of bag.css and pdp.css this route can draw with, cut by tools/route-css.mjs in
// their own order, instead of both whole files (most of their ~1,200 rules never match here and held the first paint back)
import "./combo-shared.css";
import { Icon } from "../Icon";
import { ProductCard } from "../ProductCard";
import { ComboColours, ComboGallery } from "./ComboGallery";
import { ComboPairs } from "./ComboPairs";
import {
  ComboBar,
  ComboCtas,
  ComboEditBanner,
  ComboPickers,
  ComboPriceBox,
  ComboSummary,
  ComboUnits,
  ComboWhatsApp,
} from "./ComboParts";
import { ComboRoot } from "./ComboRoot";
import { MoreSets } from "./SetCards";
import { PairPage } from "./PairPage";
import { PreviewBar } from "./PreviewBar";
import {
  PAIR_TEMPLATES,
  pairTemplateOf,
  type PairTemplate,
} from "@/lib/shop/combo-pair-model";
import { pairEnv, readPairSettings } from "@/lib/shop/combo-pair";
import "./combo.css";
// PR 573: the pair templates' styles, with the rule pages' shared ones inlined (combo-pair.css @imports them), so this
// route gets them in its own stylesheet instead of three more shared ones
import "./combo-pair.css";

export type ComboSearch = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? null;

const pageFor = cache((slug: string, from: string | null) =>
  shopContext().then((c) => comboPage(c, slug, from)),
);

export async function comboMetadata(
  slug: string,
  search: ComboSearch,
): Promise<Metadata> {
  const c = await shopContext();
  const r = await pageFor(slug, one(search.from));
  if (!r || r.kind === "missing") return {};
  const m = await shopMetadata(c, `combo/${r.page.summary.slug}`, r.env.name);
  m.alternates = {
    ...m.alternates,
    canonical: hrefIn(c.lang, ROUTES.combo(r.page.summary.slug)),
  };
  const s = r.page.summary;
  const desc =
    ((c.lang === "bn" && s.descriptionBn?.trim()) || s.descriptionEn?.trim()) ??
    "";
  if (desc) m.description = desc;
  // only the owner's featured sets are search results; a generated colour pair is one of many of the same rule
  if (!r.page.isFeatured || one(search.from) || one(search.added) || one(search.tpl) || one(search.pick))
    m.robots = { index: false, follow: true };
  return m;
}

function Crumbs({
  c,
  name,
  more,
}: {
  c: ShopContext;
  name: string;
  more: boolean;
}) {
  return (
    <nav className="crumbs cb-crumbs" aria-label={c.t("pdp.breadcrumb")}>
      <a href={hrefIn(c.lang, ROUTES.home)}>{c.t("pdp.home")}</a>
      <span aria-hidden="true">/</span>
      {/* the phone says "Sets" and goes to the sets at the foot of this page; a computer says "Combos" (D-040) */}
      <a
        className="hide-d"
        href={more ? "#cb-more" : hrefIn(c.lang, ROUTES.combos)}
      >
        {c.t("combo.crumbSets")}
      </a>
      <a className="hide-m" href={hrefIn(c.lang, ROUTES.combos)}>
        {c.t("combo.crumbCombos")}
      </a>
      <span aria-hidden="true">/</span>
      <span>{name}</span>
    </nav>
  );
}

/** PR 573 · Home / Combos / the rule / the pair (demo ca_crumbs). */
function PairCrumbs({
  c,
  rule,
  name,
}: {
  c: ShopContext;
  rule: { title: string; href: string };
  name: string;
}) {
  return (
    <nav className="ca-crumbs xs" aria-label={c.t("pdp.breadcrumb")}>
      <a href={hrefIn(c.lang, ROUTES.home)}>{c.t("pdp.home")}</a>
      <span aria-hidden="true">/</span>
      <a href={hrefIn(c.lang, ROUTES.combos)}>{c.t("combo.crumbCombos")}</a>
      <span aria-hidden="true">/</span>
      <a href={rule.href}>{rule.title}</a>
      <span aria-hidden="true">/</span>
      <span>{name}</span>
    </nav>
  );
}

/** Size exchange · Delivery · Cash on Delivery, each only while that rule is on (demo cb_rules). */
function Rules({
  c,
  payMinor,
  exchangeLine,
}: {
  c: ShopContext;
  payMinor: number | null;
  exchangeLine: boolean;
}) {
  const freeOver = c.s["delivery.freeOverMinor"];
  const free =
    c.flags.freeDelivery &&
    typeof freeOver === "number" &&
    payMinor !== null &&
    payMinor >= freeOver;
  const rows = [
    c.flags.exchange ? (
      <div key="ex" className="row top" style={{ gap: 12 }}>
        <span className="brandc" style={{ marginTop: 2 }}>
          <Icon name="swap" size={20} />
        </span>
        <div className="grow">
          <div className="h3" style={{ marginBottom: 3 }}>
            {c.t("combo.rules.exchange")}
          </div>
          <div className="small text2">
            {c.t("combo.rules.exchangeText", c.vars)}
          </div>
          {exchangeLine ? (
            <div className="small bold mt8">
              {c.t("combo.rules.exchangeSet")}
            </div>
          ) : null}
        </div>
      </div>
    ) : null,
    <div key="del" className="row top" style={{ gap: 12 }}>
      <span className="brandc" style={{ marginTop: 2 }}>
        <Icon name="truck" size={20} />
      </span>
      <div className="grow">
        <div className="h3" style={{ marginBottom: 3 }}>
          {c.t("combo.rules.delivery")}
        </div>
        {free ? (
          <div className="small text2" data-testid="cb-free-del">
            <b className="brandc">{c.t("combo.rules.free")}</b> —{" "}
            {c.t("combo.rules.freeOver", { amount: c.money(freeOver) })}
          </div>
        ) : (
          <div className="small text2">{c.t("combo.rules.charge")}</div>
        )}
      </div>
    </div>,
    c.flags.cod ? (
      <div key="cod" className="row" style={{ gap: 12 }}>
        <span className="brandc">
          <Icon name="cash" size={20} />
        </span>
        <div className="small">
          <b>{c.t("combo.rules.cod")}</b> · {c.t("combo.rules.codText")}
        </div>
      </div>
    ) : null,
  ].filter(Boolean);
  return (
    <div
      className="card p16 stack zo-rules"
      style={{ gap: 14 }}
      data-testid="cb-rules"
    >
      {rows.flatMap((r, i) =>
        i ? [<div key={`d${i}`} className="divider" />, r] : [r],
      )}
    </div>
  );
}

/** The other sets for "More sets": not this one, nor its own colour pairs (they are its popular pairs already). */
function otherGroups(
  all: SetCardGroups,
  r: Extract<ComboPageResult, { kind: "page" }>,
  max: number,
) {
  const productIds = [...new Set(r.page.slots.map((s) => s.productId))]
    .sort()
    .join("+");
  const mine = r.page.ruleId
    ? `${r.page.ruleId}:${productIds}`
    : r.page.summary.comboId;
  return all.groups.filter((g) => g.key !== mine).slice(0, max);
}

/** A set that is not on sale now (demo cb_unavailable). */
async function Unavailable({
  c,
  r,
}: {
  c: ShopContext;
  r: Extract<ComboPageResult, { kind: "page" }>;
}) {
  const set = r.set["combos.page.moreSets"];
  const ids = [...new Set(r.page.slots.map((s) => s.productId))];
  const [cards, all] = await Promise.all([
    cardsByIds(c.storeId, ids),
    set.on ? setCardGroups(c, { exceptId: r.page.summary.comboId }) : null,
  ]);
  const shown = ids.flatMap((id) => {
    const card = cards.get(id);
    return card ? [card] : [];
  });
  return (
    <div
      className="container cb-wrap"
      data-testid="combo-page"
      data-state="off"
    >
      <Crumbs c={c} name={r.env.name} more={false} />
      <div className="card cb-off mt16" data-testid="combo-unavailable">
        <span className="cb-ico">
          <Icon name="layers" size={26} />
        </span>
        <h1 className="h1 mt16">{c.t("combo.off.title")}</h1>
        <p className="text2" style={{ maxWidth: 520, margin: "10px auto 0" }}>
          {c.t("combo.off.text", { name: r.env.name })}
        </p>
        <div
          className="row wrap mt24"
          style={{ justifyContent: "center", gap: 10 }}
        >
          <a className="btn btn-ghost" href={hrefIn(c.lang, ROUTES.home)}>
            {c.t("combo.off.home")}
          </a>
        </div>
      </div>
      {shown.length ? (
        <section className="section">
          <div className="sec-hd">
            <h2 className="h2">{c.t("combo.off.separately")}</h2>
          </div>
          <div className="grid g4">
            {shown.map((card) => (
              <ProductCard key={card.id} card={card} c={c} />
            ))}
          </div>
        </section>
      ) : null}
      {all ? (
        <MoreSets
          c={c}
          groups={otherGroups(all, r, set.max)}
          all={all}
          title={c.t("combo.more.now")}
        />
      ) : null}
    </div>
  );
}

export async function ComboPage({
  slug,
  search,
}: {
  slug: string;
  search: ComboSearch;
}) {
  const c = await shopContext();
  const r = await pageFor(slug, one(search.from));
  if (!r || r.kind === "missing") notFound();
  if (!r.page.summary.onSale) return <Unavailable c={c} r={r} />;
  // PR 573 · a pair an auto rule made, in its template (P1–P5); "current" goes on below
  const pairSet = r.page.ruleId ? await readPairSettings(c.storeId) : null;
  const preview = Boolean(pairSet?.["combos.template.preview"]);
  const asked = one(search.tpl);
  const tpl = r.page.ruleId
    ? pairTemplateOf(r.page.summary.pageTemplate, { tpl: asked, pick: one(search.pick) === "1" }, preview)
    : "current";
  const previewing = preview && Boolean(r.page.ruleId) && asked === tpl;
  const base = hrefIn(c.lang, ROUTES.combo(r.page.summary.slug));
  const bar = previewing ? (
    <div className="container ca-page">
      <PreviewBar
        c={c}
        kind="page"
        list={["current", ...PAIR_TEMPLATES]}
        current={tpl}
        hrefOf={(x) => `${base}?tpl=${x}`}
        chosen={base}
      />
    </div>
  ) : null;
  if (tpl !== "current") {
    const env = await pairEnv(c, r, tpl as PairTemplate, previewing);
    if (env)
      return (
        <div
          className="container ca-page ca-pair"
          data-testid="ca-pair"
          data-template={tpl}
        >
          <PairCrumbs c={c} rule={env.side.rule} name={r.env.name} />
          <PairPage env={env} />
          {bar}
        </div>
      );
  }
  const t = c.t;
  const { env, set } = r;
  const parts = set["combos.page.parts"];
  const moreSet = set["combos.page.moreSets"];
  const all = moreSet.on
    ? await setCardGroups(c, { exceptId: r.page.summary.comboId })
    : null;
  const more = all ? otherGroups(all, r, moreSet.max) : [];
  // PR 98 · "Build your own" beside "More sets" while the set builder is open
  const build = all && more.length ? await buildEntry(c) : null;
  const s = r.page.summary;
  const blurb =
    ((c.lang === "bn" && s.descriptionBn?.trim()) || s.descriptionEn?.trim()) ??
    "";

  // the added-to-bag panel on a computer (`?added=<line>`, demo D-028); the phone keeps its message
  const added = one(search.added);
  const [view, bagSet] = added
    ? await Promise.all([currentBag(c), bagSettings(c.storeId)])
    : [null, null];
  const [bagCards, picks] =
    view && bagSet
      ? await Promise.all([
          cardsByIds(c.storeId, [
            ...view.items.map((i) => i.productId),
            ...view.sets.flatMap((x) =>
              x.pieces.flatMap((p) => (p.productId ? [p.productId] : [])),
            ),
          ]),
          bagPickCards(c.storeId, view.productIds, bagSet["bag.panel.picks"]),
        ])
      : [null, null];
  const closeHref = hrefIn(c.lang, ROUTES.combo(s.slug));
  const wa = parts.whatsapp && env.whatsapp;
  const hasChart = env.pieces.some((p) => p.chart);

  return (
    <ComboRoot env={env}>
      <div
        className="container cb-wrap zc-cur zc-ord-C"
        data-testid="combo-page"
        data-layout={env.layout}
        data-template={s.pageTemplate}
      >
        <Crumbs c={c} name={env.name} more={more.length > 0} />
        <div className="cb-main">
          <div className="cb-left zo-gal">
            <ComboGallery />
          </div>
          <div
            className="stack zc-info"
            style={{ gap: 20 }}
            data-testid={`combo-${env.layout}`}
          >
            <div className="zo-title">
              <div>
                <div className="eyebrow">
                  {t("combo.setOf", { n: c.num(env.pieces.length) })}
                </div>
                <h1 className="h1" style={{ marginTop: 6 }}>
                  {env.name}
                </h1>
                <ComboColours />
                {blurb ? (
                  <p className="small muted" style={{ margin: "8px 0 0" }}>
                    {blurb}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="zo-price">
              <ComboPriceBox />
            </div>
            <ComboPairs />
            <div className="zo-pick">
              <ComboEditBanner />
              <div className="row between mb12 cb-unitrow">
                <div className="h2">
                  {env.layout === "C2"
                    ? t("combo.pick.titleSteps")
                    : t("combo.pick.title")}
                </div>
                {hasChart ? <ComboUnits /> : null}
              </div>
              <ComboPickers />
            </div>
            {parts.summary ? <ComboSummary /> : null}
            <div className="cb-donly zo-ctas">
              <ComboCtas />
              {wa ? (
                <div className="mt12">
                  <ComboWhatsApp />
                </div>
              ) : null}
            </div>
            {parts.rules ? (
              <Rules
                c={c}
                payMinor={env.firstPrice.pay}
                exchangeLine={parts.exchangeLine}
              />
            ) : null}
            {wa ? (
              <div className="hide-d zo-wa">
                <ComboWhatsApp />
              </div>
            ) : null}
          </div>
        </div>
        {all ? (
          <MoreSets
            c={c}
            groups={more}
            all={all}
            title={t("combo.more.title")}
            build={build ? hrefIn(c.lang, ROUTES.buildSet) : null}
          />
        ) : null}
      </div>
      {bar}
      <ComboBar />
      {view && added && bagCards && bagSet ? (
        <AddedPanel
          c={c}
          view={view}
          lineId={added}
          s={bagSet}
          cards={bagCards}
          picks={picks?.cards ?? []}
          trust={reassurance(c.flags, {
            securePayment: bagSet["bag.trust.securePayment"],
            originalLine: bagSet["bag.upsell.originalLine"],
          })}
          closeHref={closeHref}
        />
      ) : null}
    </ComboRoot>
  );
}
