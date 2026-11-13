// S28 · PR 675 — the statement lines that do not match, as Courier 360 › Money and the monthly statement show them: the order,
// why it does not match (the owner's words), what we expected against what the courier says, the charge when it is the charge
// that differs, and "Accept the courier figure" where that is allowed (see StatementActions). Server-rendered; read only apart
// from that one button.
import { AcceptFigure } from '@/components/admin/couriers/StatementActions';
import { t, type Dict } from '@/lib/i18n';

export interface OpenLine {
  lineId: string;
  reference: string;
  consignmentId: string | null;
  orderNumber: string | null;
  matchState: 'MISMATCH' | 'LATE';
  reasonCode: string | null;
  expectedMinor: number | null;
  codMinor: number;
  chargeMinor: number;
  expectedChargeMinor: number | null;
  /** What the courier charged above ours, when that is the whole difference (else null). */
  extraChargeMinor: number | null;
}

export function OpenLines({ dict, lines, money, canAccept }: { dict: Dict; lines: readonly OpenLine[]; money: (minor: number) => string; canAccept: boolean }) {
  const cr = (k: string, v?: Record<string, string | number>) => t(dict, `cr.${k}`, v);
  return (
    <ul className="a2-stack a2-mt12" style={{ listStyle: 'none', padding: 0 }}>
      {lines.map((l) => (
        <li key={l.lineId} className="a2-between a2-sm" style={{ flexWrap: 'wrap', gap: 8 }} data-testid="c360-open-line">
          <div style={{ minWidth: 0 }}>
            <b>{l.orderNumber ?? l.consignmentId ?? l.reference}</b> · {l.reasonCode ? cr(`m.reasons.${l.reasonCode}`) : l.matchState === 'LATE' ? cr('m.late') : ''}
            <span className="a2-xs a2-mute a2-blk">
              {cr('m.expected')}: {l.expectedMinor === null ? '—' : money(l.expectedMinor)} · {cr('m.got')}: {money(l.codMinor)}
            </span>
            {l.extraChargeMinor !== null && l.expectedChargeMinor !== null ? (
              <span className="a2-xs a2-mute a2-blk">{cr('z.charge', { ours: money(l.expectedChargeMinor), theirs: money(l.chargeMinor), extra: money(l.extraChargeMinor) })}</span>
            ) : null}
          </div>
          {canAccept && l.extraChargeMinor !== null ? <AcceptFigure dict={dict} lineId={l.lineId} amount={money(l.extraChargeMinor)} /> : null}
        </li>
      ))}
    </ul>
  );
}
