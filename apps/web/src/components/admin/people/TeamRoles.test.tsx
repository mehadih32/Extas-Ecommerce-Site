// PR 1020 (D12) — Settings › Team & roles as the prototype draws it, on the one page: the 2-step warning, the Staff table (Name, Role,
// 2-step login, Last active, Activity ›), the role tree with Special permissions, Staff limits (Max discount, Can export, Hide phone &
// address) and the End-of-day handover table with Record and the download; the real extras sit under "More options". Both
// languages have every new word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-people.bn.json';
import en from '../../../../messages/admin-people.en.json';
import scBn from '../../../../messages/admin-staff-controls.bn.json';
import scEn from '../../../../messages/admin-staff-controls.en.json';
import type { Dict } from '@/lib/i18n';
import { PeopleScreen } from './PeopleScreen';
import { RolesScreen, SPECIAL_PERMISSIONS } from './RolesScreen';
import { StaffControlsScreen } from '../staff/StaffControlsScreen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a> }));

const dict = (l: 'en' | 'bn') => ({ people: (l === 'en' ? en : bn).people, staffControls: (l === 'en' ? scEn : scBn).staffControls }) as unknown as Dict;
const now = Date.parse('2026-11-16T12:00:00Z');
const role = (id: string, key: string, nameEn: string) => ({ id, key, nameEn, nameBn: nameEn, isOwner: key === 'owner' });
const people = {
  people: [
    { id: 'u1', email: 'owner@x.bd', name: 'Mehadi', status: 'ACTIVE', twoFactor: true, lastLoginAt: '2026-11-16T11:55:00Z', createdAt: '', mustChangePassword: false, roles: [{ assignmentId: 'a1', roleId: 'r1', key: 'owner', nameEn: 'Owner', nameBn: 'Owner', storeId: null }] },
    { id: 'u2', email: 'nusrat@x.bd', name: 'Nusrat', status: 'ACTIVE', twoFactor: false, lastLoginAt: null, createdAt: '', mustChangePassword: false, roles: [{ assignmentId: 'a2', roleId: 'r2', key: 'care', nameEn: 'Customer care', nameBn: 'Customer care', storeId: null }] },
    { id: 'u3', email: 'sohel@x.bd', name: 'Sohel', status: 'SUSPENDED', twoFactor: true, lastLoginAt: null, createdAt: '', mustChangePassword: false, roles: [] },
  ],
  roles: [role('r1', 'owner', 'Owner'), role('r2', 'care', 'Customer care')],
  counts: { active: 2, suspended: 1, archived: 0, noTwoFactor: 1 },
};

describe('Team & roles (PR 1020)', () => {
  it('draws the 2-step warning and the Staff table in the prototype\'s words', () => {
    const html = renderToStaticMarkup(<PeopleScreen dict={dict('en')} lang="en" view={people as never} canManage me="u1" now={now} />);
    expect(html).toContain('Nusrat</b> sign in with a password only. Turn on 2-step login in Security.');
    for (const w of ['Staff', 'Name', 'Role', '2-step login', 'Last active', 'Activity ›', 'Access off']) expect(html).toContain(w);
    expect(html).toContain('5 min ago');
    expect(html).toContain('More options');
    expect(html).toContain('data-testid="pp-more"');
  });
  it('draws Special permissions as shortcuts onto real keys, and keeps archive under More options', () => {
    const view = { roles: [{ id: 'r2', key: 'care', nameEn: 'Customer care', nameBn: 'Customer care', descriptionEn: null, descriptionBn: null, isSystem: false, isOwner: false, archived: false, permissions: ['books.read'], people: 1 }], tree: [{ group: 'books', label: { en: 'Money', bn: 'Money' }, keys: [{ key: 'books.read', label: { en: 'x', bn: 'x' } }, { key: 'payments.record', label: { en: 'y', bn: 'y' } }] }] };
    const html = renderToStaticMarkup(<RolesScreen dict={dict('en')} lang="en" view={view as never} canManage />);
    expect(html).toContain('Special permissions');
    expect(html).toContain('See buying price &amp; profit');
    expect(html).toContain('data-special="cost"');
    expect(html).toContain('data-testid="rl-more"');
    expect(SPECIAL_PERMISSIONS.flatMap((s) => s.keys)).toEqual(['books.read', 'payments.record', 'cash.record', 'customers.export', 'payments.refunds.request']);
  });
  it('draws Staff limits and the handover table as the prototype does', () => {
    const view = { roles: [{ id: 'r2', key: 'care', nameEn: 'Customer care', nameBn: 'Customer care', people: 1, limit: { maxDiscountMinor: null, maxDiscountPct: 5, hideContact: false }, exports: { 'orders.export': true, 'orders.exportPersonal': false, 'catalogue.export': false, 'customers.export': false } }], handover: { enabled: true, time: '21:30' }, packerPreset: [], hasPackerRole: false };
    const desk = [{ id: 'u2', name: 'Nusrat', roleName: 'Customer care', expectedCash: 130000, expectedWallet: 100, got: { CASH: null, WALLET: null } }];
    const html = renderToStaticMarkup(<StaffControlsScreen dict={dict('en')} money={{ code: 'BDT', digits: 2, symbol: '৳', locale: 'en' } as never} view={view as never} canEdit canMakeRole canManage day="2026-11-16" today="2026-11-16" sheet={{ rows: [], names: {} }} desk={desk} exportKeys={['orders.export', 'orders.exportPersonal', 'catalogue.export', 'customers.export']} />);
    for (const w of ['Staff limits', 'Max discount', 'Can export', 'Hide phone &amp; address', 'Save limits', 'End-of-day cash &amp; bKash handover', 'Ask each desk staff for a handover sheet at 21:30', 'Expected', 'Handed over', 'Record', 'Download today&#x27;s sheet', 'More options']) expect(html, w).toContain(w);
    expect(html).toContain('data-testid="handover-rec-u2"');
    expect(html).toContain('data-testid="packer-card"');
  });
  it('has every new word in both languages', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    expect(keys(scBn).sort()).toEqual(keys(scEn).sort());
  });
});
