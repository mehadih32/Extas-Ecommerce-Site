// PR 841 — Settings › Roles as the prototype draws it (m-settings.js Team & roles): one card "What each role can open" with a chip per
// role and a New role chip, the owner line, the tick hint, Undo and Save changes; the owner's role is locked; a person who may not manage
// sees no New role chip and no Save. Both languages have every word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-people.bn.json';
import en from '../../../../messages/admin-people.en.json';
import type { Dict } from '@/lib/i18n';
import { RolesScreen } from './RolesScreen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const L = { en: 'Orders', bn: 'অর্ডার' };
const view = {
  roles: [
    { id: 'r1', key: 'owner', nameEn: 'Owner', nameBn: 'মালিক', descriptionEn: null, descriptionBn: null, isSystem: true, isOwner: true, archived: false, permissions: ['orders.read'], people: 1 },
    { id: 'r2', key: 'om', nameEn: 'Order manager', nameBn: 'অর্ডার ম্যানেজার', descriptionEn: null, descriptionBn: null, isSystem: false, isOwner: false, archived: false, permissions: ['orders.read'], people: 2 },
  ],
  tree: [{ group: 'orders', label: L, keys: [{ key: 'orders.read', label: L }, { key: 'orders.write', label: L }] }],
};

describe('RolesScreen (PR 841)', () => {
  it('draws one card with the role chips, the New role chip, the owner line and the tick hint', () => {
    const html = renderToStaticMarkup(<RolesScreen dict={en as unknown as Dict} lang="en" view={view as never} canManage />);
    expect(html).toContain('What each role can open');
    expect(html).toContain('data-testid="rl-new-chip"');
    expect(html).toContain('New role');
    expect(html).toContain('Owner can always do everything');
    expect(html).toContain('Tick a section to give all its pages; a half box means some pages only.');
    expect(html).toContain('Settings › System');
  });
  it('keeps the owner role locked and shows no Save for it', () => {
    const html = renderToStaticMarkup(<RolesScreen dict={en as unknown as Dict} lang="en" view={view as never} canManage />);
    expect(html).not.toContain('data-testid="rl-save"');
    expect(html).toContain('disabled');
  });
  it('shows no New role chip to someone who may not manage roles', () => {
    const html = renderToStaticMarkup(<RolesScreen dict={bn as unknown as Dict} lang="bn" view={view as never} canManage={false} />);
    expect(html).not.toContain('rl-new-chip');
    expect(html).toContain('কোন রোল কী খুলতে পারে');
  });
  it('has Back to default beside Undo and Save for a role that can be changed, not for the owner role or a viewer', () => {
    const open = { ...view, roles: [view.roles[1], view.roles[0]] };
    const some = renderToStaticMarkup(<RolesScreen dict={en as unknown as Dict} lang="en" view={open as never} canManage />);
    expect(some).toContain('data-testid="rl-def"');
    expect(some).toContain('Back to default');
    expect(renderToStaticMarkup(<RolesScreen dict={en as unknown as Dict} lang="en" view={view as never} canManage />)).not.toContain('rl-def');
    expect(renderToStaticMarkup(<RolesScreen dict={en as unknown as Dict} lang="en" view={open as never} canManage={false} />)).not.toContain('rl-def');
  });
  it('has the same words in both languages', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});
