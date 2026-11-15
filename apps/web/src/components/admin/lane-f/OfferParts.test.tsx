import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AwaitingCard, calendarOf, HeadsUp, OfferCalendar } from './OfferParts';

describe('Offers — awaiting, heads up and calendar', () => {
  it('shows nothing when no offer waits, and one row with a Review button when one does', () => {
    expect(renderToStaticMarkup(<AwaitingCard title="T" sub="S" items={[]} review="Review" onReview={() => undefined} />)).toBe('');
    const html = renderToStaticMarkup(<AwaitingCard title="Awaiting your approval" sub="S" items={[{ id: 'o1', name: 'Eid sale', line: '10% off' }]} review="Review" onReview={() => undefined} />);
    expect(html).toContain('data-testid="of-aw-o1"');
    expect(html).toContain('Review');
  });
  it('says there are no overlaps, or lists them with an Open link', () => {
    expect(renderToStaticMarkup(<HeadsUp title="Heads up" sub="s" none="No overlaps." items={[]} open="Open" />)).toContain('No overlaps.');
    const html = renderToStaticMarkup(<HeadsUp title="Heads up" sub="s" none="n" items={[{ id: 'c1', text: 'A and B clash', href: '/admin/rules/smart?rule=1' }]} open="Open" />);
    expect(html).toContain('A and B clash');
    expect(html).toContain('href="/admin/rules/smart?rule=1"');
  });
  it('puts each bar and the line for today inside the six-week window', () => {
    const now = new Date('2026-11-15T06:00:00Z');
    const c = calendarOf(
      [
        { id: 'a', name: 'Eid', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', scheduled: true },
        { id: 'b', name: 'Always', startsAt: null, endsAt: null, scheduled: false },
      ],
      now,
      (d) => d.toISOString().slice(5, 10),
    );
    expect(c.todayAt).toBeCloseTo((7 / 42) * 100, 0); // today is one week into the window
    expect(c.items[0]!.left).toBeGreaterThan(c.todayAt);
    expect(c.items[1]).toMatchObject({ left: 0, width: 100 });
    expect(c.ticks).toHaveLength(4);
    const html = renderToStaticMarkup(<OfferCalendar title="Calendar" sub="s" none="Nothing running or planned." items={c.items} todayAt={c.todayAt} ticks={c.ticks} />);
    expect(html).toContain('of-bar sch');
    expect(html).toContain('of-today');
    expect(renderToStaticMarkup(<OfferCalendar title="Calendar" sub="s" none="Nothing running or planned." items={[]} todayAt={0} ticks={[]} />)).toContain('Nothing running or planned.');
  });
});
