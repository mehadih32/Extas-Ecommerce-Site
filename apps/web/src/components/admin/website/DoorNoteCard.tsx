'use client';
// S02 · PR 80 follow-up 679 — Website › Eye-toggles › "Door note words": the owner's own words for checkout's door note
// (English and Bengali, each at most `max` letters). The door note speaks about refusing at the door (a Cash on
// Delivery promise), so the shop never ships words for it: empty as shipped, and with no words nothing is drawn even
// while the switch is on. Save writes only the words (PUT …/eye-toggles/door-note, audited); the one toast says so.
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface DoorNoteTexts {
  title: string;
  text: string;
  en: string;
  bn: string;
  count: string;
  save: string;
  saving: string;
  saved: string;
  empty: string;
  err: Record<string, string>;
}

export function DoorNoteCard(props: { api: string; initial: { en: string; bn: string }; max: number; canEdit: boolean; texts: DoorNoteTexts }) {
  const x = props.texts;
  const [base, setBase] = useState(props.initial);
  const [v, setV] = useState(props.initial);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string | null>(null);
  const changed = v.en !== base.en || v.bn !== base.bn;
  const none = !base.en.trim() && !base.bn.trim();

  async function save() {
    setBusy(true);
    const a = await call('PUT', props.api, v);
    setBusy(false);
    if (a.status === 200) {
      const text = (a.data as { text?: { en: string; bn: string } }).text ?? v;
      setBase(text);
      setV(text);
      setBad(null);
      return showToast({ text: x.saved, tone: 'ok' });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    setBad(x.err[code] ?? x.err.other ?? code);
  }

  const field = (lang: 'en' | 'bn') => (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={`ey-door-${lang}`}>
        {x[lang]}
      </label>
      <textarea
        id={`ey-door-${lang}`}
        className="a2-ta"
        rows={2}
        lang={lang}
        maxLength={props.max}
        value={v[lang]}
        disabled={!props.canEdit || busy}
        onChange={(e) => setV({ ...v, [lang]: e.target.value })}
        aria-describedby={`ey-door-${lang}-n`}
        data-testid={`ey-door-${lang}`}
      />
      <span className="a2-xs a2-mute" id={`ey-door-${lang}-n`}>
        {x.count.replace('{n}', String([...v[lang]].length)).replace('{max}', String(props.max))}
      </span>
    </div>
  );

  return (
    <section className="a2-sc a2-mt12" aria-labelledby="ey-door-h" data-testid="ey-door">
      <h3 className="a2-h3" id="ey-door-h">
        {x.title}
      </h3>
      <p className="a2-sm a2-mute eyb-mt6">{x.text}</p>
      {none ? (
        <p className="a2-xs a2-mute eyb-mt6" data-testid="ey-door-empty">
          {x.empty}
        </p>
      ) : null}
      <div className="eyb-door a2-mt12">
        {field('en')}
        {field('bn')}
      </div>
      {props.canEdit ? (
        <div className="eyb-doorbar a2-mt12">
          {bad ? (
            <span className="a2-sm" role="alert" data-testid="ey-door-bad">
              {bad}
            </span>
          ) : null}
          <button type="button" className="a2-btn pri" disabled={busy || !changed} onClick={save} data-testid="ey-door-save">
            {busy ? x.saving : x.save}
          </button>
        </div>
      ) : null}
    </section>
  );
}
