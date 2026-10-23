'use client';
// PR 152 — the order list's bulk bar (demo V12.3 a2List bulk bar): what is ticked, one button per status command the
// person's keys allow with how many orders it would run on, and the skip reasons ("Confirm: 2 Confirmed, 1 customer
// asked to cancel will be skipped"). A button opens the [confirm] dialog: what will happen, the skipped orders, the hold
// reason; then each order runs through the order service in turn with its own key and version, and the dialog lists
// what was not done and why. Nothing here moves money or changes a price, a discount or COD.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useCallback, useId, useRef, useState } from 'react';
import { bulkPlan, runBulk, whyText, type BulkCommand, type BulkResult, type BulkRow, type SkipWhy } from '@/lib/admin-orders/bulk';
import type { FieldOption } from '@/lib/admin-orders/spec';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { Field, useDialogKeys } from './OrderCommands';

export interface BulkBarProps {
  dict: Dict;
  rows: (BulkRow & { href: string })[];
  commands: BulkCommand[];
  holdOptions: FieldOption[];
  onClear(): void;
}

const words = (d: Dict, w: SkipWhy | { failed: string }) => {
  const k = whyText(w);
  return t(d, k.key);
};

function BulkDialog({ dict: d, command: c, rows, holdOptions, onClose }: { dict: Dict; command: BulkCommand; rows: BulkBarProps['rows']; holdOptions: FieldOption[]; onClose(done: boolean): void }) {
  const router = useRouter();
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [p] = useState(() => bulkPlan(c, rows)); // fixed when the dialog opens: the run is what the dialog said
  const [reasonKey, setReason] = useState(holdOptions[0]?.value ?? '');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [phase, setPhase] = useState<'ask' | 'running' | 'done'>('ask');
  const [results, setResults] = useState<BulkResult[]>([]);
  const n = (x: number) => String(x);
  const noteRequired = c === 'hold' && !!holdOptions.find((o) => o.value === reasonKey)?.noteRequired;
  const missing = (c === 'hold' && !reasonKey) || (noteRequired && !note.trim());
  const close = useCallback(() => {
    if (phase === 'running') return; // the run finishes first: every order gets its answer
    onClose(phase === 'done');
  }, [phase, onClose]);
  useDialogKeys(box, close);

  const go = async () => {
    setTried(true);
    if (missing || phase !== 'ask' || !p.run.length) return;
    setPhase('running');
    const fields: Record<string, string> = c === 'hold' ? { reasonKey, note } : c === 'release' ? { note } : {};
    await runBulk(c, p.run, fields, (_, r) => setResults(r));
    setPhase('done');
    router.refresh();
  };

  const effects =
    c === 'confirm'
      ? [t(d, 'orders.eff.to', { st: t(d, 'orders.st.CONFIRMED') }), t(d, 'orders.eff.confirmNext')]
      : c === 'hold'
        ? [t(d, 'orders.eff.to', { st: t(d, 'orders.st.ON_HOLD') }), t(d, 'orders.eff.holdStock')]
        : [t(d, 'orders.bulk.eff.release')];
  effects.push(t(d, 'orders.bulk.eff.each'), t(d, 'orders.bulk.eff.never'));
  const failed = results.filter((r) => !r.ok);
  const href = new Map(rows.map((r) => [r.id, r.href]));
  const reasonField = { name: 'reasonKey', kind: 'select' as const, label: t(d, 'orders.dlg.reason'), options: holdOptions };
  const noteField = { name: 'note', kind: 'textarea' as const, label: t(d, noteRequired ? 'orders.dlg.note' : 'orders.dlg.noteOptional'), maxLength: 2000, placeholder: t(d, 'orders.dlg.notePh') };

  return (
    <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} data-testid={`bulk-dlg-${c}`}>
        <div className="a2-dlgh">
          <div>
            <h2 className="a2-h3" id={`${uid}-t`}>
              {t(d, `orders.bulk.title.${c}`, { n: n(p.run.length) })}
            </h2>
          </div>
          <button type="button" className="a2-icb" onClick={close} aria-label={t(d, 'orders.dlg.close')} disabled={phase === 'running'}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">
          {phase === 'ask' ? (
            <>
              <div className="a2-xs a2-mute a2-b">{t(d, 'orders.dlg.willHappen')}</div>
              <ul className="a2-eff">
                {effects.map((e) => (
                  <li key={e}>
                    <ShellIcon name="check" size={14} />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
              {p.skipped.length ? (
                <div className="a2-note warn" data-testid="bulk-skipped">
                  <ShellIcon name="alert" size={15} />
                  <span>
                    <b>{t(d, 'orders.bulk.skippedHead', { n: n(p.skipped.length) })}</b>
                    {` ${p.skipped.map((s) => `${s.row.number} (${words(d, s.why)})`).join(', ')}`}
                  </span>
                </div>
              ) : null}
              {c !== 'confirm' ? (
                <div className="a2-stack a2-dlgf-fields a2-mt12">
                  {c === 'hold' ? <Field id={`${uid}-r`} f={reasonField} value={reasonKey} set={(v) => setReason(String(v))} missing={tried && !reasonKey} label={reasonField.label} /> : null}
                  <Field id={`${uid}-n`} f={noteField} value={note} set={(v) => setNote(String(v))} missing={tried && noteRequired && !note.trim()} label={noteField.label} />
                </div>
              ) : null}
              {tried && missing ? <div className="a2-note warn">{t(d, 'orders.dlg.required')}</div> : null}
            </>
          ) : (
            <div role="status" aria-live="polite" data-testid="bulk-result">
              {phase === 'running' ? (
                <p className="a2-b">{t(d, 'orders.bulk.running', { done: n(results.length), n: n(p.run.length) })}</p>
              ) : (
                <p className="a2-b">{[t(d, 'orders.bulk.done', { n: n(results.length - failed.length) }), ...(failed.length ? [t(d, 'orders.bulk.notDone', { n: n(failed.length) })] : [])].join(' · ')}</p>
              )}
              {failed.length ? (
                <>
                  <div className="a2-xs a2-mute a2-mt12">{t(d, 'orders.bulk.notDoneHead')}</div>
                  <ul className="a2-eff" data-testid="bulk-failed">
                    {failed.map((r) => (
                      <li key={r.id}>
                        <ShellIcon name="alert" size={14} />
                        <span>
                          <Link className="a2-lnk" href={href.get(r.id) ?? '#'}>
                            {r.number}
                          </Link>
                          {` · ${words(d, { failed: r.code ?? 'other' })}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          )}
        </div>
        <div className="a2-dlgf">
          {phase === 'ask' ? (
            <>
              <button type="button" className="a2-btn" onClick={close}>
                {t(d, 'orders.dlg.cancel')}
              </button>
              <button type="button" className="a2-btn pri" data-ok onClick={go} disabled={!p.run.length}>
                {t(d, `orders.bulk.ok.${c}`, { n: n(p.run.length) })}
              </button>
            </>
          ) : (
            <button type="button" className="a2-btn pri" data-ok onClick={close} disabled={phase === 'running'} aria-busy={phase === 'running' || undefined}>
              {phase === 'running' ? t(d, 'orders.dlg.working') : t(d, 'orders.dlg.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The bar under the table while orders are ticked. */
export function BulkBar({ dict: d, rows, commands, holdOptions, onClear }: BulkBarProps) {
  const [open, setOpen] = useState<BulkCommand | null>(null);
  const plans = commands.map((c) => ({ c, p: bulkPlan(c, rows) })).filter(({ c, p }) => c !== 'release' || p.run.length > 0);
  const skips = plans
    .filter(({ p }) => p.reasons.length)
    .map(({ c, p }) => t(d, 'orders.bulk.skipLine', { cmd: t(d, `orders.bulk.cmd.${c}`), reasons: p.reasons.map((r) => t(d, 'orders.bulk.reasonN', { n: String(r.n), why: words(d, r.why) })).join(', ') }));
  const closeDialog = useCallback(
    (done: boolean) => {
      setOpen(null);
      if (done) onClear();
    },
    [onClear],
  );
  return (
    <div className="a2-bulk" role="region" aria-label={t(d, 'orders.bulk.aria')} data-testid="orders-bulk">
      <b>{t(d, 'orders.bulk.selected', { n: String(rows.length) })}</b>
      {plans.map(({ c, p }) => {
        const label = t(d, `orders.bulk.cmd.${c}`);
        return (
          <button key={c} type="button" className={`a2-btn sm${c === 'confirm' ? ' pri' : ''}`} disabled={!p.run.length} onClick={() => setOpen(c)} data-testid={`bulk-${c}`}>
            {p.skipped.length ? t(d, 'orders.bulk.btnCount', { label, n: String(p.run.length) }) : label}
          </button>
        );
      })}
      <button type="button" className="a2-btn sm ghost a2-bclr" onClick={onClear}>
        {t(d, 'orders.bulk.clear')}
      </button>
      {skips.length ? (
        <div className="a2-bskip" data-testid="bulk-skips">
          <ShellIcon name="alert" size={14} />
          <span>{skips.join(' · ')}</span>
        </div>
      ) : null}
      {open ? createPortal(<BulkDialog dict={d} command={open} rows={rows} holdOptions={holdOptions} onClose={closeDialog} />, document.body) : null}
    </div>
  );
}
