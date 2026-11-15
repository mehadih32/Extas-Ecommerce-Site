'use client';
// S28 · PR 732 (admin prototype v5, Reports › Products › "Style profit & restock"): the style groups as a tree you open one level
// at a time (a group, then the styles under it), each row with what sold, the sales, the profit, the margin and a verdict. The page
// works every figure out on the server (Money › Profit by group) and hands the rows here; this part only opens and closes them.
// "Open all" / "Close all" open every group. Verdict words and the rules strip come from the owner's report settings, not from here.
import { useMemo, useState } from 'react';

export interface TreeRow {
  id: string;
  parentId: string | null;
  depth: number;
  name: string;
  pieces: string;
  sales: string;
  profit: string;
  margin: string;
  loss: boolean;
  verdict: 'bulk' | 'stop' | 'keep';
}

export interface TreeTexts {
  label: string;
  name: string;
  pieces: string;
  sales: string;
  profit: string;
  margin: string;
  verdict: string;
  bulk: string;
  stop: string;
  keep: string;
  openAll: string;
  closeAll: string;
}

export function StyleTree({ rows, texts: x }: { rows: readonly TreeRow[]; texts: TreeTexts }) {
  const parents = useMemo(() => new Set(rows.filter((r) => r.parentId !== null).map((r) => r.parentId as string)), [rows]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const shown = rows.filter((r) => {
    for (let p = r.parentId, n = 0; p !== null && n < 32; n++) {
      if (!open.has(p)) return false;
      p = byId.get(p)?.parentId ?? null;
    }
    return true;
  });
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="rt" data-testid="rp-tree">
      <div className="rt-tools">
        <button type="button" className="a2-btn sm" onClick={() => setOpen(new Set(parents))} data-testid="rp-tree-all">
          {x.openAll}
        </button>
        <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(new Set())} data-testid="rp-tree-none">
          {x.closeAll}
        </button>
      </div>
      <div className="rt-grid" role="treegrid" aria-label={x.label}>
        <div className="rt-r rt-h" role="row">
          <span role="columnheader">{x.name}</span>
          <span role="columnheader">{x.pieces}</span>
          <span role="columnheader" className="rt-hs">
            {x.sales}
          </span>
          <span role="columnheader" className="rt-hs">
            {x.profit}
          </span>
          <span role="columnheader" className="rt-hs">
            {x.margin}
          </span>
          <span role="columnheader">{x.verdict}</span>
        </div>
        {shown.map((r) => {
          const has = parents.has(r.id);
          const isOpen = open.has(r.id);
          return (
            <div key={r.id} className={`rt-r l${Math.min(r.depth, 3)}`} role="row" aria-level={r.depth + 1} aria-expanded={has ? isOpen : undefined} data-testid="rp-tree-row">
              <span role="gridcell" className="rt-nm">
                {has ? (
                  <button type="button" className={`rt-car${isOpen ? ' on' : ''}`} aria-label={r.name} onClick={() => toggle(r.id)}>
                    ▸
                  </button>
                ) : (
                  <i className="rt-car" aria-hidden="true" />
                )}
                <b>{r.name}</b>
              </span>
              <span role="gridcell">{r.pieces}</span>
              <span role="gridcell" className="rt-hs">
                {r.sales}
              </span>
              <span role="gridcell" className={`rt-hs${r.loss ? ' bad' : ''}`}>
                {r.profit}
              </span>
              <span role="gridcell" className="rt-hs">
                {r.margin}
              </span>
              <span role="gridcell">
                <span className={`a2-pill ${r.verdict === 'bulk' ? 'ok' : r.verdict === 'stop' ? 'bad' : 'line'}`}>{x[r.verdict]}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
