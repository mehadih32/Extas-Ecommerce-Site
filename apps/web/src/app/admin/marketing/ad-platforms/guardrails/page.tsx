// S15 · PR 581 (register "তীরন্দাজ Tirondaj — the seventh agent, ads specialist … Guardrails enforced by code, not
// by the AI"; Blueprint C10.1, C10.2) — Marketing › Ad platforms › Ads guardrails at
// /admin/marketing/ad-platforms/guardrails: the trailing 30-day figures (spend, delivered sales, delivered
// purchases, every active campaign's own daily budget), progress against the owner's own sales and purchase
// targets, each campaign's own cost per delivered order against the cap, "Decrease now", and the guardrails card
// itself (ceilings, the cap, auto-decrease, the kill switch — only the owner, `marketing.ads.approve`, can change
// it). Seeing needs `marketing.campaigns.read`; "Decrease now" needs `marketing.ads.control`.
// lib/marketing/ads-guardrails.ts. Guide: docs/admin-guide/pages/marketing/ad-guardrails.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { GUARDRAILS_COUNT_MAX, GUARDRAILS_MONEY_MAX } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { GuardrailDecreaseNow } from '@/components/admin/marketing/AdGuardrailControls';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { guardrailFigures } from '@/lib/marketing/ads-guardrails';
import bn from '../../../../../../messages/admin-ad-platforms.bn.json';
import en from '../../../../../../messages/admin-ad-platforms.en.json';
import '../../../settings-cards.css';
import '../ad-platforms.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/ad-platforms/guardrails';
const BACK = '/admin/marketing/ad-platforms';
const API = '/api/admin/marketing/ad-platforms/guardrails';
const KEY = 'marketingAdGuardrails';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'adp.guardrails.metaTitle'), robots: { index: false, follow: false } };
}

