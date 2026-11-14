'use client';
// S28 · PR 713 — AI Center › Training: "Try it" (with "Use as a training example"), reference documents and "Describe a problem". Every call is
// `POST /api/admin/ai/training/extras`; "Try it" never saves or sends anything and the server answers `off` without calling a model while AI is off.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { showToast } from '@/components/admin/lumen/Toast';

const URL_ = '/api/admin/ai/training/extras';
export interface ScopeOpt {
  key: string;
  label: string;
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok && data.ok !== false, data };
  } catch {
    return { ok: false, data: {} };
  }
}

function useSave(failed: string, done: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (body: Record<string, unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    const r = await post(body);
    setBusy(false);
    showToast({ text: r.ok ? done : failed, tone: r.ok ? 'ok' : 'bad' });
    if (r.ok) router.refresh();
    return r.ok;
  };
  return { busy, save };
}

export interface TryTexts {
  agent: string;
  sample: string;
  samplePh: string;
  go: string;
  busy: string;
  off: string;
  unavailable: string;
  answer: string;
  better: string;
  betterPh: string;
  use: string;
  saved: string;
  failed: string;
  nothing: string;
  sampleMax: number;
  answerMax: number;
  locale: 'en' | 'bn';
}

export function TryItBox({ agents, texts: x }: { agents: readonly ScopeOpt[]; texts: TryTexts }) {
  const [agent, setAgent] = useState(agents[0]?.key ?? '');
  const [sample, setSample] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'off' | 'unavailable' | 'ok'>('idle');
  const [answer, setAnswer] = useState('');
  const [better, setBetter] = useState('');
  const { busy, save } = useSave(x.failed, x.saved);
  const run = async () => {
    if (!sample.trim() || state === 'busy') return;
    setState('busy');
    const r = await post({ action: 'tryIt', agent, sample: sample.trim(), locale: x.locale });
    const s = r.data.status;
    if (!r.ok) setState('unavailable');
    else if (s === 'off') setState('off');
    else if (s === 'ok' && typeof r.data.answer === 'string') {
      setAnswer(r.data.answer);
      setBetter(r.data.answer);
      setState('ok');
    } else setState('unavailable');
  };
  return (
    <div className="tr-form" data-testid="training-try">
      <label className="a2-sm" htmlFor="tr-try-agent">
        {x.agent}
      </label>
      <select id="tr-try-agent" className="a2-sel" value={agent} onChange={(e) => setAgent(e.target.value)} data-testid="training-try-agent">
        {agents.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
      <label className="a2-sm" htmlFor="tr-try-sample">
        {x.sample}
      </label>
      <textarea id="tr-try-sample" className="a2-inp" rows={2} maxLength={x.sampleMax} placeholder={x.samplePh} value={sample} onChange={(e) => setSample(e.target.value)} data-testid="training-try-sample" />
      <div>
        <button type="button" className="a2-btn pri" disabled={state === 'busy' || !sample.trim()} onClick={() => void run()} data-testid="training-try-go">
          {state === 'busy' ? x.busy : x.go}
        </button>
      </div>
      {state === 'off' ? (
        <div className="a2-note" role="note" data-testid="training-try-off">
          <span>{x.off}</span>
        </div>
      ) : null}
      {state === 'unavailable' ? (
        <div className="a2-note" role="note" data-testid="training-try-unavailable">
          <span>{x.unavailable}</span>
        </div>
      ) : null}
      {state === 'ok' ? (
        <div className="tr-answer" data-testid="training-try-answer">
          <b className="a2-sm">{x.answer}</b>
          <p className="tr-pre">{answer}</p>
          <label className="a2-sm" htmlFor="tr-try-better">
            {x.better}
          </label>
          <textarea id="tr-try-better" className="a2-inp" rows={3} maxLength={x.answerMax} placeholder={x.betterPh} value={better} onChange={(e) => setBetter(e.target.value)} data-testid="training-try-better" />
          <div>
            <button
              type="button"
              className="a2-btn"
              disabled={busy || !better.trim()}
              onClick={() => (better.trim() ? void save({ action: 'saveExample', agent, sample: sample.trim(), better: better.trim() }) : undefined)}
              data-testid="training-try-use"
            >
              {x.use}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DocAddForm({ scopes, texts: x }: { scopes: readonly ScopeOpt[]; texts: { agent: string; title: string; titlePh: string; text: string; textPh: string; add: string; done: string; failed: string; titleMax: number; textMax: number } }) {
  const { busy, save } = useSave(x.failed, x.done);
  const [agent, setAgent] = useState(scopes[0]?.key ?? 'all');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const go = async () => {
    if (title.trim() && text.trim() && (await save({ action: 'addDoc', agent, title: title.trim(), text: text.trim() }))) {
      setTitle('');
      setText('');
    }
  };
  return (
    <div className="tr-form" data-testid="training-doc-add">
      <label className="a2-sm" htmlFor="tr-doc-agent">
        {x.agent}
      </label>
      <select id="tr-doc-agent" className="a2-sel" value={agent} disabled={busy} onChange={(e) => setAgent(e.target.value)} data-testid="training-doc-agent">
        {scopes.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <label className="a2-sm" htmlFor="tr-doc-title">
        {x.title}
      </label>
      <input id="tr-doc-title" className="a2-inp" maxLength={x.titleMax} placeholder={x.titlePh} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} data-testid="training-doc-title" />
      <label className="a2-sm" htmlFor="tr-doc-text">
        {x.text}
      </label>
      <textarea id="tr-doc-text" className="a2-inp" rows={4} maxLength={x.textMax} placeholder={x.textPh} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} data-testid="training-doc-text" />
      <div>
        <button type="button" className="a2-btn pri" disabled={busy || !title.trim() || !text.trim()} onClick={() => void go()} data-testid="training-doc-go">
          {x.add}
        </button>
      </div>
    </div>
  );
}

export function DocRow({ id, title, text, meta, texts: x }: { id: string; title: string; text: string; meta: string; texts: { edit: string; save: string; cancel: string; remove: string; label: string; done: string; removed: string; failed: string; textMax: number } }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(text);
  const upd = useSave(x.failed, x.done);
  const del = useSave(x.failed, x.removed);
  const busy = upd.busy || del.busy;
  return (
    <div className="tr-row tr-doc" data-testid="training-doc">
      <span>
        <b>{title}</b> <span className="a2-xs a2-mute">{meta}</span>
        {open ? (
          <textarea className="a2-inp a2-mt6" rows={4} maxLength={x.textMax} aria-label={`${x.label}: ${title}`} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} data-testid="training-doc-edit-text" />
        ) : (
          <span className="a2-sm a2-blk tr-pre">{text}</span>
        )}
      </span>
      <span className="tr-acts">
        {open ? (
          <>
            <button
              type="button"
              className="a2-btn sm pri"
              disabled={busy || !draft.trim() || draft.trim() === text}
              onClick={async () => {
                if (await upd.save({ action: 'editDoc', id, text: draft.trim() })) setOpen(false);
              }}
              data-testid="training-doc-save"
            >
              {x.save}
            </button>
            <button
              type="button"
              className="a2-btn sm ghost"
              disabled={busy}
              onClick={() => {
                setDraft(text);
                setOpen(false);
              }}
            >
              {x.cancel}
            </button>
          </>
        ) : (
          <button type="button" className="a2-btn sm" disabled={busy} aria-label={`${x.edit}: ${title}`} onClick={() => setOpen(true)} data-testid="training-doc-edit">
            {x.edit}
          </button>
        )}
        <button type="button" className="a2-btn sm ghost" disabled={busy} aria-label={`${x.remove}: ${title}`} onClick={() => void del.save({ action: 'removeDoc', id })} data-testid="training-doc-remove">
          {x.remove}
        </button>
      </span>
    </div>
  );
}

export function NoteForm({ scopes, texts: x }: { scopes: readonly ScopeOpt[]; texts: { agent: string; text: string; placeholder: string; add: string; done: string; failed: string; max: number } }) {
  const { busy, save } = useSave(x.failed, x.done);
  const [agent, setAgent] = useState(scopes[0]?.key ?? 'all');
  const [text, setText] = useState('');
  const go = async () => {
    if (text.trim() && (await save({ action: 'addNote', agent, text: text.trim() }))) setText('');
  };
  return (
    <div className="tr-form" data-testid="training-note-add">
      <label className="a2-sm" htmlFor="tr-note-agent">
        {x.agent}
      </label>
      <select id="tr-note-agent" className="a2-sel" value={agent} disabled={busy} onChange={(e) => setAgent(e.target.value)} data-testid="training-note-agent">
        {scopes.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <label className="a2-sm" htmlFor="tr-note-text">
        {x.text}
      </label>
      <textarea id="tr-note-text" className="a2-inp" rows={3} maxLength={x.max} placeholder={x.placeholder} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} data-testid="training-note-text" />
      <div>
        <button type="button" className="a2-btn pri" disabled={busy || !text.trim()} onClick={() => void go()} data-testid="training-note-go">
          {x.add}
        </button>
      </div>
    </div>
  );
}
