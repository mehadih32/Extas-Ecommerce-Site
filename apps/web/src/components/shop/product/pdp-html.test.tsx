// S11 · PR 225 (Blueprint C4.2 build rule, GOOGLE-TRAFFIC-PLAN §1.7): the product page's folded words are in the HTML
// of the first response — a closed accordion's body and every delivery / exchange / returns rule's full text — only
// hidden while closed, so a search engine reads them; nothing is loaded on a tap.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PdpDetails } from './PdpDetails';
import { PdpRules } from './PdpRules';

describe('PR 225 · folded product words are in the HTML', () => {
  it('a closed accordion keeps its words in the page, hidden; an open one shows them', () => {
    const html = renderToStaticMarkup(
      <PdpDetails
        more="Read more"
        blocks={[
          { id: 'fabric', title: 'Fabric & care', open: 'closed', body: <p>Sample fabric: 100% cotton pique</p> },
          { id: 'desc', title: 'Description', open: 'open', body: <p>Sample description words</p> },
        ]}
      />,
    );
    expect(html).toContain('Sample fabric: 100% cotton pique');
    expect(html).toMatch(/<div class="pdp-acc-b small text2" id="pdp-acc-fabric" hidden="">/);
    expect(html).toMatch(/<div class="pdp-acc-b small text2" id="pdp-acc-desc">/);
    expect(html).toContain('aria-controls="pdp-acc-fabric"');
  });

  it('every rule`s full text is in the page while none is open, each hidden', () => {
    const html = renderToStaticMarkup(
      <PdpRules
        heads={{ delivery: 'Delivery', exchange: 'Exchange', returns: 'Returns' }}
        hide="Hide"
        trial={null}
        cells={[
          { id: 'delivery', short: 'Sample delivery', full: ['Sample delivery rule, line one.'], value: 'Details', hot: false },
          { id: 'exchange', short: 'Sample exchange', full: ['Sample exchange rule, line one.', 'Line two.'], value: 'Details', hot: false },
        ]}
      />,
    );
    expect(html).toContain('Sample delivery rule, line one.');
    expect(html).toContain('Sample exchange rule, line one.');
    expect(html.match(/class="pdp-rule-open small"[^>]*hidden=""/g)).toHaveLength(2);
    // none open: no visible rule box
    expect(html).not.toContain('data-testid="rule-open"');
  });
});
