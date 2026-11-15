// PR 818 (prototype v5 m-ai.js `renderCosts`) — the top of AI Center › Costs & limits: the AI's month against its own ceiling (with
// "Change ceiling"), a warning from 80%, the cap of each agent (the same CapInput the Control room uses) and the cost-saver mode.
// The SMS and WhatsApp ceilings stay on Messages › Cost ceilings and show right below in their own card. A server component: the
// numbers come from the Control room's own read (this month's ledger), the controls are the small client pieces.
import Link from 'next/link';
import { CapInput } from '@/components/admin/ai/CapInput';
import { CeilingInput, LimitToggle } from '@/components/admin/ai/LimitControls';
import { formatMoney, type Money } from '@/components/admin/products/model';
import { atSaverLine, monthEndAtThisPace, SAVER_AT_PCT } from '@/lib/admin-ai/limits';
import { t, type Dict } from '@/lib/i18n';
import './ai-limits.css';

export interface LimitsAgent {
  key: string;
  name: string;
  monthMinor: number;
  capMinor: number | null;
  provider: string;
}

export interface CostsLimitsProps {
  dict: Dict;
  money: Money;
  canControl: boolean;
  capMinor: number | null;
  spentMinor: number;
  dayOfMonth: number;
  daysInMonth: number;
  saver: boolean;
  saverAuto: boolean;
  agents: LimitsAgent[];
}

