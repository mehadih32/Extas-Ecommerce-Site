// PR 1064: the Processing card grid draws one card per order with its commands on the card, the call link, the flags and
// the pieces; a command the person may not use is simply not in the order's read, so it is not drawn.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OrderDetailView } from '@/lib/admin-orders/detail';
import type { CommandSpec } from '@/lib/admin-orders/spec';
import type { AdminView } from '@/lib/admin-page';
import { ProcessingCards } from './ProcessingCards';

const spec = (id: string, label: string): CommandSpec => ({ id, label, url: `/api/x/${id}`, version: 1, title: label, effects: [], fields: [], ok: label, okTone: 'pri', done: 'Done' });
const order = (n: string, over: Partial<OrderDetailView> = {}) =>
  ({
    id: `id-${n}`,
    number: n,
    name: `Sample ${n}`,
    total: '৳ 1,200',
    placed: '2 hours ago',
    contact: { phone: '01711000000', callHref: 'tel:01711000000', address: null, mapHref: null, email: null, customerHref: null, extra: [] },
    flags: [{ label: 'No answer', tone: 'warn', title: '' }],
    items: [{ id: 'i1', name: 'Polo', sub: 'Navy · M', qty: '× 2', total: '৳ 1,200', removed: false }],
    bands: [],
    money: { chip: { label: 'COD', tone: 'warn' }, rows: [], empty: '' },
    units: '2 pcs',
    primary: [spec('confirm', 'Confirm')],
    more: [spec('hold', 'Hold'), spec('cancel', 'Cancel')],
    ...over,
  }) as unknown as OrderDetailView;
const view = { dict: { orders: { detail: { call: 'Call' }, proc: { approve: 'Approve', askAdvance: 'Ask for advance', cancel: 'Cancel', more: 'More', pay: '{pay} · {units}' } } }, lang: 'en', locale: 'en-IN' } as unknown as AdminView;

describe('Processing cards (PR 1064)', () => {
  it('draws a card per order with its own commands, the call link, the flags and the pieces', () => {
    const html = renderToStaticMarkup(<ProcessingCards view={view} cards={[order('E-1001'), order('E-1002', { primary: [], more: [] })]} />);
    expect((html.match(/data-testid="processing-card"/g) ?? []).length).toBe(2);
    expect(html).toContain('E-1001');
    expect(html).toContain('Sample E-1002');
    expect(html).toContain('tel:01711000000');
    expect(html).toContain('Polo · Navy · M × 2');
    expect(html).toContain('No answer');
    // the first card has Approve and Cancel on the card (Hold under More); the second (no rights) has none of them
    expect((html.match(/data-testid="cmd-confirm"/g) ?? []).length).toBe(1);
    expect((html.match(/data-testid="cmd-cancel"/g) ?? []).length).toBe(1);
    expect(html).toContain('COD · 2 pcs');
  });

  it('PR 1120: the prototype row Approve, Ask for advance, No answer, Call, Cancel, then More', () => {
    const na = spec('noanswer-t1', 'No answer');
    const html = renderToStaticMarkup(
      <ProcessingCards view={view} cards={[order('E-7', { more: [spec('hold', 'Hold'), spec('advanceRequest', 'Request advance'), spec('cancel', 'Cancel (reason)')] })]} noAnswer={{ 'id-E-7': na }} />,
    );
    const at = (s: string) => html.indexOf(s);
    expect(at('>Approve<')).toBeGreaterThan(-1);
    expect(at('>Approve<')).toBeLessThan(at('>Ask for advance<'));
    expect(at('>Ask for advance<')).toBeLessThan(at('cmd-noanswer-t1'));
    expect(at('cmd-noanswer-t1')).toBeLessThan(at('processing-call'));
    expect(at('processing-call')).toBeLessThan(at('cmd-cancel'));
    expect(at('cmd-cancel')).toBeLessThan(at('>More'));
    expect(html).not.toContain('Cancel (reason)');
    // Hold is kept, one press away under More
    expect(at('cmd-hold')).toBeGreaterThan(at('>More'));
  });

  it('writes no colour of its own', () => {
    const html = renderToStaticMarkup(<ProcessingCards view={view} cards={[order('E-1')]} />);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
