// S28 · PR 688 (admin prototype v5, Finance) — the Money section is the prototype's Finance: seven tabs (Overview, Money in & out,
// Profit & loss, Costs & budgets, ERP account, Wallet & refunds, VAT); the Couriers tab (PR 670, Courier 360's money) sits beside Wallet & refunds. VAT shows only
// while the VAT system is on. Every page that was reachable stays reachable (nothing is deleted).
import { describe, expect, it } from 'vitest';
import { hiddenPartsOf } from '../stages/closed';
import { SHELL_SECTIONS, locate, sectionById, sectionHome, visibleTabs, type ShellViewer } from './sections';

const money = sectionById('money')!;
const OWNER = (hidden: string[] = []): ShellViewer => ({ perms: new Set(), owner: true, hidden: new Set(hidden) });
const resolver = (vat: unknown) => ({ value: async (k: string) => (k === 'vat.system' ? vat : {}) }) as never;

describe('Finance tabs', () => {
  it('opens on Overview and has the prototype tabs in order, VAT hidden while it is off', () => {
    expect(visibleTabs(money, OWNER(['money.vat'])).map((t) => t.id)).toEqual(['overview', 'cash', 'profit', 'costs', 'erp', 'refunds', 'couriers']);
    expect(visibleTabs(money, OWNER()).map((t) => t.id)).toEqual(['overview', 'cash', 'profit', 'costs', 'erp', 'refunds', 'couriers', 'vat']);
    expect(sectionHome(money, OWNER())).toBe('/admin/money');
  });
  it('every old address still belongs to a tab', () => {
    const want: Record<string, string> = {
      '/admin/money/books': 'erp', '/admin/money/books/match': 'erp', '/admin/money/books/differences': 'erp', '/admin/money/books/closes': 'erp', '/admin/money/books/daily': 'erp', '/admin/money/month-end': 'erp',
      '/admin/money/budgets': 'costs', '/admin/money/costs': 'costs', '/admin/money/expenses': 'costs', '/admin/money/fees': 'costs', '/admin/money/cost-ledger': 'costs', '/admin/money/cost-ledger/report': 'costs',
      '/admin/money/cash': 'cash', '/admin/money/profit/groups': 'profit', '/admin/money/refunds': 'refunds', '/admin/money/couriers': 'couriers', '/admin/money/vat': 'vat',
    };
    for (const [href, tab] of Object.entries(want)) expect(locate(href)?.tab?.id, href).toBe(tab);
    expect(SHELL_SECTIONS.filter((s) => s.id === 'money')).toHaveLength(1);
  });
  it('the VAT tab is hidden by the settings switch: off (or unreadable) hides it, on shows it', async () => {
    expect((await hiddenPartsOf({ resolver: resolver({ enabled: false, onDelivery: false }) })).has('money.vat')).toBe(true);
    expect((await hiddenPartsOf({ resolver: resolver(null) })).has('money.vat')).toBe(true);
    expect((await hiddenPartsOf({ resolver: resolver({ enabled: true, onDelivery: false }) })).has('money.vat')).toBe(false);
  });
});
