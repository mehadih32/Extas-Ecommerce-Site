// PR 436 — the report's arithmetic without a database: the middle and the average, a rate with nothing under it, a
// row's figure (only its own chats in its conversion; delivered = sales), and the late rule of a ticket.
import { describe, expect, it } from 'vitest';
import { average, emptyFacts, figureOf, median, rate, ticketLate } from './analytics-pure';

const at = (min: number) => new Date(Date.UTC(2026, 10, 1, 4, min));

describe('PR 436 · support analytics (pure)', () => {
  it('median and average: whole minutes, null for none, the two middle ones for an even count', () => {
    expect(median([])).toBeNull();
    expect(average([])).toBeNull();
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(3); // (2 + 3) / 2 = 2.5 → 3
    expect(average([1, 2, 3, 10])).toBe(4);
    expect(median([7])).toBe(7);
  });

  it('a rate is null when nothing is under it, never 0 %', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(0, 4)).toBe(0);
    expect(rate(1, 4)).toBe(0.25);
  });

  it('a row: conversion only over its own chats; sales only the delivered orders; ordered value all placed', () => {
    const f = emptyFacts();
    for (const c of ['a', 'b', 'c', 'd']) f.chats.add(c);
    f.orderChats.add('a');
    f.orderChats.add('z'); // an order credited from a chat this row did not answer in the period
    f.orders.set('o1', { valueMinor: 150_000, delivered: true });
    f.orders.set('o2', { valueMinor: 90_000, delivered: false });
    f.firstMinutes.push(4, 30, 2);
    f.tickets = 4;
    f.late = 1;
    const fig = figureOf(f);
    expect(fig).toMatchObject({ chats: 4, orderChats: 1, conversion: 0.25, orders: 2, orderedMinor: 240_000, delivered: 1, salesMinor: 150_000, answered: 3, firstMedian: 4, firstAverage: 12, solved: 0, resolveMedian: null, lateRate: 0.25 });
    expect(figureOf(emptyFacts())).toMatchObject({ chats: 0, conversion: null, lateRate: null, firstMedian: null });
  });

  it('late: the first answer after its timer or not yet and past it; the solution after its timer, or open and past it', () => {
    const base = { status: 'OPEN', createdAt: at(0), firstResponseDueAt: at(10), firstResponseAt: null, resolutionDueAt: at(120), resolvedAt: null };
    expect(ticketLate(base, at(5))).toBe(false);
    expect(ticketLate(base, at(11))).toBe(true);
    expect(ticketLate({ ...base, firstResponseAt: at(9) }, at(60))).toBe(false);
    expect(ticketLate({ ...base, firstResponseAt: at(12) }, at(60))).toBe(true);
    // waiting for the customer: the solution timer does not count
    expect(ticketLate({ ...base, status: 'WAITING', firstResponseAt: at(9) }, at(500))).toBe(false);
    expect(ticketLate({ ...base, firstResponseAt: at(9) }, at(500))).toBe(true);
    expect(ticketLate({ ...base, status: 'SOLVED', firstResponseAt: at(9), resolvedAt: at(100) }, at(500))).toBe(false);
    expect(ticketLate({ ...base, status: 'SOLVED', firstResponseAt: at(9), resolvedAt: at(130) }, at(500))).toBe(true);
    // no timers (tickets made before the timers): never late
    expect(ticketLate({ ...base, firstResponseDueAt: null, resolutionDueAt: null }, at(9999))).toBe(false);
  });
});
