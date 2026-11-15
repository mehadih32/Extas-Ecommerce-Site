'use client';
// PR 851 (lane E5) — Settings › ERP connection, the parts of prototype v5's page that act: "Sync stock now" and "Import products" in the
// page head, the "Matching" card (ERP warehouse and the ERP accounts shop money lands in) and the "Safety" card with "Change ERP
// connection" (which ERP, then the owner's PIN). Nothing here moves money or touches an order; each call is one request to the
// admin API (`/api/admin/inventory/resync`, `/api/admin/erp-link`) and its refusal is shown in words.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { t, type Dict } from '@/lib/i18n';
import { call, type Answer } from './api';
import { showToast } from './lumen/Toast';
import { useDialogKeys } from './orders/OrderCommands';
import { ConfirmDialog } from './settings/ConfirmDialog';
import { ShellIcon } from './shell/ShellIcon';

const noSubscribe = () => () => {};
const e = (d: Dict, key: string, vars?: Record<string, string | number>) => t(d, `erpLink.${key}`, vars);
const problem = (d: Dict, a: Answer) => {
  const code = a.status === 0 ? 'network' : String(a.data.error ?? 'INVALID_INPUT');
  const key = `erpLink.err.${code}`;
  const text = t(d, key);
  return text === key ? e(d, 'err.INVALID_INPUT') : text;
};

/** The page head's two buttons. Sync runs the shop's stock pull now (needs the stock-sync right); Import goes to the ERP import page. */
export function ErpHeadActions({ dict, storeId, importHref }: { dict: Dict; storeId: number; importHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    const a = await call('POST', `/api/admin/inventory/resync?storeId=${storeId}`, {});
    setBusy(false);
    const st = (a.data.stock ?? null) as { status?: string; reason?: string | null; variantsChanged?: number } | null;
    if (a.status !== 200 || !a.data.ok) showToast({ text: problem(dict, a), tone: 'bad' });
    else if (st?.status === 'skipped') showToast({ text: e(dict, st.reason === 'ERP_ON_PRACTICE' ? 'head.skippedPractice' : 'head.skippedNone') });
    else if (st?.status === 'failed') showToast({ text: e(dict, 'head.failed'), tone: 'bad' });
    else showToast({ text: st?.variantsChanged ? e(dict, 'head.done', { n: st.variantsChanged }) : e(dict, 'head.nothing'), tone: 'ok' });
    router.refresh();
  };
  return (
    <>
      <button type="button" className="a2-btn" onClick={() => void sync()} disabled={busy} aria-busy={busy || undefined} data-testid="erp-stock">
        <ShellIcon name="sync" size={14} />
        {e(dict, busy ? 'head.syncing' : 'head.sync')}
      </button>
      <Link className="a2-btn" href={importHref} data-testid="erp-import">
        <ShellIcon name="dl" size={14} />
        {e(dict, 'head.import')}
      </Link>
    </>
  );
}

export interface MatchingProps {
  dict: Dict;
  storeId: number;
  canWrite: boolean;
  warehouse: string;
  accounts: { cod: string; bkash: string; erpPay: string };
  suggestions: string[];
}

