'use client';
// PR 64 — Fabric & care, Size & fit, Description (Blueprint D3.6, demo 30-product.js pdp_details / pdp_acc): one box of
// accordions in the owner's order, each closed, open, or open to its first line with "Read more" (a peeking block
// opens fully on a tap). The words are the product's own; a block with nothing written is left out.
import { useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { nextOpen, type DetailId, type DetailOpen } from '@/lib/shop/pdp-details';

export interface DetailBlockView {
  id: DetailId;
  title: string;
  open: DetailOpen;
  body: ReactNode;
}

export function PdpDetails({ blocks, more }: { blocks: DetailBlockView[]; more: string }) {
  const [state, setState] = useState<Record<string, DetailOpen>>(() => Object.fromEntries(blocks.map((b) => [b.id, b.open])));
  if (!blocks.length) return null;
  const tap = (id: DetailId) => setState((s) => ({ ...s, [id]: nextOpen(s[id] ?? 'closed') }));
  return (
    <div className="pdp-box" data-testid="pdp-details">
      {blocks.map((b) => {
        const st = state[b.id] ?? b.open;
        const open = st !== 'closed';
        const peek = st === 'peek';
        return (
          <div key={b.id} className={`pdp-acc${peek ? ' peek' : ''}`} data-id={b.id}>
            <button type="button" className="pdp-acc-h" aria-expanded={open} aria-controls={open ? `pdp-acc-${b.id}` : undefined} onClick={() => tap(b.id)}>
              {b.title}
              <Icon name={open ? 'minus' : 'plus'} size={18} />
            </button>
            {open ? (
              <div className="pdp-acc-b small text2" id={`pdp-acc-${b.id}`}>
                {b.body}
                {peek ? (
                  <button type="button" className="link pdp-accmore" onClick={() => tap(b.id)}>
                    {more}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
