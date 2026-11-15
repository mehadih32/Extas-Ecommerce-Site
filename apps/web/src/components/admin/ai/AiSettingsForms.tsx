'use client';
// PR 819 — the two small forms of the AI Center the prototype has (m-ai.js): "Edit" the text shown while AI is off (English and Bengali),
// and the daily digest card (on/off, time, Telegram, e-mail). Both post to `/api/admin/ai/limits` (`ai.control`, written through the
// settings history, so the toast offers Undo). They only exist for someone who holds `ai.control`; everyone else sees the words.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/limits' };

export interface OffTextTexts {
  edit: string;
  h: string;
  en: string;
  bn: string;
  help: string;
  save: string;
  cancel: string;
  saved: string;
  failed: string;
  max: number;
}

export function OffTextEdit({ current, texts }: { current: { en: string; bn: string }; texts: OffTextTexts }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [en, setEn] = useState(current.en);
  const [bn, setBn] = useState(current.bn);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { offText: { en: en.trim(), bn: bn.trim() } }));
    setBusy(false);
    if (!ok) {
      showToast({ text: texts.failed, tone: 'bad' });
      return;
    }
    setOpen(false);
    router.refresh();
    showToast({
      text: texts.saved,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { offText: { en: current.en, bn: current.bn } }));
          if (u) {
            setEn(current.en);
            setBn(current.bn);
            router.refresh();
          }
          return u;
        },
      },
    });
  };

  return (
    <span className="ai-off-edit" data-testid="ai-off-edit">
      <button type="button" className="a2-btn sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="ai-off-edit-btn">
        {texts.edit}
      </button>
      {open ? (
        <div className="ai-off-form a2-card" role="group" aria-label={texts.h}>
          <label className="ai-fld">
            <span className="a2-xs a2-mute">{texts.en}</span>
            <textarea className="a2-sel" rows={3} maxLength={texts.max} value={en} onChange={(e) => setEn(e.target.value)} data-testid="ai-off-en" />
          </label>
          <label className="ai-fld">
            <span className="a2-xs a2-mute">{texts.bn}</span>
            <textarea className="a2-sel" rows={3} maxLength={texts.max} value={bn} onChange={(e) => setBn(e.target.value)} data-testid="ai-off-bn" />
          </label>
          <p className="a2-xs a2-mute">{texts.help}</p>
          <div className="a2-gap8">
            <button type="button" className="a2-btn sm pri" disabled={busy} onClick={() => void save()} data-testid="ai-off-save">
              {texts.save}
            </button>
            <button type="button" className="a2-btn sm" onClick={() => setOpen(false)}>
              {texts.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

export interface DigestTexts {
  on: string;
  onHelp: string;
  time: string;
  sendTo: string;
  telegram: string;
  email: string;
  save: string;
  saved: string;
  failed: string;
  invalid: string;
}

export function DigestForm({ value, texts }: { value: { on: boolean; time: string; telegram: boolean; email: boolean }; texts: DigestTexts }) {
  const router = useRouter();
  const [saved, setSaved] = useState(value);
  const [on, setOn] = useState(value.on);
  const [time, setTime] = useState(value.time);
  const [telegram, setTelegram] = useState(value.telegram);
  const [email, setEmail] = useState(value.email);
  const [busy, setBusy] = useState(false);
  const dirty = on !== saved.on || time !== saved.time || telegram !== saved.telegram || email !== saved.email;

  const save = async () => {
    if (busy) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      showToast({ text: texts.invalid, tone: 'bad' });
      return;
    }
    const prev = saved;
    const next = { on, time, telegram, email };
    setBusy(true);
    const ok = await runCall(withBody(CALL, { digest: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: texts.failed, tone: 'bad' });
      return;
    }
    setSaved(next);
    router.refresh();
    showToast({
      text: texts.saved,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { digest: prev }));
          if (u) {
            setSaved(prev);
            setOn(prev.on);
            setTime(prev.time);
            setTelegram(prev.telegram);
            setEmail(prev.email);
            router.refresh();
          }
          return u;
        },
      },
    });
  };

  return (
    <div className="ai-dg" data-testid="ai-digest-form">
      <div className="ai-dg-row">
        <div>
          <b>{texts.on}</b>
          <div className="a2-sm a2-mute">{texts.onHelp}</div>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={texts.on} className={`lm-sw${on ? ' on' : ''}`} onClick={() => setOn((v) => !v)} data-testid="ai-digest-on">
          <span aria-hidden="true" />
        </button>
      </div>
      <div className="ai-dg-grid">
        <label className="ai-fld">
          <span className="a2-xs a2-mute">{texts.time}</span>
          <input type="time" className="a2-sel" value={time} onChange={(e) => setTime(e.target.value)} data-testid="ai-digest-time" />
        </label>
        <div className="ai-fld">
          <span className="a2-xs a2-mute">{texts.sendTo}</span>
          <label className="ai-check">
            <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} data-testid="ai-digest-tg" />
            <span>{texts.telegram}</span>
          </label>
          <label className="ai-check">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} data-testid="ai-digest-email" />
            <span>{texts.email}</span>
          </label>
        </div>
      </div>
      {dirty ? (
        <button type="button" className="a2-btn sm pri" disabled={busy} onClick={() => void save()} data-testid="ai-digest-save">
          {texts.save}
        </button>
      ) : null}
    </div>
  );
}
