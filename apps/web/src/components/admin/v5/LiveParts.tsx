'use client';
// S28 · PR 694 — Inbox › Comments › Live selling: starting a live (title, Page, product codes), ending it, "Make draft" /
// "Make all" / "Skip" on the caught comments, and adding a practice comment by hand. Every call is one request; refusals
// are words from `w5a.err.*`. A draft is the piece in the person's chat bag: nothing here makes an order.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { errWords, Msg } from './Parts';
import { t, type Dict } from '@/lib/i18n';

const API = '/api/admin/support/live';

export function StartLive({ dict, products }: { dict: Dict; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const c = (k: string) => t(dict, `w5a.live.${k}`);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'messenger' | 'instagram'>('messenger');
  const [rows, setRows] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    setBusy(true);
    const codes = rows.map((p, i) => ({ code: `P${i + 1}`, productId: p })).filter((x) => x.productId);
    const a = await call('POST', `${API}/start`, { title, channelKind: kind, codes });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    router.refresh();
  }
  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="live-start">
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fTitle')}</span>
        <input className="a2-inp" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} data-testid="live-title" />
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fChannel')}</span>
        <select className="a2-inp" value={kind} onChange={(e) => setKind(e.target.value as 'messenger' | 'instagram')} style={{ maxWidth: 220 }} data-testid="live-channel">
          <option value="messenger">{c('chFacebook')}</option>
          <option value="instagram">{c('chInstagram')}</option>
        </select>
      </label>
      <div className="a2-stack" style={{ gap: 6 }}>
        <span className="a2-sm">{c('fCodes')}</span>
        {rows.map((p, i) => (
          <span key={i} className="a2-gap8" style={{ alignItems: 'center' }}>
            <b className="a2-mono">P{i + 1}</b>
            <select className="a2-inp" aria-label={c('fProduct')} value={p} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? e.target.value : x)))} style={{ maxWidth: 360 }} data-testid="live-product">
              <option value="">{c('fProduct')}…</option>
              {products.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </span>
        ))}
        <span>
          <button type="button" className="a2-btn sm" onClick={() => setRows((r) => [...r, ''])} disabled={rows.length >= 30}>
            {c('addCode')}
          </button>
        </span>
      </div>
      <div className="a2-gap8" style={{ alignItems: 'center' }}>
        <button type="button" className="a2-btn pri sm" disabled={busy} onClick={go} data-testid="live-go">
          {c('go')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

export function EndLive({ dict }: { dict: Dict }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button
        type="button"
        className="a2-btn sm"
        data-testid="live-end"
        onClick={async () => {
          if (!window.confirm(t(dict, 'w5a.live.endConfirm'))) return;
          const a = await call('POST', `${API}/end`, {});
          if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
          router.refresh();
        }}
      >
        {t(dict, 'w5a.live.end')}
      </button>
      <Msg m={msg} />
    </span>
  );
}

/** One caught comment's buttons, or "Make all" (no `captureId`). */
export function MakeDraft({ dict, captureId, all, count, canMake }: { dict: Dict; captureId?: string; all?: boolean; count?: number; canMake: boolean }) {
  const router = useRouter();
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `w5a.live.${k}`, v);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(kind: 'make' | 'skip') {
    setBusy(true);
    const a = await call('POST', `${API}/${kind}`, all ? { all: true } : { captureId });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    const results = (a.data.results as { ok: boolean; code: string | null }[] | undefined) ?? [];
    const bad = results.find((r) => !r.ok);
    if (bad) setMsg({ ok: false, text: c(`res_${bad.code}`) });
    else if (all) setMsg({ ok: true, text: results.length ? c('madeOk', { n: results.length }) : c('madeNone') });
    router.refresh();
  }
  return (
    <div className="a2-stack" style={{ gap: 4, alignItems: 'flex-end' }}>
      <span className="a2-gap8">
        {canMake ? (
          <button type="button" className={`a2-btn sm${all ? ' pri' : ''}`} disabled={busy || (all && !count)} onClick={() => run('make')} data-testid={all ? 'live-make-all' : 'live-make'}>
            {all ? c('makeAll', { n: count ?? 0 }) : c('makeDraft')}
          </button>
        ) : null}
        {!all ? (
          <button type="button" className="a2-btn sm" disabled={busy} onClick={() => run('skip')} data-testid="live-skip">
            {c('skip')}
          </button>
        ) : null}
      </span>
      <Msg m={msg} />
    </div>
  );
}

export function AddByHand({ dict }: { dict: Dict }) {
  const router = useRouter();
  const c = (k: string) => t(dict, `w5a.live.${k}`);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="a2-stack" style={{ gap: 8 }} data-testid="live-hand">
      <span className="a2-xs a2-mute">{c('handHint')}</span>
      <input className="a2-inp" placeholder={c('fName')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 260 }} />
      <input className="a2-inp" placeholder={c('fText')} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} data-testid="live-hand-text" />
      <span className="a2-gap8" style={{ alignItems: 'center' }}>
        <button
          type="button"
          className="a2-btn sm"
          data-testid="live-hand-add"
          onClick={async () => {
            const a = await call('POST', `${API}/comment`, { ...(name ? { name } : {}), text });
            if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
            setText('');
            setMsg(null);
            router.refresh();
          }}
        >
          {c('add')}
        </button>
        <Msg m={msg} />
      </span>
    </div>
  );
}
