'use client';
// PR 1011 (admin prototype v5 m-settings.js `renderMsgs`) — Settings › Customer messages, drawn the prototype's way: the five order steps, each with
// the words the customer gets (the `{...}` places as blue boxes), an SMS switch, a WhatsApp switch and Edit. A switch saves the journey step at
// once (PUT /api/admin/messages/journey, the whole journey with its version); Edit opens the words with the places to insert, a preview on
// the sample order and the letter count, and saves that one text (PUT /api/admin/messages/templates/<id>). Nothing here sends anything to a
// customer: a message goes only when an order reaches its step. Words: messages/admin-customer-messages.<lang>.json.
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { BLOCKING_PROBLEMS, previewTemplate, templateProblems, type SampleSettings } from '@extas/messages/pure';
import { MESSAGE_STEPS, pickRow, pieces, switchesOf, withSwitches, type Chan, type MessageStepId } from '@/lib/admin-customer-messages/pure';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { LmSwitch } from './LmSwitch';
import { SettingsDialog } from './SettingsDialog';
import './customer-messages.css';

export interface MsgRow {
  id: string;
  channel: Chan;
  locale: string;
  body: string;
  subject: string | null;
  version: string;
}
export interface StepData {
  id: MessageStepId;
  step: string;
  cfg: { on: boolean; channel: Chan; fallback: 'NONE' | Chan; template: string } & Record<string, unknown>;
  rows: MsgRow[];
}

const JOURNEY = '/api/admin/messages/journey';
const TEMPLATES = '/api/admin/messages/templates';

export interface CustomerMessagesProps {
  steps: StepData[];
  journey: Record<string, unknown>;
  version: string;
  x: Record<string, string>;
  sample: SampleSettings;
  tokens: readonly string[];
  hasHost: boolean;
  canSwitch: boolean;
  canEdit: boolean;
  lang: 'bn' | 'en';
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? `{${k}}`));

/** SMS parts of a text: one up to 160 letters (70 with a non-Latin letter), then 153 (67) per part, as the shop's own count. */
function smsParts(text: string): number {
  const n = [...text].length;
  const uni = /[^\x00-\x7F]/.test(text);
  return n <= (uni ? 70 : 160) ? 1 : Math.ceil(n / (uni ? 67 : 153));
}

