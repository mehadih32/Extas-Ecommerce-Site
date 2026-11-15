// PR 846 — Settings › Data & privacy: "Everything (one ZIP)" is a live Export button for the owner (it asks the PIN; no "use Backups"
// line any more) and "How long things are kept" carries the days to answer a customer request.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-privacy.bn.json';
import en from '../../../../messages/admin-privacy.en.json';
import { PrivacyBoard, type PrivacyBoardProps } from './PrivacyBoard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const flat = (o: unknown, p = ''): Record<string, string> =>
  Object.fromEntries(Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(flat(v, `${p}${k}.`)) : typeof v === 'string' ? [[`${p}${k}`, v]] : [])));

const props = (m: unknown, over: Partial<PrivacyBoardProps> = {}): PrivacyBoardProps => ({
  w: flat(m),
  chips: ['Keys'],
  keep: { media: 24, chat: 12 },
  answerDays: 30,
  answerMax: 365,
  mediaOptions: [12, 24, 60],
  chatOptions: [6, 12, 24],
  canEdit: true,
  isOwner: true,
  importHref: '/admin/customers/import',
  freshHref: null,
  today: '2026-11-15',
  ...over,
});

describe('PrivacyBoard (PR 846)', () => {
  it('has a live Everything (one ZIP) export for the owner and the days to answer in the keep card', () => {
    const html = renderToStaticMarkup(<PrivacyBoard {...props(en)} />);
    expect(html).toContain('Everything (one ZIP)');
    expect(html).not.toContain('Use Backups &amp; restore for a full copy');
    expect(html).toMatch(/data-testid="privacy-export-all"(?![^>]*disabled)/);
    expect(html).toContain('Answer a customer request within (days)');
    expect(html).toContain('value="30"');
  });
  it('keeps the ZIP button off for someone who is not the owner, and has Bengali words', () => {
    const html = renderToStaticMarkup(<PrivacyBoard {...props(bn, { isOwner: false })} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="privacy-export-all"|data-testid="privacy-export-all"[^>]*disabled/);
    expect(html).toContain('সব কিছু (একটা ZIP)');
    expect(html).toContain('কাস্টমারের অনুরোধের উত্তর কত দিনের মধ্যে');
  });
});
