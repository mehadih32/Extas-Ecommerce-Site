// S28 · PR 712 (CN-048, admin prototype v5, Products › Sets) at /admin/products/sets — the sets as their own tab (the prototype
// splits Combos from Sets; Combos & sets stays as it is): each set with its pieces (a top and a bottom …), the set price against
// the pieces added up, the stock of the set (what its weakest piece allows), and where it stands. READ ONLY: a set is changed on
// Combos & sets. Which combo kinds count as a set, and when a stock is Low, are the owner's ("More options", `combos.setsTab`).
// Seeing needs `combos.read`; changing the options `combos.write`. Words: messages/admin-sets.*.json (`productSets.*`).
// Guide: docs/admin-guide/pages/products/sets.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cb from '@extas/combos';
import { COMBO_SET_TYPES } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { SetActions, type SetActionsTexts } from '@/components/admin/combos/SetActions';
import { SetEditorButton, SetEditorHost } from '@/components/admin/combos/SetEditor';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { combosAccess, storeCurrency } from '@/lib/admin-combos';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { setsOptionsCard } from '@/lib/combos-sets-api';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-sets.bn.json';
import en from '../../../../../messages/admin-sets.en.json';
import '../../combos/combos.css';
import '../../settings/settings.css';
import '../../settings-cards.css';
import './sets.css';

export const dynamic = 'force-dynamic';

