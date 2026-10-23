'use client';
// PR 56 — the sizes (Blueprint D3.5, demo 30-product.js pdp_sizeOnly / pdp_sizeHead / pdp_pills / pdp_fitLineHTML):
// "Size – Choose your size" with "Size chart" on its right, one box per size on one row, a size out of stock in this
// colour crossed out and not tappable (its name says so), a size gone in every colour crossed out or left out
// (SIM-F-035), and under them the chosen size's measurements on one line. "Please choose a size" shows only after a
// buy button was pressed without one (A8: one message, beside the boxes). A one-size product says so and is chosen.
// Follow-up 62 (SIM-F-047): the owner's word under each box (`pdp.sizeWords`), and "Your size" on the size this browser
// last put in the bag (`pdp.usualSize`), with the colours that have it when the one shown is sold out in it.
import { Fragment, useState } from 'react';
import type { PdpSizeSettings } from '@extas/settings';
import { Icon } from '../Icon';
import { measureParts, measureText, sizePills } from '@/lib/shop/pdp-size';
import { colourKeyOf, isOneSize, NO_COLOUR } from '@/lib/shop/product-model';
import { usualElsewhere } from '@/lib/shop/usual-size';
import { Bold } from './Bold';
import { PdpChart } from './PdpChart';
import { PdpNotify } from './PdpNotify';
import { wakeBar } from './PdpColour';
import { usePdp } from './PdpRoot';

