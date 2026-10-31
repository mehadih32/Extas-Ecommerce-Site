'use client';
// S18 · PR 382 — CUS-07 erasure requests on Settings › Privacy & data: file one by the customer's mobile number and
// what he asked; the list with Cancel (`customers.privacy`) and, for the owner only, "Erase now" behind a confirm that
// asks for the word shown (the API checks the word, the owner and that no order is on its way). Words come from the
// page (messages/admin-privacy.<lang>.json).
import { useId, useState } from 'react';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';
import { ConfirmDialog } from './ConfirmDialog';

type Words = Record<string, string>;

export interface RequestRow {
  id: string;
  name: string | null;
  phoneEnd: string | null;
  reason: string | null;
  status: string;
  at: string;
}

const API = '/api/admin/privacy';
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export function PrivacyRequests({ w, effects, rows: first, on, canRequest, canErase, locale, timeZone }: { w: Words; effects: string[]; rows: RequestRow[]; on: boolean; canRequest: boolean; canErase: boolean; locale: string; timeZone: string }) {
  const id = useId();
  const [rows, setRows] = useState(first);
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [erasing, setErasing] = useState<RequestRow | null>(null);
  const waiting = rows.some((r) => r.status === 'REQUESTED');
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
  const problem = (a: { status: number; data: { error?: string; details?: string[] } }) => {
    const code = a.status === 0 ? 'network' : a.status === 401 ? 'unauthorized' : a.data.error === 'FORBIDDEN' ? 'forbidden' : (a.data.error ?? 'other');
    return fill(w[`err.${code}`] ?? w['err.other']!, { fields: (a.data.details ?? []).join(', ') });
  };
  const take = (data: Record<string, unknown>) => {
    const view = data.view as { requests?: { id: string; name: string | null; phoneEnd: string | null; reason: string | null; status: string; createdAt: string }[] } | undefined;
    if (view?.requests) setRows(view.requests.map((r) => ({ id: r.id, name: r.name, phoneEnd: r.phoneEnd, reason: r.reason, status: r.status, at: r.createdAt })));
  };
  async function file(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const a = await call('POST', API, { action: 'request', phone, reason });
    setBusy(false);
    if (a.status !== 200) return setSaid({ text: problem(a), bad: true });
    take(a.data);
    setPhone('');
    setReason('');
    setSaid({ text: w['req.filed']!, bad: false });
  }
  async function cancel(r: RequestRow) {
    const a = await call('POST', API, { action: 'cancel', requestId: r.id });
    if (a.status !== 200) return setSaid({ text: problem(a), bad: true });
    take(a.data);
  }
  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="privacy-requests">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {w['req.h']}
          </h2>
          <p className="a2-scd">{w['req.d']}</p>
        </div>
      </div>
      {!on ? (
        <div className="a2-note a2-mt12" data-testid="privacy-requests-off">
          <ShellIcon name="lock" size={15} />
          <span>{w['req.off']}</span>
        </div>
      ) : canRequest ? (
        <form className="a2-fg a2-mt12" onSubmit={(e) => void file(e)}>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-p`}>
              {w['req.phone']}
            </label>
            <input id={`${id}-p`} className="a2-inp" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} required data-testid="privacy-request-phone" />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-r`}>
              {w['req.reason']}
            </label>
            <input id={`${id}-r`} className="a2-inp" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} required data-testid="privacy-request-reason" />
          </div>
          <div>
            <button type="submit" className="a2-btn pri" disabled={busy} data-testid="privacy-request-file">
              {w['req.file']}
            </button>
          </div>
        </form>
      ) : null}
      <p className={`a2-sm a2-mt6${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="privacy-request-status">
        {said?.text ?? ''}
      </p>
      {rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{w['req.when']}</th>
                <th>{w['req.who']}</th>
                <th>{w['req.why']}</th>
                <th>{w['req.state']}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="privacy-request-row">
                  <td className="a2-tdh">{when(r.at)}</td>
                  <td data-l={w['req.who']}>{r.name || r.phoneEnd ? `${r.name ?? ''}${r.phoneEnd ? ` ···${r.phoneEnd}` : ''}` : w['req.erased']}</td>
                  <td data-l={w['req.why']} className="a2-xs">
                    {r.reason ?? ''}
                  </td>
                  <td data-l={w['req.state']}>{w[`req.states.${r.status}`] ?? r.status}</td>
                  <td>
                    {r.status === 'REQUESTED' ? (
                      <span className="a2-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="a2-btn" onClick={() => void cancel(r)} data-testid="privacy-request-cancel">
                          {w['req.cancel']}
                        </button>
                        {canErase && on ? (
                          <button type="button" className="a2-btn badf" onClick={() => setErasing(r)} data-testid="privacy-request-erase">
                            {w['req.erase']}
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt12" data-testid="privacy-requests-none">
          {w['req.none']}
        </p>
      )}
      {waiting && !canErase ? <p className="a2-xs a2-mute a2-mt6">{w['req.ownerOnly']}</p> : null}
      {erasing ? (
        <ConfirmDialog
          testId="privacy-erase-confirm"
          tone="badf"
          texts={{ title: w['req.confirmTitle']!, effects, reason: w['req.confirmLabel']!, cancel: w['req.confirmCancel']!, ok: w['req.confirmOk']!, working: w['req.working']!, close: w['req.close']! }}
          onClose={() => setErasing(null)}
          onConfirm={async (typed) => {
            const a = await call('POST', API, { action: 'erase', requestId: erasing.id, confirm: typed });
            if (a.status !== 200) return problem(a);
            take(a.data);
            setErasing(null);
            setSaid({ text: w['req.done']!, bad: false });
            return null;
          }}
        />
      ) : null}
    </section>
  );
}
