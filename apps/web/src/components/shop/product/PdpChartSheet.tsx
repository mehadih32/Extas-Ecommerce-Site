'use client';
// PR 57 — the size chart's window (moved out of PdpChart.tsx by PR 88 so it is its own chunk, fetched once the page is
// idle or on the first open): the chart's name, inches / cm, one row per size with the chosen colour's stock, a tap on a
// row chooses that size and closes it; "Not sure? Find my size", "Ask on WhatsApp" and "How to measure" under it.
import type { RefObject } from 'react';
import { Icon, WaGlyph } from '../Icon';
import { showToast } from '../toast';
import { howToText } from '@/lib/shop/pdp-chart';
import { measureText } from '@/lib/shop/pdp-size';
import { stockOf } from '@/lib/shop/product-model';
import { PdpModal } from './PdpModal';
import { usePdp } from './PdpRoot';
import { Bold } from './Bold';

interface Props {
  /** Closes the window (the button's own state). */
  onClose: () => void;
  /** The "Size chart" button: focus goes back to it. */
  opener: RefObject<HTMLButtonElement | null>;
}

export function ChartSheet({ onClose, opener }: Props) {
  const { m, set, choice, unit, w, num, setUnit, pickSize, chartWa, chartBottom, finder, openFinder } = usePdp();
  const chart = m.chart;
  if (!chart) return null;
  const colour = m.colours.find((c) => c.key === choice.colour)?.name ?? '';
  const label = (key: string) => m.sizes.find((s) => s.key === key)?.label ?? key;
  const value = (v: number | null) => (v == null ? '' : w(unit === 'cm' ? 'cm' : 'inch', { v: num(measureText(v)) }));
  const how = set.chart.howTo ? chart.fields.filter((f) => f.howTo) : [];

  return (
    <PdpModal title={w('sizeChart')} closeLabel={w('chart.close')} onClose={onClose} opener={opener} wide className="pdp-chartd" testId="chart-modal">
      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <div className="h3">{chart.name}</div>
          <div className="xs muted">{w('chart.sub', { colour })}</div>
        </div>
        <div className="seg" role="group" aria-label={w('chart.units')}>
          <button type="button" className={unit === 'inch' ? 'on' : ''} aria-pressed={unit === 'inch'} onClick={() => setUnit('inch')}>
            {w('unitIn')}
          </button>
          <button type="button" className={unit === 'cm' ? 'on' : ''} aria-pressed={unit === 'cm'} onClick={() => setUnit('cm')}>
            {w('unitCm')}
          </button>
        </div>
      </div>
      <div className="xs text2 mt12">
        <bdi className="hide-d">{w('chart.tap')}</bdi>
        <bdi className="hide-m">{w('chart.click')}</bdi>
      </div>
      <div className="tbl-wrap mt8">
        <table className="tbl pdp-chart" data-testid="chart-table">
          <thead>
            <tr>
              <th scope="col">{w('chart.sizeCol')}</th>
              {chart.fields.map((f) => (
                <th key={f.key} scope="col">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((r) => {
              const out = stockOf(m, choice.colour, r.size) <= 0;
              const sel = choice.size === r.size;
              const choose = (el: HTMLElement) => {
                if (out) return showToast(el, w('sizeGone', { size: label(r.size), colour }));
                const host = el.closest('.shop') ?? document.body;
                pickSize(r.size);
                onClose();
                showToast(host, w('chart.picked', { size: label(r.size) }));
              };
              return (
                <tr key={r.size} className={`pick${sel ? ' sel' : ''}${out ? ' out' : ''}`} onClick={(e) => choose(e.currentTarget)}>
                  <td>
                    <button
                      type="button"
                      className="pdp-rowbtn"
                      aria-label={out ? w('sizeOutAria', { size: label(r.size), colour }) : w('chart.select', { size: label(r.size) })}
                      onClick={(e) => {
                        e.stopPropagation();
                        choose(e.currentTarget);
                      }}
                    >
                      {label(r.size)}
                    </button>
                    {out ? <div className="oos">{w('chart.out', { colour })}</div> : null}
                  </td>
                  {(unit === 'cm' ? r.cm : r.inch).map((v, i) => (
                    <td key={chart.fields[i]?.key ?? i}>{value(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {finder || (chartWa && set.chart.askWhatsapp) ? (
        <div className="pdp-chartft mt12">
          {finder ? (
            <button
              type="button"
              className="chart-opt"
              data-testid="chart-finder"
              onClick={() => {
                onClose();
                openFinder(opener.current);
              }}
            >
              <Icon name="ruler" size={18} />
              <span>
                <b>{w('finder.chartOpt')}</b>
                <span>{w('finder.chartOptSub')}</span>
              </span>
            </button>
          ) : null}
          {chartWa && set.chart.askWhatsapp ? (
          <a className="chart-opt wa" href={chartWa} target="_blank" rel="noopener">
            <WaGlyph size={18} />
            <span>
              <b>{w('chart.waTitle')}</b>
              <span>{w('chart.waText')}</span>
            </span>
          </a>
          ) : null}
        </div>
      ) : null}
      {how.length ? (
        <div className="soft p16 mt16 small chart-how">
          <div className="bold">{w('chart.howTitle')}</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }} className="text2">
            {how.map((f) => (
              <li key={f.key}>
                <Bold text={w('chart.how', { field: f.label, text: howToText(f.label, f.howTo ?? '') })} />
              </li>
            ))}
          </ul>
          <div className="xs muted mt8">{w(chartBottom ? 'chart.tipBottom' : 'chart.tipTop')}</div>
        </div>
      ) : null}
    </PdpModal>
  );
}