const KEY = 'productSets';
const HERE = '/admin/products/sets';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, productSets: (view.lang === 'bn' ? bn : en).productSets as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'productSets.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SetsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('combos.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="sets-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="combos.read" />
      </div>
    );
  const a = combosAccess(access);
  const [list, currency, card, options] = await Promise.all([cb.listSets(a.deps, a.who, { withCost: a.perms.prices }), storeCurrency(a), setsOptionsCard(access.deps, MOTHER_STORE_ID), a.perms.write ? cb.comboOptions(a.deps, a.who) : Promise.resolve({ products: [] })]);
  const money = moneyOf(currency, view.locale);
  // PR 971: the set editor's "Your profit" line needs each piece's ERP buying price (only for someone who may see prices)
  const costRows = a.perms.prices ? await a.deps.db.productVariant.groupBy({ by: ['productId'], where: { storeId: a.storeId, archivedAt: null, shopPriceMinor: { gt: 0 } }, _min: { shopPriceMinor: true } }) : [];
  const costs: Record<string, number> = Object.fromEntries(costRows.flatMap((r) => (r._min.shopPriceMinor ? [[r.productId, r._min.shopPriceMinor] as const] : [])));
  const requirePin = (await a.deps.settings.value('catalogue.prices.requirePin', { storeId: a.storeId })) === true;
  const m = (x: number) => formatMoney(x, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const so = (k: string, v?: Record<string, string | number>) => t(d, `productSets.${k}`, v);

  const opt = (k: string) => so(`opt.${k}`);
  const texts: FieldsCardTexts = {
    h: opt('h'),
    d: opt('d'),
    save: opt('save'),
    saving: opt('saving'),
    saved: opt('saved'),
    discard: opt('discard'),
    unsaved: opt('unsaved'),
    readOnly: opt('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, opt(`err.${k}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'checks', path: 'types', label: opt('types'), options: COMBO_SET_TYPES.map((k) => ({ value: k, label: so(`type.${k}`) })) },
    { kind: 'number', path: 'lowStockAt', label: opt('lowStockAt'), help: opt('lowStockAtHelp'), min: 0, max: 1000 },
  ];
  const fig = (label: string, value: string, sub: string, testId: string) => (
    <div className="a2-card st-fig" data-testid={testId}>
      <span className="a2-xs a2-mute">{label}</span>
      <b>{value}</b>
      {sub ? <span className="a2-xs a2-mute">{sub}</span> : null}
    </div>
  );
  const name = (x: { nameEn: string | null; nameBn: string | null }) => (view.lang === 'bn' ? (x.nameBn ?? x.nameEn) : x.nameEn) ?? '—';
  const actionTexts: SetActionsTexts = {
    on: so('act.on'),
    off: so('act.off'),
    edit: so('act.edit'),
    archive: so('act.archive'),
    bringBack: so('act.bringBack'),
    archived: so('act.archived'),
    confirm: so('act.confirm'),
    confirmBody: so('act.confirmBody'),
    cancel: so('act.cancel'),
    failed: so('act.failed'),
    notReady: so('act.notReady'),
  };
  const pct = (profit: number, price: number) => (price > 0 ? `${new Intl.NumberFormat(view.locale, { numberingSystem: 'latn', maximumFractionDigits: 0 }).format(Math.round((profit / price) * 100))}%` : '—');

  return (
    <SetEditorHost dict={d} lang={view.lang === 'bn' ? 'bn' : 'en'} locale={view.locale} currency={currency} products={options.products} canPrice={a.perms.prices} costs={costs} requirePin={requirePin} failed={so('act.failed')}>
    <div className="a2-z" data-testid="sets-page" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={so('title')}
        sub={so('sub')}
        right={
          <>
            <Link className="a2-btn" href="/admin/products/new" data-testid="sets-add-listing">
              {so('addListing')}
            </Link>
            {a.perms.write ? (
              <SetEditorButton id={null} label={so('newSet')} primary />
            ) : null}
          </>
        }
      />
      <SectionTabs view={view} current={KEY} />

      <div className="st-figs">
        {fig(so('k.live'), `${n(list.live)}/${n(list.total)}`, '', 'sets-fig-live')}
        {fig(so('k.sold'), n(list.sold30), '', 'sets-fig-sold')}
        {fig(so('k.sales'), m(list.sales30Minor), '', 'sets-fig-sales')}
        {fig(so('k.colours'), n(list.coloursReady), '', 'sets-fig-colours')}
      </div>
      <div className="a2-note a2-mt12" data-testid="sets-note">{so('note')}</div>

      {list.rows.length ? (
        <div className="st-grid" data-testid="sets-grid">
          {list.rows.map((r) => {
            const archived = r.state === 'ended';
            const profit = r.costMinor !== null && r.setPriceMinor !== null ? r.setPriceMinor - r.costMinor : null;
            return (
              <section key={r.id} className="a2-card st-card" data-testid="set-card" data-state={r.state}>
                <div className="st-head">
                  <h2 className="a2-h3">{name(r)}</h2>
                </div>
                <div className="st-pcs">
                  {r.parts.map((p, i) => (
                    <div key={p.position} className="st-pcw" data-testid="set-piece">
                      {i > 0 ? <b className="st-plus a2-mute">+</b> : null}
                      <a className="st-pc" href={p.productId ? `/admin/products/${p.productId}` : undefined}>
                        <span className="st-pcn">
                          <b>{name(p)}</b>
                          <span className="a2-xs a2-mute">{p.quantity > 1 ? `${so('qty', { n: n(p.quantity) })} · ` : ''}{p.label || so('piece', { n: n(p.position + 1) })}</span>
                        </span>
                      </a>
                    </div>
                  ))}
                </div>
                <div className="a2-sm st-link-line">
                  <b>{r.sameColour ? so('colour.same') : so('colour.free')}</b>
                </div>
                <div className="st-chips" data-testid="set-colours">
                  {r.colours.length ? (
                    r.colours.map((c) => (
                      <span key={c.id} className={`st-chip${c.ok ? '' : ' off'}`}>
                        <i style={{ background: c.hex }} aria-hidden="true" />
                        {name(c)}
                      </span>
                    ))
                  ) : (
                    <span className="a2-pill bad">{so('noColour')}</span>
                  )}
                </div>
                <div className="a2-xs a2-mute st-sizes" data-testid="set-sizes">
                  {r.parts.map((p, i) => (
                    <span key={p.position} className="a2-blk">
                      {i === 0 ? so('sizes.top') : so('sizes.bottom')}:{' '}
                      {p.sizes.map((z, j) => (
                        <span key={z.key}>
                          {j > 0 ? ' · ' : ''}
                          <span className={z.inStock ? undefined : 'st-gone'}>{z.label}</span>
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
                <dl className="st-list">
                  <div>
                    <dt>{so('price')}</dt>
                    <dd>
                      <b>{r.setPriceMinor === null ? so('noPrice') : m(r.setPriceMinor)}</b>
                      {r.sumPartsMinor !== null && r.setPriceMinor !== null && r.setPriceMinor < r.sumPartsMinor ? <s className="st-was">{m(r.sumPartsMinor)}</s> : null}
                    </dd>
                  </div>
                  <div>
                    <dt>{so('profit')}</dt>
                    <dd data-testid="set-profit">{profit === null || r.setPriceMinor === null ? '—' : <>{m(profit)} · <span className="a2-pill ok">{pct(profit, r.setPriceMinor)}</span></>}</dd>
                  </div>
                  <div>
                    <dt>{so('soldRow')}</dt>
                    <dd>
                      <b>{n(r.sold30)}</b>
                    </dd>
                  </div>
                  <div>
                    <dt>{so('stock')}</dt>
                    <dd data-testid="set-stock">
                      {so('stockN', { n: n(r.stock) })} {r.low ? <span className="a2-pill warn">{so('low')}</span> : null}
                    </dd>
                  </div>
                </dl>
                {r.blocking.length ? <p className="a2-xs a2-mt6" style={{ color: 'var(--bad)' }}>{r.blocking.map((b) => so(`blocking.${b}`)).join(' · ')}</p> : null}
                <SetActions id={r.id} on={r.state === 'live' || r.state === 'soon'} archived={archived} canPublish={a.perms.publish} canEdit={a.perms.write} texts={actionTexts} />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="a2-card a2-mt12" data-testid="sets-none">
          <p className="a2-sm a2-mute">{so('none')}</p>
          <p className="a2-xs a2-mute a2-mt6">{so('noneKind', { kinds: list.types.map((k) => so(`type.${k}`)).join(', ') })}</p>
          <div className="a2-mt6">
            <Link href="/admin/combos?tab=new" className="st-link">{so('edit')}</Link>
          </div>
        </div>
      )}

      {/* PR 786: the prototype has no options card; the two owner settings stay reachable, folded away under a plain line */}
      <details className="st-opts a2-mt12" data-testid="sets-options-fold">
        <summary className="a2-xs a2-mute">{opt('h')}</summary>
        <FieldsCard url="/api/admin/combos/sets/options" screen={{ key: card.key, value: { ...card.value }, version: card.version }} fields={fields} texts={texts} canEdit={a.perms.write} testId="sets-options" />
      </details>
    </div>
    </SetEditorHost>
  );
}
