'use client';
// PR 629 (CN-036, LUMEN-SPEC §3 item 6) — settings switch cards (Settings, Alerts, Banners, Menus, Courier rates,
// Assistants): one switch per card, every one off as shipped (the page passes what is stored; CN-018); turning one on
// folds out its own number fields (what counts as safe or risky COD, amounts, days, limits, which sizes count as low:
// each a backend setting with options, never a question to the owner). A change is saved at once through the page's
// own admin API (the settings resolver keeps who and when) and the toast offers Undo. A card whose kind is guarded
// (money, refunds, COD, prices, discounts, blocking, deleting: lib/admin-lumen/safety.ts) first asks in the card
// itself, with the page's own words, and gets no Undo (hard rule 6). Numbers are kept inside their bounds before saving.
import { useId, useState } from 'react';
import { callAllowed, runCall, undoAllowed, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { useLumen } from './context';
import { showToast } from './Toast';

export interface SettingCardField {
  name: string;
  label: string;
  kind: 'number' | 'select';
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly { value: string; label: string }[];
  hint?: string;
}

export interface SettingCardDef {
  key: string;
  title: string;
  text?: string;
  on: boolean;
  /** The action kind (safety.ts); default a plain setting switch. A guarded kind asks first and has no Undo. */
  kind?: string;
  /** What the card asks before a guarded change. */
  confirm?: string;
  fields?: readonly SettingCardField[];
}

type Vals = Record<string, number | string>;

/** A number kept inside its field's bounds (and its step's whole units); anything unreadable keeps the old value. */
export function clampField(f: SettingCardField, raw: string, old: number | string): number | string {
  if (f.kind !== 'number') return (f.options ?? []).some((o) => o.value === raw) ? raw : old;
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n)) return old;
  let v = n;
  if (f.min !== undefined) v = Math.max(f.min, v);
  if (f.max !== undefined) v = Math.min(f.max, v);
  if (f.step && f.step >= 1) v = Math.round(v / f.step) * f.step;
  return v;
}

const valsOf = (c: SettingCardDef): Vals => Object.fromEntries((c.fields ?? []).map((f) => [f.name, f.value]));

function Card({ card, save }: { card: SettingCardDef; save: LmCall }) {
  const { lt } = useLumen();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [on, setOn] = useState(card.on);
  const [vals, setVals] = useState<Vals>(() => valsOf(card));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const kind = card.kind ?? 'setting.switch';
  const guarded = !undoAllowed(kind);

  const store = async (nextOn: boolean, nextVals: Vals, undo: { on: boolean; vals: Vals } | null) => {
    if (!callAllowed(save)) return false;
    setBusy(true);
    const ok = await runCall(withBody(save, { key: card.key, on: nextOn, values: nextVals }));
    setBusy(false);
    if (!ok) {
      showToast({ text: lt('failed'), tone: 'bad' });
      return false;
    }
    setOn(nextOn);
    setVals(nextVals);
    showToast({
      text: lt('saved', { what: card.title }),
      undo:
        undo && !guarded
          ? {
              kind,
              run: async () => {
                const u = await runCall(withBody(save, { key: card.key, on: undo.on, values: undo.vals }));
                if (u) {
                  setOn(undo.on);
                  setVals(undo.vals);
                  setDraft({});
                }
                return u;
              },
            }
          : undefined,
    });
    return true;
  };

  const flip = () => {
    if (busy) return;
    if (guarded) {
      setAsk(true);
      return;
    }
    void store(!on, vals, { on, vals });
  };

  const commit = (f: SettingCardField) => {
    const raw = draft[f.name];
    if (raw === undefined) return;
    const old = vals[f.name] ?? f.value;
    const v = clampField(f, raw, old);
    setDraft((d) => {
      const n = { ...d };
      delete n[f.name];
      return n;
    });
    if (v === old) return;
    void store(on, { ...vals, [f.name]: v }, { on, vals });
  };

  return (
    <section className={`lm-setc${on ? ' on' : ''}`} data-testid={`lm-setc-${card.key}`} aria-labelledby={`${uid}-t`}>
      <div className="lm-setr">
        <div>
          <h3 id={`${uid}-t`}>{card.title}</h3>
          {card.text ? <p>{card.text}</p> : null}
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby={`${uid}-t`} className={`lm-sw${on ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid={`lm-sw-${card.key}`}>
          <span aria-hidden="true" />
        </button>
      </div>
      {ask ? (
        <div className="lm-ask" role="alertdialog" aria-labelledby={`${uid}-q`}>
          <p id={`${uid}-q`}>{card.confirm ?? lt('askSure')}</p>
          <div>
            <button type="button" className="lm-btn sm gh" onClick={() => setAsk(false)}>
              {lt('cancel')}
            </button>
            <button
              type="button"
              className="lm-btn sm pri"
              onClick={async () => {
                setAsk(false);
                await store(!on, vals, null);
              }}
              data-testid={`lm-ask-yes-${card.key}`}
            >
              {on ? lt('yesOff') : lt('yesOn')}
            </button>
          </div>
        </div>
      ) : null}
      {card.fields?.length ? (
        <div className="lm-fold" hidden={!on} data-testid={`lm-fold-${card.key}`}>
          {card.fields.map((f) => {
            const id = `${uid}-${f.name}`;
            const v = draft[f.name] ?? String(vals[f.name] ?? f.value);
            return (
              <div key={f.name} className="lm-fl">
                <label htmlFor={id}>{f.label}</label>
                {f.kind === 'select' ? (
                  <select id={id} className="lm-inp" value={v} disabled={busy} onChange={(e) => void store(on, { ...vals, [f.name]: clampField(f, e.target.value, vals[f.name] ?? f.value) }, { on, vals })}>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="lm-inp-w">
                    <input
                      id={id}
                      className="lm-inp"
                      type="number"
                      inputMode="decimal"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={v}
                      disabled={busy}
                      aria-describedby={f.hint ? `${id}-h` : undefined}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                      onBlur={() => commit(f)}
                      onKeyDown={(e) => e.key === 'Enter' && commit(f)}
                    />
                    {f.unit ? <span className="lm-unit">{f.unit}</span> : null}
                  </span>
                )}
                {f.hint ? (
                  <small id={`${id}-h`} className="lm-hint">
                    {f.hint}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function SettingCards({ cards, save, testId = 'lm-setcards' }: { cards: readonly SettingCardDef[]; save: LmCall; testId?: string }) {
  return (
    <div className="lm-setcards" data-testid={testId}>
      {cards.map((c) => (
        <Card key={c.key} card={c} save={save} />
      ))}
    </div>
  );
}
