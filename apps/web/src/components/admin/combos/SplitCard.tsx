'use client';
// CN-018 (4) · PR 89 follow-up (SIM-F-051) — "When only some pieces of a set stay", under the fixed combos: the store's
// `combos.split` (off as shipped) and, on each combo card, the set's own choice. A Fixed set is kept or returned whole
// (a partial delivery or return that splits it is refused; the sticker tells the rider); a Flexible set's kept pieces
// cost their share of the set price or each its own price, and a free-delivery order may owe the delivery charge when
// the kept part falls under the limit. It only changes the rider's expected amount on a door record a person
// approves. Changing it is the owner's money decision (`combos.prices`); the API checks again.
import { useState } from 'react';
import type { ComboView } from '@extas/combos';
import type { ComboSplitSettings } from '@extas/settings';
import { call, errorText } from '../api';
import { t, type Dict } from '@/lib/i18n';
import { COMBOS_API } from './ComboEditor';
import { Row, Switch } from './parts';

/** The set's own choice as one select value: the store's default, Fixed, or Flexible with its rule. */
export type SetChoice = 'default' | 'FIXED' | 'PRO_RATA' | 'OWN_PRICE';

export function setChoiceOf(c: Pick<ComboView, 'splitMode' | 'splitPriceRule'>, split: ComboSplitSettings): SetChoice {
  if (!c.splitMode) return 'default';
  if (c.splitMode === 'FIXED') return 'FIXED';
  return c.splitPriceRule ?? split.priceRule;
}

export function splitOfChoice(v: SetChoice): { splitMode: 'FIXED' | 'FLEXIBLE' | null; splitPriceRule: 'PRO_RATA' | 'OWN_PRICE' | null } {
  if (v === 'default') return { splitMode: null, splitPriceRule: null };
  if (v === 'FIXED') return { splitMode: 'FIXED', splitPriceRule: null };
  return { splitMode: 'FLEXIBLE', splitPriceRule: v };
}

/** What the store's default means, in words (the set select's first option). */
const defaultWhat = (tt: (k: string) => string, s: ComboSplitSettings) => (s.defaultMode === 'FIXED' ? tt('split.setChoice.FIXED') : tt(`split.setChoice.${s.priceRule}`));

/** The combo card's select (only while the store's setting is on). */
export function SetSplitRow({ dict: d, combo: c, split, name, canEdit, onChange, onError }: { dict: Dict; combo: ComboView; split: ComboSplitSettings; name: string; canEdit: boolean; onChange(c: ComboView): void; onError(text: string): void }) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const [busy, setBusy] = useState(false);
  const pick = async (v: SetChoice) => {
    setBusy(true);
    const a = await call('POST', `${COMBOS_API}/${c.id}/split`, splitOfChoice(v));
    setBusy(false);
    if (!a.data.ok) return onError(errorText(d, a));
    onChange(a.data.combo as ComboView);
  };
  return (
    <Row label={tt('split.setLabel')}>
      <select className="ad-input cb-split-sel" aria-label={tt('split.setLabelOf', { name })} value={setChoiceOf(c, split)} disabled={!canEdit || busy} onChange={(e) => void pick(e.target.value as SetChoice)} data-testid={`cb-split-${c.slug}`}>
        <option value="default">{tt('split.setChoice.default', { what: defaultWhat(tt, split) })}</option>
        <option value="FIXED">{tt('split.setChoice.FIXED')}</option>
        <option value="PRO_RATA">{tt('split.setChoice.PRO_RATA')}</option>
        <option value="OWN_PRICE">{tt('split.setChoice.OWN_PRICE')}</option>
      </select>
    </Row>
  );
}

/** The store's card, folded under "More options" (rarely changed). */
export function SplitCard({ dict: d, split: start, canEdit, onSaved }: { dict: Dict; split: ComboSplitSettings; canEdit: boolean; onSaved(s: ComboSplitSettings): void }) {
  const tt = (k: string) => t(d, `combos.${k}`);
  const [s, setS] = useState(start);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !canEdit || busy;
  const save = async (patch: Partial<ComboSplitSettings>) => {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', `${COMBOS_API}/split`, patch);
    setBusy(false);
    if (!a.data.ok) return setSaid({ text: errorText(d, a), bad: true });
    const next = a.data.split as ComboSplitSettings;
    setS(next);
    onSaved(next);
    setSaid({ text: tt('split.saved'), bad: false });
  };
  return (
    <details className="cb-more" open={s.enabled || undefined} data-testid="cb-split-card">
      <summary data-testid="cb-split-open">{tt('split.more')}</summary>
      <section className="ad-card cb-split" aria-labelledby="cb-split-h" data-testid="cb-split-open-panel">
        <h3 className="cb-h3" id="cb-split-h">
          {tt('split.title')}
        </h3>
        <p className="ad-mini">{tt('split.intro')}</p>
        <Row label={<b>{tt('split.on')}</b>} hint={s.enabled ? undefined : tt('split.offNote')}>
          <Switch on={s.enabled} label={tt('split.on')} disabled={off} onChange={(v) => void save({ enabled: v })} />
        </Row>
        {s.enabled ? (
          <>
            <Row label={tt('split.defaultMode')}>
              <select className="ad-input cb-split-sel" aria-label={tt('split.defaultMode')} value={s.defaultMode} disabled={off} onChange={(e) => void save({ defaultMode: e.target.value as ComboSplitSettings['defaultMode'] })}>
                <option value="FLEXIBLE">{tt('split.modes.FLEXIBLE')}</option>
                <option value="FIXED">{tt('split.modes.FIXED')}</option>
              </select>
            </Row>
            <Row label={tt('split.priceRule')}>
              <select className="ad-input cb-split-sel" aria-label={tt('split.priceRule')} value={s.priceRule} disabled={off} onChange={(e) => void save({ priceRule: e.target.value as ComboSplitSettings['priceRule'] })}>
                <option value="PRO_RATA">{tt('split.rules.PRO_RATA')}</option>
                <option value="OWN_PRICE">{tt('split.rules.OWN_PRICE')}</option>
              </select>
            </Row>
            <Row label={tt('split.charge')} hint={tt('split.chargeHint')}>
              <Switch on={s.chargeUnderFreeLimit} label={tt('split.charge')} disabled={off} onChange={(v) => void save({ chargeUnderFreeLimit: v })} />
            </Row>
          </>
        ) : null}
        {!canEdit ? <div className="ad-mini">{tt('split.ownerOnly')}</div> : null}
        {said ? (
          <div className={`ad-mini${said.bad ? ' bad' : ''}`} role={said.bad ? 'alert' : 'status'}>
            {said.text}
          </div>
        ) : null}
      </section>
    </details>
  );
}
