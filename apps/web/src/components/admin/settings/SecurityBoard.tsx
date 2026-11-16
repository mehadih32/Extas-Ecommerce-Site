'use client';
// PR 815 (prototype v5 Settings › Security) — the page as the prototype draws it: three cards (the 2-step switch, failed sign-ins in 24 h,
// open sessions), the sign-in history table with a Block button on a wrong password, "Signed in now" with Sign out, and "Blocked addresses"
// with Unblock and the plain hint. Everything goes to POST /api/admin/security/board (lib/admin-security/board.ts); a block and turning
// 2-step off ask for the owner's PIN in the same dialog the rest of Settings uses.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BoardView } from '@/lib/admin-security/board';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { dateTime } from '../stock/text';
import { ConfirmDialog } from './ConfirmDialog';
import { LmSwitch } from './LmSwitch';

const API = '/api/admin/security/board';
type Ask = { kind: 'twoOff' } | { kind: 'block'; ip: string } | { kind: 'unblock'; ip: string };

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

export function SecurityBoard({ view, w, locale, timeZone }: { view: BoardView; w: Record<string, string>; locale: string; timeZone: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const err = (code: unknown) => w[`board.boardErr.${String(code)}`] ?? w['board.boardErr.other']!;
  const when = (iso: string) => dateTime(iso, locale, timeZone);

  async function act(body: Record<string, unknown>, ok: string) {
    const a = await call('POST', API, body);
    if (!a.data.ok) return a.status === 0 ? err('network') : err(a.data.error);
    showToast({ text: ok, tone: 'ok' });
    router.refresh();
    return null;
  }

  const readOnly = !view.canEdit;
  const dlg = (kind: Ask['kind']) => ({
    cancel: w['board.dlg.cancel']!,
    working: w['board.dlg.working']!,
    close: w['board.dlg.close']!,
    reason: null,
    ...(kind === 'unblock' ? {} : { pin: w['board.dlg.pin']! }),
  });

  return (
    <>
      <div className="s28-grid s28-g3" data-testid="security-board">
        <section className="a2-card" data-testid="security-2fa-card">
          <div className="s28-row between" style={{ flexWrap: 'nowrap' }}>
            <div className="s28-grow">
              <b>{w['board.twoFa']}</b>
              <div className="a2-xs a2-mute">{w['board.twoFaSub']}</div>
            </div>
            <LmSwitch
              testId="security-2fa-switch"
              on={view.twoFactorRequired}
              label={w['board.twoFa']!}
              disabled={readOnly}
              onFlip={async (next) => {
                if (next) {
                  const p = await act({ action: 'twoFactor', on: true }, w['board.toast.twoOn']!);
                  if (p) showToast({ text: p, tone: 'bad' });
                } else setAsk({ kind: 'twoOff' });
              }}
            />
          </div>
        </section>
        <section className="a2-card a2-kpi" data-testid="security-failed">
          <div className="a2-kl">{w['board.failed']}</div>
          <div className="a2-kv">{view.failed24}</div>
          {view.failed24 ? <div className="a2-xs a2-mute">{fill(w['board.failedSub']!, { n: view.failedAddresses })}</div> : null}
        </section>
        <section className="a2-card a2-kpi" data-testid="security-open-sessions">
          <div className="a2-kl">{w['board.sessions']}</div>
          <div className="a2-kv">{view.sessions.length}</div>
        </section>
      </div>

      <div className="s28-grid s28-g2 a2-mt12">
        <section className="a2-card" data-testid="security-history" aria-labelledby="sec-hist-h">
          <h2 className="a2-h3" id="sec-hist-h">{w['board.history.h']}</h2>
          {view.history.length ? (
            <div className="s28-tw">
              <table className="s28-tbl">
                <thead>
                  <tr>
                    <th>{w['board.history.who']}</th>
                    <th>{w['board.history.where']}</th>
                    <th>{w['board.history.when']}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {view.history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <b>{h.who ?? w['board.history.unknown']}</b>
                        <div className="a2-xs a2-mute">{h.device}</div>
                      </td>
                      <td className="a2-xs">{h.ip ?? '—'}</td>
                      <td className="a2-xs">{when(h.at)}</td>
                      <td className="r">
                        {h.ok ? (
                          <span className="s28-good">{w['board.history.ok']}</span>
                        ) : (
                          <>
                            <span className="s28-bad">{w['board.history.wrong']}</span>
                            {h.ip && !h.blocked && view.isOwner && view.canEdit && h.ip !== view.yourIp ? (
                              <button type="button" className="a2-btn sm" style={{ marginLeft: 6 }} onClick={() => setAsk({ kind: 'block', ip: h.ip! })}>
                                {w['board.history.block']}
                              </button>
                            ) : h.blocked ? (
                              <span className="a2-xs a2-mute"> {w['board.history.blockedTag']}</span>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{w['board.history.none']}</p>
          )}
        </section>

        <div className="a2-stack">
          <section className="a2-card" data-testid="security-now" aria-labelledby="sec-now-h">
            <h2 className="a2-h3" id="sec-now-h">{w['board.now.h']}</h2>
            <ul className="s28-list">
              {view.sessions.map((s) => (
                <li key={s.id} className="s28-row between" style={{ alignItems: 'center' }} data-testid="security-session">
                  <div className="s28-grow">
                    <b>{s.who}</b>
                    {s.me ? <span className="a2-pill line" style={{ marginLeft: 6 }}>{w['board.now.thisDevice']}</span> : null}
                    <div className="a2-xs a2-mute">
                      {s.device}
                      {s.ip ? ` · ${s.ip}` : ''} · {w['board.now.since']} {when(s.since)}
                    </div>
                  </div>
                  {!s.me && view.isOwner && view.canEdit ? (
                    <button
                      type="button"
                      className="a2-btn sm"
                      onClick={async () => {
                        const p = await act({ action: 'signOut', sessionId: s.id }, fill(w['board.now.signedOut']!, { who: s.who, device: s.device }));
                        if (p) showToast({ text: p, tone: 'bad' });
                      }}
                    >
                      {w['board.now.signOut']}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="a2-card" data-testid="security-blocked" aria-labelledby="sec-blk-h">
            <h2 className="a2-h3" id="sec-blk-h">{w['board.blocked.h']}</h2>
            {view.blocked.length || view.waiting.length ? (
              <ul className="s28-list">
                {view.blocked.map((b) => (
                  <li key={b.ip} className="s28-row between" style={{ alignItems: 'center' }} data-testid="security-blocked-row">
                    <div className="s28-grow">
                      <code>{b.ip}</code>
                      <div className="a2-xs a2-mute">
                        {b.why} · {when(b.at)}
                      </div>
                    </div>
                    {view.isOwner && view.canEdit ? (
                      <button type="button" className="a2-btn sm" onClick={() => setAsk({ kind: 'unblock', ip: b.ip })}>
                        {w['board.blocked.unblock']}
                      </button>
                    ) : null}
                  </li>
                ))}
                {view.waiting.map((x) => (
                  <li key={`w-${x.ip}`} className="s28-row" data-testid="security-waiting-row">
                    <div className="s28-grow">
                      <code>{x.ip}</code>
                      <div className="a2-xs a2-mute">{fill(w['board.blocked.waiting']!, { time: when(x.until) })}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{w['board.blocked.none']}</p>
            )}
            <p className="a2-xs a2-mute a2-mt12">{fill(w['board.blocked.hint']!, { n: view.maxAttempts, m: view.lockoutMinutes })}</p>
          </section>
        </div>
      </div>

      {ask ? (
        <ConfirmDialog
          testId="security-board-dialog"
          tone={ask.kind === 'unblock' ? 'pri' : 'badf'}
          texts={{
            title: ask.kind === 'twoOff' ? w['board.dlg.twoOffTitle']! : ask.kind === 'block' ? w['board.dlg.blockTitle']! : w['board.dlg.unblockTitle']!,
            effects: [ask.kind === 'twoOff' ? w['board.dlg.twoOffText']! : ask.kind === 'block' ? fill(w['board.dlg.blockText']!, { ip: ask.ip }) : ask.ip],
            ok: ask.kind === 'twoOff' ? w['board.dlg.twoOff']! : ask.kind === 'block' ? w['board.dlg.blockOk']! : w['board.dlg.unblockOk']!,
            ...dlg(ask.kind),
          }}
          onClose={() => setAsk(null)}
          onConfirm={async (_r, pin) => {
            const p =
              ask.kind === 'twoOff'
                ? await act({ action: 'twoFactor', on: false, pin }, w['board.toast.twoOff']!)
                : ask.kind === 'block'
                  ? await act({ action: 'block', ip: ask.ip, pin }, w['board.toast.blocked']!)
                  : await act({ action: 'unblock', ip: ask.ip }, w['board.toast.unblocked']!);
            if (!p) setAsk(null);
            return p;
          }}
        />
      ) : null}
    </>
  );
}
