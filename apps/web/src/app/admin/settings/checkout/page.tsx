// PR 748 + 749 — Settings › Checkout at /admin/settings/checkout: how the shop takes the customer's money (PR 748: the payment
// ways in the owner's order, Cash on Delivery for an owner only, the numbers and bank accounts customers send money to) and
// the customer's details (PR 749: the order of the fields, the shortest name and address, the help and note lines, what the
// Confirm button does). Seeing needs `settings.read`; saving `settings.write` (the API checks again; audited). Nothing here moves
// money or changes a price. lib/admin-checkout/*, components/admin/settings/CheckoutEditor.tsx.
// Guide: docs/admin-guide/pages/settings/checkout.md.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { MOBILE_WALLETS } from "@extas/settings";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { CheckoutEditor } from "@/components/admin/settings/CheckoutEditor";
import {
  PayMethods,
  type PayMethod,
} from "@/components/admin/settings/PayMethods";
import { SettlementCard } from "@/components/admin/settings/SettlementCard";
import { settlementRead } from "@/lib/admin-checkout/settlement";
import Link from "next/link";
import { formatMoney, moneyOf } from "@/components/admin/products/model";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { checkoutView } from "@/lib/admin-checkout/service";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import bn from "../../../../../messages/admin-checkout.bn.json";
import en from "../../../../../messages/admin-checkout.en.json";
import "../../settings-cards.css";
import "../../website/brand-menus/brand.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/settings/checkout";
const KEY = "settingsCheckout";

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      ...((view.lang === "bn" ? bn : en) as unknown as Dict),
    },
  };
}

/** A nested words file as one flat list: `{a: {b: 'x'}}` → `{'a.b': 'x'}`. */
function flat(d: Dict, at = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(d).flatMap(([k, v]) =>
      typeof v === "string"
        ? [[`${at}${k}`, v]]
        : Object.entries(flat(v, `${at}${k}.`)),
    ),
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: t(view.dict, "ck.metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutSettingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([
    adminView(deps),
    pageAccess("settings.read", deps, MOTHER_STORE_ID),
  ]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === "login" || access.kind === "password")
    redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable")
    return <AdminNotice view={view} current={KEY} text={t(d, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z" data-testid="ck-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="settings.read" />
      </div>
    );
  const v = await checkoutView(
    { db: access.deps.db, resolver: access.deps.resolver },
    { actor: access.guard.actor, ctx: access.guard.ctx },
  );
  const canEdit = access.guard.permissions?.has("settings.write") ?? false;
  const settle = await settlementRead(access.deps.resolver, MOTHER_STORE_ID); // PR 817: where the money lands
  const g = (k: string) => t(d, `ck.${k}`);

  // the three method cards (prototype): the account customers pay to, and the last 30 days of orders paid that way
  const currency = String(
    (await access.deps.resolver.value("store.currency", {
      storeId: MOTHER_STORE_ID,
    })) ?? "",
  );
  const money = moneyOf(currency, view.locale);
  const since = new Date(new Date().getTime() - 30 * 86_400_000);
  const rows = await access.deps.db.order
    .groupBy({
      by: ["paymentMethod"],
      where: {
        storeId: MOTHER_STORE_ID,
        placedAt: { gte: since },
        status: { notIn: ["DRAFT", "CANCELLED"] },
        paymentMethod: { in: ["BKASH", "NAGAD", "CARD"] },
      },
      _count: { _all: true },
      _sum: { paidMinor: true },
    })
    .catch(() => []);
  const stat = (m: string) => {
    const row = rows.find((x) => x.paymentMethod === m);
    return {
      orders: row?._count._all ?? 0,
      money: formatMoney(row?._sum.paidMinor ?? 0, money),
    };
  };
  const pay = v.cards.payments.value;
  const wallet = (id: string) => {
    const w = pay.wallets.find((x) => x.provider === id);
    return w ? `${w.number} (${g(`methods.kind.${w.kind}`)})` : "";
  };
  const tick = (id: string) =>
    pay.mobile.on && (pay.mobile.list.find((x) => x.id === id)?.on ?? false);
  const bank = pay.banks[0];
  const methods: PayMethod[] = [
    {
      id: "bkash",
      name: g("methods.bkash"),
      on: tick("bkash"),
      account: wallet("bkash"),
      ...stat("BKASH"),
    },
    {
      id: "nagad",
      name: g("methods.nagad"),
      on: tick("nagad"),
      account: wallet("nagad"),
      ...stat("NAGAD"),
    },
    {
      id: "card",
      name: g("methods.card"),
      on: pay.card.on,
      account: bank ? `${bank.bankName} · ${bank.accountNumber}` : "",
      ...stat("CARD"),
    },
  ];
  const mt = Object.fromEntries(
    [
      "onAt",
      "off",
      "notSet",
      "orders",
      "test",
      "tested",
      "setup",
      "failed",
    ].map((k) => [k, g(`methods.${k}`)]),
  ) as Record<string, string>;
  return (
    <div className="a2-z bm-page" data-testid="ck-page" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={g("title")}
        sub={g("sub")}
      />
      <SectionTabs view={view} current={KEY} />
      <PayMethods
        methods={methods}
        payments={pay}
        version={v.cards.payments.version}
        api="/api/admin/settings/checkout"
        keysHref={
          locateKey("integrations")?.page?.href ?? "/admin/integrations"
        }
        canEdit={canEdit}
        texts={{ ...mt, readOnly: g("readOnly") } as never}
      />
      <SettlementCard
        value={settle}
        canEdit={canEdit && v.owner}
        texts={flat(((d.ck as Dict | undefined)?.settle ?? {}) as Dict)}
      />
      <div className="a2-note pm-callout" role="note" data-testid="pay-rules">
        <span>
          {g("rulesPre")} <b>{g("rulesName")}</b>
          {g("rulesPost")}
        </span>{" "}
        <Link className="a2-btn" href="/admin/rules">
          {g("open")} →
        </Link>
      </div>
      <details className="st-more a2-card a2-mt12" data-testid="pay-more">
        <summary className="a2-h3">{g("more.h")}</summary>
        <p className="a2-sm a2-mute">{g("more.d")}</p>
        <div className="a2-note a2-mt12" role="note">
          <span>{g("note")}</span>
        </div>
        <CheckoutEditor
          payments={v.cards.payments}
          form={v.cards.form}
          gift={v.cards.gift}
          unit={v.unit}
          wallets={[...MOBILE_WALLETS]}
          texts={flat((d.ck ?? {}) as Dict)}
          canEdit={canEdit}
          owner={v.owner}
        />
      </details>
    </div>
  );
}
