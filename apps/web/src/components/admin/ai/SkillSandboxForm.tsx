'use client';
// S15 · PR 322 (AIC-04a "Skill sandbox") — the sandbox's own form + result + run-history card: pick a skill and a
// data window, POST `{action:'sandbox', id, dataWindowDays}` to the same `/api/admin/ai/skills` route PR 321's
// import/rollback/enable already use, and show the real, read-only result it returns (orders read, an honest cost
// estimate or why there is none, and whether the version is ready for approval) plus every earlier run.
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { dateTime } from '@/components/admin/stock/text';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface SandboxSkillOption {
  id: string;
  key: string;
  label: string;
}

type CostNote = 'NO_AGENT_JOB' | 'NO_EXCHANGE_RATE' | null;

interface RunRow {
  id: string;
  version: number;
  dataWindowDays: number;
  ordersRead: number;
  estimatedCostMinor: number | null;
  costNote: CostNote;
  passed: boolean;
  createdAt: string;
}

export function SkillSandboxForm({
  dict,
  locale,
  timeZone,
  skills,
  dataWindows,
  canRun,
  initialHistory,
  money,
}: {
  dict: Dict;
  locale: string;
  timeZone: string;
  skills: readonly SandboxSkillOption[];
  dataWindows: readonly number[];
  canRun: boolean;
  initialHistory: readonly RunRow[];
  money: (minor: number) => string;
}) {
  const c = (k: string, vars?: Record<string, string | number>) => t(dict, `aiSkillsSandbox.${k}`, vars);
  const errText = (code: string | undefined) => {
    const key = `aiSkillsSandbox.err.${code ?? 'other'}`;
    const text = t(dict, key);
    return text === key ? c('err.other') : text;
  };
  const costNoteText = (note: CostNote) => (note === 'NO_AGENT_JOB' ? c('costNote.NO_AGENT_JOB') : note === 'NO_EXCHANGE_RATE' ? c('costNote.NO_EXCHANGE_RATE') : null);
  const when = (iso: string) => dateTime(iso, locale, timeZone);

  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const [days, setDays] = useState<number>(dataWindows[0] ?? 7);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunRow | null>(initialHistory[0] ?? null);
  const [history, setHistory] = useState<readonly RunRow[]>(initialHistory);

  const run = async () => {
    if (!canRun || !skillId || busy) return;
    setBusy(true);
    const res = await call('POST', '/api/admin/ai/skills', { action: 'sandbox', id: skillId, dataWindowDays: days });
    setBusy(false);
    if (!res.data.ok) {
      showToast({ text: errText(res.data.error), tone: 'bad' });
      return;
    }
    const data = res.data as unknown as { run: RunRow; history: RunRow[] };
    setResult(data.run);
    setHistory(data.history);
    showToast({ text: c('toastOk') });
  };

  return (
    <div data-testid="ai-sbx">
      <div className="a2-row a2-r2 a2-mt12">
      <section className="a2-sc" aria-labelledby="ai-sbx-form-h" data-testid="ai-sbx-form">
        <h2 className="a2-h3" id="ai-sbx-form-h">
          {c('formTitle')}
        </h2>
        <p className="a2-sm a2-mute">{c('formSub')}</p>
        <div className="a2-fg a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="ai-sbx-skill">
              {c('skillLabel')}
            </label>
            <select id="ai-sbx-skill" className="a2-sel" value={skillId} data-testid="ai-sbx-skill" onChange={(e) => setSkillId(e.target.value)}>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="ai-sbx-days">
              {c('dataLabel')}
            </label>
            <select id="ai-sbx-days" className="a2-sel" value={days} data-testid="ai-sbx-days" onChange={(e) => setDays(Number(e.target.value))}>
              {dataWindows.map((n) => (
                <option key={n} value={n}>
                  {n === 30 ? c('data30') : c('data7')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="a2-btn pri a2-mt12" disabled={!canRun || busy} aria-busy={busy || undefined} data-testid="ai-sbx-run" onClick={run}>
          <ShellIcon name="zap" size={15} />
          {busy ? c('working') : c('run')}
        </button>
      </section>

      {result ? (
        <section className="a2-sc" aria-labelledby="ai-sbx-res-h" data-testid="ai-sbx-result">
          <h2 className="a2-h3" id="ai-sbx-res-h">
            {c('resultTitle')}
          </h2>
          <ul className="a2-eff a2-mt12">
            <li>
              <ShellIcon name="check" size={14} />
              <span data-testid="ai-sbx-orders">{c('ordersRead', { n: result.ordersRead })}</span>
            </li>
            <li>
              <ShellIcon name={result.passed ? 'check' : 'alert'} size={14} />
              <span data-testid="ai-sbx-passed">{result.passed ? c('passed', { version: result.version }) : c('notPassed')}</span>
            </li>
            <li>
              <ShellIcon name={result.estimatedCostMinor !== null ? 'check' : 'info'} size={14} />
              <span data-testid="ai-sbx-cost">{result.estimatedCostMinor !== null ? c('cost', { amount: money(result.estimatedCostMinor) }) : costNoteText(result.costNote)}</span>
            </li>
          </ul>
        </section>
      ) : (
        <section className="a2-sc" aria-labelledby="ai-sbx-res-h" data-testid="ai-sbx-result-empty">
          <h2 className="a2-h3" id="ai-sbx-res-h">
            {c('resultEmptyTitle')}
          </h2>
          <p className="a2-sm a2-mute">{c('resultEmpty')}</p>
        </section>
      )}
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="ai-sbx-hist-h" data-testid="ai-sbx-history">
        <h2 className="a2-h3" id="ai-sbx-hist-h">
          {c('historyTitle')}
        </h2>
        {history.length ? (
          <ul className="ai-sbx-list a2-mt12">
            {history.map((r) => (
              <li key={r.id} className="ai-sbx-row" data-testid={`ai-sbx-hist-${r.id}`}>
                <span className={`a2-pill ${r.passed ? 'ok' : 'line'}`}>{r.passed ? c('passed', { version: r.version }) : c('notPassed')}</span>
                <span className="a2-xs">{c('ordersRead', { n: r.ordersRead })}</span>
                <span className="a2-xs a2-mute">{r.estimatedCostMinor !== null ? c('cost', { amount: money(r.estimatedCostMinor) }) : costNoteText(r.costNote)}</span>
                <span className="a2-xs a2-mute">{when(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{c('historyEmpty')}</p>
        )}
      </section>
    </div>
  );
}
