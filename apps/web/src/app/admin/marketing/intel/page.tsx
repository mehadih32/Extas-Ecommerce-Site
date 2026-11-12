// S13 · PR 548 (register "Market and competitor intelligence"; demo MKT-07 `97x-adm2-marketing.js` "Market &
// competitors") — Marketing › Market & competitors at /admin/marketing/intel, drawn in Lumen (CN-036: --lm-* tokens
// only, data-lm-ready): the price table (our price vs. the lowest matched price a followed shop shows, with a Gap
// pill), the followed links (add one, "Check now", archive/restore), and the "Change alerts" card. Proposals only —
// a price never changes here; it changes in the ERP (hard rule 6). Seeing needs `marketing.campaigns.read`; adding a
// link, acting on one, and the card need `marketing.campaigns.write`. Guide: docs/admin-guide/pages/marketing/intel.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { IntelLinksCard } from '@/components/admin/marketing/IntelLinksCard';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { intelScreen } from '@/lib/marketing/intel';
import bn from '../../../../../messages/admin-intel.bn.json';
import en from '../../../../../messages/admin-intel.en.json';
import './intel.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/intel';
const KEY = 'marketingIntel';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'in.meta'), robots: { index: false, follow: false } };
}

export default async function IntelPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps)]);
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
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `in.${k}`, vars);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const r = await intelScreen(access.deps.db, access.deps.resolver);
  const set = r.card.value;
  const now = access.deps.now?.() ?? new Date();
  const m = (minor: number) => formatMoney(minor, moneyOf(r.currency, view.locale));
  const ago = (iso: string | null) => {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return l('agoM', { n: mins });
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return l('agoH', { n: hrs });
    return l('agoD', { n: Math.round(hrs / 24) });
  };

  return (
    <div className="a2-z in-page" data-testid="intel" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={l('title')} sub={l('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="in-grid">
        <div className="in-stack">
          <section className="lm-card" aria-labelledby="in-t-h" data-testid="in-table">
            <h2 className="lm-h2" id="in-t-h">
              {l('table')}
            </h2>
            <p className="gg-span">{l('tableSub')}</p>
            {r.table.length ? (
              <div className="gg-table-w">
                <table className="gg-table in-table" data-testid="in-table-rows">
                  <thead>
                    <tr>
                      <th scope="col">{l('colProduct')}</th>
                      <th scope="col">{l('colYou')}</th>
                      <th scope="col">{l('colLowest')}</th>
                      <th scope="col">{l('colGap')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.table.map((row) => (
                      <tr key={row.ourId}>
                        <th scope="row">{row.ourName}</th>
                        <td>{m(row.ourPriceMinor)}</td>
                        <td>{row.theirPriceMinor === null ? l('unreadable') : m(row.theirPriceMinor)}</td>
                        <td className="in-gap">
                          {row.gapMinor === null ? (
                            <span className="gg-pill">{l('unknown')}</span>
                          ) : row.gapMinor < 0 ? (
                            <span className="gg-pill warn">{l('theyLower', { n: m(-row.gapMinor) })}</span>
                          ) : (
                            <span className="gg-pill ok">{l('youLower')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="gg-span" data-testid="in-table-empty">
                {l('tableEmpty')}
              </p>
            )}
          </section>
        </div>
        <div className="in-stack">
          <IntelLinksCard words={d} links={r.links.map((row) => ({ ...row, agoText: row.lastRunAt ? ago(row.lastRunAt) : '' }))} linksMax={r.linksMax} canWrite={canWrite} />
          {canWrite ? (
            <SettingCards
              save={{ method: 'PUT', url: '/api/admin/marketing/intel' }}
              cards={[{ key: r.card.key, title: l('card'), text: l('cardText'), on: set.on, fields: [] }]}
              testId="in-card"
            />
          ) : (
            <p className="lm-card gg-ro" data-testid="in-readonly">
              {l('readOnly')}
            </p>
          )}
        </div>
      </div>
      <p className="gg-span in-foot">{l('erpNote')}</p>
    </div>
  );
}
