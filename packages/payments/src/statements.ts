// S07 · PR 174 — the payment reconciliation report against the gateways' statements (BACKEND-ARCHITECTURE §6.5.3,
// MNY-03; SIM-F-028, SIM-F-041). Read and checked by people; nothing here changes an order, moves money or messages
// anyone: a mismatch is listed with its reason for a person to look at (the "flag, change nothing" rule of PR 564).
//
// - `importGatewayStatement` (`payments.settle`): a gateway's statement file (bKash, Nagad, card), read line by line
//   with the owner's column names (`payments.statement`); the same file twice is one statement, a reference once. Each
//   line is matched with our payment by its transaction ID (a refund line with the refund a person paid out with that
//   reference); a matched payment's money becomes RECONCILED and its gateway fee is kept; every other line carries its
//   reason code (statement-match.ts). A payment is on one statement line only (a second is DOUBLE_LINE).
// - `getGatewayStatement` (`payments.view`) and `resolveGatewayLine` (`payments.settle`): one statement with its lines
//   and their reason words; a checked mismatch marked resolved with the person's note.
// - `practiceStatement` (`payments.settle`): on the practice gateway only (MOCK, while `payments.testPayments` is on —
//   the go-live guard), the statement the gateway would give for a period, made from our own paid practice payments,
//   so the import and the report can be tried end to end before a real gateway's statement exists.
// - `reconciliationReport` (`payments.view`): for a period, per gateway what our records received against what its
//   statements say (and the fees), every open mismatch from every source — gateway lines, courier COD lines, payment
//   rows, paid payments no statement shows — each with its reason code and the owner's words (SIM-F-028: none without
//   one), the Cash on Delivery position, the money owed to customers, cancelled or returned orders still holding the
//   customer's money with no refund asked (SIM-F-041), and the wallet ledger check. Every money figure is
//   @extas/metrics' (PR 155).
// A gateway's own statement API (`fetchStatement`) joins later (PROGRESS follow-up 426); until then the owner's team
// downloads the file from the gateway's merchant panel and imports it here.
import { createHash } from 'node:crypto';
import { owedNotAsked, owedToCustomers, paymentsReceived, statementTotals, walletDrift, type OwedFigure, type OwedNotAsked, type WalletDrift } from '@extas/metrics';
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, UUID, type PaymentsDeps, type Who } from './context';
import { codPosition } from './cod';
import { PaymentsError } from './errors';
import { moneyForward, type MoneyStatus } from './pure';
import { reasonWords } from './record';
import { matchGatewayLine, parseGatewayStatement, type GatewayLine, type StatementMismatch } from './statement-match';
import { auditMoney } from './wallet';

const PROVIDER = /^[a-z][a-zA-Z0-9]{1,30}$/;
/** How many rows one list of the report shows at most (the report is a page for people, not an export). */
const LIST_LIMIT = 500; // hardcode-ok: a page size of the report, not a business rule
const DAY = 86_400_000;

type Words = { en: string; bn: string };

/** The owner's words of the statement reason codes. */
async function statementWords(deps: Pick<PaymentsDeps, 'settings'>, storeId: number): Promise<Map<string, Words>> {
  const list = await setting(deps, storeId, 'payments.statement.reasons');
  return new Map(list.map((r) => [r.code, { en: r.en, bn: r.bn }]));
}

const refOf = (s: string) => s.replace(/\s+/g, '').toUpperCase();

// ---------------------------------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------------------------------

const lineInput = z
  .object({
    trxId: z.string().trim().min(1).max(100),
    amountMinor: z.int().min(0).max(1_000_000_000),
    feeMinor: z.int().min(0).max(1_000_000_000).optional(),
    occurredAt: z.coerce.date().optional(),
    kind: z.enum(['PAYMENT', 'REFUND']).default('PAYMENT'),
  })
  .strict();

export const gatewayStatementInputSchema = z
  .object({
    provider: z.string().regex(PROVIDER),
    reference: z.string().trim().min(1).max(120),
    periodFrom: z.coerce.date(),
    periodTo: z.coerce.date(),
    /** The gateway's CSV file as text, or the lines themselves. */
    csv: z.string().max(5_000_000).optional(),
    lines: z.array(lineInput).max(20_000).optional(),
  })
  .strict()
  .refine((v) => (v.csv === undefined) !== (v.lines === undefined), { message: 'send the file (csv) or the lines, one of them', path: ['csv'] })
  .refine((v) => v.periodTo.getTime() >= v.periodFrom.getTime(), { message: 'the period ends before it starts', path: ['periodTo'] });

