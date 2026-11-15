// Parity round 3, lane F2 (PR 821) — the figures behind the prototype v5 Finance › Overview blocks "Where the money is now",
// "Courier money", "Next 14 days of cash" and "Books match with the ERP". Everything comes from records that already exist
// (the cashbook, the COD the couriers hold, the claims ledger, the courier payouts, the wallets, the ERP account). Read-only:
// nothing here moves money. A part the person may not read, or that is not set up (no ERP link), comes back as null and the
// page shows its own "not set up" line instead of a made-up number.
import * as inv from '@extas/inventory';
import type { PrismaClient } from '@extas/db/client';

type Db = PrismaClient;
import type { MoneyOverview } from '../money-overview';

export interface NowAccount {
  key: string;
  name: string;
  minor: number;
}

export interface NowErp {
  owedMinor: number;
  erpSaysMinor: number | null;
  daysSincePayment: number | null;
  holdsInDays: number | null;
  onHold: boolean;
  openLines: number;
  tone: 'good' | 'warn' | 'bad';
}

export interface NowPayout {
  id: string;
  courier: string;
  state: string;
  minor: number;
}

export interface MoneyNow {
  accounts: NowAccount[] | null;
  inHandMinor: number | null;
  walletsMinor: number;
  walletHolders: number;
  erp: NowErp | null;
  payouts: NowPayout[];
  forecast: { days: { day: string; inMinor: number; outMinor: number; balanceMinor: number }[]; tightest: { day: string; balanceMinor: number } | null; fixedMinor: number } | null;
}

/** How full the ERP hold clock is: 'good' below the warning day, 'warn' from it, 'bad' once the hold starts. Pure. */
export function holdTone(daysSince: number | null, warnFromDays: number | null, holdAfterDays: number | null): 'good' | 'warn' | 'bad' {
  if (daysSince === null) return 'good';
  if (holdAfterDays !== null && daysSince >= holdAfterDays) return 'bad';
  if (warnFromDays !== null && daysSince >= warnFromDays) return 'warn';
  return 'good';
}

/** Days left before the hold starts (never below 0), or null when the ERP has not said. Pure. */
export function daysToHold(holdsOn: string | null, today: string): number | null {
  if (!holdsOn) return null;
  const ms = Date.parse(`${holdsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : null; // hardcode-ok: ms per day
}

async function safe<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null; // no permission or not set up: the block says so, it never shows a guess
  }
}

export async function loadMoneyNow(o: { db: Db; deps: inv.InventoryDeps; who: inv.Who; money: MoneyOverview; can: { books: boolean; erp: boolean }; locale: 'en' | 'bn' }): Promise<MoneyNow> {
  const { db, deps, who, money, can, locale } = o;
  const [book, forecast, erp, status, wallets, payouts] = await Promise.all([
    can.books ? safe(() => inv.cashbookView(deps, who, { limit: 1 }) /* hardcode-ok: only the balances are used */) : null,
    can.books ? safe(() => inv.cashbookForecast(deps, who, money.cod.minor)) : null,
    can.erp ? safe(() => inv.accountOverview(deps, who)) : null,
    can.books ? safe(() => inv.booksStatus(deps, who)) : null,
    safe(() => db.walletAccount.aggregate({ where: { storeId: who.storeId, balanceMinor: { gt: 0 } }, _sum: { balanceMinor: true }, _count: { _all: true } })),
    safe(() =>
      db.courierPayout.findMany({
        where: { storeId: who.storeId, state: { in: ['REQUESTED', 'PROCESSING'] } },
        orderBy: { createdAt: 'desc' },
        take: 6, // hardcode-ok: the card shows the newest few
        select: { id: true, state: true, amountMinor: true, courierAccount: { select: { name: true } } },
      }),
    ),
  ]);
  const accounts = book ? book.accounts.filter((a) => !a.archived).map((a) => ({ key: a.key, name: locale === 'bn' && a.nameBn ? a.nameBn : a.nameEn, minor: a.balanceMinor })) : null;
  let erpNow: NowErp | null = null;
  if (erp?.link && erp.balanceMinor !== null) {
    const since = erp.erp?.daysSinceLastPayment ?? null;
    const left = daysToHold(erp.erp?.holdsOn ?? null, erp.today ?? '');
    const total = since !== null && left !== null ? since + left : null;
    erpNow = {
      owedMinor: erp.balanceMinor,
      erpSaysMinor: erp.erp?.balanceMinor ?? null,
      daysSincePayment: since,
      holdsInDays: left,
      onHold: erp.erp?.onHold ?? false,
      openLines: status?.open.total ?? 0,
      tone: erp.erp?.onHold ? 'bad' : holdTone(since, total === null ? null : Math.ceil(total / 2), total),
    };
  }
  return {
    accounts,
    inHandMinor: book ? book.totalMinor : null,
    walletsMinor: Number(wallets?._sum.balanceMinor ?? 0),
    walletHolders: wallets?._count._all ?? 0,
    erp: erpNow,
    payouts: (payouts ?? []).map((p) => ({ id: p.id, courier: p.courierAccount.name, state: p.state, minor: p.amountMinor })),
    forecast: forecast ? { days: forecast.days, tightest: forecast.tightest, fixedMinor: forecast.fixedMinor } : null,
  };
}
