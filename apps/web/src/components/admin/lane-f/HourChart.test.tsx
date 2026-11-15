import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HourChart } from './HourChart';

describe('HourChart', () => {
  it('draws one column per hour with the tallest at full height and the figures for a screen reader', () => {
    const html = renderToStaticMarkup(<HourChart title="Messages by hour" sub="s" hours={[8, 9, 10]} values={[0, 2, 4]} testId="h" />);
    expect(html).toContain('data-testid="h"');
    expect(html.match(/class="lf-hc-col"/g)).toHaveLength(3);
    expect(html).toContain('height:100%');
    expect(html).toContain('height:50%');
    expect(html).toContain('9:00 — 2');
  });
  it('does not divide by zero when nothing came in', () => {
    expect(renderToStaticMarkup(<HourChart title="t" sub="s" hours={[8]} values={[0]} testId="h" />)).toContain('height:0%');
  });
});
