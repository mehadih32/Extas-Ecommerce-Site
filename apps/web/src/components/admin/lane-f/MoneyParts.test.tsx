import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DecideToday, ProfitSnapshot, type SnapCol } from './MoneyParts';

const texts = { title: 'Profit snapshot', sub: 's', open: 'o', bar: 'b', sales: 'Sales', costs: 'Costs', note: 'n', more: 'More', moreHref: '/admin/money/profit' };
const col = (over: Partial<SnapCol>): SnapCol => ({ key: 'today', label: 'Today', vs: 'vs yesterday', href: '/x', netShown: '৳10', negative: false, delta: 10, salesShown: '৳100', costShown: '৳90', costPct: 90, ...over });

describe('Finance overview parts', () => {
  it('draws one link per period with its bar split', () => {
    const html = renderToStaticMarkup(<ProfitSnapshot cols={[col({}), col({ key: '7d', negative: true, netShown: '−৳5', costPct: 100, delta: null })]} texts={texts} />);
    expect(html).toContain('data-testid="fn-snap-today"');
    expect(html).toContain('data-testid="fn-snap-7d"');
    expect(html).toContain('width:90%');
    expect(html).toContain('lf-snv neg');
  });
  it('shows the empty line when nothing waits and one card per thing that does', () => {
    const none = renderToStaticMarkup(<DecideToday cards={[]} texts={{ title: 'T', sub: 'S', none: 'Nothing waits' }} />);
    expect(none).toContain('Nothing waits');
    const one = renderToStaticMarkup(<DecideToday cards={[{ key: 'cod', tone: 'warn', head: 'H', text: 'X', action: { label: 'Go', href: '/a' } }]} texts={{ title: 'T', sub: 'S', none: 'n' }} />);
    expect(one).toContain('data-testid="fn-decide-cod"');
    expect(one).toContain('href="/a"');
  });
});
