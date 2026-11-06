// PR 532 follow-up (664) — the shared event ids block: inert JSON, escaped, and absent while sharing is off.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharedEventIds } from './SharedEventIds';

describe('the shared event ids block (664)', () => {
  it('draws nothing while sharing is off', () => {
    expect(renderToStaticMarkup(<SharedEventIds ids={null} />)).toBe('');
  });

  it('is one inert JSON data block with the ids, and a `<` cannot end it early', () => {
    const html = renderToStaticMarkup(<SharedEventIds ids={{ order: 'C29-</script>', events: { meta: [{ name: 'Purchase', id: 'purchase-C29' }] } }} />);
    expect(html.startsWith('<script type="application/json" id="extas-event-ids" data-testid="shared-event-ids">')).toBe(true);
    expect(html).not.toContain('C29-</script>');
    expect(html).toContain('"id":"purchase-C29"');
  });
});
