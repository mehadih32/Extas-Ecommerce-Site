// S13 · PR 273 (register "Referral programme"; SIM-F-009, the referral half) — Marketing › Referrals at
// /admin/marketing/referrals: whether the programme runs now, what it brought (invite codes, friends' orders,
// delivered, rewards given and paid into wallets), each friend's order with its reward state and "Give reward" (after
// a confirm; the wallet permission), and the programme settings (the owner's OK). Seeing needs
// `marketing.campaigns.read`. lib/marketing/referrals.ts. Guide: docs/admin-guide/pages/marketing/referrals.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { REFERRAL_CODE_MAX } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ReferralReward } from '@/components/admin/marketing/ReferralReward';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { referralsOverview } from '@/lib/marketing/referrals';
import obn from '../../../../../messages/admin-orders.bn.json';
import oen from '../../../../../messages/admin-orders.en.json';
import bn from '../../../../../messages/admin-referrals.bn.json';
import en from '../../../../../messages/admin-referrals.en.json';
import '../../settings-cards.css';
import '../ad-platforms/ad-platforms.css';
import './referrals.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/referrals';
const API = '/api/admin/marketing/referrals';
const KEY = 'marketingReferrals';

function withScreen(view: AdminView): AdminView {
  const bnLang = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, ...((bnLang ? obn : oen) as unknown as Dict), ...((bnLang ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'ref.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ReferralsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await referralsOverview({ db: access.deps.db, resolver: access.deps.resolver });
  const canOk = access.guard.permissions?.has('rules.approve') ?? false;
  const canPay = access.guard.permissions?.has('payments.wallet') ?? false;
  const currency = await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID });
  const m = moneyOf(currency, view.locale);
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `ref.${k}`, vars);
  const c = (k: string) => g(`card.${k}`);
  const n = (x: number) => formatNumber(x, view.locale);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone }).format(new Date(iso));
  const err = Object.fromEntries(['INVALID_INPUT', 'STALE', 'NOT_FOUND', 'CONFIRM_REQUIRED', 'NO_REWARD', 'NOT_DELIVERED', 'GIVEN', 'CAP', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: '', err };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: c('on'), help: c('onHelp') },
    { kind: 'date', path: 'startsOn', label: c('startsOn'), help: c('startsOnHelp') },
    { kind: 'date', path: 'endsOn', label: c('endsOn'), help: c('endsOnHelp') },
    { kind: 'select', path: 'friendRuleKey', label: c('friendRuleKey'), help: c('friendRuleKeyHelp'), options: [{ value: '', label: c('noRule') }, ...o.rules.map((r) => ({ value: r.key, label: r.live ? r.name : `${r.name} ${c('off')}` }))] },
    { kind: 'number', path: 'rewardMinor', label: c('rewardMinor'), help: c('rewardMinorHelp'), min: 1, max: Number.MAX_SAFE_INTEGER },
    { kind: 'number', path: 'rewardsMax', label: c('rewardsMax'), help: c('rewardsMaxHelp'), min: 1, max: Number.MAX_SAFE_INTEGER },
    { kind: 'number', path: 'codeLength', label: c('codeLength'), help: c('codeLengthHelp'), min: 6, max: REFERRAL_CODE_MAX }, // hardcode-ok: the setting's own bound
  ];
  const total = (label: string, value: string, id: string) => (
    <div>
      <dt className="a2-sm">{label}</dt>
      <dd className="a2-sm" data-testid={id}>
        {value}
      </dd>
    </div>
  );
  const rewardText = (r: number) => formatMoney(r, m);

  return (
    <div className="a2-z" data-testid="ref-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note ref-mt8" role="note">
        <span>{g('note')}</span>
      </div>
      <p className="a2-sm ref-mt8" data-testid="ref-live" data-live={o.live ? 'yes' : 'no'}>
        <span className={`a2-pill ${o.live ? 'g' : 'line'}`}>{o.live ? g('liveTag') : g('notLiveTag')}</span> {o.live ? g('live') : g('notLive')}
      </p>
      <p>
        <Link className="a2-sm ref-link" href="/admin/rules">
          {g('rulesLink')}
        </Link>
      </p>

      <section className="a2-sc a2-mt12" aria-labelledby="ref-tot-h" data-testid="ref-totals">
        <h2 className="a2-h3" id="ref-tot-h">
          {g('totals.h')}
        </h2>
        <dl className="ref-totals">
          {total(g('totals.codes'), n(o.totals.codes), 'ref-t-codes')}
          {total(g('totals.uses'), n(o.totals.uses), 'ref-t-uses')}
          {total(g('totals.delivered'), n(o.totals.delivered), 'ref-t-delivered')}
          {total(g('totals.rewarded'), n(o.totals.rewarded), 'ref-t-rewarded')}
          {total(g('totals.rewardedMoney'), formatMoney(o.totals.rewardedMinor, m), 'ref-t-money')}
        </dl>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="ref-list-h" data-testid="ref-list">
        <h2 className="a2-h3" id="ref-list-h">
          {g('list.h')}
        </h2>
        {o.uses.length ? (
          <ul className="adp-rules">
            {o.uses.map((u) => {
              const name = u.sharer.name ?? u.sharer.phone ?? g('list.unknown');
              const amount = o.card.value.rewardMinor === null ? '' : rewardText(Math.round(o.card.value.rewardMinor * 10 ** m.digits));
              return (
                <li key={u.id} className="adp-rule" data-testid="ref-use" data-status={u.status} data-block={u.block ?? 'none'}>
                  <p className="a2-sm adp-sub">{u.order ? g('list.order', { number: u.order.number }) : g('list.noOrder')}</p>
                  <p className="a2-sm a2-mute">
                    {g('list.by', { code: u.code, name })} · {when(u.createdAt)}
                    {u.order ? ` · ${t(d, `orders.st.${u.order.status}`)} · ${formatMoney(u.order.totalMinor, moneyOf(u.order.currency, view.locale))}` : ''}
                  </p>
                  {u.status === 'REWARDED' ? (
                    <p className="a2-sm">
                      <span className="a2-pill g">{g('list.givenOn', { amount: rewardText(u.rewardMinor ?? 0), when: u.rewardedAt ? when(u.rewardedAt) : '' })}</span>
                    </p>
                  ) : u.block ? (
                    <p className="a2-sm">
                      <span className="a2-pill line">{g(`list.block.${u.block}`)}</span>
                    </p>
                  ) : canPay && u.order ? (
                    <ReferralReward url={API} id={u.id} texts={{ give: `${g('give')} · ${amount}`, confirm: g('confirm', { amount, name, number: u.order.number }), yes: g('yes'), cancel: g('cancel'), given: g('given'), err }} />
                  ) : (
                    <p className="a2-sm">
                      <span className="a2-pill info">{g('list.reward', { amount })}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute ref-mt8">{g('list.empty')}</p>
        )}
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canOk} testId="ref-card" />
      </div>
    </div>
  );
}
