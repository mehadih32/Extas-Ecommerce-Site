'use client';
// S14 · PR 505 — Messages → Order journey as one form (demo V12.4 #/admin/messages/journey): on the left the order's
// timeline and the event messages, each step with its number, its channel and fallback, when it goes and to which
// orders; on the right the chosen step: its switch, channel, fallback, e-mail, time (at once, some minutes later, or a
// time of day some days after), orders and template, with the languages that template is written in and a link to its
// words. Under "More options": the message language, the amount line and the self-confirm. One Save (asked first) with
// the journey's version; a stale screen is read again and said so. The API checks every value again. A person without
// `messages.journey.write` sees it locked.
import { useId, useState } from 'react';
import type { JourneyConfig, JourneyScreen } from '@extas/messages';
import { AUDIENCES, clock, FALLBACKS, journeyChanges, journeyDraft, LANGUAGES, STEP_CHANNELS, TIMELINE_STEPS, WHEN_KINDS, type JourneyDraft, type StepDraft } from '@/lib/admin-messages/journey-draft';
import { msgError } from '@/lib/admin-messages/i18n';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

const URL = '/api/admin/messages/journey';

export function JourneyForm({ dict, screen, steps, templateKeys }: { dict: Dict; screen: Pick<JourneyScreen, 'config' | 'version' | 'templates' | 'perms'>; steps: readonly string[]; templateKeys: string[] }) {
  const id = useId();
  const [base, setBase] = useState({ config: screen.config, version: screen.version, templates: screen.templates });
  const [draft, setDraft] = useState<JourneyDraft>(() => journeyDraft(screen.config));
  const [sel, setSel] = useState<string>(steps[0] ?? 'placed');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const x = (k: string, v: Record<string, string> = {}) => t(dict, `msg.journey.${k}`, v);
  const canEdit = screen.perms.write;
  const off = !canEdit || busy;
  const { changes, bad } = journeyChanges(draft, base.config);
  const dirty = Object.keys(changes).length > 0 || bad.length > 0;
  const step = draft.steps[sel];
  const edit = (p: Partial<JourneyDraft>) => (setDraft({ ...draft, ...p }), setSaid(null));
  const editStep = (p: Partial<StepDraft>) => edit({ steps: { ...draft.steps, [sel]: { ...draft.steps[sel]!, ...p } } });
  // the languages per template come from the page (every template of the store), not from the save's answer
  const fresh = (s: { config: JourneyConfig; version: string }) => {
    setBase({ config: s.config, version: s.version, templates: base.templates });
    setDraft(journeyDraft(s.config));
  };
  async function save() {
    if (bad.length) return setSaid({ text: x('badHour'), bad: true });
    if (!window.confirm(x('saveAsk'))) return;
    setBusy(true);
    const a = await call('PUT', URL, { ...changes, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data.journey as JourneyScreen);
      return setSaid({ text: t(dict, 'msg.saved'), bad: false });
    }
    const code = a.status === 0 ? 'network' : a.data.error;
    if (code === 'STALE') {
      const g = await call('GET', URL);
      if (g.status === 200) fresh(g.data.journey as JourneyScreen);
    }
    setSaid({ text: msgError(dict, code, (a.data.details ?? []).join(', ')), bad: true });
  }
  const summary = (s: StepDraft) => {
    if (!s.on) return x('summaryOff');
    const ch = t(dict, `msg.channel.${s.channel}`) + (s.fallback !== 'NONE' ? ` → ${t(dict, `msg.channel.${s.fallback}`)}` : '');
    const when = s.kind === 'now' ? x('summaryNow') : s.kind === 'after' ? x('summaryAfter', { n: s.minutes }) : x('summaryAt', { d: s.days, time: /^\d+$/.test(s.hour) && /^\d+$/.test(s.minute) ? clock(Number(s.hour), Number(s.minute)) : '?' });
    return `${ch} · ${when} · ${x(`whoOpt.${s.who}`)}`;
  };
  const row = (k: string, n: number | null) => {
    const s = draft.steps[k];
    if (!s) return null;
    return (
      <button key={k} type="button" className={`a2-js${sel === k ? ' on' : ''}${s.on ? '' : ' off'}`} aria-pressed={sel === k} onClick={() => setSel(k)} data-testid="journey-step" data-step={k} data-on={s.on ? '1' : '0'}>
        <span className="a2-jn">{n ?? <ShellIcon name="zap" size={15} />}</span>
        <span style={{ minWidth: 0 }}>
          <b className="a2-h4 a2-blk">{t(dict, `msg.step.${k}`)}</b>
          <span className="a2-xs a2-mute">{summary(s)}</span>
        </span>
        <span className="a2-xs a2-mute a2-mono">{s.template}</span>
      </button>
    );
  };
  const langs = step ? base.templates[step.template] ?? {} : {};
  const needed = step ? [...new Set([step.channel, ...(step.fallback !== 'NONE' ? [step.fallback] : []), ...(step.email ? ['EMAIL' as const] : [])])] : [];
  const keys = step && !templateKeys.includes(step.template) ? [step.template, ...templateKeys] : templateKeys;
  const numIn = (k: 'minutes' | 'days' | 'hour' | 'minute', max: number) => (
    <input id={`${id}-${k}`} className="a2-inp" type="number" inputMode="numeric" min={k === 'minutes' ? 1 : 0} max={max} step="1" value={step?.[k] ?? ''} disabled={off} onChange={(e) => editStep({ [k]: e.target.value })} data-testid={`js-${k}`} />
  );

  return (
    <div className="a2-stack a2-mt12" style={{ gap: 12 }} data-testid="journey-form">
      {!canEdit ? (
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{t(dict, 'msg.readOnly')}</span>
        </div>
      ) : null}
      <div className="a2-row a2-r21" style={{ alignItems: 'start', marginBottom: 0 }}>
        <div className="a2-stack" style={{ gap: 10 }}>
          <h2 className="a2-h4">{x('timeline')}</h2>
          <div className="a2-jr" data-testid="journey-timeline">
            {TIMELINE_STEPS.map((k, i) => row(k, i + 1))}
          </div>
          <h2 className="a2-h4 a2-mt6">{x('events')}</h2>
          <div className="a2-jr" data-testid="journey-events">
            {steps.filter((k) => !(TIMELINE_STEPS as readonly string[]).includes(k)).map((k) => row(k, null))}
          </div>
        </div>
        {step ? (
          <section className="a2-card" aria-labelledby={`${id}-s`} data-testid="journey-editor" data-step={sel}>
            <div className="a2-swl">
              <span>
                <span className="a2-xs a2-mute a2-blk">{x('send')}</span>
                <b id={`${id}-s`}>{t(dict, `msg.step.${sel}`)}</b>
              </span>
              <button type="button" className={`a2-sw${step.on ? ' on' : ''}`} role="switch" aria-checked={step.on} aria-labelledby={`${id}-s`} disabled={off} onClick={() => editStep({ on: !step.on })} data-testid="js-on" />
            </div>
            <div className="a2-fg a2-mt12">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-ch`}>
                  {x('channel')}
                </label>
                <select id={`${id}-ch`} className="a2-sel" value={step.channel} disabled={off} onChange={(e) => editStep({ channel: e.target.value as StepDraft['channel'] })} data-testid="js-channel">
                  {STEP_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {t(dict, `msg.channel.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-fb`}>
                  {x('fallback')}
                </label>
                <select id={`${id}-fb`} className="a2-sel" value={step.fallback} disabled={off} onChange={(e) => editStep({ fallback: e.target.value as StepDraft['fallback'] })} data-testid="js-fallback">
                  {FALLBACKS.filter((f) => f !== step.channel).map((f) => (
                    <option key={f} value={f}>
                      {f === 'NONE' ? x('fallbackNone') : t(dict, `msg.channel.${f}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-wk`}>
                  {x('when')}
                </label>
                <select id={`${id}-wk`} className="a2-sel" value={step.kind} disabled={off} onChange={(e) => editStep({ kind: e.target.value as StepDraft['kind'] })} data-testid="js-when">
                  {WHEN_KINDS.map((w) => (
                    <option key={w} value={w}>
                      {x(`whenOpt.${w}`)}
                    </option>
                  ))}
                </select>
              </div>
              {step.kind === 'after' ? (
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={`${id}-minutes`}>
                    {x('minutes')}
                  </label>
                  {numIn('minutes', 20_160)}
                </div>
              ) : null}
              {step.kind === 'at' ? (
                <>
                  <div className="a2-fld">
                    <label className="a2-lbl" htmlFor={`${id}-days`}>
                      {x('days')}
                    </label>
                    {numIn('days', 30)}
                  </div>
                  <div className="a2-fld">
                    <label className="a2-lbl" htmlFor={`${id}-hour`}>
                      {x('hour')}
                    </label>
                    {numIn('hour', 23)}
                  </div>
                  <div className="a2-fld">
                    <label className="a2-lbl" htmlFor={`${id}-minute`}>
                      {x('minute')}
                    </label>
                    {numIn('minute', 59)}
                  </div>
                </>
              ) : null}
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-who`}>
                  {x('who')}
                </label>
                <select id={`${id}-who`} className="a2-sel" value={step.who} disabled={off} onChange={(e) => editStep({ who: e.target.value as StepDraft['who'] })} data-testid="js-who">
                  {AUDIENCES.map((w) => (
                    <option key={w} value={w}>
                      {x(`whoOpt.${w}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-tp`}>
                  {x('template')}
                </label>
                <select id={`${id}-tp`} className="a2-sel" value={step.template} disabled={off} onChange={(e) => editStep({ template: e.target.value })} data-testid="js-template">
                  {keys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {step.channel !== 'EMAIL' ? (
              <label className="a2-chkl a2-mt6">
                <input type="checkbox" className="a2-chk" checked={step.email} disabled={off} onChange={(e) => editStep({ email: e.target.checked })} data-testid="js-email" />
                <span>{x('alsoEmail')}</span>
              </label>
            ) : null}
            <ul className="a2-stack a2-mt12" style={{ gap: 2, paddingLeft: 18, margin: 0 }} data-testid="js-langs">
              {needed.map((c) => {
                const l = langs[c] ?? [];
                return (
                  <li key={c} className="a2-xs" style={l.length < 2 ? { color: 'var(--bad)' } : undefined}>
                    {t(dict, `msg.channel.${c}`)}: {l.length ? x('langs', { list: l.map((v) => t(dict, `msg.tpl.lang.${v === 'en' ? 'en' : 'bn'}`)).join(', ') }) : x('noText', { channel: t(dict, `msg.channel.${c}`) })}
                  </li>
                );
              })}
            </ul>
            <div className="a2-gap8 a2-mt12">
              <a className="a2-btn sm" href={`/admin/messages/templates?key=${encodeURIComponent(step.template)}`} data-testid="js-edit-words">
                <ShellIcon name="edit" size={14} />
                {x('editWords')}
              </a>
            </div>
          </section>
        ) : null}
      </div>
      <details className="a2-sc" data-testid="journey-more">
        <summary className="a2-h4" style={{ cursor: 'pointer', padding: '12px 0', margin: '-12px 0' }}>
          {x('more')}
        </summary>
        <div className="a2-fg a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-lang`}>
              {x('language')}
            </label>
            <select id={`${id}-lang`} className="a2-sel" value={draft.language} disabled={off} onChange={(e) => edit({ language: e.target.value as JourneyDraft['language'] })} data-testid="jm-language">
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {x(`languageOpt.${l}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="a2-h4 a2-mt12">{x('amountLine')}</div>
        <p className="a2-xs a2-mute">{x('amountLineHelp')}</p>
        <div className="a2-fg a2-mt6">
          {(['en', 'bn'] as const).map((l) => (
            <div key={l} className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-al-${l}`}>
                {t(dict, `msg.tpl.lang.${l}`)}
              </label>
              <input id={`${id}-al-${l}`} className="a2-inp" lang={l} value={draft.amountLine[l]} disabled={off} onChange={(e) => edit({ amountLine: { ...draft.amountLine, [l]: e.target.value } })} data-testid={`jm-amount-${l}`} />
            </div>
          ))}
        </div>
        <div className="a2-h4 a2-mt12">{x('selfConfirm')}</div>
        <label className="a2-chkl a2-mt6">
          <input type="checkbox" className="a2-chk" checked={draft.newOnly} disabled={off} onChange={(e) => edit({ newOnly: e.target.checked })} />
          <span>{x('newOnly')}</span>
        </label>
        <label className="a2-chkl a2-mt6">
          <input type="checkbox" className="a2-chk" checked={draft.confirmOnYes} disabled={off} onChange={(e) => edit({ confirmOnYes: e.target.checked })} />
          <span>{x('confirmOnYes')}</span>
        </label>
        <label className="a2-chkl a2-mt6">
          <input type="checkbox" className="a2-chk" checked={draft.countsAsOne} disabled={off} onChange={(e) => edit({ countsAsOne: e.target.checked })} />
          <span>{x('countsAsOne')}</span>
        </label>
        <div className="a2-fg a2-mt6">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-wait`}>
              {x('waitHours')}
            </label>
            <input id={`${id}-wait`} className="a2-inp" type="number" inputMode="numeric" min={0} max={72} step="1" value={draft.waitHours} disabled={off} onChange={(e) => edit({ waitHours: e.target.value })} data-testid="jm-wait" />
          </div>
        </div>
      </details>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="journey-status">
          {said ? said.text : dirty ? t(dict, 'msg.unsaved') : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => fresh(base)}>
                {t(dict, 'msg.discard')}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="journey-save">
              {busy ? t(dict, 'msg.saving') : t(dict, 'msg.save')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
