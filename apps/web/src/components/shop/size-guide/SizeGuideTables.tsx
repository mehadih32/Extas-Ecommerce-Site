// Follow-up 155 (PR 58, 75) — the size guide page's body (demo 10-size-guide.js sg_deskPage / sg_table): the breadcrumb
// on a computer, the title and lede, "Find my size" (a link to this page marked `data-act="size-guide"`, so the shell
// opens the window on a press and the link stays a link without script), then one table per category: its chart's
// name, a column per measurement, a row per size, in inches. Server-drawn.
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { measureText } from '@/lib/shop/pdp-size';
import { digitsOf } from '@/lib/shop/product-model';
import { ROUTES } from '@/lib/shop/routes';
import type { SizeGuideData } from '@/lib/shop/size-guide';
import { SIZE_GUIDE_ACT } from '@/lib/shop/size-guide-link';
import { GarmentIcon, Icon } from '../Icon';

export function SizeGuideTables({ c, data }: { c: ShopContext; data: SizeGuideData }) {
  const t = c.t;
  const finds = data.finder.on && data.entries.some((e) => e.finds);
  const bn = c.lang === 'bn' && c.bnDigits;
  const here = hrefIn(c.lang, ROUTES.help('size-guide'));
  return (
    <div className="pg sg-page" data-testid="size-guide-page">
      <nav className="crumbs pg-crumbs hide-m" aria-label={t('helpPage.crumbs')}>
        <a href={hrefIn(c.lang, ROUTES.home)}>{t('helpPage.home')}</a>
        <span aria-hidden="true">/</span>
        <a href={hrefIn(c.lang, ROUTES.help('faq'))}>{t('helpPage.help')}</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('sizeGuide.title')}</span>
      </nav>
      <h1>{t('sizeGuide.title')}</h1>
      <p className="pg-lede">{t('sizeGuide.lede')}</p>
      {finds ? (
        <a className="btn btn-primary sg-open" href={here} data-act={SIZE_GUIDE_ACT} data-testid="sg-open">
          <Icon name="ruler" size={18} />
          {t('sizeGuide.find')}
        </a>
      ) : null}
      <div className="sg-tables">
        {data.entries.map((e) => (
          <section key={e.slug} className="card sg-tbl" data-testid="sg-table" aria-labelledby={`sg-${e.slug}`}>
            <div className="sg-tbl-hd">
              <h2 id={`sg-${e.slug}`}>
                <GarmentIcon garment={e.garment} size={18} />
                <a href={e.href}>{e.name}</a>
              </h2>
              <span className="xs muted">{t('sizeGuide.tableOf', { chart: e.chart.name })}</span>
            </div>
            <div className="sg-scroll" tabIndex={0} role="region" aria-labelledby={`sg-${e.slug}`}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('sizeGuide.size')}</th>
                    {e.chart.fields.map((f) => (
                      <th key={f.key} scope="col">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {e.chart.rows.map((r) => (
                    <tr key={r.size}>
                      <th scope="row">{e.labels[r.size] ?? r.size}</th>
                      {r.inch.map((v, i) => (
                        <td key={e.chart.fields[i]?.key ?? i}>{v === null ? '—' : digitsOf(measureText(v), bn)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
