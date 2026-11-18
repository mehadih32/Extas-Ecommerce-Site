'use client';
// PR 1101 (owner, 19 Nov 2026: "match the prototype 100%"): the section's tab bar under the page's title, as prototype v5
// draws it (core.js: `pageHead` then `tabsBar`). The shell still builds the bar once from the address (PR 762, ShellTabBar)
// and hands it down through this context; a page head (PageHead) draws it right under itself. While a head holds the
// bar the shell draws none at the top of the page (the stylesheet hides that one before the page is live, so nothing
// moves; the shell then leaves it out). A page with an older head of its own keeps the bar at the top.
import { createContext, useContext, useEffect, type ReactNode } from 'react';

export interface ShellTabsValue {
  /** The bar for the page open now (null: no tabs, or Settings, which has its own list). */
  bar: ReactNode;
  /** A head says it draws the bar; returns the undo (the head left the page). */
  claim: () => () => void;
}

export const ShellTabsContext = createContext<ShellTabsValue | null>(null);

export function HeadTabs() {
  const ctx = useContext(ShellTabsContext);
  const claim = ctx?.claim;
  useEffect(() => (claim ? claim() : undefined), [claim]);
  if (!ctx?.bar) return null;
  return <div className="a2-bar-in">{ctx.bar}</div>;
}
