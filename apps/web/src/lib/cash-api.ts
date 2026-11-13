// S28 · PR 687 (admin prototype v5, Finance › Money in & out) — the cashbook's admin API. Every route signs the person in
// (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/inventory (cashbook.ts), which checks the permission again, asks for the owner's PIN on every record and writes the
// audit log. Answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details }`. Nothing here sends or pays money.
//
//   GET   /api/admin/money/cash          the page: accounts and balances, the month's money in and out, the newest movements and
//                                        the forecast with the cash couriers hold (`books.read`)
//   POST  /api/admin/money/cash          {action: 'record', kind, accountKey, toAccountKey?, amountMinor, day?, note?, requestKey,
//                                        pin} · {action: 'reverse', id, reason, pin} · {action: 'account', key, nameEn, nameBn?,
//                                        kind} — `cash.record`. Over the person's cash limit (`approvals.gates`) a record answers 202
//                                        {waiting, requestId} and writes nothing; once an approver answered, {action: 'apply',
//                                        requestId, pin} records it.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { requireAnyPermission } from '@extas/auth';
import * as inv from '@extas/inventory';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { moneyOverview } from './money-overview';
import { approvalAnswer, askApprover, cashGate } from './approval-gates';

const CASH_REQUEST = 'CashRequest';

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Everything the Money in & out page shows, for one store. */
export async function cashScreen(admin: AdminDeps, deps: inv.InventoryDeps, who: inv.Who, o: { limit?: number } = {}) {
  const timeZone = await admin.resolver.value('store.timeZone', {
    storeId: who.storeId,
  });
  const money = await moneyOverview(admin.db, who.storeId, (admin.now ?? (() => new Date()))(), timeZone);
  const [book, forecast] = await Promise.all([inv.cashbookView(deps, who, o), inv.cashbookForecast(deps, who, money.cod.minor)]);
  return { book, forecast, codHeldMinor: money.cod.minor };
}

export async function cashHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, m === 'GET' ? { permission: 'books.read', storeId } : { storeId });
  if (g instanceof Response) return g;
  try {
    const who: inv.Who = { actor: g.actor, storeId, ctx: g.ctx };
    const idep = await inventoryDeps(deps!);
    if (m === 'GET') return json({ ok: true, ...(await cashScreen(deps!, idep, who)) });
    await requireAnyPermission(deps!.db, g.actor, ['cash.record'], { storeId });
    const b = await body(request);
    if (b.action === 'record') {
      const { action: _a, ...input } = b;
      // PR 687 wired to the staff limits (702) and the approvals (703): over the person's cash limit the entry is NOT written (no balance
      // change); it waits as a request that an approver answers, and "apply" below records it with the approver's PIN.
      const amount = typeof input.amountMinor === 'number' ? input.amountMinor : 0;
      const verdict = await cashGate(deps!, g.actor.staffUserId ?? null, storeId, { amountMinor: amount });
      if (!verdict.apply) {
        const { pin: _pin, ...rest } = input as Record<string, unknown>;
        const requestId = crypto.randomUUID();
        const asked = await askApprover(deps!, storeId, 'cash', { source: 'money.cash', title: `Cash ${String(rest.kind ?? 'entry')}`, detail: JSON.stringify({ ...rest, requestKey: requestId }), amountMinor: amount, refType: CASH_REQUEST, refId: requestId });
        if (!asked.ok) return fail(400, asked.error);
        return json({ ok: true, waiting: true, requestId, reason: verdict.reason, limit: verdict.limit }, { status: 202 });
      }
      return json(
        {
          ok: true,
          ...(await inv.recordCash(idep, who, input as inv.RecordCashInput)),
        },
        { status: 201 },
      );
    }
    if (b.action === 'apply') {
      // an approved waiting request is recorded with the approver's own PIN, once (its request key is the request's id)
      if (!isUuid(b.requestId)) return fail(400, 'INVALID_INPUT', ['requestId']);
      const answer = await approvalAnswer(deps!.db, storeId, CASH_REQUEST, b.requestId);
      if (answer !== 'APPROVED') return fail(409, answer === null ? 'NOT_FOUND' : `REQUEST_${answer}`);
      const row = await deps!.db.approvalRequest.findFirst({ where: { storeId, refType: CASH_REQUEST, refId: b.requestId }, orderBy: { createdAt: 'desc' }, select: { detail: true } });
      let saved: Record<string, unknown>;
      try {
        saved = JSON.parse(row?.detail ?? '{}') as Record<string, unknown>;
      } catch {
        return fail(409, 'NOT_FOUND');
      }
      return json({ ok: true, ...(await inv.recordCash(idep, who, { ...saved, requestKey: b.requestId, pin: b.pin } as inv.RecordCashInput)) }, { status: 201 });
    }
    if (b.action === 'reverse') {
      if (!isUuid(b.id)) return fail(400, 'INVALID_INPUT', ['id']);
      return json(
        {
          ok: true,
          ...(await inv.reverseCash(idep, who, b.id, {
            reason: b.reason as string,
            pin: b.pin as string,
          })),
        },
        { status: 201 },
      );
    }
    if (b.action === 'account') {
      const { action: _a, ...input } = b;
      return json(
        {
          ok: true,
          account: await inv.addCashAccount(idep, who, input as inv.AddCashAccountInput),
        },
        { status: 201 },
      );
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
