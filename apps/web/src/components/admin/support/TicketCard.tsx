// S22 · PR 431 (Blueprint B4.14 item 7) — the chat's ticket beside a conversation: its status and owner, when it opened,
// the first-answer and solution timers (due, late, or met with how long it took), and how many earlier tickets the chat
// had. Read only: the status and the owner are changed with the chat's own buttons.
import type { TicketView } from '@extas/support';
import { t, type Dict } from '@/lib/i18n';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { span } from '@/lib/admin-support/i18n';

function timer(d: Dict, locale: string, at: Date | null, due: Date | null, minutes: number | null, late: boolean, now: Date): { text: string; bad: boolean } {
  if (at && minutes != null) return { text: t(d, late ? 'sup.tk.lateTime' : 'sup.tk.inTime', { time: span(d, locale, minutes) }), bad: late };
  if (!due) return { text: t(d, 'sup.tk.notYet'), bad: false };
  const left = Math.round((due.getTime() - now.getTime()) / 60_000);
  return left < 0 ? { text: t(d, 'sup.tk.lateBy', { time: span(d, locale, -left) }), bad: true } : { text: t(d, 'sup.tk.dueBy', { time: span(d, locale, left) }), bad: false };
}

export function TicketCard({ ticket: k, dict: d, locale, timeZone, now, me }: { ticket: TicketView; dict: Dict; locale: string; timeZone: string; now: Date; me: string | null }) {
  const first = timer(d, locale, k.firstResponseAt, k.firstResponseDueAt, k.firstMinutes, k.firstLate, now);
  const solve = timer(d, locale, k.resolvedAt, k.resolutionDueAt, k.resolutionMinutes, k.resolutionLate, now);
  return (
    <section className="a2-card" aria-labelledby="sp-tk-h" data-testid="support-ticket" data-late={k.clock?.late ? 'yes' : 'no'}>
      <h2 className="a2-h4" id="sp-tk-h">
        {t(d, 'sup.tk.h')}
      </h2>
      <p className="a2-xs a2-mute" style={{ margin: '4px 0 12px' }}>
        {t(d, 'sup.tk.d')}
      </p>
      <div className="sp-kv">
        <span>{t(d, 'sup.tk.status')}</span>
        <span data-testid="support-ticket-status">{t(d, `sup.status.${k.status}`)}</span>
        <span>{t(d, 'sup.tk.owner')}</span>
        <span>{k.owner ? (k.owner.id === me ? t(d, 'sup.you') : k.owner.name) : t(d, 'sup.nobody')}</span>
        <span>{t(d, 'sup.tk.opened')}</span>
        <span>{printedAt(k.openedAt.toISOString(), timeZone)}</span>
        <span>{t(d, 'sup.tk.first')}</span>
        <span className={first.bad ? 'sp-late' : undefined} data-testid="support-ticket-first">
          {first.text}
        </span>
        <span>{t(d, 'sup.tk.resolve')}</span>
        <span className={solve.bad ? 'sp-late' : undefined} data-testid="support-ticket-resolve">
          {k.status === 'WAITING' && !k.resolvedAt ? t(d, 'sup.tk.waiting') : solve.text}
        </span>
      </div>
      {k.earlier > 0 ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'sup.tk.earlier', { n: String(k.earlier) })}</p> : null}
    </section>
  );
}