export function CustomerMessages({ steps, journey: j0, version: v0, x, sample, tokens, hasHost, canSwitch, canEdit, lang }: CustomerMessagesProps) {
  const router = useRouter();
  const [journey, setJourney] = useState(j0);
  const [version, setVersion] = useState(v0);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<StepData | null>(null);
  const tok = (k: string) => x[`tok.${k}`] ?? k;

  const cfgOf = (s: StepData) => ({ ...s.cfg, ...((journey[s.step] ?? {}) as object) }) as StepData['cfg'];

  const flip = async (s: StepData, which: 'sms' | 'wa', next: boolean) => {
    if (busy) return;
    const now = switchesOf(cfgOf(s));
    const cfg = withSwitches(cfgOf(s), which === 'sms' ? next : now.sms, which === 'wa' ? next : now.wa);
    setBusy(true);
    const a = await call('PUT', JOURNEY, { journey: { ...journey, [s.step]: cfg }, version });
    setBusy(false);
    if (a.status === 200 && a.data.journey) {
      const screen = a.data.journey as { version: string; config: { journey: Record<string, unknown> } };
      setJourney(screen.config.journey);
      setVersion(screen.version);
      showToast({ text: next ? x.on! : x.off!, tone: 'ok' });
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : a.status === 403 ? 'forbidden' : typeof a.data.error === 'string' ? a.data.error : 'other';
    showToast({ text: x[`err.${code}`] ?? x['err.other']!, tone: 'bad' });
    if (code === 'STALE') router.refresh();
  };

  return (
    <section className="a2-card cm-card" data-testid="cm-list" aria-label={x.title}>
      <div className="cm-list">
        {steps.map((s) => {
          const sw = switchesOf(cfgOf(s));
          const row = pickRow(s.rows, cfgOf(s).channel, lang);
          return (
            <div className="cm-li" key={s.id} data-testid="cm-row" data-step={s.id}>
              <div className="cm-main">
                <b>{x[`step.${s.id}`]}</b>
                <div className="cm-text" lang={row?.locale === 'en' ? 'en' : 'bn'}>
                  {row ? (
                    pieces(row.body).map((p, i) =>
                      p.token ? (
                        <span className="cm-var" key={i}>
                          {tok(p.text)}
                        </span>
                      ) : (
                        <span key={i}>{p.text}</span>
                      ),
                    )
                  ) : (
                    <span className="a2-mute">{x.noText}</span>
                  )}
                </div>
              </div>
              <div className="cm-ctl">
                <label className="cm-sw">
                  <span>{x.sms}</span>
                  <LmSwitch on={sw.sms} label={`${x[`step.${s.id}`]}: ${x.sms}`} onFlip={(n) => void flip(s, 'sms', n)} disabled={!canSwitch || busy} testId={`cm-sms-${s.id}`} />
                </label>
                <label className="cm-sw">
                  <span>{x.wa}</span>
                  <LmSwitch on={sw.wa} label={`${x[`step.${s.id}`]}: ${x.wa}`} onFlip={(n) => void flip(s, 'wa', n)} disabled={!canSwitch || busy} testId={`cm-wa-${s.id}`} />
                </label>
                <button type="button" className="a2-btn sm" onClick={() => setEdit(s)} disabled={!canEdit || !s.rows.length} data-testid={`cm-edit-${s.id}`}>
                  {x.edit}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {edit ? <EditDialog s={edit} lang={lang} x={x} sample={sample} tokens={tokens} hasHost={hasHost} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), router.refresh())} /> : null}
    </section>
  );
}

function EditDialog({ s, lang, x, sample, tokens, hasHost, onClose, onSaved }: { s: StepData; lang: 'bn' | 'en'; x: Record<string, string>; sample: SampleSettings; tokens: readonly string[]; hasHost: boolean; onClose(): void; onSaved(): void }) {
  const first = pickRow(s.rows, s.cfg.channel, lang)!;
  const [rowId, setRowId] = useState(first.id);
  const row = s.rows.find((r) => r.id === rowId) ?? first;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const body = drafts[row.id] ?? row.body;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const words = { channel: row.channel, locale: row.locale, body, subject: row.subject };
  const problems = useMemo(() => templateProblems(words, hasHost), [row.channel, row.locale, body, row.subject, hasHost]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocking = problems.filter((p) => BLOCKING_PROBLEMS.has(p));
  const previews = useMemo(() => previewTemplate(words, sample), [row.channel, row.locale, body, row.subject, sample]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = previews.find((p) => p.ok) ?? previews[0];
  const text = shown && shown.ok ? shown.text : '';
  const insert = (k: string) => {
    const el = document.getElementById('cm-ta') as HTMLTextAreaElement | null;
    const at = el?.selectionStart ?? body.length;
    setDrafts({ ...drafts, [row.id]: `${body.slice(0, at)}{${k}}${body.slice(at)}` });
    el?.focus();
  };
  const save = async () => {
    if (!body.trim()) return setProblem(x.empty!);
    if (blocking.length) return setProblem(x[`problem.${blocking[0]}`] ?? x['err.INVALID_INPUT']!);
    setBusy(true);
    const a = await call('PUT', `${TEMPLATES}/${row.id}`, { version: row.version, body: body.trim(), ...(row.channel === 'EMAIL' ? { subject: row.subject ?? '' } : {}) });
    setBusy(false);
    if (a.status === 200) {
      showToast({ text: x.saved!, tone: 'ok' });
      onSaved();
      return;
    }
    const code = a.status === 0 ? 'network' : a.status === 403 ? 'forbidden' : typeof a.data.error === 'string' ? a.data.error : 'other';
    setProblem(x[`err.${code}`] ?? x['err.other']!);
  };
  const label = (r: MsgRow) => `${x[`ch.${r.channel}`] ?? r.channel} · ${r.locale === 'en' ? x.en : x.bn}`;
  return (
    <SettingsDialog title={x[`step.${s.id}`]!} close={x.close!} cancel={x.cancel!} ok={x.save!} busy={busy} testId="cm-edit-dlg" onClose={onClose} onOk={() => void save()}>
      {s.rows.length > 1 ? (
        <div className="a2-fld cm-which">
          <label className="a2-lbl" htmlFor="cm-which">
            {`${x.channel} · ${x.language}`}
          </label>
          <select id="cm-which" className="a2-sel" value={row.id} onChange={(e) => (setRowId(e.target.value), setProblem(null))} data-testid="cm-which">
            {s.rows.map((r) => (
              <option key={r.id} value={r.id}>
                {label(r)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <textarea id="cm-ta" className="a2-ta tall" rows={4} value={body} lang={row.locale === 'en' ? 'en' : 'bn'} onChange={(e) => (setDrafts({ ...drafts, [row.id]: e.target.value }), setProblem(null))} data-testid="cm-ta" />
      <div className="cm-ins">
        <span className="a2-xs a2-mute">{x.insert}</span>
        {tokens.map((k) => (
          <button type="button" className="cm-chip" key={k} onClick={() => insert(k)} data-testid={`cm-ins-${k}`}>
            {x[`tok.${k}`] ?? k}
          </button>
        ))}
      </div>
      <div className="a2-lbl a2-mt12">{x.preview}</div>
      <div className="cm-prev" data-testid="cm-preview" lang={row.locale === 'en' ? 'en' : 'bn'}>
        {shown && !shown.ok ? fill(x.skipped!, { why: x[`reason.${shown.reason}`] ?? shown.reason }) : text}
      </div>
      <div className="a2-xs a2-mute" data-testid="cm-count">
        {fill(x.count!, { n: [...text].length, parts: smsParts(text) })}
      </div>
      {problems.filter((p) => !BLOCKING_PROBLEMS.has(p)).length || blocking.length ? (
        <ul className="cm-problems">
          {problems.map((p) => (
            <li key={p} className={BLOCKING_PROBLEMS.has(p) ? 'bad' : 'warn'}>
              {x[`problem.${p}`] ?? p}
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <div className="a2-note bad" role="alert">
          <span>{problem}</span>
        </div>
      ) : null}
    </SettingsDialog>
  );
}

export { MESSAGE_STEPS };
