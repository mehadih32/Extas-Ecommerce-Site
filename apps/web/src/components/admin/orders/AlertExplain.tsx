// S06 · PR 521 — the alert summary inside one review card on /admin/orders/<id>: one click ("Why this alert, and the
// options") opens why it fired, the earlier orders that matched, what the riders wrote on this customer's parcels, his
// history and the decisions open to this person with the proposed one first. The buttons stay the card's own: this only
// explains (lib/admin-orders/alert.ts builds the words). No script: a plain disclosure.
import Link from 'next/link';
import type { AlertExplainView } from '@/lib/admin-orders/alert';
import { ShellIcon } from '../shell/ShellIcon';

export function AlertExplain({ e }: { e: AlertExplainView }) {
  return (
    <details className="a2-mt12" data-testid="alert-explain">
      <summary className="a2-btn sm" style={{ listStyle: 'none', width: 'fit-content' }}>
        <ShellIcon name="info" size={15} />
        {e.label}
      </summary>
      <div className="a2-mt12" data-testid="alert-why">
        <h3 className="a2-h4">{e.fired}</h3>
        <ul className="a2-lines" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {e.why.map((w, i) => (
            <li key={i} className="a2-sm" style={{ padding: '4px 0' }}>
              {w}
            </li>
          ))}
        </ul>
      </div>
      <div className="a2-mt12" data-testid="alert-matched">
        <h3 className="a2-h4">{e.matchedTitle}</h3>
        {e.noMatch ? <div className="a2-sm a2-mute">{e.noMatch}</div> : null}
        {e.matches.length ? (
          <div className="a2-lines">
            {e.matches.map((m) => (
              <Link key={m.key} className="a2-prow" href={m.href}>
                <div className="a2-prt">
                  <b>{m.number}</b>
                  <span>{m.sub}</span>
                </div>
                <span className={`a2-pill ${m.tone}`}>{m.status}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <div className="a2-mt12" data-testid="alert-rider">
        <h3 className="a2-h4">{e.riderTitle}</h3>
        {e.noRider ? <div className="a2-sm a2-mute">{e.noRider}</div> : null}
        {e.riders.map((r) => (
          <div key={r.key} className="a2-rule">
            <span>
              &ldquo;{r.text}&rdquo;
              <span className="a2-xs a2-mute a2-blk">
                <Link href={r.href}>{r.number}</Link> · {r.sub}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="a2-mt12" data-testid="alert-history">
        <h3 className="a2-h4">{e.historyTitle}</h3>
        {e.history.map((h, i) => (
          <div key={i} className="a2-sm">
            {h}
          </div>
        ))}
      </div>
      <div className="a2-note a2-mt12" data-testid="alert-options">
        <ShellIcon name="info" size={15} />
        <span>
          {e.proposed ? <b className="a2-blk">{e.proposed}</b> : null}
          <span className="a2-blk">{e.options}</span>
          <span className="a2-xs a2-mute a2-blk">{e.yours}</span>
        </span>
      </div>
    </details>
  );
}