export interface GatewayLineOut {
  id: string;
  lineNo: number;
  kind: string;
  trxId: string;
  amountMinor: number;
  feeMinor: number | null;
  occurredAt: Date | null;
  paymentId: string | null;
  expectedMinor: number | null;
  matchStatus: string;
  reasonCode: StatementMismatch | null;
  words: Words | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export interface GatewayStatementSummary {
  statementId: string;
  provider: string;
  reference: string | null;
  periodFrom: Date;
  periodTo: Date;
  totalMinor: number;
  feesMinor: number;
  lines: GatewayLineOut[];
  matched: number;
  mismatched: number;
  /** Mismatches by reason code. */
  reasons: Partial<Record<StatementMismatch, number>>;
  replay: boolean;
}

const LINE_SELECT = {
  id: true,
  lineNo: true,
  kind: true,
  providerTrxId: true,
  amountMinor: true,
  feeMinor: true,
  occurredAt: true,
  matchedPaymentId: true,
  expectedMinor: true,
  matchStatus: true,
  reasonCode: true,
  resolvedAt: true,
  resolutionNote: true,
} satisfies Prisma.GatewayStatementLineSelect;
type LineRow = Prisma.GatewayStatementLineGetPayload<{ select: typeof LINE_SELECT }>;

const lineOut = (l: LineRow, words: Map<string, Words>): GatewayLineOut => ({
  id: l.id,
  lineNo: l.lineNo,
  kind: l.kind,
  trxId: l.providerTrxId,
  amountMinor: l.amountMinor,
  feeMinor: l.feeMinor,
  occurredAt: l.occurredAt,
  paymentId: l.matchedPaymentId,
  expectedMinor: l.expectedMinor,
  matchStatus: l.matchStatus,
  reasonCode: l.reasonCode as StatementMismatch | null,
  words: l.reasonCode ? (words.get(l.reasonCode) ?? null) : null,
  resolvedAt: l.resolvedAt,
  resolutionNote: l.resolutionNote,
});

async function statementSummary(deps: PaymentsDeps, storeId: number, id: string, replay: boolean): Promise<GatewayStatementSummary> {
  const [s, words] = await Promise.all([
    deps.db.gatewayStatement.findUniqueOrThrow({
      where: { id },
      select: { id: true, provider: true, reference: true, periodFrom: true, periodTo: true, totalMinor: true, feesMinor: true, lines: { select: LINE_SELECT, orderBy: { lineNo: 'asc' } } },
    }),
    statementWords(deps, storeId),
  ]);
  const lines = s.lines.map((l) => lineOut(l, words));
  const reasons: Partial<Record<StatementMismatch, number>> = {};
  for (const l of lines) if (l.matchStatus === 'MISMATCH' && l.reasonCode) reasons[l.reasonCode] = (reasons[l.reasonCode] ?? 0) + 1;
  return {
    statementId: s.id,
    provider: s.provider,
    reference: s.reference,
    periodFrom: s.periodFrom,
    periodTo: s.periodTo,
    totalMinor: s.totalMinor,
    feesMinor: s.feesMinor,
    lines,
    matched: lines.filter((l) => l.matchStatus === 'MATCHED').length,
    mismatched: lines.filter((l) => l.matchStatus === 'MISMATCH').length,
    reasons,
    replay,
  };
}

/** Imports one gateway statement and matches every line (see the file header). */
export async function importGatewayStatement(deps: PaymentsDeps, who: Who, input: unknown): Promise<GatewayStatementSummary> {
  await allow(deps, who, 'payments.settle');
  const d = parse(gatewayStatementInputSchema, input, 'gateway statement');
  const storeId = who.storeId;
  const format = await setting(deps, storeId, 'payments.statement');
  let lines: GatewayLine[];
  if (d.csv !== undefined) {
    const p = parseGatewayStatement(d.csv, format);
    if (!p.ok) throw new PaymentsError('INVALID_INPUT', 'the statement file cannot be read', p.problems);
    lines = p.lines;
  } else {
    lines = d.lines!.map((l, i) => ({ lineNo: i + 1, trxId: l.trxId, amountMinor: l.amountMinor, feeMinor: l.feeMinor ?? null, occurredAt: l.occurredAt ?? null, kind: l.kind }));
  }
  if (!lines.length) throw new PaymentsError('INVALID_INPUT', 'the statement has no lines', ['lines']);
  const fileHash = createHash('sha256').update(d.csv ?? JSON.stringify(d.lines)).digest('hex');
  const same = await deps.db.gatewayStatement.findFirst({ where: { storeId, provider: d.provider, fileHash }, select: { id: true } });
  if (same) return statementSummary(deps, storeId, same.id, true);
  const dupRef = await deps.db.gatewayStatement.findFirst({ where: { storeId, provider: d.provider, reference: d.reference }, select: { id: true } });
  if (dupRef) throw new PaymentsError('DUPLICATE_REFERENCE', 'a statement with this reference is already imported', ['reference'], { statementId: dupRef.id });
  const now = nowOf(deps);
  const total = lines.filter((l) => l.kind === 'PAYMENT').reduce((s, l) => s + l.amountMinor, 0);
  const fees = lines.reduce((s, l) => s + (l.feeMinor ?? 0), 0);
  try {
    const id = await deps.db.$transaction(async (tx) => {
      const s = await tx.gatewayStatement.create({
        data: { storeId, provider: d.provider, periodFrom: d.periodFrom, periodTo: d.periodTo, status: 'IMPORTED', reference: d.reference, fileHash, importedById: who.actor.staffUserId, totalMinor: total, feesMinor: fees },
        select: { id: true },
      });
      const trx = [...new Set(lines.filter((l) => l.kind === 'PAYMENT').map((l) => l.trxId))];
      const payments = await tx.payment.findMany({ where: { storeId, provider: d.provider, providerTrxId: { in: trx } }, select: { id: true, status: true, amountMinor: true, receivedMinor: true, providerTrxId: true, moneyStatus: true } });
      const byTrx = new Map(payments.map((p) => [p.providerTrxId!, p]));
      const onStatement = new Set(
        (await tx.gatewayStatementLine.findMany({ where: { storeId, kind: 'PAYMENT', matchedPaymentId: { in: payments.map((p) => p.id) } }, select: { matchedPaymentId: true } })).map((x) => x.matchedPaymentId!),
      );
      const refs = [...new Set(lines.filter((l) => l.kind === 'REFUND').map((l) => refOf(l.trxId)))];
      const refunds = refs.length ? await tx.refund.findMany({ where: { storeId, status: 'COMPLETED', payoutReference: { in: refs } }, select: { amountMinor: true, payoutReference: true } }) : [];
      const refundOf = new Map(refunds.map((r) => [r.payoutReference!, r]));
      for (const l of lines) {
        const p = l.kind === 'PAYMENT' ? (byTrx.get(l.trxId) ?? null) : null;
        const m = matchGatewayLine(l, { payment: p, alreadyOnStatement: !!p && onStatement.has(p.id), refund: l.kind === 'REFUND' ? (refundOf.get(refOf(l.trxId)) ?? null) : null, toleranceMinor: format.toleranceMinor });
        // a second line for a payment keeps no payment (one statement line per payment)
        const keeps = !!p && !onStatement.has(p.id);
        await tx.gatewayStatementLine.create({
          data: { storeId, statementId: s.id, lineNo: l.lineNo, kind: l.kind, providerTrxId: l.trxId, amountMinor: l.amountMinor, feeMinor: l.feeMinor, occurredAt: l.occurredAt, matchedPaymentId: keeps ? p!.id : null, matchStatus: m.matchStatus, expectedMinor: m.expectedMinor, reasonCode: m.reasonCode },
        });
        if (keeps) onStatement.add(p!.id);
        if (keeps && m.matchStatus === 'MATCHED')
          await tx.payment.update({ where: { id: p!.id }, data: { moneyStatus: moneyForward((p!.moneyStatus as MoneyStatus | null) ?? null, 'RECONCILED'), reconciledAt: now, ...(l.feeMinor !== null ? { gatewayFeeMinor: l.feeMinor } : {}) } });
      }
      await auditMoney(tx, who, 'gateway.statement.import', 'GatewayStatement', s.id, undefined, { provider: d.provider, reference: d.reference, lines: lines.length, totalMinor: total, feesMinor: fees, fileHash });
      return s.id;
    }, TX);
    return statementSummary(deps, storeId, id, false);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await deps.db.gatewayStatement.findFirst({ where: { storeId, provider: d.provider, fileHash }, select: { id: true } });
      if (again) return statementSummary(deps, storeId, again.id, true);
      throw new PaymentsError('DUPLICATE_REFERENCE', 'a statement with this reference is already imported', ['reference']);
    }
    throw e;
  }
}

