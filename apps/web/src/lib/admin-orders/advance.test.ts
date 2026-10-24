// S06 · PR 542 — "Request advance" on the order page: every word in both admin languages; only with the key and only
// when the order service has the command open; the risk level's proposal first (and as the primary button's tone);
// kinds that cannot be asked left out of the list; "Send again" only with a link; the waiting band and the timeline line;
// the Risk rules card's words, and auto with no way ticked refused before it is sent.
import { describe, expect, it } from 'vitest';
import type { AdvanceRequestView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { advanceBand, advanceSpecs, advanceSummary } from './advance';
import { advanceCardTexts, advanceDraftProblem, sameAdvance } from './advance-card';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const O = { id: '01a16af2-30f0-7462-aab8-719bb3ce5542', number: 'S-1042', version: 3, currency: 'BDT' };
const ADV: AdvanceRequestView = {
  amounts: { delivery: { ok: false, code: 'NO_CHARGE' }, partial: { ok: false, code: 'PARTIAL_UNSET' }, full: { ok: true, amountMinor: 250_000 }, codOff: { ok: true, amountMinor: 250_000 } },
  proposed: 'full',
  defaultKind: 'full',
  channels: ['SMS', 'CALL'],
  messagesOn: true,
  provider: 'bkash',
  waitHours: 0,
  auto: false,
  currency: 'BDT',
  link: null,
};
const PERMS = new Set(['orders.advance.request']);
const words = (s: unknown): string[] => (typeof s === 'string' ? [s] : Array.isArray(s) ? s.flatMap(words) : s && typeof s === 'object' ? Object.values(s).flatMap(words) : []);

describe('PR 542 · Request advance on the order page', () => {
  it('every word in both languages; the proposal first; kinds that cannot be asked are left out', () => {
    for (const lang of ['en', 'bn'] as const) {
      const { request, resend } = advanceSpecs(view(lang), O, ADV, ['awaitAdvance', 'hold'], PERMS);
      expect(resend).toBeNull();
      expect(request).toMatchObject({ id: 'advanceRequest', tone: 'pri', url: `/api/admin/orders/${O.id}/advance/request`, version: 3 });
      for (const w of words(request)) expect(w, lang).not.toMatch(/^orders\.|\{[a-z]+\}/);
      const kind = request!.fields.find((x) => x.name === 'kind')!;
      expect(kind.options!.map((x) => x.value)).toEqual(['full', 'codOff']);
      expect(kind.value).toBe('full');
      expect(request!.fields.find((x) => x.name === 'channels')).toMatchObject({ kind: 'checks', value: ['SMS', 'CALL'] });
    }
    expect(advanceSpecs(view('en'), O, ADV, ['awaitAdvance'], PERMS).request!.fields[0]!.options![0]!.label).toContain('2,500');
  });

  it('only with the key, only when the command is open, and "Send again" only with a link', () => {
    expect(advanceSpecs(view('en'), O, ADV, ['awaitAdvance'], new Set(['orders.read']))).toEqual({ request: null, resend: null });
    expect(advanceSpecs(view('en'), O, ADV, ['hold'], PERMS).request).toBeNull();
    expect(advanceSpecs(view('en'), O, { ...ADV, proposed: null }, ['awaitAdvance'], PERMS).request!.tone).toBeUndefined();
    const link = { token: 't'.repeat(24), path: `/pay/${'t'.repeat(24)}`, paymentId: 'p', amountMinor: 250_000, currency: 'BDT', status: 'INITIATED', attempt: 1, kind: 'full' as const, createdAt: new Date() };
    const waiting = advanceSpecs(view('bn'), O, { ...ADV, link }, ['advanceResend'], PERMS);
    expect(waiting.request).toBeNull();
    expect(waiting.resend).toMatchObject({ id: 'advanceResend', url: `/api/admin/orders/${O.id}/advance/resend` });
    const band = advanceBand(view('bn'), { ...ADV, link }, 'AWAITING_ADVANCE', 'BDT')!;
    expect(band).toContain(link.path);
    expect(band).not.toMatch(/orders\.|\{/);
    expect(advanceBand(view('en'), { ...ADV, link }, 'PLACED', 'BDT')).toBeNull();
  });

  it('the timeline line says what was asked and by which ways', () => {
    expect(advanceSummary(view('en'), 'order.awaitAdvance', { request: true, kind: 'delivery', amountMinor: 12_000, channels: ['SMS', 'CALL'] }, 'BDT')).toMatch(/120.*delivery charge.*SMS, Call/);
    expect(advanceSummary(view('bn'), 'order.advanceResend', { resend: true, channels: ['WHATSAPP'], newTry: true }, 'BDT')).toContain('WhatsApp');
    expect(advanceSummary(view('en'), 'order.awaitAdvance', { requiredMinor: 100 }, 'BDT')).toBeNull();
  });

  it('the Risk rules card: every word in both languages; auto with no way ticked is refused before it is sent', () => {
    for (const lang of ['en', 'bn'] as const) {
      const x = advanceCardTexts(view(lang), ['bkash', 'nagad', 'rocket', 'upay', 'online']);
      for (const w of words(x)) expect(w, lang).not.toMatch(/^orders\.|\{[a-z]+\}/);
      expect(Object.keys(x.prov)).toHaveLength(5);
    }
    const v = { auto: true, channels: { SMS: false, WHATSAPP: false, CALL: false }, provider: 'bkash' as const, template: 'order.advanceRequest' };
    expect(advanceDraftProblem(v)).toBe('noChannel');
    expect(advanceDraftProblem({ ...v, auto: false })).toBeNull();
    expect(advanceDraftProblem({ ...v, channels: { ...v.channels, CALL: true } })).toBeNull();
    expect(sameAdvance(v, { ...v })).toBe(true);
  });
});
