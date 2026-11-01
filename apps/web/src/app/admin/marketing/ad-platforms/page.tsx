// S13 · PR 259 (Blueprint C6.2, demo 93-admin-ads.js) — Marketing › Ad platforms at /admin/marketing/ad-platforms: each
// platform's connection (a practice copy until its key is in), "Read now", and the ad account's campaigns as the
// platform lists them (status, goal, budget, ad sets), each tied or not to one of the shop's own campaigns. Read only:
// nothing is paused and no budget changes here. Seeing needs `marketing.campaigns.read`; reading and tying need
// `marketing.campaigns.write`. Guide: docs/admin-guide/pages/marketing/ad-platforms.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AdCampaignLink, AdPlatformRead } from '@/components/admin/marketing/AdPlatformControls';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { adPlatformsOverview } from '@/lib/marketing/ad-platforms';
import bn from '../../../../../messages/admin-ad-platforms.bn.json';
import en from '../../../../../messages/admin-ad-platforms.en.json';
import './ad-platforms.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/ad-platforms';
const API = '/api/admin/marketing/ad-platforms';
const KEYS_PAGE = '/admin/integrations';
const KEY = 'marketingAdPlatforms';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'adp.metaTitle'), robots: { index: false, follow: false } };
}

export default async function AdPlatformsPage() {
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
  const o = await adPlatformsOverview({ db: access.deps.db, resolver: access.deps.resolver, vault: access.deps.vault });
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `adp.${k}`, vars);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const budget = (daily: number | null, total: number | null, cur: string) =>
    daily ? s('budgetDaily', { amount: formatMoney(daily, moneyOf(cur, view.locale)) }) : total ? s('budgetTotal', { amount: formatMoney(total, moneyOf(cur, view.locale)) }) : s('none');
  const errs = Object.fromEntries(['PLATFORM', 'INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)]));

  return (
    <div className="a2-z" data-testid="adp-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note" role="note">
        <span>{s('readOnlyNote')}</span>
      </div>

      {o.platforms.map((p) => (
        <section key={p.platform} className="a2-sc a2-mt12" aria-labelledby={`adp-${p.platform}-h`} data-testid={`adp-${p.platform}`} data-mode={p.mode}>
          <div className="adp-head">
            <h2 className="a2-h3" id={`adp-${p.platform}-h`}>
              {s(`platform.${p.platform}`)}
            </h2>
            <span className={`a2-pill ${p.mode === 'MOCK' ? 'warn' : 'g'}`}>{s(`mode.${p.mode}`)}</span>
          </div>
          <p className="a2-sm a2-mute">{p.lastTest ? s('lastTest', { when: when(p.lastTest.at), result: s(p.lastTest.ok ? 'testOk' : 'testBad') }) : s('noTest')}</p>
          <Link className="a2-sm adp-keys" href={KEYS_PAGE}>
            {s('keysLink')}
          </Link>
          {canWrite ? <AdPlatformRead url={API} platform={p.platform} texts={{ label: s('read'), working: s('reading'), done: s('readDone'), practice: s('readPractice'), err: errs }} /> : <p className="a2-sm a2-mute">{s('noManage')}</p>}

          {p.practice ? (
            <div className="a2-mt12" data-testid={`adp-${p.platform}-practice`}>
              <h3 className="a2-sm adp-sub">
                {s('practiceH')} <span className="a2-pill info">{s('practiceBadge')}</span>
              </h3>
              <p className="a2-sm a2-mute">{s('accountLine', { name: p.practice.account.name, id: p.practice.account.externalId, currency: p.practice.account.currency })}</p>
              <div className="a2-tblw a2-mt12">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{s('col.name')}</th>
                      <th>{s('col.status')}</th>
                      <th>{s('col.budget')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.practice.campaigns.map((c) => (
                      <tr key={c.externalId}>
                        <td>{c.name}</td>
                        <td className="a2-sm">{c.status}</td>
                        <td className="a2-sm adp-nowrap">{budget(c.dailyBudgetMinor, c.lifetimeBudgetMinor, p.practice!.account.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {!p.accounts.length && !p.practice ? <p className="a2-sm a2-mute a2-mt12">{s('noAccount')}</p> : null}
          {p.accounts.map((a) => (
            <div key={a.id} className="a2-mt12" data-testid="adp-account">
              <p className="a2-sm adp-sub">{s('accountLine', { name: a.name, id: a.externalId, currency: a.currency })}</p>
              {a.campaigns.length ? (
                <div className="a2-tblw a2-mt12">
                  <table className="a2-tbl" data-testid="adp-campaigns">
                    <thead>
                      <tr>
                        <th>{s('col.name')}</th>
                        <th>{s('col.status')}</th>
                        <th>{s('col.objective')}</th>
                        <th>{s('col.budget')}</th>
                        <th>{s('col.adSets')}</th>
                        <th>{s('col.ours')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.campaigns.map((c) => (
                        <tr key={c.id} data-gone={c.gone ? 'yes' : 'no'}>
                          <td>
                            {c.name}
                            {c.gone ? <span className="a2-pill line adp-gone">{s('gone')}</span> : null}
                          </td>
                          <td className="a2-sm">{c.status}</td>
                          <td className="a2-sm">{c.objective ?? s('none')}</td>
                          <td className="a2-sm adp-nowrap">{budget(c.dailyBudgetMinor, c.lifetimeBudgetMinor, c.currency)}</td>
                          <td className="a2-sm">{c.adSets}</td>
                          <td>
                            <AdCampaignLink url={API} adCampaignId={c.id} value={c.campaign?.id ?? null} ours={o.ours} label={s('linkLabel', { name: c.name })} none={s('linkNone')} disabled={!canWrite} err={s('linkErr')} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="a2-sm a2-mute">{s('noCampaigns')}</p>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
