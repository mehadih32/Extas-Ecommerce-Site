'use client';
// PR 628 (CN-036, LUMEN-SPEC §3 item 3) — list + filter + bulk (All orders, Products, Stock, Campaigns, Coupons, Pages,
// Cashbook): filter chips with their counts, a search box, the first rows and "Show N more" (`admin.patterns.pageStep`,
// 12 as shipped), a tick box per row with a bulk bar (what the page offers: Confirm, Print labels, Assign courier …,
// and Clear), and a row press opens its detail in the drawer (a bottom sheet on a phone), else its own page.
// Built from the orders list's chips and BulkBar idea; the rows arrive from the server already drawn (`cells`), so a
// page keeps its own columns and links. Bulk actions follow the same safety as the queue (lib/admin-lumen/safety.ts):
// a reversible kind runs in one tap with Undo; anything else (money, refunds, COD, prices, discounts, blocking,
// deleting) only opens its own page with the chosen ids, where the existing confirmation stays.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Drawer } from '@/components/admin/shell/Drawer';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { chipCounts, filterRows, moreCount } from '@/lib/admin-lumen/list';
import { actMode, runCall, withBody, type LmAction } from '@/lib/admin-lumen/safety';
import { useLumen } from './context';
import { EmptyState } from './EmptyState';
import { showToast } from './Toast';

export interface ListRow {
  id: string;
  /** The chips this row counts under. */
  chips: readonly string[];
  /** What the search looks in (number, name, phone …). */
  text: string;
  /** The row as drawn (its own columns and links). */
  cells: ReactNode;
  /** What the drawer shows; none = the row opens `href`. */
  detail?: ReactNode;
  detailTitle?: string;
  detailSub?: string;
  href?: string;
}

export interface ListViewProps {
  rows: readonly ListRow[];
  chips: readonly { key: string; label: string }[];
  /** The "All" chip's words. */
  allLabel: string;
  searchLabel: string;
  bulk?: readonly (LmAction & { done?: string })[];
  /** A header row (column names), optional. */
  head?: ReactNode;
  empty: { title: string; text?: string };
  initialChip?: string;
  testId?: string;
}

/** A page link with the chosen ids added (?ids=a,b). */
export function hrefWithIds(href: string, ids: readonly string[]): string {
  return `${href}${href.includes('?') ? '&' : '?'}ids=${ids.map(encodeURIComponent).join(',')}`;
}

const fromControl = (ev: MouseEvent) => (ev.target as HTMLElement).closest('a,button,input,select,textarea,label');

