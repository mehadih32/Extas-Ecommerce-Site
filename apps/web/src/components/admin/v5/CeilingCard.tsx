// S28 · PR 698 — the month's message spend against the SMS and WhatsApp ceilings: one bar per channel with the share spent
// and a word for its state (under, close, reached). Display only (a server component); the numbers are set on
// Messages › Cost ceilings. Used there and on the AI Center's costs page.
import Link from 'next/link';
import type * as ms from '@extas/messages';
import { t, type Dict } from '@/lib/i18n';

export function CeilingCard({ dict, status, locale, timeZone, link }: { dict: Dict; status: ms.CeilingStatus; locale: string; timeZone: string; link: boolean }) {
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `w5a.ceil.${k}`, v);
  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency: status.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: status.currency, numberingSystem: 'latn' }).format(minor / 10 ** digits);
  const at = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', numberingSystem: 'latn' }).format(status.monthStart);
  return (
    <section className="a2-card a2-mt12" data-testid="ceiling-card" data-on={status.enabled ? 'yes' : 'no'} aria-label={c('title')}>
      <div className="a2-gap8" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 className="a2-h3">{c('title')}</h2>
        {link ? (
          <Link className="a2-btn sm" href="/admin/messages/cost-ceilings">
            {c('openPage')}
          </Link>
        ) : null}
      </div>
      {!status.enabled ? <p className="a2-sm a2-mute a2-mt6">{c('off')}</p> : null}
      <p className="a2-xs a2-mute a2-mt6">{c('month', { at })}</p>
      <ul className="cr-rows" style={{ marginTop: 6 }}>
        {status.channels.map((x) => (
          <li key={x.channel} data-testid="ceiling-row" data-channel={x.channel} data-state={x.state}>
            <div style={{ width: '100%' }}>
              <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{c(`channel_${x.channel}`)}</b>
                <span className="a2-sm">{c('spent', { amount: money(x.spentMinor) })}</span>
                <span className="a2-sm a2-mute">{x.ceilingMinor === null ? c('noCeiling') : c('of', { amount: money(x.ceilingMinor) })}</span>
                <span className={`a2-pill ${x.state === 'over' ? 'bad' : x.state === 'warn' ? 'warn' : 'line'}`}>{c(`state_${x.state}`)}</span>
              </div>
              {x.pct !== null ? (
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, x.pct)} style={{ height: 8, borderRadius: 4, background: 'var(--line, #ddd)', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, x.pct)}%`, height: '100%', background: x.state === 'over' ? 'var(--bad, #c0392b)' : x.state === 'warn' ? 'var(--warn, #d68910)' : 'var(--ok, #2e8b57)' }} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
