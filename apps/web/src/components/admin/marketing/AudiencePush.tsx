'use client';
// S13 · PR 263 (Blueprint C6.2 points 3 and 5) — one audience's "Send to ad platforms" card: where it was sent before
// (one line per ad account: its state, how many people, when, whether a lookalike was made, the platform's refusal in
// words) and "Send now", which asks once more and then sends the audience (hashed) to Meta, TikTok and Google. While
// the sending switch is off the button is locked and the card says where to turn it on. Each platform's answer is
// listed after a send; a practice send (no key or no ad account yet) says so. No budget or campaign is changed.
// PR 264: the exclusion list's card says it is sent marked as a list to leave out; it is locked while either switch is off.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';

export interface PushSyncLine {
  key: string;
  platform: string;
  account: string;
  status: string;
  line: string;
  error: string | null;
}
interface Result {
  platform: string;
  account: { id: string; name: string } | null;
  status: string;
  sent: number;
  lookalike: string | null;
  error: string | null;
}

const API = '/api/admin/marketing/audiences';

export function AudiencePush(p: { words: Dict; audienceId: string; version: string; on: boolean; canWrite: boolean; archived: boolean; lookalike: boolean; exclusion?: boolean; syncs: PushSyncLine[]; settingsHref: string }) {
  const id = useId();
  const router = useRouter();
  const a = (k: string, vars?: Record<string, string | number>) => t(p.words, `au.push.${k}`, vars);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const can = p.canWrite && p.on && !p.archived;

  async function send() {
    if (!ask) return setAsk(true);
    setAsk(false);
    setBusy(true);
    setSaid(null);
    const r = await call('POST', `${API}/${p.audienceId}/push`, { version: p.version });
    setBusy(false);
    if (r.status === 200) {
      setResults(r.data.results as Result[]);
      setSaid({ text: a('done'), bad: false });
      return router.refresh();
    }
    const code = r.status === 0 ? 'network' : r.status === 401 ? 'unauthorized' : r.status === 403 ? 'forbidden' : (r.data.error ?? 'other');
    const txt = a(`err.${code}`);
    setSaid({ text: txt === `au.push.err.${code}` ? a('err.other') : txt, bad: true });
    if (code === 'STALE') router.refresh();
  }

  return (
    <section className="a2-card a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="au-push">
      <h2 className="a2-h3" id={`${id}-h`}>
        {a('title')}
      </h2>
      <p className="a2-cs">{a(p.exclusion ? 'subExcl' : p.lookalike ? 'subLal' : 'sub')}</p>
      {!p.on ? (
        <div className="a2-mt12" data-testid="au-push-off">
          <p className="a2-sm bk-warn">{a('off')}</p>
          <a className="a2-btn au-push-go" href={p.settingsHref}>
            {a('offLink')}
          </a>
        </div>
      ) : null}
      {p.syncs.length ? (
        <ul className="au-sample a2-mt12" data-testid="au-push-syncs">
          {p.syncs.map((x) => (
            <li key={x.key}>
              <span>
                <b>{a(`platform.${x.platform}`)}</b> · {x.account}
                {x.error ? <span className="a2-xs bk-warn au-push-err">{x.error}</span> : null}
              </span>
              <span className="a2-xs a2-mute">{x.line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-sm a2-mute a2-mt12">{a('never')}</p>
      )}
      {results ? (
        <ul className="au-sample a2-mt12" data-testid="au-push-results" aria-live="polite">
          {results.map((x, i) => (
            <li key={`${x.platform}-${x.account?.id ?? i}`}>
              <span>
                <b>{a(`platform.${x.platform}`)}</b> · {x.account?.name ?? a('noAccount')}
                {x.error ? <span className="a2-xs bk-warn au-push-err">{x.error}</span> : null}
              </span>
              <span className="a2-xs a2-mute">
                {a(`status.${x.status}`, { n: x.sent })}
                {x.lookalike ? ` · ${a(`lal.${x.lookalike}`)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {p.canWrite ? (
        <div className="lp-acts a2-mt12">
          <button type="button" className={`a2-btn${ask ? ' pri' : ''}`} disabled={!can || busy} onClick={send} data-testid="au-push-send">
            {busy ? a('sending') : ask ? a('sendAsk') : a('send')}
          </button>
        </div>
      ) : null}
      {said ? (
        <p className={`a2-sm lp-said ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="au-push-said">
          {said.text}
        </p>
      ) : null}
    </section>
  );
}
