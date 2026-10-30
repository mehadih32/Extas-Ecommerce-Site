// CN-028 · PR 616 — what every Money → Books page of the match does first: sign in (else the login page), check the
// page's key in the page's store (else the "no access" state), the words of the books, the money and date formats, and
// the head with the section's tabs. Each page then reads only its own store's link through @extas/inventory, which
// checks the key again.
// qa-gate: the store is the person's, not a fixed one — `?storeId=` (as the books API takes it), else the mother store.
// The page's key is checked in that store, its money is that store's currency, and every form and link of the page
// carries the same store (`api`, `href`), so staff of store 2 work on store 2's books.
import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps, type AdminDeps } from '@/lib/admin-auth';
import { withBooks } from '@/lib/admin-books/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { inventoryDeps } from '@/lib/inventory-api';
import { t, type Dict } from '@/lib/i18n';

export interface BooksPageCtx {
  view: AdminView;
  d: Dict;
  /** Only the `bk.*` words, for the client form. */
  bd: Dict;
  who: inv.Who;
  idp: inv.InventoryDeps;
  deps: AdminDeps;
  perms: Set<PermissionKey>;
  digits: number;
  m: (minor: number | null | undefined) => string;
  n: (x: number) => string;
  day: (s: string | null | undefined) => string;
  at: (s: string | null | undefined) => string;
  head: ReactElement;
  /** The store the page shows. */
  storeId: number;
  /** A books API path for the page's store. */
  api: (path: string) => string;
  /** A link to another books page, in the page's store. */
  href: (path: string) => string;
}

type Search = Record<string, string | string[] | undefined> | undefined;

/** The store a books page shows: `?storeId=` (a positive whole number), else the mother store. */
export function storeOfSearch(sp: Search): number {
  const raw = sp?.storeId;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = v && /^\d{1,9}$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : MOTHER_STORE_ID;
}

const withStore = (storeId: number, path: string) => (storeId === MOTHER_STORE_ID ? path : `${path}${path.includes('?') ? '&' : '?'}storeId=${storeId}`);

/** A books API path for a store (`/api/admin/books…?storeId=`). */
export const booksApi = (storeId: number, path: string): string => withStore(storeId, `/api/admin/books${path}`);

/** A link to a books page in a store. */
export const booksHref = (storeId: number, path: string): string => withStore(storeId, path);

/**
 * qa-gate F1 (CN-029 Phase 3): on a phone a table row is a two-column card, so a status cell that holds "Put right"
 * spans the whole card (`a2-tdw`) — the opened form never runs off the screen. Desktop keeps its table.
 */
export const diffStatusCellClass = (adjust: boolean): string | undefined => (adjust ? 'a2-tdw' : undefined);

/** Opens a books page for `perm`, or answers the element to show instead (no access, no database). */
export async function openBooksPage(o: { perm: PermissionKey; here: string; current: string; title: string; sub: string; storeId?: number }): Promise<BooksPageCtx | { el: ReactElement }> {
  const deps = adminDeps();
  const storeId = o.storeId ?? MOTHER_STORE_ID;
  const [plain, access] = await Promise.all([adminView(deps), pageAccess(o.perm, deps, storeId)]);
  const view = withBooks(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(booksHref(storeId, o.here))}`);
  if (access.kind === 'unavailable') return { el: <AdminNotice view={view} current={o.current} text={t(d, 'page.noDb')} /> };
  if (access.kind === 'forbidden')
    return {
      el: (
        <div className="a2-z">
          <ShellState view={view} kind="denied" permission={o.perm} />
        </div>
      ),
    };
  const currency = (await access.deps.resolver.value('store.currency', { storeId })) as string;
  const money = moneyOf(currency, view.locale);
  const dateOf = new Intl.DateTimeFormat(view.locale, { timeZone: 'UTC', numberingSystem: 'latn', dateStyle: 'medium' });
  const stamp = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium', timeStyle: 'short' });
  return {
    view,
    d,
    bd: { bk: d.bk as Dict },
    who: { actor: access.guard.actor, storeId, ctx: access.guard.ctx },
    storeId,
    api: (path) => booksApi(storeId, path),
    href: (path) => booksHref(storeId, path),
    idp: await inventoryDeps(access.deps),
    deps: access.deps,
    perms: access.guard.permissions ?? new Set(),
    digits: money.digits,
    m: (minor) => (minor == null ? '—' : formatMoney(minor, money)),
    n: (x) => formatNumber(x, view.locale),
    day: (s) => (s ? dateOf.format(new Date(`${s}T00:00:00Z`)) : '—'),
    at: (s) => (s ? stamp.format(new Date(s)) : '—'),
    head: (
      <>
        <PageHead view={view} place={locateKey(o.current)} title={o.title} sub={o.sub} />
        <SectionTabs view={view} current={o.current} />
      </>
    ),
  };
}

/** The result of a day or a check as a coloured pill. */
export function ResultPill({ d, result }: { d: Dict; result: string | null }) {
  const tone = result === 'MATCHED' ? 'ok' : result === 'PARTIAL' ? 'line' : result === 'PENDING' ? 'gold' : result ? 'bad' : 'line';
  // A long result ("Matched (partly checked)") wraps inside a narrow phone cell instead of running over its neighbour.
  return (
    <span className={`a2-pill ${tone}`} style={{ whiteSpace: 'normal' }}>
      {t(d, `bk.result.${result ?? 'none'}`)}
    </span>
  );
}

/** The page when the store is still on v5 or has no ERP link: the books start at the switch. */
export function BooksOff({ ctx, model, testId }: { ctx: BooksPageCtx; model: 'v5' | 'v6'; testId: string }) {
  return (
    <div className="a2-z" data-testid={testId}>
      {ctx.head}
      <section className="a2-card a2-mt12" data-testid="books-off">
        <p className="a2-sm a2-mute">{t(ctx.d, model === 'v5' ? 'bk.v5' : 'bk.noLink')}</p>
      </section>
    </div>
  );
}