export function ListView({ rows, chips, allLabel, searchLabel, bulk = [], head, empty, initialChip = 'all', testId = 'lm-list' }: ListViewProps) {
  const { lt, pageStep } = useLumen();
  const router = useRouter();
  const [chip, setChip] = useState(initialChip);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(pageStep);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ListRow | null>(null);
  const [busy, setBusy] = useState(false);
  const closeDrawer = useCallback(() => setOpen(null), []);

  const found = useMemo(() => filterRows(rows, chip, query), [rows, chip, query]);
  const counts = useMemo(
    () =>
      chipCounts(
        rows,
        chips.map((c) => c.key),
        query,
      ),
    [rows, chips, query],
  );
  const visible = found.slice(0, shown);
  const more = moreCount(found.length, visible.length, pageStep);
  const ids = [...picked];
  const allOn = visible.length > 0 && visible.every((r) => picked.has(r.id));

  const toggle = (id: string) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const pickAll = () => setPicked(allOn ? new Set() : new Set(visible.map((r) => r.id)));
  const choose = (k: string) => {
    setChip(k);
    setShown(pageStep);
  };
  const openRow = (r: ListRow) => {
    if (r.detail) setOpen(r);
    else if (r.href) router.push(r.href);
  };

  const runBulk = async (a: LmAction & { done?: string }) => {
    const m = actMode(a);
    if (m.mode !== 'run' || busy || !ids.length) return;
    setBusy(true);
    const ok = await runCall(withBody(m.call, { ids }));
    setBusy(false);
    if (!ok) {
      showToast({ text: lt('failed'), tone: 'bad' });
      return;
    }
    const done = ids;
    setPicked(new Set());
    showToast({
      text: a.done?.replace('{n}', String(done.length)) ?? lt('done'),
      undo: {
        kind: a.kind,
        run: async () => {
          const u = await runCall(withBody(m.undo, { ids: done }));
          router.refresh();
          return u;
        },
      },
    });
    router.refresh();
  };

  return (
    <section className="lm-list" data-testid={testId}>
      <div className="lm-list-bar">
        <div className="lm-chips" role="group" aria-label={lt('filter')}>
          {[{ key: 'all', label: allLabel }, ...chips].map((c) => (
            <button key={c.key} type="button" className={`lm-chip${chip === c.key ? ' on' : ''}`} aria-pressed={chip === c.key} onClick={() => choose(c.key)} data-testid={`${testId}-chip-${c.key}`}>
              {c.label}
              <i>{counts[c.key] ?? 0}</i>
            </button>
          ))}
        </div>
        <label className="lm-search">
          <ShellIcon name="search" size={16} />
          <span className="lm-vh">{searchLabel}</span>
          <input
            type="search"
            value={query}
            placeholder={searchLabel}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(pageStep);
            }}
            data-testid={`${testId}-search`}
          />
        </label>
      </div>

      {visible.length ? (
        <div className="lm-card lm-rows">
          <div className="lm-lr lm-lr-h">
            <label className="lm-cb">
              <input type="checkbox" checked={allOn} onChange={pickAll} aria-label={lt('pickAll')} />
              <span aria-hidden="true">
                <ShellIcon name="check" size={13} />
              </span>
            </label>
            <div className="lm-lr-c">{head}</div>
          </div>
          {visible.map((r) => (
            <div key={r.id} className={`lm-lr${picked.has(r.id) ? ' on' : ''}`} onClick={(ev) => !fromControl(ev) && openRow(r)} data-testid={`${testId}-row`}>
              <label className="lm-cb">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={lt('pick', { what: r.detailTitle ?? r.id })} />
                <span aria-hidden="true">
                  <ShellIcon name="check" size={13} />
                </span>
              </label>
              <div className="lm-lr-c">{r.cells}</div>
              {r.detail ? (
                <button type="button" className="lm-lr-go" aria-label={lt('openWhat', { what: r.detailTitle ?? r.id })} onClick={() => setOpen(r)}>
                  <ShellIcon name="cr" size={16} />
                </button>
              ) : r.href ? (
                <Link className="lm-lr-go" href={r.href} aria-label={lt('openWhat', { what: r.detailTitle ?? r.id })}>
                  <ShellIcon name="cr" size={16} />
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState tone="calm" icon="search" title={empty.title} text={empty.text} testId={`${testId}-empty`} />
      )}

      {more ? (
        <button type="button" className="lm-btn lm-more" onClick={() => setShown(shown + pageStep)} data-testid={`${testId}-more`}>
          {lt('showMore', { n: more })}
        </button>
      ) : null}

      {ids.length ? (
        <div className="lm-bulk" role="region" aria-label={lt('bulk')} data-testid={`${testId}-bulk`}>
          <b>{lt('picked', { n: ids.length })}</b>
          {bulk.map((a) => {
            const m = actMode(a);
            if (m.mode === 'run')
              return (
                <button key={a.label} type="button" className="lm-btn sm pri" onClick={() => runBulk(a)} disabled={busy}>
                  {a.label}
                </button>
              );
            if (m.mode === 'open')
              return (
                <Link key={a.label} className="lm-btn sm" href={hrefWithIds(m.href, ids)}>
                  {a.label}
                </Link>
              );
            return null;
          })}
          <button type="button" className="lm-btn sm gh" onClick={() => setPicked(new Set())}>
            {lt('clear')}
          </button>
        </div>
      ) : null}

      {open ? (
        <Drawer title={open.detailTitle ?? open.id} sub={open.detailSub} closeLabel={lt('close')} onClose={closeDrawer} testId={`${testId}-drawer`} foot={open.href ? <Link className="lm-btn" href={open.href}>{lt('openPage')}</Link> : undefined}>
          {open.detail}
        </Drawer>
      ) : null}
    </section>
  );
}
