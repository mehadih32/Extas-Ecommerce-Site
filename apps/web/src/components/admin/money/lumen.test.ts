// PR 642 (CN-036) — Money part 1 in the Lumen look: the "saved" / "done" lines of its screens go through the admin's one
// toast (components/admin/lumen/Toast.tsx), a refusal stays beside the card it is about, and nothing that touches money
// offers Undo: refunds keep their [confirm] tick and request key, cost lines and expenses are reversed with a reason, a
// fee, a rate or the money report saves only on a second "Confirm" press. The 11 pages and their no-access state carry
// data-lm-ready with the page's data-testid (the server's read-only smoke account sees the latter).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { undoAllowed } from '@/lib/admin-lumen/safety';

const here = join(__dirname, '..');
const app = join(__dirname, '../../../app/admin/money');
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const FILES = ['ChannelRulesCard', 'CostsScreen', 'ExpensesScreen', 'FeesScreen', 'MoneyReportCard', 'PrepaidCard', 'RefundActions', 'VatScreen', 'WalletTools'].map((f) => `money/${f}.tsx`);
const PAGES: [string, string][] = [
  ['page.tsx', 'money-overview'],
  ['expenses/page.tsx', 'expenses-page'],
  ['costs/page.tsx', 'costs-page'],
  ['cost-ledger/page.tsx', 'cost-ledger'],
  ['cost-ledger/report/page.tsx', 'cost-report'],
  ['fees/page.tsx', 'fees-page'],
  ['vat/page.tsx', 'vat-page'],
  ['refunds/page.tsx', 'refunds-page'],
  ['profit/page.tsx', 'money-profit'],
  ['profit/groups/page.tsx', 'profit-groups'],
  ['profit/channels/page.tsx', 'profit-channels'],
];

describe('Money part 1 speaks through the one toast, with no Undo', () => {
  it('every success line goes to showToast, none stays on the page (a receipt still uploading may)', () => {
    for (const f of FILES) {
      const s = read(f);
      expect(s, f).toContain('showToast');
      const rest = s.replace("setSaid({ text: c('entry.receiptAdding'), bad: false })", '');
      expect(rest, f).not.toMatch(/Said\(\{ text: .*, bad: false \}\)/);
      expect(s, f).not.toMatch(/undo\s*:\s*\{/);
    }
  });

  it('refunds, payouts and money stay guarded: confirm ticks and second presses are still there', () => {
    expect(undoAllowed('refund')).toBe(false);
    expect(undoAllowed('payout.received')).toBe(false);
    expect(undoAllowed('money')).toBe(false);
    const refunds = read('money/RefundActions.tsx');
    expect(refunds).toContain('confirm: true');
    expect(refunds).toContain('needsSure');
    expect(read('money/FeesScreen.tsx')).toContain("c('confirm')");
    expect(read('money/MoneyReportCard.tsx')).toContain("c('confirm')");
    expect(read('money/ChannelRulesCard.tsx')).toContain("c('confirm')");
    expect(read('money/ExpensesScreen.tsx')).toContain('REASON_REQUIRED');
    expect(read('money/CostsScreen.tsx')).toContain('REASON_REQUIRED');
  });

  it('each page and its no-access state carry the page testid and data-lm-ready', () => {
    for (const [f, id] of PAGES) {
      const s = readFileSync(join(app, f), 'utf8');
      const ready = s.match(new RegExp(`data-testid="${id}"[^>]*data-lm-ready=""`, 'g')) ?? [];
      expect(ready.length, f).toBe(2);
      expect(s, f).not.toMatch(/<div className="a2-z">\s*<ShellState/);
    }
  });
});
