'use client';
// PR 51 — template T3, fit-first (Blueprint D3.7, demo 30-product.js pdp_t3Card / ACT['pdp-t3-*']): one card holding
// the sizes, then Find My Size right there ("Your size · Find my size", the height and weight steppers, "Show my size"),
// or once answered "Your size: L · From 5'7" · 66 kg" with Change and the reasons ("Why L?"), then the chosen size's
// measurements as tiles with the inch / cm switch. On a phone the card has no frame and the sizes lead, so the first
// screen holds the same choices as every template (PR 53); on a computer the sizes join the other choices and the
// finder and measurements follow the buttons in their own box (demo r12-zzdesk-b.css). The demo's "Fit from N reviews"
// and "Customers like you" wait for real reviews (follow-up). Each part has its own switch (`pdp.templates.t3`).
import { useState } from 'react';
import type { PdpTemplatesSettings } from '@extas/settings';
import { Icon } from '../Icon';
import { measureParts, measureText } from '@/lib/shop/pdp-size';
import { bodyWords, sizeFor, startBody, type FitBody } from '@/lib/shop/pdp-finder';
import { Bold } from './Bold';
import { FinderSteps, recordAnswer, recordChoice, useAnswerWords, useTakeSize } from './PdpFinder';
import { usePdp } from './PdpRoot';
import { PdpSizes } from './PdpSizes';

type SizesProps = Parameters<typeof PdpSizes>[0];

export function PdpT3Card({ t3, sizes }: { t3: PdpTemplatesSettings['t3']; sizes: SizesProps }) {
  const { m, choice, finder, body, yours, w, num, unit, setUnit } = usePdp();
  const { label, reasons } = useAnswerWords();
  const take = useTakeSize();
  const [edit, setEdit] = useState(false);
  const [why, setWhy] = useState(false);
  const [draft, setDraft] = useState<FitBody | null>(null);

  const inline = Boolean(finder && t3.inlineFinder && m.chart);
  const answered = inline && yours && body && !edit ? { rec: yours, b: body } : null;
  const cur = finder ? (draft ?? startBody(body, finder)) : null;
  const find = (el: Element) => {
    if (!finder || !cur) return;
    const rec = sizeFor(m, finder, cur);
    if (!rec) return;
    const taken = take(rec.size, cur, el);
    setEdit(false);
    setWhy(t3.whyOpen);
    setDraft(null);
    if (finder.record) void recordAnswer(m.productId, cur).then((id) => (taken ? recordChoice(id, rec.size) : undefined));
  };

  const top = !inline || !cur ? null : answered ? (
    <div className="pdp-t3-top" data-testid="t3-yours">
      <div className="row between top">
        <div>
          <div className="pdp-ys">
            <Bold text={w('finder.t3.yours', { size: label(answered.rec.size) })} cls="brandc" />
          </div>
          <div className="xs text2">{w('finder.t3.from', bodyWords(answered.b, w, num))}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" data-testid="t3-change" onClick={() => setEdit(true)}>
          {w('finder.t3.change')}
        </button>
      </div>
      {why ? (
        <>
          <ul className="pdp-why" data-testid="t3-why">
            {reasons(answered.rec, answered.b).map((x) => (
              <li key={x}>
                <Icon name="check" size={16} />
                <span>
                  <Bold text={x} />
                </span>
              </li>
            ))}
          </ul>
          {answered.rec.next ? (
            <div className="xs text2 mt8">
              <Bold text={w('finder.t3.next', { size: label(answered.rec.next) })} />
            </div>
          ) : null}
        </>
      ) : (
        <button type="button" className="link" data-testid="t3-whybtn" onClick={() => setWhy(true)}>
          {w('finder.t3.why', { size: label(answered.rec.size) })}
        </button>
      )}
    </div>
  ) : (
    <div className="pdp-t3-top" data-testid="t3-ask">
      <div className="row between top">
        <div>
          <div className="eyebrow">{w('finder.tag')}</div>
          <div className="h2" style={{ marginTop: 2 }}>
            {w('finder.t3.title')}
          </div>
        </div>
        {yours && body ? (
          <button type="button" className="link" onClick={() => {
              setEdit(false);
              setDraft(null);
            }}
          >
            {w('finder.t3.cancel')}
          </button>
        ) : null}
      </div>
      <div className="xs text2 mb12">{w('finder.t3.sub', { chart: m.chart?.name ?? '' })}</div>
      <FinderSteps value={cur} onChange={setDraft} />
      <button type="button" className="btn btn-primary btn-block mt16" data-testid="t3-find" onClick={(e) => find(e.currentTarget)}>
        <Icon name="ruler" size={18} />
        {w('finder.show')}
      </button>
    </div>
  );

  const chosen = m.sizes.find((s) => s.key === choice.size) ?? null;
  // the tiles carry their own inch / cm switch (demo), whatever the size row's line does (`pdp.size.unitToggle`)
  const u = unit;
  const parts = measureParts(m.chart, choice.size, u);
  const rest =
    t3.measures && m.chart ? (
      <div className={`pdp-t3-rest${top ? '' : ' solo'}`}>
        <div className="row between mt16">
          <span className="pdp-lbl">{chosen ? w('finder.t3.measuresOf', { size: chosen.label }) : w('finder.t3.measures')}</span>
          <button type="button" className="pdp-unit" aria-label={w(unit === 'cm' ? 'showIn' : 'showCm')} onClick={() => setUnit(unit === 'cm' ? 'inch' : 'cm')}>
            {w(unit === 'cm' ? 'unitIn' : 'unitCm')}
          </button>
        </div>
        {chosen && parts.length ? (
          <div className="pdp-meas" data-testid="t3-meas">
            {parts.map((p) => (
              <div key={p.field}>
                <span className="tiny muted">{p.field}</span>
                <b>{w(u === 'cm' ? 'cm' : 'inch', { v: num(measureText(p.value)) })}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="xs muted mt8">{w('finder.t3.choose')}</div>
        )}
      </div>
    ) : null;

  return (
    <div className="pdp-sec pdp-t3sec">
      <div className="pdp-box pdp-t3" id="pdp-t3" data-testid="t3-card">
        <PdpSizes {...sizes} cls="pdp-t3-sizes" />
        {top}
        {rest}
      </div>
    </div>
  );
}
