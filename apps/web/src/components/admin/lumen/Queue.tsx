'use client';
// PR 628 (CN-036, LUMEN-SPEC §3 item 2) — the queue (Today's queue, Pickups, Returns, Reviews, Messages, Drafts,
// Payouts): a banner with how many wait and, when allowed, a "do all" button; rows with one clear button each. A
// done row slides away and the one toast offers Undo for `admin.patterns.undoSeconds`.
// Safety (LUMEN-SPEC §5, hard rule 6; lib/admin-lumen/safety.ts): only a reversible shop action (confirm an order,
// assign a courier, change a status, hide, pause …) with both its call and its undo call runs in one tap. Money,
// refunds, payouts marked received, COD, prices, discounts, blocking and deleting only open their own page, where
// the existing confirmation and the owner's written OK stay; "do all" exists only when every row's action is a
// reversible one. The page's API checks permissions and states again; this only asks it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { actMode, doAllAllowed, runCall, type LmAction } from '@/lib/admin-lumen/safety';
import { motionReduced } from '@/lib/admin-look/theme';
import { useLumen } from './context';
import { EmptyState } from './EmptyState';
import { showToast } from './Toast';

export interface QueueRow {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  /** A small thing on the right (an amount, an age). */
  meta?: ReactNode;
  act: LmAction;
  /** The toast's words when done ("Order #1042 confirmed"). */
  done?: string;
}

export interface QueueProps {
  title: string;
  sub?: string;
  rows: readonly QueueRow[];
  /** The "do all" button's words; shown only when every row's action is reversible. */
  doAll?: { label: string; done: string };
  empty: { title: string; text?: string };
  /** Ask the server for fresh rows and badges after a change (default yes). */
  refresh?: boolean;
  testId?: string;
}

/** Slide-out time before a done row leaves the list (the theme layer's --lm-t-in; 0 when motion is reduced). */
const outMs = () => (motionReduced() ? 0 : 320);

export function Queue({ title, sub, rows, doAll, empty, refresh = true, testId = 'lm-queue' }: QueueProps) {
  const { lt } = useLumen();
  const router = useRouter();
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const live = useMemo(() => rows.filter((r) => !gone.has(r.id)), [rows, gone]);
  const modes = useMemo(() => new Map(live.map((r) => [r.id, actMode(r.act)])), [live]);
  const canAll = !!doAll && live.length > 1 && doAllAllowed(live.map((r) => (modes.get(r.id)?.mode === 'run' ? r.act.kind : null)));

  const leave = (ids: string[]) => {
    setOut((s) => new Set([...s, ...ids]));
    window.setTimeout(() => {
      setGone((s) => new Set([...s, ...ids]));
      setOut((s) => new Set([...s].filter((x) => !ids.includes(x))));
    }, outMs());
  };
  const back = (ids: string[]) => setGone((s) => new Set([...s].filter((x) => !ids.includes(x))));
  const after = () => refresh && router.refresh();

  const one = async (r: QueueRow) => {
    const m = modes.get(r.id);
    if (!m || m.mode !== 'run' || busy) return;
    setBusy(r.id);
    const ok = await runCall(m.call);
    setBusy(null);
    if (!ok) {
      showToast({ text: lt('failed'), tone: 'bad' });
      return;
    }
    leave([r.id]);
    showToast({
      text: r.done ?? lt('done'),
      undo: {
        kind: r.act.kind,
        run: async () => {
          const u = await runCall(m.undo);
          if (u) back([r.id]);
          after();
          return u;
        },
      },
    });
    after();
  };

  const all = async () => {
    if (!canAll || busy || !doAll) return;
    setBusy('*');
    const done: QueueRow[] = [];
    for (const r of live) {
      const m = modes.get(r.id);
      if (m?.mode === 'run' && (await runCall(m.call))) done.push(r);
    }
    setBusy(null);
    if (!done.length) {
      showToast({ text: lt('failed'), tone: 'bad' });
      return;
    }
    leave(done.map((r) => r.id));
    showToast({
      text: done.length < live.length ? lt('someFailed', { n: done.length, of: live.length }) : doAll.done.replace('{n}', String(done.length)),
      undo: {
        kind: live[0]!.act.kind,
        run: async () => {
          const back1: string[] = [];
          for (const r of done) {
            const m = modes.get(r.id);
            if (m?.mode === 'run' && (await runCall(m.undo))) back1.push(r.id);
          }
          back(back1);
          after();
          return back1.length === done.length;
        },
      },
    });
    after();
  };

  return (
    <section className="lm-queue" data-testid={testId} aria-label={title}>
      <div className="lm-ban lm-in">
        <div className="lm-ban-n" aria-hidden="true">
          {live.length}
        </div>
        <div className="lm-ban-t">
          <b>{title}</b>
          <span>{sub ?? lt('waiting', { n: live.length })}</span>
        </div>
        {canAll ? (
          <button type="button" className="lm-btn pri" onClick={all} disabled={!!busy} data-testid={`${testId}-all`}>
            <ShellIcon name="check" size={16} />
            {doAll!.label}
          </button>
        ) : null}
      </div>
      {live.length ? (
        <ul className="lm-qlist lm-card">
          {live.map((r) => {
            const m = modes.get(r.id)!;
            return (
              <li key={r.id} className={`lm-qr${out.has(r.id) ? ' out' : ''}`} data-testid={`${testId}-row`}>
                <div className="lm-qr-t">
                  <b>{r.title}</b>
                  {r.sub ? <small>{r.sub}</small> : null}
                </div>
                {r.meta ? <span className="lm-qr-m">{r.meta}</span> : null}
                {m.mode === 'run' ? (
                  <button type="button" className="lm-btn sm pri" onClick={() => one(r)} disabled={!!busy || out.has(r.id)} aria-busy={busy === r.id}>
                    {r.act.label}
                  </button>
                ) : m.mode === 'open' ? (
                  <Link className="lm-btn sm" href={m.href}>
                    {r.act.label}
                    <ShellIcon name="cr" size={14} />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={empty.title} text={empty.text} testId={`${testId}-empty`} />
      )}
    </section>
  );
}
