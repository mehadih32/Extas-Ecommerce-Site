// PR 282 follow-up (browser check of 656) — the Marketing calendar's month grid: the day names come in two forms (the
// short name on wide screens, the narrow one on phones, where a 14 px short name does not fit a seventh of the
// screen); a day with more items than fit draws the rest as phone-only dots (the "+n more" words are hidden there);
// every text in the grid is 14 px or more (Lumen: text on cards never under 14) and a long name wraps to two lines
// instead of being cut off sideways (the device gate's TEXT-CUT-OFF); the day list's and the bars' links are 44 wide.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { CalendarItem } from '@/lib/marketing/calendar-model';
import { calendarRange } from '@/lib/marketing/calendar-model';
import { CalendarBars, CalendarMonth, type CalendarViewWords } from './CalendarView';

const w: CalendarViewWords = { lane: { plan: 'Your plan' }, state: { live: 'Live', scheduled: 'Scheduled', ended: 'Ended', off: 'Off' }, mark: 'Last day', open: 'Until stopped', empty: 'Nothing' };
const item = (id: string, title: string): CalendarItem => ({ id, lane: 'plan', title: { en: title, bn: null }, starts: '2026-11-09', ends: '2026-11-09', open: false, state: 'scheduled', detail: null, href: null });
const week = ['08', '09', '10', '11', '12', '13', '14'].map((d) => ({ day: `2026-11-${d}`, out: false }));

it('draws short and narrow day names, and the items past perDay as phone-only dots', () => {
  const html = renderToStaticMarkup(
    <CalendarMonth items={[item('a', 'Eid'), item('b', 'Winter sale'), item('c', 'Flash'), item('d', 'Boishakh')]} weeks={[week]} today="2026-11-09" locale="en-BD" bn={false} w={w} mw={{ more: (n) => `+${n} more`, empty: 'none' }} perDay={2} />,
  );
  expect(html).toContain('<span class="mc-dw-s" aria-hidden="true">Sun</span>');
  expect(html).toContain('<span class="mc-dw-n" aria-hidden="true">S</span>');
  expect(html).toContain('role="columnheader" aria-label="Mon"');
  const day = html.slice(html.indexOf('data-day="2026-11-09"'), html.indexOf('data-day="2026-11-10"'));
  expect(day.match(/class="mc-chip scheduled"/g)).toHaveLength(2);
  expect(day.match(/class="mc-chip mc-x scheduled"/g)).toHaveLength(2);
  expect(day).toContain('+2 more');
});

it('the month grid keeps text at 14 px or more, wraps long names and widens its links', () => {
  const css = readFileSync(fileURLToPath(new URL('../../../app/admin/marketing/calendar/calendar.css', import.meta.url)), 'utf8');
  const month = css.slice(css.indexOf('.adm2 .mc-month'));
  for (const [, size] of month.matchAll(/font-size:\s*([\d.]+)px/g)) expect(Number(size)).toBeGreaterThanOrEqual(14);
  expect(month).toMatch(/\.mc-chip \.mc-ct\{[^}]*-webkit-line-clamp:2[^}]*overflow-wrap:anywhere/);
  expect(month).not.toMatch(/\.mc-ct\{[^}]*text-overflow:ellipsis/);
  expect(css).toMatch(/\.mc-item a\.a2-lnk\{[^}]*min-width:44px/);
  expect(css).toMatch(/\.mc-t a\{[^}]*min-width:44px/);
});

it('follow-up (PR 282): the bars view keeps text at the Lumen card size too — item names and the header dates', () => {
  const css = readFileSync(fileURLToPath(new URL('../../../app/admin/marketing/calendar/calendar.css', import.meta.url)), 'utf8');
  for (const [, size] of css.matchAll(/font-size:\s*([\d.]+)px/g)) expect(Number(size)).toBeGreaterThanOrEqual(14);
  expect(css).toMatch(/\.mc-t\{[^}]*font-size:var\(--lm-fs-card\)/);
  expect(css).toMatch(/\.mc-head \.mc-b span\{[^}]*font-size:var\(--lm-fs-card\)/);
});

it('follow-up (PR 282): a header date near the right end slides back by its own place, so it never runs past the bar', () => {
  const html = renderToStaticMarkup(<CalendarBars items={[item('a', 'Eid')]} range={calendarRange('2026-11-07', 60)} locale="en-BD" bn={false} w={w} />);
  const marks = [...html.matchAll(/<span style="left:([\d.]+)%;transform:translateX\(-([\d.]+)%\)">/g)];
  expect(marks.length).toBeGreaterThan(1);
  for (const [, left, back] of marks) expect(back).toBe(left);
  const css = readFileSync(fileURLToPath(new URL('../../../app/admin/marketing/calendar/calendar.css', import.meta.url)), 'utf8');
  expect(css).not.toMatch(/\.mc-head \.mc-b span\{[^}]*transform:/);
});
