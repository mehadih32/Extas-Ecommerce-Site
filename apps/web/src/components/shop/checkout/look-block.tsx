// PR 128 — "Complete your look" drawn from its data (lib/shop/thanks-look): the rows' pictures, names, colours, sizes
// and prices in the shop's money, acted on in ThanksLook. Shared by the thank-you page and, follow-up 217, the order's
// page in My account (there only while the add-on window is open).
import type { ReactNode } from 'react';
import type { Receipt } from '@extas/checkout';
import { colourName, productName, type cardsByIds } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { fill } from '@/lib/shop/dict';
import { productPath } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import type { LookData } from '@/lib/shop/thanks-look';
import { openColours } from '@/lib/shop/thanks-look-model';
import { Thumb } from '../bag/BagLines';
import { ThanksLook, type LookRowView } from './ThanksLook';

type Cards = Awaited<ReturnType<typeof cardsByIds>>;

/** The block, or null when no row can be drawn (`words`: the checkout's words, `ty.look*`). */
export function lookBlockOf(c: ShopContext, r: Receipt, look: LookData, cards: Cards, words: Record<string, string>): ReactNode {
  const w = (k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);
  const m = c.money;
  const n = (x: number) => c.num(x);
  const rows: LookRowView[] = [];
  for (const x of look.rows) {
    const card = cards.get(x.productId);
    const p = look.products.get(x.productId);
    if (!card || !p) continue;
    const name = productName(card, c.lang);
    const line = x.kind === 'added' ? r.lines.find((l) => l.id === x.lineId) : undefined;
    const open = openColours(p);
    const thumbs: Record<string, ReactNode> = {};
    // an added line is drawn in its own colour; a suggestion in each colour he can pick
    const drawn = line?.colour ? card.colours.filter((k) => k.key === line.colour!.key) : card.colours;
    for (const k of drawn.length ? drawn : [{ key: '', hex: line?.colour?.hex ?? '' }])
      thumbs[k.key] = <Thumb c={c} card={card} colourKey={k.key || undefined} hex={k.hex} alt={name} />;
    rows.push({
      key: x.kind === 'added' ? x.lineId : x.productId,
      kind: x.kind,
      lineId: x.kind === 'added' ? x.lineId : null,
      name,
      href: hrefIn(c.lang, productPath(c.s['naming.productPathPrefix'], card.slug)),
      thumbs,
      colours: card.colours.filter((k) => open.includes(k.key)).map((k) => ({ key: k.key, name: colourName(k, c.lang), hex: k.hex })),
      sizes: p.sizes,
      variants: p.variants.map((v) => ({ ...v, pay: m(v.payMinor) })),
      detail: line ? [line.colour ? colourName(line.colour, c.lang) : null, line.size, line.quantity > 1 ? `×${n(line.quantity)}` : null].filter(Boolean).join(' · ') || null : null,
      amount: line ? m(line.amountMinor) : null,
    });
  }
  if (!rows.length) return null;
  return (
    <ThanksLook
      number={r.number}
      words={words}
      rows={rows}
      open={look.state.open}
      full={look.state.lines.length >= look.state.maxLines}
      until={look.state.open ? w(look.until === 'confirmed' ? 'ty.lookUntilPack' : 'ty.lookUntilConfirm') : null}
      newTotal={look.state.lines.length && r.pay.kind === 'cod' ? m(look.state.dueMinor) : null}
      fullNote={w('ty.lookFull', { count: n(look.state.maxLines) })}
    />
  );
}
