'use client';
// PR 58 — the Find My Size popup's own window (moved out of PdpFinder.tsx by PR 88 so it is its own chunk, fetched when
// the page is idle or on the first open): the two steppers and "Show my size", then the size from this product's chart
// with the reasons, "Between sizes? Take XL", the stock line and "Select size L". It is drawn only while the popup is
// open, so closing it forgets the draft and the answer (as before).
import { useCallback, useRef, useState } from 'react';
import type { Recommendation } from '@extas/catalogue/size-finder';
import { Icon } from '../Icon';
import { bodyWords, sizeFor, startBody, type FitBody } from '@/lib/shop/pdp-finder';
import { Bold } from './Bold';
import { FinderStock, FinderSteps, recordAnswer, recordChoice, useAnswerWords, useTakeSize } from './PdpFinder';
import { PdpModal } from './PdpModal';
import { usePdp } from './PdpRoot';

export function FinderSheet() {
  const { m, finder, body, closeFinder, finderOpener, w, num, unit, setUnit } = usePdp();
  const { label, reasons } = useAnswerWords();
  const take = useTakeSize();
  const [draft, setDraft] = useState<FitBody | null>(null);
  const [answer, setAnswer] = useState<{ b: FitBody; rec: Recommendation } | null>(null);
  const rid = useRef<string | null>(null);
  const close = useCallback(() => closeFinder(), [closeFinder]);

  if (!finder || !m.chart) return null;
  const chart = m.chart;
  const cur = draft ?? startBody(body, finder);
  const show = () => {
    const rec = sizeFor(m, finder, cur);
    if (!rec) return;
    setAnswer({ b: cur, rec });
    rid.current = null;
    if (finder.record) void recordAnswer(m.productId, cur).then((id) => (rid.current = id));
  };
  const select = (size: string, el: Element) => {
    if (!answer) return;
    recordChoice(rid.current, size);
    take(size, answer.b, el);
    close();
  };

  return (
    <PdpModal title={w('finder.title')} closeLabel={w('finder.close')} onClose={close} opener={finderOpener} className="pdp-sheet" testId="finder-modal">
      {answer ? (
        <>
          <div className="pdp-res" data-testid="finder-result">
            <div className="row between top">
              <div>
                <div className="eyebrow">{w('finder.eyebrow', { chart: chart.name })}</div>
                <div className="pdp-res-size mt8" data-testid="finder-size">
                  {label(answer.rec.size)}
                </div>
                <div className="small text2 mt8">{w('finder.for', bodyWords(answer.b, w, num))}</div>
              </div>
              <button type="button" className="pdp-unit" aria-label={w(unit === 'cm' ? 'showIn' : 'showCm')} onClick={() => setUnit(unit === 'cm' ? 'inch' : 'cm')}>
                {w(unit === 'cm' ? 'unitIn' : 'unitCm')}
              </button>
            </div>
            <ul className="pdp-why" data-testid="finder-why">
              {reasons(answer.rec, answer.b).map((x) => (
                <li key={x}>
                  <Icon name="check" size={16} />
                  <span>
                    <Bold text={x} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {answer.rec.next ? (
            <div className="soft p16 small mt12">
              {w('finder.between')}{' '}
              <button type="button" className="link" data-testid="finder-next" onClick={(e) => select(answer.rec.next!, e.currentTarget)}>
                {w('finder.take', { size: label(answer.rec.next) })}
              </button>
            </div>
          ) : (
            <div className="soft p16 small mt12">{w('finder.largestNote')}</div>
          )}
          <FinderStock size={answer.rec.size} />
          <div className="row mt16" style={{ gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAnswer(null)}>
              {w('finder.change')}
            </button>
            <button type="button" className="btn btn-primary grow" data-testid="finder-select" onClick={(e) => select(answer.rec.size, e.currentTarget)}>
              {w('finder.select', { size: label(answer.rec.size) })}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="small text2">
            <Bold text={w('finder.intro', { chart: chart.name })} />
          </div>
          <div className="mt16">
            <FinderSteps value={cur} onChange={setDraft} />
          </div>
          <button type="button" className="btn btn-primary btn-block mt24" data-testid="finder-show" onClick={show}>
            {w('finder.show')}
          </button>
          <div className="xs muted center mt12">{w(finder.remember ? 'finder.privacy' : 'finder.privacyNoSave')}</div>
        </>
      )}
    </PdpModal>
  );
}
