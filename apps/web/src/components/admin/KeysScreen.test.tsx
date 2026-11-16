// PR 1020 (D12) — Keys & connections as the prototype draws it: the warning, the three cards with the right counts, seven groups with
// the prototype's rows (masked key, status, "used … ago", Test / Replace / Add key), the real extras under "More options", and no
// button for a connection that has no code behind it. A person who may not write sees no buttons.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/admin.en.json';
import bn from '../../../messages/admin.bn.json';
import type { Dict } from '@/lib/i18n';
import type { ConnectionView } from '@/lib/integrations';
import { KeysScreen } from './KeysScreen';

vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a> }));

const now = Date.parse('2026-11-16T12:00:00Z');
const row = (id: string, o: Partial<ConnectionView> = {}): ConnectionView => ({ id, kind: 'X', adapter: true, builtIn: false, managedAt: null, secrets: [], config: [], keySaved: false, savedAt: null, integrationId: null, mode: null, enabled: false, inUse: false, lastTest: null, keyHint: null, ...o });
const ok = (id: string, hint: string | null = '7A2C') => row(id, { keySaved: true, enabled: true, mode: 'LIVE', keyHint: hint, lastTest: { at: '2026-11-16T11:51:00Z', ok: true, message: null } });
const rows = [ok('bkash'), row('nagad'), row('tiktokAds', { keySaved: true, mode: 'MOCK', lastTest: { at: '2026-11-13T12:00:00Z', ok: false, message: 'expired' } }), row('emailSending', { adapter: false }), row('cloudflare')];

describe('KeysScreen (PR 1020)', () => {
  const html = renderToStaticMarkup(<KeysScreen dict={en as unknown as Dict} initial={rows} canWrite vaultReady now={now} />);
  it('draws the warning and the three cards with the prototype\'s words and counts', () => {
    expect(html).toContain('Type keys only here.');
    expect(html).toContain('only the last 4 characters');
    expect(html).toMatch(/Working<\/div><div class="a2-kv">1</);
    expect(html).toMatch(/Need attention<\/div><div class="a2-kv">1</);
    expect(html).toMatch(/Not set up<\/div><div class="a2-kv">2</);
    expect(html).toContain('replace the key');
    expect(html).toContain('the shop hides these options');
  });
  it('draws the groups with the masked key, status, used-ago and the buttons', () => {
    for (const g of ['Payments', 'Messages', 'Ads &amp; Google']) expect(html).toContain(g);
    expect(html).toContain('••••7A2C');
    expect(html).toContain('used 9 min ago');
    expect(html).toContain('used 3 d ago');
    expect(html).toContain('>Test<');
    expect(html).toContain('>Replace<');
    expect(html).toContain('>Add key<');
    expect(html).toContain('No key yet');
    expect(html).toContain('Problem');
  });
  it('gives a connection with no code behind it no button, and keeps the extras under More options', () => {
    expect(html).toMatch(/data-connection="emailSending"[^]*?Comes later/);
    expect(html).toContain('data-testid="keys-more"');
    expect(html.indexOf('data-connection="cloudflare"')).toBeGreaterThan(html.indexOf('data-testid="keys-more"'));
    expect(html).toContain('Remove a saved key');
  });
  it('shows no buttons to someone who may not write, and speaks Bengali', () => {
    const view = renderToStaticMarkup(<KeysScreen dict={en as unknown as Dict} initial={rows} canWrite={false} vaultReady now={now} />);
    expect(view).not.toContain('>Add key<');
    expect(view).not.toContain('>Replace<');
    const b = renderToStaticMarkup(<KeysScreen dict={bn as unknown as Dict} initial={rows} canWrite vaultReady now={now} />);
    expect(b).toContain('কি দিন');
    expect(b).toContain('9 মিনিট আগে');
  });
});
