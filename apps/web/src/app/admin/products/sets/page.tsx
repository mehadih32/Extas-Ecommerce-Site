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
import '../../settings/settings.css';
import '../../settings-cards.css';
import './sets.css';

export const dynamic = 'force-dynamic';

const KEY = 'productSets';
const HERE = '/admin/products/sets';
const statePill = { live: 'ok', soon: 'info', off: 'line', ended: 'line', draft: 'warn' } as const;

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
  const [list, currency, card] = await Promise.all([cb.listSets(a.deps, a.who), storeCurrency(a), setsOptionsCard(access.deps, MOTHER_STORE_ID)]);
  const money = moneyOf(currency, view.locale);
  const m = (x: number) => formatMoney(x, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const so = (k: string, v?: Record<string, string | number>) => t(d, `productSets.${k}`, v);
  const lowCount = list.rows.filter((r) => r.low).length;

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
      <span className="a2-xs a2-mute">{sub}</span>
    </div>
  );
  const name = (x: { nameEn: string | null; nameBn: string | null }) => (view.lang === 'bn' ? (x.nameBn ?? x.nameEn) : x.nameEn) ?? '—';

  return (
    <div className="a2-z" data-testid="sets-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={so('title')} sub={so('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="st-figs">
        {fig(so('k.live'), `${n(list.live)}/${n(list.total)}`, so('k.liveSub', { total: n(list.total) }), 'sets-fig-live')}
        {fig(so('k.low'), list.lowStockAt > 0 ? n(lowCount) : '—', so('k.lowSub', { n: n(list.lowStockAt) }), 'sets-fig-low')}
        {fig(so('k.soldOut'), n(list.soldOut), so('k.soldOutSub'), 'sets-fig-soldout')}
      </div>
      <div className="a2-note a2-mt12">{so('note')}</div>

      {list.rows.length ? (
        <div className="st-grid" data-testid="sets-grid">
          {list.rows.map((r) => (
            <section key={r.id} className="a2-card st-card" data-testid="set-card" data-state={r.state}>
              <div className="st-head">
                <div>
                  <h2 className="a2-h3">{name(r)}</h2>
                  <span className="a2-xs a2-mute">{so(`type.${r.type}`)} · {r.sameColour ? so('colour.same') : so('colour.free')}</span>
                </div>
                <span className={`a2-pill ${statePill[r.state]}`}>{so(`state.${r.state}`)}</span>
              </div>
              <ul className="st-pieces" aria-label={so('pieces')}>
                {r.parts.map((p) => (
                  <li key={p.position} className={`st-piece${p.position === r.limitedBy && r.stock <= (list.lowStockAt || 0) ? ' limit' : ''}`} data-testid="set-piece">
                    <span>
                      <b>{p.label || so('piece', { n: n(p.position + 1) })}</b> · {name(p)}
                      <span className="a2-xs a2-mute a2-blk">{p.quantity > 1 ? `${so('qty', { n: n(p.quantity) })} · ` : ''}{p.priceMinor === null ? so('noPiecePrice') : m(p.priceMinor)}</span>
                    </span>
                    <span className="a2-xs a2-mute">{so('pieceStock', { n: n(p.stock) })}</span>
                  </li>
                ))}
              </ul>
              <dl className="st-kv">
                <dt className="a2-sm a2-mute">{so('price')}</dt>
                <dd>{r.setPriceMinor === null ? so('noPrice') : m(r.setPriceMinor)}</dd>
                <dt className="a2-sm a2-mute">{so('sum')}</dt>
                <dd>{r.sumPartsMinor === null ? so('noPiecePrice') : m(r.sumPartsMinor)}</dd>
                {r.savingMinor > 0 ? (
                  <>
                    <dt className="a2-sm a2-mute">{so('save')}</dt>
                    <dd>{so('savePct', { amount: m(r.savingMinor), pct: n(r.savingPercent) })}</dd>
                  </>
                ) : null}
                <dt className="a2-sm"><b>{so('stock')}</b></dt>
                <dd data-testid="set-stock">
                  {so('stockN', { n: n(r.stock) })} {r.low ? <span className="a2-pill warn">{so('low')}</span> : null}
                </dd>
              </dl>
              {r.limitedBy !== null && r.parts.length > 1 ? <p className="a2-xs a2-mute a2-mt6">{so('limit', { name: name(r.parts.find((p) => p.position === r.limitedBy)!) })}</p> : null}
              {r.blocking.length ? <p className="a2-xs a2-mt6" style={{ color: 'var(--bad)' }}>{r.blocking.map((b) => so(`blocking.${b}`)).join(' · ')}</p> : null}
              <div className="a2-mt6">
                <Link href="/admin/combos?tab=fixed" className="st-link">{so('edit')}</Link>
              </div>
            </section>
          ))}
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

      <div className="a2-mt12">
        <FieldsCard url="/api/admin/combos/sets/options" screen={{ key: card.key, value: { ...card.value }, version: card.version }} fields={fields} texts={texts} canEdit={a.perms.write} testId="sets-options" />
      </div>
    </div>
  );
}