export function CostsLimits(p: CostsLimitsProps) {
  const c = (k: string, v?: Record<string, string | number>) => t(p.dict, `aiLimits.${k}`, v);
  const m = (minor: number) => formatMoney(minor, p.money);
  const pct = p.capMinor ? Math.min(100, Math.round((p.spentMinor / p.capMinor) * 100)) : null;
  const warn = atSaverLine(p.spentMinor, p.capMinor);
  const pace = monthEndAtThisPace(p.spentMinor, p.dayOfMonth, p.daysInMonth);
  const crosses = p.capMinor !== null && pace > p.capMinor;
  const barTone = warn ? 'var(--lm-warn)' : 'var(--lm-ok)';
  const tx = {
    saved: c('ceiling.saved'),
    failed: c('failed'),
    invalid: c('ceiling.invalid'),
  };

  return (
    <section className="ai-lim a2-mt12" data-testid="ai-limits" aria-label={c('h')}>
      <p className="a2-sm a2-mute">{c('sub', { pct: SAVER_AT_PCT })}</p>
      {warn && p.capMinor ? (
        <div className="a2-note a2-mt12" role="note" data-testid="ai-limits-warn">
          <span>{c('warn', { pct: pct ?? 0, spent: m(p.spentMinor), cap: m(p.capMinor), left: p.daysInMonth - p.dayOfMonth })}</span>
        </div>
      ) : null}

      <div className="a2-card ai-lim-meter a2-mt12" data-testid="ai-limits-meter" data-state={warn ? 'warn' : 'ok'}>
        <div className="ai-lim-top">
          <b>{c('ceiling.name')}</b>
          {p.canControl ? (
            <CeilingInput capMinor={p.capMinor} money={p.money} label={c('ceiling.label')} saveLabel={c('ceiling.save')} savedText={tx.saved} failedText={tx.failed} invalidText={tx.invalid} pin={{ title: c('ceiling.pin.title'), text: c('ceiling.pin.text'), label: c('ceiling.pin.label'), ok: c('ceiling.pin.ok'), cancel: c('ceiling.pin.cancel'), err: Object.fromEntries(['PIN_REQUIRED', 'PIN_NOT_SET', 'PIN_LOCKED', 'WRONG_PIN', 'other'].map((k) => [k, c(`ceiling.pin.${k}`)])) }} />
          ) : null}
        </div>
        <div className="a2-kv ai-lim-v">
          {m(p.spentMinor)} <span className="a2-sm a2-mute">{p.capMinor ? `/ ${m(p.capMinor)}` : c('ceiling.none')}</span>
        </div>
        {pct !== null ? (
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="ai-lim-bar">
            <div style={{ width: `${pct}%`, background: barTone }} />
          </div>
        ) : null}
        <div className="a2-xs a2-mute">
          {c('pace', { pct: pct ?? 0, amount: m(pace) })}{' '}
          {p.capMinor ? <span className={`a2-pill ${crosses ? 'bad' : 'ok'}`}>{crosses ? c('cross') : c('within')}</span> : null}
        </div>
        <p className="a2-xs a2-mute">{c('ceiling.help', { pct: SAVER_AT_PCT })}</p>
      </div>

      <div className="ai-lim-grid a2-mt12">
        <section className="a2-card" data-testid="ai-limits-agents">
          <h2 className="a2-h3">{c('agents.h')}</h2>
          <div className="a2-tblw">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{c('agents.agent')}</th>
                  <th>{c('agents.month')}</th>
                  <th>{c('agents.cap')}</th>
                </tr>
              </thead>
              <tbody>
                {p.agents.map((a) => {
                  const share = a.capMinor ? Math.min(100, Math.round((a.monthMinor / a.capMinor) * 100)) : null;
                  return (
                    <tr key={a.key} data-testid={`ai-limits-agent-${a.key}`}>
                      <td data-l={c('agents.agent')}>
                        <b>{a.name}</b>
                        <div className="a2-xs a2-mute">{a.provider}</div>
                      </td>
                      <td data-l={c('agents.month')}>
                        {m(a.monthMinor)}
                        {share !== null ? (
                          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} className="ai-lim-bar sm">
                            <div style={{ width: `${share}%`, background: share >= SAVER_AT_PCT ? 'var(--lm-warn)' : 'var(--lm-ok)' }} />
                          </div>
                        ) : null}
                      </td>
                      <td data-l={c('agents.cap')}>
                        {p.canControl ? (
                          <CapInput agentKey={a.key} capMinor={a.capMinor} money={p.money} label={c('agents.capLabel', { name: a.name })} saveLabel={c('ceiling.save')} savedText={c('agents.saved', { name: a.name })} failedText={c('failed')} invalidText={c('ceiling.invalid')} />
                        ) : a.capMinor ? (
                          m(a.capMinor)
                        ) : (
                          c('ceiling.none')
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="a2-xs a2-mute a2-mt6">{c('agents.hint')}</p>
        </section>

        <section className="a2-card" data-testid="ai-limits-saver">
          <h2 className="a2-h3">{c('saver.h')}</h2>
          <div className="ai-lim-row">
            <div>
              <b>{p.saver ? c('saver.on') : c('saver.off')}</b>
              <div className="a2-sm a2-mute">{c('saver.d')}</div>
            </div>
            {p.canControl ? <LimitToggle field="costSaver" on={p.saver} kind="switch" label={c('saver.switch')} onText={c('saver.toastOn')} offText={c('saver.toastOff')} failedText={c('failed')} testId="ai-saver-sw" /> : <span className={`a2-pill ${p.saver ? 'ok' : 'line'}`}>{p.saver ? c('saver.on') : c('saver.off')}</span>}
          </div>
          {p.canControl ? (
            <div className="a2-mt12">
              <LimitToggle field="costSaverAuto" on={p.saverAuto} kind="check" label={c('saver.auto', { pct: SAVER_AT_PCT })} onText={c('saver.toastAutoOn')} offText={c('saver.toastAutoOff')} failedText={c('failed')} testId="ai-saver-auto" />
            </div>
          ) : (
            <p className="a2-xs a2-mute a2-mt12">{p.saverAuto ? c('saver.autoIsOn', { pct: SAVER_AT_PCT }) : c('saver.autoIsOff', { pct: SAVER_AT_PCT })}</p>
          )}
          <p className="a2-xs a2-mute a2-mt12">{c('saver.note')}</p>
          <p className="a2-xs a2-mt6">
            <Link href="/admin/messages/cost-ceilings">{c('messagesLink')}</Link>
          </p>
        </section>
      </div>
    </section>
  );
}