export default async function AdGuardrailsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="adgr-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await guardrailFigures({ db: access.deps.db, resolver: access.deps.resolver });
  const canControl = access.guard.permissions?.has('marketing.ads.control') ?? false;
  const canApprove = access.guard.permissions?.has('marketing.ads.approve') ?? false;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `adp.guardrails.${k}`, vars);
  const shopMoney = moneyOf(o.currency, view.locale);
  const money = (v: number | null) => (v === null ? g('unknown') : formatMoney(v, shopMoney));
  const progress = (now: number, target: number) => (target <= 0 ? null : Math.min(100, Math.round((now * 100) / target))); // hardcode-ok: a percent cap

  const cardTexts: FieldsCardTexts = { h: g('card.h'), d: g('card.d'), save: g('card.save'), saving: g('card.saving'), saved: g('card.saved'), discard: g('card.discard'), unsaved: g('card.unsaved'), readOnly: g('card.readOnly'), pairHelp: '', err: Object.fromEntries(['INVALID_INPUT', 'NOT_FOUND', 'STALE', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)])) };
  const num = (path: string, min: number, max: number): FieldsCardField => ({ kind: 'number', path, label: g(`card.${path}`), help: g(`card.${path}Help`, { currency: o.currency }), min, max });
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: g('card.on'), help: g('card.onHelp') },
    num('dailyBudgetCeiling', 0, GUARDRAILS_MONEY_MAX),
    num('monthlyBudgetCeiling', 0, GUARDRAILS_MONEY_MAX),
    num('maxCostPerPurchase', 0, GUARDRAILS_MONEY_MAX),
    num('targetSales', 0, GUARDRAILS_MONEY_MAX),
    num('targetPurchases', 0, GUARDRAILS_COUNT_MAX),
    { kind: 'switch', path: 'autoDecreaseAllowed', label: g('card.autoDecreaseAllowed'), help: g('card.autoDecreaseAllowedHelp') },
    num('decreaseStepPercent', 1, 90), // hardcode-ok: the setting's own bound
    { kind: 'switch', path: 'killSwitch', label: g('card.killSwitch'), help: g('card.killSwitchHelp') },
  ];
  const decreaseErr = Object.fromEntries(['OFF', 'network', 'forbidden', 'unauthorized', 'other'].map((k) => [k, g(`err.${k}`)]));
  const salesPct = progress(o.deliveredSalesMinor, o.card.value.targetSales * (10 ** shopMoney.digits)); // hardcode-ok: scaling a whole-currency target to minor units for the progress bar
  const purchasePct = progress(o.delivered, o.card.value.targetPurchases);

  return (
    <div className="a2-z" data-testid="adgr-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="adg-mt8">
        <Link className="a2-sm adp-keys" href={BACK}>
          {g('back')}
        </Link>
      </p>
      <div className="a2-note" role="note">
        <span>{g('note')}</span>
      </div>
      {o.card.value.killSwitch ? (
        <div className="a2-note bad a2-mt12" role="alert" data-testid="adgr-kill-on">
          <span>{g('killOn')}</span>
        </div>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="adgr-figures-h" data-testid="adgr-figures">
        <h2 className="a2-h3" id="adgr-figures-h">
          {g('figuresH')}
        </h2>
        <p className="a2-sm a2-mute">{g('figuresD', { from: o.from, to: o.to })}</p>
        <dl className="adp-log">
          <div className="a2-sm">
            <dt className="adp-sub">{g('spend')}</dt> <dd>{money(o.spendMinor)}</dd>
          </div>
          <div className="a2-sm">
            <dt className="adp-sub">{g('activeDaily')}</dt> <dd>{money(o.activeDailyBudgetMinor)}</dd>
          </div>
          <div className="a2-sm">
            <dt className="adp-sub">{g('deliveredSales')}</dt>{' '}
            <dd>
              {money(o.deliveredSalesMinor)}
              {salesPct !== null ? ` · ${g('ofTarget', { pct: formatNumber(salesPct, view.locale) })}` : ''}
            </dd>
          </div>
          <div className="a2-sm">
            <dt className="adp-sub">{g('delivered')}</dt>{' '}
            <dd>
              {formatNumber(o.delivered, view.locale)}
              {purchasePct !== null ? ` · ${g('ofTarget', { pct: formatNumber(purchasePct, view.locale) })}` : ''}
            </dd>
          </div>
        </dl>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="adgr-cpa-h" data-testid="adgr-campaigns">
        <h2 className="a2-h3" id="adgr-cpa-h">
          {g('cpaH')}
        </h2>
        {o.campaigns.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="adgr-cpa-table">
              <thead>
                <tr>
                  <th>{g('col.name')}</th>
                  <th>{g('col.dailyBudget')}</th>
                  <th>{g('col.delivered')}</th>
                  <th>{g('col.cpa')}</th>
                </tr>
              </thead>
              <tbody>
                {o.campaigns.map((c) => (
                  <tr key={c.key} data-over={c.overCap ? 'yes' : 'no'}>
                    <td className="adp-sub">
                      {c.name}
                      {c.paused ? <span className="a2-pill line adp-gone">{g('paused')}</span> : null}
                    </td>
                    <td className="a2-sm adp-nowrap">{c.dailyBudgetMinor === null ? g('unknown') : money(c.dailyBudgetMinor)}</td>
                    <td className="a2-sm">{formatNumber(c.delivered, view.locale)}</td>
                    <td className="a2-sm adp-nowrap">
                      {c.cpaMinor === null ? '—' : money(c.cpaMinor)}
                      {c.overCap ? <span className="a2-pill bad">{g('overCap')}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute">{g('noFigures')}</p>
        )}
        {o.card.value.autoDecreaseAllowed ? (
          canControl ? (
            <GuardrailDecreaseNow url={API} texts={{ run: g('decreaseNow'), running: g('decreasing'), done: g('decreased'), err: decreaseErr }} />
          ) : (
            <p className="a2-sm a2-mute">{g('noControl')}</p>
          )
        ) : null}
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canApprove} testId="adgr-card" />
      </div>
    </div>
  );
}
