// PR 174 — a gateway's statement without a database: the file read with the owner's column names (a refund by its
// word or a negative amount, every unreadable row named), and every line matched with a reason code when it does not
// fit (SIM-F-028). The codes agree with the settings' list. Every value is made up.
import { describe, expect, it } from 'vitest';
import { registry, STATEMENT_MISMATCH_CODES } from '@extas/settings';
import { matchGatewayLine, parseGatewayStatement, STATEMENT_MISMATCHES, type GatewayLine } from './statement-match';

const F = registry['payments.statement'].default;
const line = (x: Partial<GatewayLine> = {}): GatewayLine => ({ lineNo: 1, trxId: 'TRX1', amountMinor: 100_000, feeMinor: null, occurredAt: null, kind: 'PAYMENT', ...x });
const paid = { status: 'PAID', amountMinor: 100_000, receivedMinor: 100_000 };

describe('PR 174 · gateway statement lines', () => {
  it('the reason codes are the settings list, every one with its words in both languages', () => {
    expect([...STATEMENT_MISMATCHES]).toEqual([...STATEMENT_MISMATCH_CODES]);
    const words = registry['payments.statement.reasons'].default;
    expect(words.map((w) => w.code)).toEqual([...STATEMENT_MISMATCHES]);
    for (const w of words) expect(w.en.length * w.bn.length).toBeGreaterThan(0);
  });

  it('reads the file with the owner column names; a refund by its word or by a negative amount', () => {
    const csv = 'TrxID,Amount,Fee,Date,Type\nAB12,"1,000.00",18.50,2026-10-20T10:00:00Z,Payment\nAB13,৳ 500,,2026-10-20,Refund\nAB14,-250.00,0,,payment\n';
    const p = parseGatewayStatement(csv, F);
    expect(p).toEqual({
      ok: true,
      lines: [
        { lineNo: 1, trxId: 'AB12', amountMinor: 100_000, feeMinor: 1_850, occurredAt: new Date('2026-10-20T10:00:00Z'), kind: 'PAYMENT' },
        { lineNo: 2, trxId: 'AB13', amountMinor: 50_000, feeMinor: null, occurredAt: new Date('2026-10-20'), kind: 'REFUND' },
        { lineNo: 3, trxId: 'AB14', amountMinor: 25_000, feeMinor: 0, occurredAt: null, kind: 'REFUND' },
      ],
    });
  });

  it('names every problem and never guesses', () => {
    expect(parseGatewayStatement('Amount\n1', F)).toEqual({ ok: false, problems: ['no transaction ID column'] });
    expect(parseGatewayStatement('trx_id,amount\n', F)).toEqual({ ok: false, problems: ['the file has no lines'] });
    const bad = parseGatewayStatement('trx_id,amount,fee,date\n,abc,x,yesterday\n', F);
    expect(bad).toEqual({ ok: false, problems: ['line 1: no transaction ID', 'line 1: the amount is not a number', 'line 1: the fee is not a number', 'line 1: the date cannot be read'] });
  });

  it('matches a payment line, else gives the first reason that applies', () => {
    const c = { payment: paid, alreadyOnStatement: false, refund: null, toleranceMinor: 0 };
    expect(matchGatewayLine(line(), c)).toEqual({ matchStatus: 'MATCHED', reasonCode: null, expectedMinor: 100_000 });
    expect(matchGatewayLine(line(), { ...c, payment: null })).toMatchObject({ reasonCode: 'UNKNOWN_PAYMENT' });
    expect(matchGatewayLine(line(), { ...c, alreadyOnStatement: true })).toMatchObject({ reasonCode: 'DOUBLE_LINE' });
    expect(matchGatewayLine(line(), { ...c, payment: { ...paid, status: 'FAILED' } })).toMatchObject({ reasonCode: 'NOT_PAID' });
    expect(matchGatewayLine(line({ amountMinor: 99_999 }), c)).toMatchObject({ reasonCode: 'AMOUNT_DIFFERS', expectedMinor: 100_000 });
    expect(matchGatewayLine(line({ amountMinor: 99_999 }), { ...c, toleranceMinor: 1 })).toMatchObject({ matchStatus: 'MATCHED' });
    // a refunded payment was still paid in: its money-in line matches
    expect(matchGatewayLine(line(), { ...c, payment: { ...paid, status: 'PARTIALLY_REFUNDED' } })).toMatchObject({ matchStatus: 'MATCHED' });
  });

  it('matches a refund line with the refund a person paid out with that reference', () => {
    const c = { payment: null, alreadyOnStatement: false, refund: { amountMinor: 20_000 }, toleranceMinor: 0 };
    expect(matchGatewayLine(line({ kind: 'REFUND', amountMinor: 20_000 }), c)).toMatchObject({ matchStatus: 'MATCHED' });
    expect(matchGatewayLine(line({ kind: 'REFUND', amountMinor: 25_000 }), c)).toMatchObject({ reasonCode: 'REFUND_DIFFERS', expectedMinor: 20_000 });
    expect(matchGatewayLine(line({ kind: 'REFUND' }), { ...c, refund: null })).toMatchObject({ reasonCode: 'UNKNOWN_REFUND' });
  });
});
