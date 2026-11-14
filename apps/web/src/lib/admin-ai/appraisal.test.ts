// S15 · PR 578 — pure math for the Agent reports screen: the rolling period window, the KPI arithmetic over rows
// the caller already read (no database here — appraisal.db.test.ts covers the read/write/seeded-row side on real
// Postgres), and the Bengali report text's shape. `firstTimeRightRate` is `null`, never a guessed 0 or 100, while
// there is nothing to divide (CLAUDE.md "never invent a number") — this is the one rule every test below protects.
import { describe, expect, it } from 'vitest';
import { appraisalRange, appraisalReportText, isAppraisalPeriod, kpisFromRows, type AppraisalKpis } from './appraisal';

const TZ = 'Asia/Dhaka';
const NOW = new Date('2026-11-12T10:00:00Z'); // 2026-11-12 16:00 Asia/Dhaka

describe('isAppraisalPeriod', () => {
  it('accepts only the four fixed periods', () => {
    expect(isAppraisalPeriod('daily')).toBe(true);
    expect(isAppraisalPeriod('weekly')).toBe(true);
    expect(isAppraisalPeriod('monthly')).toBe(true);
    expect(isAppraisalPeriod('yearly')).toBe(true);
    expect(isAppraisalPeriod('quarterly')).toBe(false);
    expect(isAppraisalPeriod('')).toBe(false);
  });
});

describe('appraisalRange', () => {
  it('daily is a one-day rolling window ending today, in the store time zone', () => {
    const r = appraisalRange('daily', NOW, TZ);
    expect(r.periodStart).toBe('2026-11-12');
    expect(r.periodEnd).toBe('2026-11-12');
    expect(r.to).toEqual(NOW);
  });

  it('weekly is a 7-day rolling window (6 days back, inclusive of today)', () => {
    const r = appraisalRange('weekly', NOW, TZ);
    expect(r.periodStart).toBe('2026-11-06');
    expect(r.periodEnd).toBe('2026-11-12');
  });

  it('monthly is a 30-day rolling window, not a calendar month', () => {
    const r = appraisalRange('monthly', NOW, TZ);
    expect(r.periodStart).toBe('2026-10-14');
    expect(r.periodEnd).toBe('2026-11-12');
  });

  it('yearly is a 365-day rolling window, not a calendar year', () => {
    const r = appraisalRange('yearly', NOW, TZ);
    expect(r.periodStart).toBe('2025-11-13');
    expect(r.periodEnd).toBe('2026-11-12');
  });

  it('from is the local midnight of periodStart as a UTC instant', () => {
    const r = appraisalRange('daily', NOW, TZ);
    // 2026-11-12 00:00 Asia/Dhaka (+06:00) = 2026-11-11T18:00:00Z
    expect(r.from.toISOString()).toBe('2026-11-11T18:00:00.000Z');
  });
});