/** The "Matching" card: the ERP warehouse for shop stock and where courier cash, bKash and the payments to the ERP go. */
export function ErpMatching({ dict, storeId, canWrite, warehouse, accounts, suggestions }: MatchingProps) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState({ warehouse, ...accounts });
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const dirty = v.warehouse !== warehouse || v.cod !== accounts.cod || v.bkash !== accounts.bkash || v.erpPay !== accounts.erpPay;
  const save = async () => {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', `/api/admin/erp-link?storeId=${storeId}`, { action: 'saveMatching', warehouse: v.warehouse.trim(), cod: v.cod.trim(), bkash: v.bkash.trim(), erpPay: v.erpPay.trim() });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      showToast({ text: e(dict, 'match.saved'), tone: 'ok' });
      router.refresh();
    } else setSaid(problem(dict, a));
  };
  const field = (k: 'warehouse' | 'cod' | 'bkash' | 'erpPay', label: string, list?: string) => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`${uid}-${k}`}>
        {label}
      </label>
      <input id={`${uid}-${k}`} className="a2-inp" list={list} value={v[k]} maxLength={80} disabled={!canWrite} onChange={(ev) => setV({ ...v, [k]: ev.target.value })} autoComplete="off" data-testid={`erp-match-${k}`} />
    </div>
  );
  return (
    <section className="a2-card" data-testid="erp-matching" aria-labelledby={`${uid}-h`}>
      <h2 className="a2-h4" id={`${uid}-h`}>
        {e(dict, 'match.h')}
      </h2>
      <div className="a2-stack a2-mt6">
        {field('warehouse', e(dict, 'match.wh'))}
        {field('cod', e(dict, 'match.cod'), `${uid}-acc`)}
        {field('bkash', e(dict, 'match.bkash'), `${uid}-acc`)}
        {field('erpPay', e(dict, 'match.pay'), `${uid}-acc`)}
        <datalist id={`${uid}-acc`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="a2-xs a2-mute">{e(dict, 'match.hint')}</p>
        {said ? (
          <p className="a2-xs s28-bad" role="alert">
            {said}
          </p>
        ) : null}
        <div>
          <button type="button" className="a2-btn sm" onClick={() => void save()} disabled={!canWrite || !dirty || busy} aria-busy={busy || undefined} data-testid="erp-match-save">
            {e(dict, busy ? 'match.saving' : 'match.save')}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The first step of "Change ERP connection": which ERP (live or practice). */
function WhichDialog({ dict, now, onClose, onNext }: { dict: Dict; now: 'live' | 'practice' | null; onClose(): void; onNext(mode: 'live' | 'practice'): void }) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'live' | 'practice'>(now ?? 'live');
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  useDialogKeys(box, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className="adm2 a2-z a2-ov mid" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} data-testid="erp-change-which">
        <div className="a2-dlgh">
          <h2 className="a2-h3" id={`${uid}-t`}>
            {e(dict, 'change.h')}
          </h2>
          <button type="button" className="a2-icb" onClick={onClose} aria-label={e(dict, 'change.cancel')}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">
          <div className="a2-note">
            <ShellIcon name="alert" size={15} />
            <span>{e(dict, 'change.note')}</span>
          </div>
          <div className="a2-fld a2-mt12">
            <label className="a2-lbl" htmlFor={`${uid}-m`}>
              {e(dict, 'change.which')}
            </label>
            <select id={`${uid}-m`} className="a2-sel" value={mode} onChange={(ev) => setMode(ev.target.value as 'live' | 'practice')} data-testid="erp-change-mode">
              <option value="live">{e(dict, 'change.live')}</option>
              <option value="practice">{e(dict, 'change.practice')}</option>
            </select>
          </div>
          <p className="a2-xs a2-mute a2-mt6">{e(dict, 'change.address')}</p>
        </div>
        <div className="a2-dlgf">
          <button type="button" className="a2-btn" onClick={onClose}>
            {e(dict, 'change.cancel')}
          </button>
          <button type="button" className="a2-btn pri" data-ok onClick={() => onNext(mode)} data-testid="erp-change-go">
            {e(dict, 'change.go')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The "Safety" card (the three lines and "Change ERP connection"). Only the owner gets the button. */
export function ErpSafety({ dict, storeId, lines, isOwner, mode }: { dict: Dict; storeId: number; lines: string[]; isOwner: boolean; mode: 'live' | 'practice' | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'none' | 'which' | 'pin'>('none');
  const [pick, setPick] = useState<'live' | 'practice'>('live');
  const asked = (m: 'live' | 'practice') => {
    if (m === mode) {
      setStep('none');
      showToast({ text: e(dict, 'change.same') });
      return;
    }
    setPick(m);
    setStep('pin');
  };
  return (
    <section className="a2-card" data-testid="erp-safety">
      <h2 className="a2-h4">{e(dict, 'safeCard.h')}</h2>
      <ul className="a2-stack a2-mt6">
        {lines.map((x, i) => (
          <li key={x} className="a2-sm" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <ShellIcon name={i === lines.length - 1 ? 'alert' : 'check'} size={15} />
            <span>{x}</span>
          </li>
        ))}
      </ul>
      {isOwner ? (
        <div className="a2-mt12">
          <button type="button" className="a2-btn sm" onClick={() => setStep('which')} data-testid="erp-switch">
            {e(dict, 'safeCard.change')}
          </button>
        </div>
      ) : null}
      {step === 'which' ? <WhichDialog dict={dict} now={mode} onClose={() => setStep('none')} onNext={asked} /> : null}
      {step === 'pin' ? (
        <ConfirmDialog
          testId="erp-change-pin"
          tone="pri"
          texts={{ title: e(dict, 'change.askLive'), effects: [e(dict, pick === 'practice' ? 'change.textPractice' : 'change.textLive')], reason: null, cancel: e(dict, 'change.cancel'), ok: e(dict, 'change.switch'), working: e(dict, 'change.working'), close: e(dict, 'change.cancel'), pin: e(dict, 'change.pin') }}
          onClose={() => setStep('none')}
          onConfirm={async (_r, pin) => {
            if (!pin) return e(dict, 'err.PIN_REQUIRED');
            const a = await call('POST', `/api/admin/erp-link?storeId=${storeId}`, { action: 'changeConnection', mode: pick, pin });
            if (a.status !== 200 || !a.data.ok) return problem(dict, a);
            setStep('none');
            showToast({ text: e(dict, pick === 'practice' ? 'change.nowPractice' : 'change.nowLive'), tone: 'ok' });
            router.refresh();
            return null;
          }}
        />
      ) : null}
    </section>
  );
}
