// S08 · PR 181 — Orders → Packing & print → Picking list (ORD-04a; Blueprint B1.6, B1.7): the one list the store keeper
// holds to pull every piece of the run — every order still with us that has not gone to the courier, however many days
// they span — grouped category → style → colour → size with the most pieces first, sizes short of the shop's stock
// marked. The summary line counts orders and pieces separately, the line items, the categories in order, shortages and
// the held and problem orders (listed apart, never counted). The owner may narrow it to days (the day the order was
// placed); a dispatched order never enters it. "Print picking list" makes the PDF on the letterhead with a tick box per
// row. No customer's details: order numbers and pieces only.
//
// S20 · PR 405 (ORD-04b; demo V12.4 97s picking list): the list on screen for the picker's phone — every size line a
// large button with its colour, size, pieces (and shortage) and the order numbers it is for; a tap marks it pulled
// (`fulfilment.pack`), another tap takes the mark back; a line that got a new order after the mark shows "more to pull"
// with the new order numbers. "Pulled" counts the pieces of the lines marked. Each mark is one kept row (PickingTick).
//
// S20 · PR 412 (B2.3; demo V12.4 97s "Picking list sort"): the list's order as a card on this page
// (`fulfilment.picking.sort`: by category as shipped, or shelf by shelf; saved with `fulfilment.printSettings`) and a
// "Shelves" card — the shelf each style on the list is kept on, set here (`fulfilment.bins`; each change kept). Read
// shelf by shelf, the groups (on screen and on the PDF) are the shelves in order, the styles with no shelf last; the
// summary keeps its categories and nothing counted changes.
import type { Metadata } from 'next';
import '../../../settings-cards.css';
import '../packing.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { PickTick } from '@/components/admin/fulfil/PickTick';
import { ShelfEdit } from '@/components/admin/fulfil/ShelfEdit';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PICKING_SORTS } from '@extas/settings';
import { packingSettingCards } from '@/lib/packing-settings-api';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { categoryName, groupName } from '@/lib/admin-fulfil/picking';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/packing/picking';
const API = '/api/admin/packing/picking';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata(): Promise<Metadata> {
  const view = withFulfil(await adminView());
  return { title: `${t(view.dict, 'ful.picking.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function PickingPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('fulfilment.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withFulfil(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="packingPicking" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="fulfilment.read" />
      </div>
    );
  const one = (v: string | string[] | undefined) => (typeof v === 'string' && DAY.test(v) ? v : null);
  let from = one(sp.from);
  let to = one(sp.to);
  const badRange = !!from && !!to && from > to;
  if (badRange) [from, to] = [null, null];
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  const [list, cfg, cards] = await Promise.all([sh.pickingList(sd, who, { from, to }), sd.settings.value('delivery.picking.list', { storeId: MOTHER_STORE_ID }), packingSettingCards(access.deps, { actor: access.guard.actor, ctx: access.guard.ctx })]);
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const s = list.summary;
  const none = t(d, 'ful.picking.sheet.noCategory');
  const cat = (name: string) => categoryName(list, name, view.lang, none);
  const canTick = access.guard.permissions?.has('fulfilment.pack') ?? false;
  // PR 412: the group headings (categories, or shelves), the list-order card and the shelves card
  const group = (name: string) => groupName(list, name, view.lang, { none, shelf: (code) => t(d, 'ful.picking.sheet.shelf', { code }), noShelf: t(d, 'ful.picking.sheet.noShelf') });
  const canSettings = access.guard.permissions?.has('fulfilment.printSettings') ?? false;
  const canBins = access.guard.permissions?.has('fulfilment.bins') ?? false;
  const ps = (k: string) => t(d, `ful.printRun.set.${k}`);
  const sortTexts: FieldsCardTexts = {
    h: t(d, 'ful.picking.shelves.set.h'),
    d: t(d, 'ful.picking.shelves.set.d'),
    save: ps('save'),
    saving: ps('saving'),
    saved: ps('saved'),
    discard: ps('discard'),
    unsaved: ps('unsaved'),
    readOnly: ps('readOnly'),
    pairHelp: ps('readOnly'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, ps(`err.${c}`)])),
  };
  const sortFields: FieldsCardField[] = [{ kind: 'select', path: 'mode', label: t(d, 'ful.picking.shelves.set.mode'), options: PICKING_SORTS.map((v) => ({ value: v, label: t(d, `ful.picking.shelves.set.modes.${v}`) })) }];
  const counts: [string, number][] = [
    ['orders', s.orders],
    ['pieces', s.pieces],
    ['pulled', s.pulled],
    ['lines', s.lineItems],
    ['short', s.shortages],
    ['held', s.held],
  ];

  return (
    <div className="a2-z" data-testid="picking-page">
      <PageHead
        view={view}
        place={locateKey('packingPicking')}
        title={t(d, 'ful.picking.title')}
        sub={t(d, 'ful.picking.sub')}
        right={<PdfButton dict={fd} url={API} body={{ from, to }} label={t(d, 'ful.picking.print')} busyLabel={t(d, 'ful.packing.printing')} tone="pri" size="" testId="picking-print" disabled={!s.orders} fileName="picking-list.pdf" />}
      />
      <SectionTabs view={view} current="packingPicking" />
      <div className="a2-kpis a2-mt12" data-testid="picking-summary">
        {counts.map(([k, v]) => (
          <div key={k} className="a2-card a2-kpi">
            <div className="a2-kl">{t(d, `ful.picking.counts.${k}`)}</div>
            <div className="a2-kv">{n(v)}</div>
          </div>
        ))}
      </div>
      <section className="a2-card tight a2-mt12" aria-label={t(d, 'ful.picking.rangeTitle')} data-testid="picking-range">
        <form method="get" action={HERE} className="a2-gap8" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="a2-stack a2-xs" style={{ gap: 4 }}>
            {t(d, 'ful.picking.from')}
            <input type="date" name="from" className="a2-inp" defaultValue={from ?? ''} />
          </label>
          <label className="a2-stack a2-xs" style={{ gap: 4 }}>
            {t(d, 'ful.picking.to')}
            <input type="date" name="to" className="a2-inp" defaultValue={to ?? ''} />
          </label>
          <button type="submit" className="a2-btn sm">
            {t(d, 'ful.picking.apply')}
          </button>
          {from || to ? (
            <Link href={HERE} className="a2-btn sm ghost">
              {t(d, 'ful.picking.allDays')}
            </Link>
          ) : null}
        </form>
        <p className="a2-xs a2-mute a2-mt6">{badRange ? t(d, 'ful.picking.badRange') : t(d, 'ful.picking.rangeNote')}</p>
        <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
          <span className="a2-pill line">{t(d, `ful.handover.paper.${cfg.paper}`)}</span>
          <span className="a2-pill line">{t(d, 'ful.packing.dpi', { dpi: n(cfg.dpi) })}</span>
          <span className="a2-pill line">{t(d, `ful.packing.lang.${cfg.lang}`)}</span>
          <span className="a2-pill line">{t(d, 'ful.picking.shortPill', { on: t(d, cfg.markShortages ? 'ful.handover.on' : 'ful.handover.off') })}</span>
          <span className="a2-pill line" data-testid="picking-sort-pill">{t(d, 'ful.picking.shelves.sortPill', { mode: t(d, `ful.picking.shelves.sort.${list.sort}`) })}</span>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.picking.settingsNote')}</p>
      </section>
      {s.categories.length ? <p className="a2-xs a2-mt12">{t(d, 'ful.picking.sheet.categories', { list: s.categories.map((c) => `${cat(c.name)} ${n(c.pieces)}`).join(' · ') })}</p> : null}
      {list.groups.length ? (
        <div className="a2-tblw a2-mt12" data-testid="picking-list">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{t(d, 'ful.picking.sheet.col.item')}</th>
                <th className="r">{t(d, 'ful.picking.sheet.col.pieces')}</th>
              </tr>
            </thead>
            <tbody>
              {list.groups.flatMap((g) => [
                <tr key={`c-${g.category}`} data-testid="picking-category">
                  <td className="a2-tdh">
                    <b>{group(g.category)}</b>
                  </td>
                  <td className="r">
                    <b className="a2-num">{n(g.pieces)}</b>
                  </td>
                </tr>,
                ...g.styles.map((st) => (
                  <tr key={`s-${g.category}-${st.styleKey}`}>
                    <td className="a2-tdh">
                      <div className="a2-cell" style={{ paddingInlineStart: 16 }}>
                        <b>{st.style}</b>
                        <div className="pk-lines">
                          {st.colours.flatMap((c) =>
                            c.sizes.map((z) => (
                              <PickTick
                                key={z.key}
                                dict={fd}
                                lineKey={z.key}
                                state={z.tick.state}
                                canTick={canTick}
                                label={`${c.colour ?? t(d, 'ful.picking.sheet.noColour')} · ${z.size ?? t(d, 'ful.picking.sheet.noSize')} × ${n(z.quantity)}${z.short ? ` · ${t(d, 'ful.picking.sheet.short', { n: n(z.short) })}` : ''}`}
                                sub={z.orders.map((o) => (o.quantity > 1 ? `${o.orderNumber} ×${n(o.quantity)}` : o.orderNumber)).join(', ')}
                                words={{ done: t(d, 'ful.picking.tick.done'), more: t(d, 'ful.picking.tick.more', { list: z.tick.newOrders.join(', ') }), tick: t(d, 'ful.picking.tick.tick'), untick: t(d, 'ful.picking.tick.untick') }}
                              />
                            )),
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="r" data-l={t(d, 'ful.picking.sheet.col.pieces')}>
                      <b className="a2-num">{n(st.pieces)}</b>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-state a2-mt12" data-testid="picking-empty">
          <div className="a2-sti">
            <ShellIcon name="print" size={26} />
          </div>
          <h3>{t(d, 'ful.picking.empty')}</h3>
          <p>{t(d, 'ful.picking.emptySub')}</p>
        </div>
      )}
      <section className="a2-card tight a2-mt12" aria-label={t(d, 'ful.picking.shelves.title')} data-testid="picking-shelves">
        <h2 className="a2-h4">{t(d, 'ful.picking.shelves.title')}</h2>
        <p className="a2-xs a2-mute">{t(d, 'ful.picking.shelves.sub')}</p>
        <ShelfEdit dict={fd} rows={list.shelves} canEdit={canBins} />
        <p className="a2-xs a2-mute a2-mt6">{canBins ? t(d, 'ful.picking.shelves.note') : t(d, 'ful.picking.shelves.readOnly')}</p>
      </section>
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/packing/settings" screen={cards['fulfilment.picking.sort']} fields={sortFields} texts={sortTexts} canEdit={canSettings} testId="picking-sort" />
      </div>
      <section className="a2-card tight a2-mt12" aria-label={t(d, 'ful.picking.heldTitle')} data-testid="picking-held">
        <h2 className="a2-h4">{t(d, 'ful.picking.heldTitle')}</h2>
        {list.held.length ? (
          <ul className="a2-stack a2-mt6" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
            {list.held.map((h) => (
              <li key={h.orderId} className="a2-xs">
                <b>
                  <Link className="a2-lnk" href={`/admin/orders/${h.orderId}`}>{h.orderNumber}</Link>
                </b>{' '}
                · {t(d, `ful.picking.reason.${h.reason}`)} · {t(d, 'ful.picking.heldPieces', { n: n(h.pieces) })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.picking.noHeld')}</p>
        )}
      </section>
    </div>
  );
}
