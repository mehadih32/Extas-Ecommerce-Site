// PR 951 (lane D6, final round): the Batch page's "Not handed over" card opens All orders on the `batch` view, which the
// order service and the page both know, and the page keeps it out of the chip row (the prototype shows a note instead).
import { describe, expect, it } from 'vitest';
import * as od from '@extas/orders';
import { LIST_PAGES } from './model';

describe('All orders, current batch view (prototype v5)', () => {
  it('is a view of the order service and of the page', () => {
    expect(od.ORDER_VIEWS).toContain('batch');
    expect(LIST_PAGES.all.views).toContain('batch');
  });
  it('is not one of the drawn chips', () => {
    expect([...LIST_PAGES.all.chips, ...LIST_PAGES.all.chips2]).not.toContain('batch');
  });
});
