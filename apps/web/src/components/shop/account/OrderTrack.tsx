// PR 135 — the tracking steps of one order (demo 60-account.js ord_track, V12.2): placed, confirmed, packed, with the
// courier, delivered — each step reached shows when (the times the order stores), the next one says so, and the last
// one carries the band's promise in hours. Past that promise (SIM-F-018) the step says when it was due and a box says
// plainly that it is late and that we are chasing the courier, with WhatsApp to ask. The steps only show the stored
// state; moving an order is the state machine's (S05, CN-022).
import { TRACK_STEPS, type LateView, type TrackView } from '@extas/accounts/pure';
import type { ShopContext } from '@/lib/shop/context';
import { dateText } from '@/lib/shop/account-view';
import { Icon } from '../Icon';

export function OrderTrack({ c, track, late, hours, lateWa }: { c: ShopContext; track: TrackView; late: LateView; hours: string | null; lateWa: string | null }) {
  const t = c.t;
  return (
    <>
      <ol className="ord-track" aria-label={t('account.track.label')} data-testid="order-track" data-reached={track.reached} data-late={late.late ? '1' : '0'}>
        {TRACK_STEPS.map((step, i) => {
          const done = i <= track.reached;
          const now = !track.ended && i === track.reached + 1;
          const line = i + 1 <= track.reached;
          const at = track.at[step];
          // PR 184: a step passed without its own time (the courier picked the parcel up before anyone pressed
          // "Packed") shows no "coming up"
          const sub = at
            ? dateText(c, at, true)
            : track.ended || done
              ? ''
              : step === 'delivered'
                ? late.late && late.dueBy
                  ? t('account.track.dueBy', { date: dateText(c, late.dueBy, true) })
                  : hours
                    ? t('account.track.within', { hours })
                    : now
                      ? t('account.track.next')
                      : t('account.track.soon')
                : now
                  ? t('account.track.next')
                  : t('account.track.soon');
          return (
            <li key={step} className={`ord-st${line ? ' ln' : ''}${done ? '' : ' todo'}`} aria-current={i === track.reached ? 'step' : undefined} data-step={step}>
              <span className={`tl-dot${done ? ' done' : now ? ' now' : ''}`}>{done ? <Icon name="check" size={13} /> : c.num(i + 1)}</span>
              <div>
                <div className="lbl">{t(`account.track.step.${step}`)}</div>
                {sub ? <div className={`xs ${late.late && step === 'delivered' && !at ? 'ord-latec' : 'muted'}`}>{sub}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {late.late && late.dueBy ? (
        <div className="ord-late mt16" role="status" data-testid="order-late">
          <span className="ord-late-i">
            <Icon name="clock" size={18} />
          </span>
          <div>
            <div className="bold small">{t('account.track.lateTitle')}</div>
            <div className="xs text2" style={{ marginTop: 2 }}>
              {t('account.track.lateText', { date: dateText(c, late.dueBy, true) })}
            </div>
            {lateWa ? (
              <a className="link xs bold" href={lateWa} target="_blank" rel="noopener noreferrer" data-testid="order-late-wa">
                {t('account.track.lateWa')}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
