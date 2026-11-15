// S28 · PR 689 (admin prototype v5) — Reports › Report library at /admin/reports: pick a question, see the answer for a period
// (with compare), pin cards to Home, restock and unsold lists, orders by weekday and hour, last month's review, saved views.
// S28 · PR 689 follow-up: 6 months and your own dates in the period bar, Excel / PDF / Print of the report on the screen, and
// Downloads & report packs in one place. Seeing it needs `reports.read`. Words: messages/admin-reports-library.*.json (`reportsLibrary.*`). Read-only reports.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { customRange, PERIOD_PRESETS, type PeriodPreset, type PeriodRange } from '@extas/catalogue';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { LibraryScreen } from '@/components/admin/reports/LibraryScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { libraryScreen } from '@/lib/report-library-api';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { libraryGroups, loadLibraryInput, type CardVal } from '@/lib/reports-v5/library';
import { loadBase } from '@/lib/reports-v5/load';
import { withReportsV5 } from '@/lib/reports-v5/words';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-reports-library.bn.json';
import en from '../../../../messages/admin-reports-library.en.json';
import '../wave4b.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsLibrary';
const HERE = '/admin/reports';

function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: {
      ...view.dict,
      reportsLibrary: (view.lang === 'bn' ? bn : en).reportsLibrary as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, 'reportsLibrary.metaTitle')} · ${t(view.dict, 'shell.admin')}`,
    robots: { index: false, follow: false },
  };
}

export default async function ReportsLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const sp = await searchParams;
  const raw = typeof sp.preset === 'string' ? sp.preset : 'month';
  // your own dates (`from` and `to`) when they are a good pair, else a preset
  const own: PeriodRange | null = typeof sp.from === 'string' && typeof sp.to === 'string' ? customRange(sp.from, sp.to) : null;
  const preset = ((PERIOD_PRESETS as readonly string[]).includes(raw) ? raw : 'month') as PeriodPreset;
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID)]);
  const view = withReportsV5(withScreen(plain));
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="library-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const who: inv.Who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  const [screen, currency] = await Promise.all([libraryScreen(access.deps, who, own ?? preset), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const base = await loadBase(access.deps, { from: screen.range.from, to: screen.range.to });
  const f = makeFmt(view.locale, base.currency);
  const L = (k: string, v?: Record<string, string | number>) => t(view.dict, `reportsLibrary.${k}`, v);
  const word = (text: string) => {
    const k = `reportsV5.channel.${text}`;
    const w = t(view.dict, k);
    return w === k ? text.replace(/^(source|ads):/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()) : w;
  };
  const show = (id: string, v: CardVal): string => {
    if (v.k === 'none') return '—';
    if (v.k === 'text') return id === 'chprofit' ? word(v.text) : id === 'why' ? word(v.text) : v.text;
    if (v.n === null) return '—';
    if (v.k === 'money') return f.amount(v.n);
    if (v.k === 'pct') return id === 'repeat' ? `${Math.round(v.n)}%` : f.pctOf(v.n);
    if (v.k === 'x') return `${(Math.round(v.n * 10) / 10).toFixed(1)}×`;
    if (v.k === 'hours') return L('val.hours', { n: (Math.round(v.n * 10) / 10).toFixed(1) });
    if (v.k === 'products') return L('val.products', { n: f.num(v.n) });
    return id === 'checkoutj' ? L('val.open', { n: f.num(v.n) }) : f.num(v.n);
  };
  const groups = libraryGroups(await loadLibraryInput(access, base)).map((g) => ({
    id: g.id,
    title: g.id === 'sales' ? L('groups.sales') : L(`groups.${g.id}`),
    cards: g.cards.map((c) => {
      const pct = c.change === null ? null : Math.round(c.change * 100);
      const vars = Object.fromEntries(Object.entries(c.sub?.vars ?? {}).map(([k, x]) => (k.startsWith('$') ? [k.slice(1), f.amount(Number(x))] : [k, typeof x === 'number' ? f.num(x) : x])));
      return {
        id: c.id,
        q: L(`cards.${c.q}`),
        v: show(c.id, c.val),
        d: pct === null || pct === 0 ? null : { text: pct > 0 ? L('changeUp', { pct }) : L('changeDown', { pct: Math.abs(pct) }), tone: (pct > 0) !== !!c.lowerBetter ? ('good' as const) : ('bad' as const) },
        s: c.sub ? L(`line.${c.sub.key}`, vars) : '',
        href: c.href,
        small: !!c.small,
      };
    }),
  }));
  return (
    <div className="a2-z" data-testid="library-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(view.dict, 'reportsLibrary.title')} sub={t(view.dict, 'reportsLibrary.sub')} />
      <SectionTabs view={view} current={KEY} />
      <LibraryScreen
        dict={view.dict}
        money={moneyOf(currency, view.locale)}
        preset={own ? 'custom' : preset}
        lang={view.lang}
        compare={sp.compare === '1'}
        range={screen.range}
        cards={screen.cards}
        restock={screen.restock}
        time={screen.time}
        review={screen.review}
        views={screen.views}
        pins={screen.pins}
        groups={groups}
      />
    </div>
  );
}
