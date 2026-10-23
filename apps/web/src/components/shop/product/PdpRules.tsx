'use client';
// PR 63 — Delivery · Exchange · Returns (Blueprint D3.5 / D3.6, demo 30-product.js pdp_rulesRow): three cells, each its
// short line and a value; tapping the value opens the rule's full text across the whole box (one at a time, 42), one
// sentence per row with a hanging indent (P11), and the same button says "Hide". The words are the owner's live rules
// (lib/shop/pdp-rules); "Try it on in front of the rider" under them is his switch.
import { useState, type CSSProperties } from 'react';
import { Icon } from '../Icon';
import type { RuleCell, RuleCellId } from '@/lib/shop/pdp-rules';

const ICON: Record<RuleCellId, 'truck' | 'swap' | 'info'> = { delivery: 'truck', exchange: 'swap', returns: 'info' };

export function PdpRules({ cells, heads, hide, trial }: { cells: RuleCell[]; heads: Record<RuleCellId, string>; hide: string; trial: string | null }) {
  const [open, setOpen] = useState<RuleCellId | null>(null);
  if (!cells.length && !trial) return null;
  const cur = cells.find((c) => c.id === open) ?? null;
  return (
    <div className="pdp-box pdp-rules" data-testid="pdp-rules" style={{ '--cells': Math.max(1, cells.length) } as CSSProperties}>
      {cells.map((c) => (
        <div key={c.id} className={`pdp-rule${open === c.id ? ' on' : ''}`} data-id={c.id}>
          <span className="pdp-ric">
            <Icon name={ICON[c.id]} size={17} />
          </span>
          <span className="pdp-rule-h">{heads[c.id]}</span>
          <span className="pdp-rule-s">{c.short}</span>
          <button type="button" className={`link rule-v${c.hot ? ' hot' : ''}`} aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
            {open === c.id ? hide : c.value}
          </button>
        </div>
      ))}
      {cur ? (
        <div className="pdp-rule-open small" data-testid="rule-open">
          {cur.full.map((l, i) => (
            <span key={i} className="pdp-rule-ln">
              {l}
            </span>
          ))}
        </div>
      ) : null}
      {trial ? (
        <p className="trial-ln pdp-trial" data-testid="pdp-trial">
          <Icon name="check" size={16} />
          <span>{trial}</span>
        </p>
      ) : null}
    </div>
  );
}
