// PR 799 (prototype v5 Reports › Profit): the four tables under the callout — By category, By area (division), By style and By product —
// each sortable (a tap on a heading), with the prototype's columns (Delivered sales, Profit before ads with its change, Margin), a row
// that goes where the prototype's row goes (a category filters the page, a division opens Areas, a style opens Products, a product opens
// its page) and "Show all". Server component; the sums come from lib/reports-v5/profit.ts and the Money figures.
import Link from 'next/link';
import { SortTable, type STRow } from './SortTable';
import type { ReportFmt } from '@/lib/reports-v5/fmt';
import { change } from '@/lib/reports-v5/model';
import { marginTone, type ProfitGroup } from '@/lib/reports-v5/profit';

type C = (k: string, v?: Record<string, string | number>) => string;

export interface ProfitTableRow {
  key: string;
  name: string;
  sub?: string;
  sales: number;
  /** Profit before ads. */
  profit: number;
  before: number | null;
  margin: number;
  href?: string;
  drawer?: { title: string; sub?: string; items: { label: string; sub?: string; value?: string; href?: string }[]; empty: string };
}

const TONE = { good: 'rp-m-good', bad: 'rp-m-bad', plain: undefined, none: undefined } as const;

export function toTableRow(x: { key: string; name: string; sub?: string; g: Pick<ProfitGroup, 'sales' | 'profit' | 'margin'>; was?: number | null; href?: string; drawer?: ProfitTableRow['drawer'] }): ProfitTableRow {
  return { key: x.key, name: x.name, sub: x.sub, sales: x.g.sales, profit: x.g.profit, before: x.was ?? null, margin: x.g.margin, href: x.href, drawer: x.drawer };
}

export function ProfitTable({ id, rows, nameHead, c, f, cmp, limit = 12, texts }: { id: string; rows: readonly ProfitTableRow[]; nameHead: string; c: C; f: ReportFmt; cmp: boolean; limit?: number; texts: { more: string; less: string; close: string; empty: string } }) {
  const cols = [{ h: nameHead }, { h: c('colSales'), right: true, hide: true }, { h: c('colProfitBefore'), right: true }, { h: c('colMargin'), right: true }];
  const st: STRow[] = rows.map((x) => {
    const d = cmp && x.before !== null ? change(x.profit, x.before) : null;
    return {
      key: x.key,
      cells: [
        <span key="n">
          <b>{x.name}</b>
          {x.sub ? <span className="a2-xs a2-mute a2-blk">{x.sub}</span> : null}
        </span>,
        f.amount(x.sales),
        <span key="p">
          <b className={x.profit < 0 ? 'rp-neg' : undefined}>{f.amount(x.profit)}</b>
          {d !== null ? (
            <>
              {' '}
              <span className={d >= 0 ? 'rp-up' : 'rp-dn'}>{`${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%`}</span>
            </>
          ) : null}
        </span>,
        <span key="m" className={TONE[marginTone(x.margin, x.sales > 0)] ?? undefined}>
          {x.sales ? `${Math.round(x.margin)}%` : '—'}
        </span>,
      ],
      sort: [x.name, x.sales, x.profit, x.margin],
      href: x.href,
      drawer: x.drawer,
    };
  });
  return <SortTable cols={cols} rows={st} sortCol={2} sortDir="desc" limit={limit} texts={texts} testId={id} rowId={`${id}-row`} />;
}

/** A small "open this" link under a table. */
export function MoreLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <Link className="a2-lnk cr-link a2-xs a2-blk a2-mt6" href={href} data-testid={testId}>
      {label} →
    </Link>
  );
}
