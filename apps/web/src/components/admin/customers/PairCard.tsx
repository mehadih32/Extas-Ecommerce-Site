// S14 · PR 284 — one "Same person?" card of Customers → To review (demo V12.4 CUS-05): the profile that stays and the
// one that would join it, side by side (stacked on a phone), with the rules that matched, each profile's number as this
// person may see it, its orders, Sales (delivered only) and last order; then Merge and "Not the same person" for a
// person with `customers.merge`. No street address is shown here (it stays inside an order).
import type { MergePair, PairSide } from '@extas/customers';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import type { AdminView } from '@/lib/admin-page';
import { t, type Dict } from '@/lib/i18n';
import { CustomerAct } from './CustomerAct';

/** The two letters on a profile's round badge. */
export function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((p) => [...p][0]!.toUpperCase()).join('') : '·';
}

export function Side({ view, s, role, money, when }: { view: AdminView; s: PairSide; role: 'stays' | 'joins'; money: Money; when: Intl.DateTimeFormat }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  return (
    <div className="a2-card tight" data-testid="pair-side" data-role={role}>
      <div className="a2-prow" style={{ padding: 0 }}>
        <span className={`a2-av${role === 'stays' ? ' g' : ''}`} aria-hidden="true">
          {initials(s.name)}
        </span>
        <div className="a2-prt">
          <b>{s.name ?? t(d, 'cus.side.noName')}</b>
          <span className="a2-mono">{s.phone?.text ?? t(d, 'cus.side.noPhone')}</span>
        </div>
        <span className={`a2-pill ${role === 'stays' ? 'ok' : 'line'}`}>{t(d, `cus.side.${role}`)}</span>
      </div>
      <div className="a2-xs a2-mute a2-mt6">
        {[s.email, s.whatsapp ? t(d, 'cus.side.whatsapp', { n: s.whatsapp.text }) : null].filter(Boolean).join(' · ')}
      </div>
      <div className="a2-xs a2-mt6">
        {t(d, 'cus.side.orders', { n: n(s.orders) })} · {t(d, 'cus.side.sales', { v: formatMoney(s.salesMinor, money) })} · {s.lastOrderAt ? t(d, 'cus.side.last', { at: when.format(s.lastOrderAt) }) : t(d, 'cus.side.never')}
      </div>
      {s.hasLogin || s.members ? (
        <div className="a2-gap8 a2-mt6">
          {s.hasLogin ? <span className="a2-pill line">{t(d, 'cus.side.login')}</span> : null}
          {s.members ? <span className="a2-pill line">{t(d, 'cus.side.members', { n: n(s.members) })}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function PairCard({ view, pair, canMerge, noteRequired, money, when, title }: { view: AdminView; pair: MergePair; canMerge: boolean; noteRequired: boolean; money: Money; when: Intl.DateTimeFormat; title?: string }) {
  const d = view.dict;
  const cd: Dict = { cus: d.cus as Dict };
  const signals = pair.signals.length ? pair.signals : [];
  return (
    <section className="a2-card a2-mt12" data-testid="merge-pair">
      <div className="a2-ch">
        <h2 className="a2-h3">
          {title ?? t(d, 'cus.review.pair')}{' '}
          {signals.map((s) => (
            <span key={s} className="a2-pill warn" style={{ marginLeft: 6 }}>
              {t(d, `cus.signal.${s}`)}
            </span>
          ))}
        </h2>
      </div>
      <div className="a2-row a2-r2 a2-mt12" style={{ marginBottom: 12 }}>
        <Side view={view} s={pair.survivor} role="stays" money={money} when={when} />
        <Side view={view} s={pair.merged} role="joins" money={money} when={when} />
      </div>
      {canMerge ? (
        <div className="a2-gap8" style={{ alignItems: 'flex-start' }}>
          <CustomerAct
            dict={cd}
            url="/api/admin/customers/merge"
            body={{ survivorId: pair.survivor.id, mergedId: pair.merged.id, signals: signals.length ? signals : ['manual'] }}
            label={t(d, 'cus.merge.go')}
            busyLabel={t(d, 'cus.merge.busy')}
            ask={{ title: t(d, 'cus.merge.ask'), effects: [t(d, 'cus.merge.eff1'), t(d, 'cus.merge.eff2'), t(d, 'cus.merge.eff3')], confirm: t(d, 'cus.merge.confirm') }}
            note={{ field: 'note', label: t(d, noteRequired ? 'cus.merge.note' : 'cus.merge.noteOptional'), min: noteRequired ? 1 : 0 }}
            tone="pri"
            testId="merge-go"
            done={t(d, 'cus.merge.done')}
          />
          <CustomerAct
            dict={cd}
            url="/api/admin/customers/not-same"
            body={{ aId: pair.survivor.id, bId: pair.merged.id, signals: signals.length ? signals : ['manual'] }}
            label={t(d, 'cus.merge.notSame')}
            busyLabel={t(d, 'cus.merge.notSameBusy')}
            testId="merge-no"
            done={t(d, 'cus.merge.notSameDone')}
          />
        </div>
      ) : null}
    </section>
  );
}