export function PdpSizes({ oneSizeNote, fitPos, fitWord }: { oneSizeNote: string | null; fitPos: number | null; fitWord: string }) {
  const pdp = usePdp();
  const { m, set, choice, err, unit, w, num, pickSize, pickColour, setUnit, usualSize } = pdp;
  // SIM-F-035: a crossed-out size asks "tell me when it is back" (off by default, `pdp.size.notifyBack`)
  const [notify, setNotify] = useState<string | null>(null);
  if (!m.sizes.length) return null;
  const colour = m.colours.find((c) => c.key === choice.colour)?.name ?? '';
  const sweep = (on: boolean) => (on ? ' sweep' : '');

  if (isOneSize(m)) {
    const label = m.sizes[0]?.label || w('oneSize');
    return (
      <div className="pdp-sec" id="pdp-sizes">
        <div className="pdp-lblrow">
          <span className="pdp-lbl">
            {w('size')} <span className="pdp-lblv">{label}</span>
          </span>
        </div>
        {oneSizeNote ? (
          <div className="row between xs mt12 pdp-fitline" style={{ gap: 10 }}>
            <span>
              <Bold text={w('oneSizeLine', { size: label, note: oneSizeNote })} cls="pdp-fsz" />
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  const pills = sizePills(m, choice, set.size.soldOutEverywhere);
  const ask = set.size.notifyBack && m.onSale;
  const notifyPill = ask && notify ? pills.find((p) => p.key === notify && p.out) : null;
  const notifyVariant = notifyPill ? (m.variants.find((x) => colourKeyOf(x) === (choice.colour ?? NO_COLOUR) && x.size === notifyPill.key)?.id ?? null) : null;
  const chosen = m.sizes.find((s) => s.key === choice.size) ?? null;
  const parts = set.size.measureLine ? measureParts(m.chart, choice.size, set.size.unitToggle ? unit : 'inch') : [];
  const fmt = (v: number) => w(set.size.unitToggle && unit === 'cm' ? 'cm' : 'inch', { v: num(measureText(v)) });
  const fieldWord = (f: string) => (pdp.lang === 'bn' ? f : f.toLowerCase());
  const sizeWords = set.sizeWords;
  const worded = pills.some((p) => sizeWords[p.key]);
  const usualPill = usualSize ? pills.find((p) => p.key === usualSize) : undefined;
  const elsewhere = usualPill?.out ? usualElsewhere(m, choice.colour, usualPill.key) : [];
  // the box's name says its word and "your size" too (both are drawn aria-hidden)
  const ariaOf = (p: (typeof pills)[number]) => {
    const size = sizeWords[p.key] ? `${p.label} ${sizeWords[p.key]}` : p.label;
    const label = p.gone ? w('sizeGoneAria', { size }) : p.out ? w('sizeOutAria', { size, colour }) : w('sizeAria', { size });
    return p.key === usualSize ? w('usual.aria', { label }) : label;
  };

  return (
    <div className="pdp-sec" id="pdp-sizes">
      <div className="pdp-lblrow" data-fitrow="">
        <span className={`pdp-lbl pdp-fitt${sweep(set.sweep.sizeLabel)}`}>
          {w('size')}{' '}
          {chosen ? (
            <span className="pdp-lblv on">{chosen.label}</span>
          ) : (
            <span className="pdp-lblv unset pdp-fx" data-fx-max="1" data-fx-ord="2" data-l="0">
              <span className="pf pf0">{w('chooseSize')}</span>
              <span className="pf pf1">{w('chooseSizeShort')}</span>
            </span>
          )}
        </span>
        {m.chart && set.chart.on ? <PdpChart /> : null}
      </div>
      <div
        className={`pdp-pills${err ? ' err' : ''}${set.sweep.sizePills ? ' shine' : ''}${worded ? ' worded' : ''}`}
        role="radiogroup"
        aria-label={w('size')}
        style={{ gridTemplateColumns: `repeat(${pills.length},minmax(0,1fr))` }}
        data-n={pills.length}
      >
        {pills.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`size-pill${p.on ? ' on' : ''}${p.out ? ' out' : ''}${p.gone ? ' gone' : ''}${p.key === usualSize ? ' tagged' : ''}`}
            disabled={p.out && !ask}
            aria-disabled={p.out || undefined}
            role="radio"
            aria-checked={p.on}
            aria-label={ariaOf(p)}
            data-s={p.key}
            onClick={() => {
              if (p.out) return setNotify(notify === p.key ? null : p.key);
              setNotify(null);
              pickSize(p.key);
              wakeBar();
            }}
          >
            {p.label}
            {sizeWords[p.key] ? (
              <span className="size-w" aria-hidden="true">
                {sizeWords[p.key]}
              </span>
            ) : null}
            {p.key === usualSize ? (
              <span className="pdp-ystag" aria-hidden="true">
                {w('usual.tag')}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {usualPill?.out ? (
        <div className="xs mt8 pdp-ysout" data-testid="pdp-usual-out">
          {w('usual.out', { size: usualPill.label, colour })}
          {elsewhere.length ? (
            <>
              {' '}
              {w('usual.inStock')}{' '}
              {elsewhere.map((x, i) => (
                <Fragment key={x.key}>
                  {i ? ', ' : null}
                  <button type="button" className="link pdp-yslink" onClick={() => pickColour(x.key)}>
                    {x.name}
                  </button>
                </Fragment>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {notifyPill ? (
        <PdpNotify key={notifyPill.key} variantId={notifyVariant} what={colour ? w('notify.sizeIn', { size: notifyPill.label, colour }) : notifyPill.label} onClose={() => setNotify(null)} />
      ) : null}
      {err ? (
        <div className="pdp-err small" role="alert">
          <Icon name="info" size={15} />
          {w('pickSize')}
        </div>
      ) : null}
      {set.size.measureLine && m.chart ? (
        <div className="row between xs mt12 pdp-fitline" style={{ gap: 10 }}>
          <span className="pdp-fitx" data-shown={parts.length}>
            {parts.length && chosen ? (
              parts.map((p, i) => (
                <Fragment key={p.field}>
                  {i ? <span className="pdp-fdot">{' · '}</span> : null}
                  <span className="pdp-fi">
                    <Bold
                      text={i === 0 ? w('fitsFirst', { size: chosen.label, field: fieldWord(p.field), value: fmt(p.value) }) : w('fitsMore', { field: fieldWord(p.field), value: fmt(p.value) })}
                    />
                  </span>
                </Fragment>
              ))
            ) : (
              <>
                <bdi className="hide-d">{w('tapSize')}</bdi>
                <bdi className="hide-m">{w('pickSizeDesk')}</bdi>
              </>
            )}
          </span>
          {set.size.unitToggle ? (
            <button type="button" className="pdp-unit" aria-label={w(unit === 'cm' ? 'showIn' : 'showCm')} onClick={() => setUnit(unit === 'cm' ? 'inch' : 'cm')}>
              {w(unit === 'cm' ? 'unitIn' : 'unitCm')}
            </button>
          ) : null}
        </div>
      ) : null}
      {set.size.fitBar && fitPos !== null ? (
        <div className="mt16">
          <div className="pdp-fit">
            <div className="fitbar" role="img" aria-label={w('fitAria', { word: fitWord })}>
              <span style={{ left: `calc(${fitPos}% - 6px)` }} />
            </div>
            <div className="row between tiny muted mt8">
              <span>{w('fitSmall')}</span>
              <span>{w('fitTrue')}</span>
              <span>{w('fitLarge')}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