describe('kpisFromRows', () => {
  it('an empty work log is all honest zeros, and the rate is null (nothing to divide)', () => {
    const kpis = kpisFromRows([], 0);
    expect(kpis).toEqual<AppraisalKpis>({ tasksDone: 0, bugsSelfFound: 0, bugsOwnerFound: 0, rewards: 0, costMinor: 0, firstTimeRightRate: null, practiceTasksGraded: 0, practiceTasksPassed: 0 });
  });

  it('PR 585: practiceTasksGraded/Passed are honestly 0/0 when no `practiceTasks` is given at all (every earlier caller)', () => {
    const kpis = kpisFromRows([{ outcome: null }], 0);
    expect(kpis.practiceTasksGraded).toBe(0);
    expect(kpis.practiceTasksPassed).toBe(0);
  });

  it('PR 585: counts graded practice tasks and how many of them passed, over whatever rows the caller read', () => {
    const kpis = kpisFromRows([], 0, [{ grade: 'pass' }, { grade: 'pass' }, { grade: 'fail' }, { grade: 'partial' }, { grade: null }]);
    expect(kpis.practiceTasksGraded).toBe(5);
    expect(kpis.practiceTasksPassed).toBe(2);
  });

  it('counts self-found and owner-found bugs separately, and rewards do not count as tasks', () => {
    const rows = [{ outcome: null }, { outcome: null }, { outcome: 'bug_self' }, { outcome: 'bug_owner' }, { outcome: 'reward' }];
    const kpis = kpisFromRows(rows, 1500);
    expect(kpis.tasksDone).toBe(4); // 5 rows minus 1 reward
    expect(kpis.bugsSelfFound).toBe(1);
    expect(kpis.bugsOwnerFound).toBe(1);
    expect(kpis.rewards).toBe(1);
    expect(kpis.costMinor).toBe(1500);
  });

  it('firstTimeRightRate is (tasksDone - bugsOwnerFound) / tasksDone as a whole percent', () => {
    const rows = [{ outcome: null }, { outcome: null }, { outcome: null }, { outcome: null }, { outcome: 'bug_owner' }];
    const kpis = kpisFromRows(rows, 0);
    expect(kpis.tasksDone).toBe(5);
    expect(kpis.firstTimeRightRate).toBe(80); // (5-1)/5
  });

  it('a perfect period (no owner-found bugs at all) is 100%, never invented, always computed', () => {
    const kpis = kpisFromRows([{ outcome: null }, { outcome: 'bug_self' }], 0);
    expect(kpis.firstTimeRightRate).toBe(100);
  });

  it('only rewards and no plain tasks still reads as null, not 0% or 100%', () => {
    const kpis = kpisFromRows([{ outcome: 'reward' }], 0);
    expect(kpis.tasksDone).toBe(0);
    expect(kpis.firstTimeRightRate).toBeNull();
  });
});

describe('appraisalReportText', () => {
  const range = appraisalRange('daily', NOW, TZ);
  const zero: AppraisalKpis = { tasksDone: 0, bugsSelfFound: 0, bugsOwnerFound: 0, rewards: 0, costMinor: 0, firstTimeRightRate: null, practiceTasksGraded: 0, practiceTasksPassed: 0 };

  it('says plainly that nothing was recorded, rather than leaving a blank report', () => {
    const text = appraisalReportText('daily', zero, 'সাইজ পরামর্শ', range);
    expect(text).toContain('এই সময়ে কোনো কাজ রেকর্ড হয়নি');
    expect(text).toContain(range.periodStart);
  });

  it('shows "তথ্য নেই" for a null rate, never a guessed percent', () => {
    const text = appraisalReportText('daily', zero, 'সাইজ পরামর্শ', range);
    expect(text).toContain('তথ্য নেই');
    expect(text).not.toMatch(/0%|null%/);
  });

  it('a real rate is printed as a whole percent', () => {
    const some: AppraisalKpis = { tasksDone: 4, bugsSelfFound: 1, bugsOwnerFound: 1, rewards: 0, costMinor: 250, firstTimeRightRate: 75, practiceTasksGraded: 0, practiceTasksPassed: 0 };
    const text = appraisalReportText('daily', some, 'সাইজ পরামর্শ', range);
    expect(text).toContain('75%');
    expect(text).toContain('250');
  });

  it('PR 585: the practice-task line only appears once something was actually graded, never 0/0 noise', () => {
    expect(appraisalReportText('daily', zero, 'সাইজ পরামর্শ', range)).not.toContain('প্র্যাকটিস টাস্ক');
    const withTasks: AppraisalKpis = { ...zero, practiceTasksGraded: 3, practiceTasksPassed: 2 };
    const text = appraisalReportText('daily', withTasks, 'সাইজ পরামর্শ', range);
    expect(text).toContain('প্র্যাকটিস টাস্ক: 3টা গ্রেড হয়েছে, 2টা পাস');
  });

  it('only the yearly report adds the role line and the honest "not yet filled" note', () => {
    const daily = appraisalReportText('daily', zero, 'সাইজ পরামর্শ', range);
    const yearly = appraisalReportText('yearly', zero, 'সাইজ পরামর্শ', range);
    expect(daily).not.toContain('সাইজ পরামর্শ');
    expect(yearly).toContain('সাইজ পরামর্শ');
    expect(yearly).toContain('এখনো ভরা হয়নি');
  });
});
