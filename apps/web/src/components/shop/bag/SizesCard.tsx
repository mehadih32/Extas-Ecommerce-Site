// PR 110 — the two-sizes notice (demo 50-bag.js bag_brkCard), drawn after the last line of a group: the same product
// and colour in neighbouring sizes. Asked once; the answer is kept on the bag (PUT /api/bag/sizes).
// Follow-up 41: in "help", while Find My Size is on (`pdp.finder`), a "Find my size" link opens the product with
// `?finder=1` (demo bag_brkCard), so the shopper can pick from his height and weight instead of guessing.
import type { BagItem, BagView } from '@extas/cart';
import type { ShopContext } from '@/lib/shop/context';
import { listText } from '@/lib/shop/bag-model';
import { Icon } from '../Icon';
import { FINDER_QUERY } from '@/lib/shop/pdp-finder';
import { lineHref, nameOf } from './BagLines';

/**
 * PR 110 — the same product, same colour, in neighbouring sizes (demo bag_brkCard). Asked once; "one is for someone
 * else" closes it for good (SIM-F-036: no order flag), "help" offers to keep one size and take the others out.
 */
export function SizesCard({
  c,
  group,
  items,
  policyLine,
  finderOn = false,
}: {
  c: ShopContext;
  group: BagView['groups'][number];
  items: readonly BagItem[];
  policyLine: string | null;
  /** Find My Size is on (`pdp.finder.on`): "help" links to it. */
  finderOn?: boolean;
}) {
  const t = c.t;
  const sizes = group.sizes.map((s) => s.label);
  const title = t('bag.sizes.title', { name: nameOf(group.name, c), sizes: listText(sizes, t('bag.sizes.and')) });
  if (group.answer === 'other' || group.answer === 'keep') {
    return (
      <div className="bg-inl bg-brk soft row" style={{ padding: '12px 14px', gap: 10 }} data-testid="brk-done" data-answer={group.answer}>
        <span className="bg-ok">
          <Icon name="check" size={18} />
        </span>
        <div className="grow small">
          <b>{group.answer === 'other' ? t('bag.sizes.doneOther') : t('bag.sizes.doneKeep')}</b> <span className="muted">{title}</span>
        </div>
        <button type="button" className="link" data-bag-act="sizes" data-key={group.key} data-v="">
          {t('bag.sizes.change')}
        </button>
      </div>
    );
  }
  const sizeOfLine = new Map(items.map((i) => [i.lineId, i.size?.id ?? null]));
  const othersThan = (sizeId: string) => group.lineIds.filter((id) => sizeOfLine.get(id) !== sizeId);
  const first = items.find((i) => i.lineId === group.lastLineId) ?? items.find((i) => group.lineIds.includes(i.lineId));
  const page = finderOn && first ? lineHref(c, first.slug, first.colour?.key) : null;
  const finderHref = page ? `${page}${page.includes('?') ? '&' : '?'}${FINDER_QUERY}=1` : null;
  return (
    <div className="bg-inl bg-brk soft p16" data-testid="brk-card" data-answer={group.answer ?? ''}>
      <div className="row top" style={{ gap: 12 }}>
        <span className="bg-ic">
          <Icon name="ruler" size={18} />
        </span>
        <div className="grow">
          <div className="h3">{title}</div>
          {group.answer === 'help' ? (
            <>
              <p className="small text2" style={{ margin: '4px 0 0' }}>
                {t('bag.sizes.helpText')}
              </p>
              {finderHref ? (
                <div className="stack s8 mt12" data-testid="brk-finder">
                  <div className="small text2">{t('bag.sizes.finderText')}</div>
                  <div>
                    <a className="btn btn-secondary btn-sm" href={finderHref}>
                      <Icon name="ruler" size={15} />
                      {t('bag.sizes.finder')}
                    </a>
                  </div>
                </div>
              ) : null}
              <div className="row wrap mt12" style={{ gap: 8 }}>
                {group.sizes.map((s) => {
                  const others = sizes.filter((x) => x !== s.label);
                  return (
                    <button key={s.sizeId} type="button" className="btn btn-sm btn-ghost" data-bag-act="keep-one" data-keep={s.label} data-remove={othersThan(s.sizeId).join(',')}>
                      {others.length === 1 ? t('bag.sizes.keepOne', { keep: s.label, other: others[0]! }) : t('bag.sizes.keepOnly', { keep: s.label })}
                    </button>
                  );
                })}
                <button type="button" className="btn btn-sm btn-ghost" data-bag-act="sizes" data-key={group.key} data-v="keep">
                  {sizes.length > 2 ? t('bag.sizes.keepAllMany') : t('bag.sizes.keepAll')}
                </button>
              </div>
              <button type="button" className="link mt8" data-bag-act="sizes" data-key={group.key} data-v="other">
                {t('bag.sizes.other')}
              </button>
            </>
          ) : (
            <>
              <p className="small text2" style={{ margin: '4px 0 0' }}>
                {t('bag.sizes.ask')}
              </p>
              <div className="row wrap mt12" style={{ gap: 8 }}>
                <button type="button" className="btn btn-sm btn-secondary" data-bag-act="sizes" data-key={group.key} data-v="help">
                  {t('bag.sizes.help')}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" data-bag-act="sizes" data-key={group.key} data-v="other">
                  {t('bag.sizes.other')}
                </button>
              </div>
            </>
          )}
          {policyLine ? (
            <div className="xs muted mt12 row top" style={{ gap: 6 }}>
              <Icon name="info" size={14} />
              <span>{policyLine}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