/** One imported gateway statement with its lines and their reason words (`payments.view`). */
export async function getGatewayStatement(deps: PaymentsDeps, who: Who, statementId: string): Promise<GatewayStatementSummary | null> {
  await allow(deps, who, 'payments.view');
  if (!UUID.test(statementId)) return null;
  const s = await deps.db.gatewayStatement.findFirst({ where: { id: statementId, storeId: who.storeId }, select: { id: true } });
  return s ? statementSummary(deps, who.storeId, s.id, false) : null;
}

export const resolveGatewayLineSchema = z.object({ note: z.string().trim().min(3).max(2_000) }).strict();

/** Marks a checked statement mismatch resolved with the person's note (its payment's money then counts as reconciled). */
export async function resolveGatewayLine(deps: PaymentsDeps, who: Who, lineId: string, input: unknown): Promise<GatewayLineOut> {
  await allow(deps, who, 'payments.settle');
  if (!UUID.test(lineId)) throw new PaymentsError('NOT_FOUND', 'no such statement line', ['lineId']);
  const d = parse(resolveGatewayLineSchema, input, 'resolution');
  const storeId = who.storeId;
  const now = nowOf(deps);
  const words = await statementWords(deps, storeId);
  return deps.db.$transaction(async (tx) => {
    const l = await tx.gatewayStatementLine.findFirst({ where: { id: lineId, storeId }, select: LINE_SELECT });
    if (!l) throw new PaymentsError('NOT_FOUND', 'no such statement line', ['lineId']);
    if (l.matchStatus === 'MATCHED') throw new PaymentsError('NOT_PENDING', 'this line matches; there is nothing to resolve');
    if (l.resolvedAt) throw new PaymentsError('ALREADY_RECORDED', 'this line is already resolved');
    const after = await tx.gatewayStatementLine.update({ where: { id: l.id }, data: { resolvedAt: now, resolvedById: who.actor.staffUserId, resolutionNote: d.note }, select: LINE_SELECT });
    if (l.matchedPaymentId) {
      const p = await tx.payment.findUniqueOrThrow({ where: { id: l.matchedPaymentId }, select: { moneyStatus: true } });
      await tx.payment.update({ where: { id: l.matchedPaymentId }, data: { moneyStatus: moneyForward((p.moneyStatus as MoneyStatus | null) ?? null, 'RECONCILED'), reconciledAt: now } });
    }
    await auditMoney(tx, who, 'gateway.statement.line.resolve', 'GatewayStatementLine', l.id, { matchStatus: l.matchStatus, reasonCode: l.reasonCode }, { note: d.note });
    return lineOut(after, words);
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// The practice gateway's statement
// ---------------------------------------------------------------------------------------------------------------------

export const practiceInputSchema = z
  .object({ provider: z.string().regex(PROVIDER), from: z.coerce.date(), to: z.coerce.date() })
  .strict()
  .refine((v) => v.to.getTime() > v.from.getTime(), { message: 'the period ends before it starts', path: ['to'] });

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const major = (minor: number) => `${Math.trunc(minor / 100)}.${String(Math.abs(minor) % 100).padStart(2, '0')}`; // hardcode-ok: poisha in a taka

/**
 * The statement the practice gateway gives for a period (see the file header): one line per paid practice payment of
 * that provider, in the owner's own column names, so it imports as a real one would. Refused once the provider runs on
 * a real gateway, or while test payments are off.
 */
export async function practiceStatement(deps: PaymentsDeps, who: Who, input: unknown): Promise<{ provider: string; csv: string; lines: number }> {
  await allow(deps, who, 'payments.settle');
  const d = parse(practiceInputSchema, input, 'practice statement');
  const storeId = who.storeId;
  if (!deps.gateways) throw new PaymentsError('GATEWAY_ERROR', 'no payment gateway is wired here');
  const gw = await deps.gateways(storeId, d.provider);
  if (gw.mode !== 'MOCK' || !(await setting(deps, storeId, 'payments.testPayments'))) throw new PaymentsError('TEST_PAYMENTS_OFF', 'a practice statement exists only on the practice gateway while test payments are on');
  const f = await setting(deps, storeId, 'payments.statement');
  const paid = await deps.db.payment.findMany({
    where: { storeId, provider: d.provider, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, providerTrxId: { not: null }, paidAt: { gte: d.from, lt: d.to } },
    orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    select: { providerTrxId: true, amountMinor: true, receivedMinor: true, gatewayFeeMinor: true, paidAt: true },
    take: 20_000,
  });
  const head = [f.columns.trx[0]!, f.columns.amount[0]!, f.columns.fee[0] ?? null, f.columns.date[0] ?? null].filter((x): x is string => x !== null);
  const rows = paid.map((p) => {
    const cells = [p.providerTrxId!, major(p.receivedMinor ?? p.amountMinor)];
    if (f.columns.fee[0]) cells.push(p.gatewayFeeMinor === null ? '' : major(p.gatewayFeeMinor));
    if (f.columns.date[0]) cells.push(p.paidAt!.toISOString());
    return cells.map(csvCell).join(',');
  });
  return { provider: d.provider, csv: [head.map(csvCell).join(','), ...rows].join('\n') + '\n', lines: rows.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// The reconciliation report
// ---------------------------------------------------------------------------------------------------------------------

export const reportInputSchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .strict()
  .refine((v) => v.to.getTime() > v.from.getTime(), { message: 'the period ends before it starts', path: ['to'] });

/** One gateway's money in the period: ours against its statements. */
export interface GatewayReconciliation {
  provider: string;
  ourCount: number;
  ourReceivedMinor: number;
  statementLines: number;
  statementInMinor: number;
  statementBackMinor: number;
  feesMinor: number;
  /** The statements' money in − ours (0 when every payment is on a statement and the amounts agree). */
  differenceMinor: number;
  openMismatches: number;
}

/** Where an open mismatch comes from. */
export type MismatchSource = 'GATEWAY_LINE' | 'COD_LINE' | 'PAYMENT' | 'MISSING';

/** One open mismatch, always with its reason code and the owner's words for it (SIM-F-028). */
export interface OpenMismatch {
  source: MismatchSource;
  id: string;
  reasonCode: string | null;
  words: Words | null;
  amountMinor: number | null;
  expectedMinor: number | null;
  orderId: string | null;
  /** The gateway (provider) or the courier account. */
  party: string | null;
  at: Date | null;
}

export interface ReconciliationReport {
  period: { from: Date; to: Date };
  gateways: GatewayReconciliation[];
  /** Every open mismatch, newest first, with its reason. */
  mismatches: OpenMismatch[];
  /** By source and reason code. */
  byReason: Partial<Record<MismatchSource, Record<string, number>>>;
  /** SIM-F-028 — open mismatches without a reason code or its words (always 0; the acceptance test checks it). */
  unexplained: number;
  cod: { totalInTransitMinor: number; missingParcels: number; partialsWaiting: number };
  /** F-041 — the money owed to customers. */
  refunds: OwedFigure;
  /** SIM-F-041 — cancelled or returned orders still holding the customer's money with no refund asked. */
  owedNotAsked: OwedNotAsked[];
  /** The wallet ledger check: every wallet's balance against its entries. */
  wallets: { checked: number; drift: WalletDrift[] };
}

/** The reconciliation report for a period (see the file header). */
export async function reconciliationReport(deps: PaymentsDeps, who: Who, input: unknown): Promise<ReconciliationReport> {
  await allow(deps, who, 'payments.view');
  const d = parse(reportInputSchema, input, 'period');
  const storeId = who.storeId;
  const period = { from: d.from, to: d.to };
  const now = nowOf(deps);
  const [format, sWords, pWords, received, statements, gwLines, codLines, paymentRows, position, owed, notAsked, wallets] = await Promise.all([
    setting(deps, storeId, 'payments.statement'),
    statementWords(deps, storeId),
    reasonWords(deps, storeId),
    paymentsReceived(deps.db, storeId, period),
    statementTotals(deps.db, storeId, period),
    deps.db.gatewayStatementLine.findMany({
      where: { storeId, matchStatus: 'MISMATCH', resolvedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: { id: true, reasonCode: true, amountMinor: true, expectedMinor: true, occurredAt: true, createdAt: true, statement: { select: { provider: true } }, matchedPaymentId: true },
    }),
    deps.db.courierSettlementLine.findMany({
      where: { storeId, matchState: 'MISMATCH', resolvedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: { id: true, reasonCode: true, codMinor: true, expectedMinor: true, orderId: true, createdAt: true, settlement: { select: { courierAccountId: true } } },
    }),
    deps.db.payment.findMany({
      where: { storeId, mismatchReason: { not: null }, paidAt: { gte: d.from, lt: d.to } },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: { id: true, mismatchReason: true, amountMinor: true, receivedMinor: true, orderId: true, provider: true, paidAt: true },
    }),
    codPosition(deps, who),
    owedToCustomers(deps.db, storeId),
    owedNotAsked(deps.db, storeId, LIST_LIMIT),
    walletDrift(deps.db, storeId),
  ]);
  // the payments a gateway's statement should show by now and does not
  const missing: OpenMismatch[] = [];
  if (format.missingAfterDays > 0) {
    const cutoff = new Date(now.getTime() - format.missingAfterDays * DAY);
    const due = await deps.db.payment.findMany({
      where: { storeId, provider: { not: null }, method: { notIn: ['COD', 'WALLET', 'CASH', 'BANK_TRANSFER'] }, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paidAt: { gte: d.from, lt: d.to.getTime() < cutoff.getTime() ? d.to : cutoff } },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: 20_000,
      select: { id: true, provider: true, amountMinor: true, receivedMinor: true, orderId: true, paidAt: true },
    });
    const listed = new Set((await deps.db.gatewayStatementLine.findMany({ where: { storeId, kind: 'PAYMENT', matchedPaymentId: { in: due.map((p) => p.id) } }, select: { matchedPaymentId: true } })).map((x) => x.matchedPaymentId!));
    for (const p of due) {
      if (listed.has(p.id) || missing.length >= LIST_LIMIT) continue;
      missing.push({ source: 'MISSING', id: p.id, reasonCode: 'MISSING', words: sWords.get('MISSING') ?? null, amountMinor: null, expectedMinor: p.receivedMinor ?? p.amountMinor, orderId: p.orderId, party: p.provider, at: p.paidAt });
    }
  }
  const mismatches: OpenMismatch[] = [
    ...gwLines.map((l) => ({ source: 'GATEWAY_LINE' as const, id: l.id, reasonCode: l.reasonCode, words: l.reasonCode ? (sWords.get(l.reasonCode) ?? null) : null, amountMinor: l.amountMinor, expectedMinor: l.expectedMinor, orderId: null, party: l.statement.provider, at: l.occurredAt ?? l.createdAt })),
    ...codLines.map((l) => ({ source: 'COD_LINE' as const, id: l.id, reasonCode: l.reasonCode, words: l.reasonCode ? (pWords.get(l.reasonCode) ?? null) : null, amountMinor: l.codMinor, expectedMinor: l.expectedMinor, orderId: l.orderId, party: l.settlement.courierAccountId, at: l.createdAt })),
    ...paymentRows.map((p) => ({ source: 'PAYMENT' as const, id: p.id, reasonCode: p.mismatchReason, words: p.mismatchReason ? (pWords.get(p.mismatchReason) ?? null) : null, amountMinor: p.receivedMinor, expectedMinor: p.amountMinor, orderId: p.orderId, party: p.provider, at: p.paidAt })),
    ...missing,
  ].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  const byReason: ReconciliationReport['byReason'] = {};
  for (const m of mismatches) {
    const r = (byReason[m.source] ??= {});
    const k = m.reasonCode ?? 'NONE';
    r[k] = (r[k] ?? 0) + 1;
  }
  // the open statement mismatches of each gateway
  const open = new Map<string, number>();
  for (const l of gwLines) open.set(l.statement.provider, (open.get(l.statement.provider) ?? 0) + 1);
  const providers = [...new Set([...received.map((r) => r.provider), ...statements.map((s) => s.provider)])].sort();
  const gateways = providers.map((provider) => {
    const ours = received.find((r) => r.provider === provider);
    const st = statements.find((s) => s.provider === provider);
    const ourReceivedMinor = ours?.receivedMinor ?? 0;
    const statementInMinor = st?.inMinor ?? 0;
    return {
      provider,
      ourCount: ours?.count ?? 0,
      ourReceivedMinor,
      statementLines: st?.lines ?? 0,
      statementInMinor,
      statementBackMinor: st?.backMinor ?? 0,
      feesMinor: st?.feesMinor ?? 0,
      differenceMinor: statementInMinor - ourReceivedMinor,
      openMismatches: open.get(provider) ?? 0,
    };
  });
  return {
    period,
    gateways,
    mismatches,
    byReason,
    unexplained: mismatches.filter((m) => !m.reasonCode || !m.words).length,
    cod: { totalInTransitMinor: position.totalInTransitMinor, missingParcels: position.missing.length, partialsWaiting: position.partialsWaiting },
    refunds: owed,
    owedNotAsked: notAsked,
    wallets,
  };
}
