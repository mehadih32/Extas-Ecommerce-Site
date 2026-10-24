'use client';
// S04 · PR 558 — the Parameter for Checkout panel (demo V12.3 ORD-06 "Checkout advance layers", 97s-adm2-orders2.js;
// CN-018 (2) Soft = the delivery charge, Hard = the full amount, a partial option): the one switch, the layers in their
// order (name, on, what counts as a flag, what it asks for), "More options" for the most layers, and Save. Switching
// the feature on asks first ([confirm], with a reason for the audit log). A person with `risk.rules.read` only sees
// it; saving needs `risk.rules.write` (the API checks again). Every word comes from messages/admin-advance.<lang>.json,
// the signals' names from the settings messages (the API sends them).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call, errorText } from '@/components/admin/api';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { ConfirmDialog } from '../settings/ConfirmDialog';

export const REQUIREMENTS = ['NONE', 'DELIVERY_CHARGE', 'PART_AMOUNT', 'FULL_AMOUNT'] as const;
export type Requirement = (typeof REQUIREMENTS)[number];

export interface LayerDraft {
  /** null: a new layer, not saved yet. */
  id: string | null;
  /** The screen's own key for a new layer (React list key). */
  key: string;
  name: string;
  enabled: boolean;
  conditions: { minScore: number | null; bands: string[]; signals: string[] };
  requirement: Requirement;
  partPercent: number | null;
}

export interface AdvancePanel {
  enabled: boolean;
  maxLayers: number;
  maxLayersChoices: readonly number[];
  layers: LayerDraft[];
  bands: { key: string; en: string; bn: string }[];
  signals: { key: string; label: { en: string; bn: string } }[];
  version: string;
}

/** The score choices for "Risk score at least" (every 5 up to 100). */
export const SCORE_STEPS: readonly number[] = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);

const local = (d: Dict, key: string, vars: Record<string, string | number> = {}) => t(d, `advance.${key}`, vars);

/** A layer is complete when it has a name, at least one condition, and a part when it asks for one. */
export function layerProblems(l: LayerDraft): string[] {
  const out: string[] = [];
  if (!l.name.trim()) out.push('name');
  if (l.conditions.minScore === null && !l.conditions.bands.length && !l.conditions.signals.length) out.push('conditions');
  if (l.requirement === 'PART_AMOUNT' && !(l.partPercent && l.partPercent >= 1 && l.partPercent <= 99)) out.push('partPercent');
  return out;
}

/** What the API takes for one layer. */
export const layerBody = (l: LayerDraft) => ({
  ...(l.id ? { id: l.id } : {}),
  name: l.name.trim(),
  enabled: l.enabled,
  conditions: l.conditions,
  requirement: l.requirement,
  partPercent: l.requirement === 'PART_AMOUNT' ? l.partPercent : null,
});

function LayerCard({ d, lang, panel, l, n, count, ro, onChange, onMove, onRemove }: { d: Dict; lang: 'en' | 'bn'; panel: AdvancePanel; l: LayerDraft; n: number; count: number; ro: boolean; onChange(p: Partial<LayerDraft>): void; onMove(by: -1 | 1): void; onRemove(): void }) {
  const uid = useId();
  const c = l.conditions;
  const setC = (p: Partial<LayerDraft['conditions']>) => onChange({ conditions: { ...c, ...p } });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const missing = layerProblems(l);
  return (
    <section className="a2-sc" data-testid="advance-layer" aria-labelledby={`${uid}-h`}>
      <div className="a2-sch">
        <div>
          <div className="a2-scw">{local(d, 'layers.number', { n })}</div>
          <h3 className="a2-h3" id={`${uid}-h`}>
            {l.name.trim() || local(d, 'layers.namePlaceholder')}
          </h3>
        </div>
        <div className="a2-lyctl">
          <button type="button" className="a2-icb a2-up" aria-label={local(d, 'layers.up')} disabled={ro || n === 1} onClick={() => onMove(-1)}>
            <ShellIcon name="cd" size={16} />
          </button>
          <button type="button" className="a2-icb" aria-label={local(d, 'layers.down')} disabled={ro || n === count} onClick={() => onMove(1)}>
            <ShellIcon name="cd" size={16} />
          </button>
          <button type="button" className="a2-icb" aria-label={local(d, 'layers.remove')} title={local(d, 'layers.removeNote')} disabled={ro} onClick={onRemove} data-testid="advance-layer-remove">
            <ShellIcon name="x" size={16} />
          </button>
        </div>
      </div>
      <div className="a2-scb">
        <div className="a2-scv">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-name`}>
              {local(d, 'layers.name')}
            </label>
            <input id={`${uid}-name`} className="a2-inp" value={l.name} maxLength={60} placeholder={local(d, 'layers.namePlaceholder')} disabled={ro} onChange={(e) => onChange({ name: e.target.value })} data-testid="advance-layer-name" />
          </div>
          <div className="a2-fld a2-swl">
            <span>{local(d, 'layers.enabled')}</span>
            <button type="button" className={`a2-sw${l.enabled ? ' on' : ''}`} role="switch" aria-checked={l.enabled} aria-label={local(d, 'layers.enabled')} disabled={ro} onClick={() => onChange({ enabled: !l.enabled })} />
          </div>
        </div>

        <div className="a2-sm a2-b a2-mt12">{local(d, 'layers.flagTitle')}</div>
        <div className="a2-scv a2-mt6">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-score`}>
              {local(d, 'layers.minScore')}
            </label>
            <select id={`${uid}-score`} className="a2-sel" value={c.minScore ?? ''} disabled={ro} onChange={(e) => setC({ minScore: e.target.value === '' ? null : Number(e.target.value) })} data-testid="advance-layer-score">
              <option value="">{local(d, 'layers.minScoreNone')}</option>
              {SCORE_STEPS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="a2-fld">
            <span className="a2-lbl" id={`${uid}-bands`}>
              {local(d, 'layers.bands')}
            </span>
            <div className="a2-chips" role="group" aria-labelledby={`${uid}-bands`}>
              {panel.bands.map((b) => (
                <button key={b.key} type="button" className={`a2-chipt${c.bands.includes(b.key) ? ' on' : ''}`} aria-pressed={c.bands.includes(b.key)} disabled={ro} onClick={() => setC({ bands: toggle(c.bands, b.key) })}>
                  {lang === 'bn' ? b.bn : b.en}
                </button>
              ))}
            </div>
          </div>
        </div>
        <details className="a2-mt12 a2-more-opts">
          <summary className="a2-sm a2-b">{local(d, 'layers.signalsMore', { n: c.signals.length })}</summary>
          <div className="a2-ckgrid a2-mt12">
            {panel.signals.map((s) => (
              <label key={s.key} className="a2-ckb">
                <input type="checkbox" checked={c.signals.includes(s.key)} disabled={ro} onChange={() => setC({ signals: toggle(c.signals, s.key) })} />
                <span>{lang === 'bn' ? s.label.bn : s.label.en}</span>
              </label>
            ))}
          </div>
        </details>
        {missing.includes('conditions') ? (
          <p className="a2-xs a2-mute a2-mt6" role="note">
            {local(d, 'layers.needOne')}
          </p>
        ) : null}

        <div className="a2-sm a2-b a2-mt12">{local(d, 'layers.askTitle')}</div>
        <div className="a2-scv a2-mt6">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-ask`}>
              {local(d, 'layers.askLabel')}
            </label>
            <select id={`${uid}-ask`} className="a2-sel" value={l.requirement} disabled={ro} onChange={(e) => onChange({ requirement: e.target.value as Requirement })} data-testid="advance-layer-ask">
              {REQUIREMENTS.map((r) => (
                <option key={r} value={r}>
                  {local(d, `layers.ask.${r}`)}
                </option>
              ))}
            </select>
            <div className="a2-def">{local(d, `layers.askHint.${l.requirement}`)}</div>
          </div>
          {l.requirement === 'PART_AMOUNT' ? (
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${uid}-pct`}>
                {local(d, 'layers.percent')}
              </label>
              <input id={`${uid}-pct`} className="a2-inp" type="number" inputMode="numeric" min={1} max={99} value={l.partPercent ?? ''} disabled={ro} onChange={(e) => onChange({ partPercent: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })} data-testid="advance-layer-pct" />
              <div className="a2-def">{local(d, 'layers.percentHint')}</div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

let fresh = 0;

/** The whole panel: the switch, the layers, More options and Save. */
export function CheckoutLayers({ d, lang, panel, canWrite, defaultMax }: { d: Dict; lang: 'en' | 'bn'; panel: AdvancePanel; canWrite: boolean; defaultMax: number }) {
  const router = useRouter();
  const [p, setP] = useState(panel);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const ro = !canWrite || busy;
  const setLayer = (i: number, x: Partial<LayerDraft>) => setP((v) => ({ ...v, layers: v.layers.map((l, j) => (j === i ? { ...l, ...x } : l)) }));
  const move = (i: number, by: -1 | 1) =>
    setP((v) => {
      const ls = [...v.layers];
      const [it] = ls.splice(i, 1);
      ls.splice(i + by, 0, it!);
      return { ...v, layers: ls };
    });
  const add = () =>
    setP((v) => ({
      ...v,
      layers: [...v.layers, { id: null, key: `new-${++fresh}`, name: '', enabled: true, conditions: { minScore: null, bands: [], signals: [] }, requirement: 'DELIVERY_CHARGE', partPercent: null }],
    }));
  const remove = (i: number) => setP((v) => ({ ...v, layers: v.layers.filter((_, j) => j !== i) }));
  const incomplete = p.layers.some((l) => layerProblems(l).length > 0);

  const save = async (confirm: boolean, reason: string): Promise<string | null> => {
    setBusy(true);
    setNote(null);
    const a = await call('PUT', '/api/admin/risk/checkout-layers', { version: p.version, enabled: p.enabled, maxLayers: p.maxLayers, layers: p.layers.map(layerBody), ...(confirm ? { confirm: true } : {}), ...(reason ? { reason } : {}) });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      const next = a.data.panel as AdvancePanel;
      const changed = next.version !== p.version;
      setP({ ...next, layers: next.layers.map((l) => ({ ...l, key: l.id ?? `new-${++fresh}` })) });
      setNote({ ok: true, text: local(d, changed ? 'saved' : 'unchanged') });
      setAsking(false);
      router.refresh();
      return null;
    }
    if (a.data.error === 'STALE') router.refresh();
    const text = errorText((d.advance ?? {}) as Dict, a);
    setNote({ ok: false, text });
    return text;
  };
  const onSave = () => {
    if (p.enabled && !panel.enabled) setAsking(true);
    else void save(false, '');
  };

  return (
    <>
      <section className="a2-sc" id="a2s-rr-layers" data-testid="advance-master">
        <div className="a2-sch">
          <div>
            <div className="a2-scw">{t(d, 'advance.where')}</div>
            <h2 className="a2-h3">{local(d, 'master.title')}</h2>
            <p className="a2-scd">{local(d, p.enabled ? 'master.on' : 'master.off')}</p>
          </div>
          <button type="button" className={`a2-sw${p.enabled ? ' on' : ''}`} role="switch" aria-checked={p.enabled} aria-label={local(d, 'master.aria')} disabled={ro} onClick={() => setP((v) => ({ ...v, enabled: !v.enabled }))} data-testid="advance-switch" />
        </div>
        <p className="a2-xs a2-mute a2-mt6">{local(d, 'master.hint')}</p>
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="advance-layers">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="advance-layers">
              {local(d, 'layers.title')}
            </h2>
            <div className="a2-cs">{local(d, 'layers.sub')}</div>
          </div>
          {canWrite ? (
            <button type="button" className="a2-btn" onClick={add} disabled={ro || p.layers.length >= p.maxLayers} title={p.layers.length >= p.maxLayers ? local(d, 'layers.addFull', { max: p.maxLayers }) : undefined} data-testid="advance-add">
              <ShellIcon name="plus" size={15} />
              {local(d, 'layers.add')}
            </button>
          ) : null}
        </div>
        {p.layers.length ? (
          <div className="a2-mt12">
            {p.layers.map((l, i) => (
              <LayerCard key={l.key} d={d} lang={lang} panel={p} l={l} n={i + 1} count={p.layers.length} ro={ro} onChange={(x) => setLayer(i, x)} onMove={(by) => move(i, by)} onRemove={() => remove(i)} />
            ))}
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{local(d, 'layers.none')}</p>
        )}
        {p.layers.length >= p.maxLayers ? <p className="a2-xs a2-mute a2-mt6">{local(d, 'layers.addFull', { max: p.maxLayers })}</p> : null}

        <details className="a2-mt12 a2-more-opts">
          <summary className="a2-sm a2-b">{local(d, 'more.title')}</summary>
          <div className="a2-scv a2-mt12">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="advance-max">
                {local(d, 'more.maxLayers')}
              </label>
              <select id="advance-max" className="a2-sel" value={p.maxLayers} disabled={ro} onChange={(e) => setP((v) => ({ ...v, maxLayers: Number(e.target.value) }))}>
                {p.maxLayersChoices.map((n) => (
                  <option key={n} value={n} disabled={n < p.layers.length}>
                    {local(d, 'more.layers', { n })}
                  </option>
                ))}
              </select>
              <div className="a2-def">{local(d, 'more.default', { v: local(d, 'more.layers', { n: defaultMax }) })}</div>
            </div>
          </div>
        </details>

        {canWrite ? (
          <div className="a2-gap8 a2-mt12">
            <button type="button" className="a2-btn pri" onClick={onSave} disabled={busy || incomplete} aria-busy={busy || undefined} data-testid="advance-save">
              {local(d, busy ? 'saving' : 'save')}
            </button>
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12">{local(d, 'readOnly')}</p>
        )}
        {note ? (
          <div className={`a2-note${note.ok ? '' : ' bad'} a2-mt12`} role={note.ok ? 'status' : 'alert'} data-testid="advance-note">
            <ShellIcon name={note.ok ? 'check' : 'alert'} size={15} />
            <span>{note.text}</span>
          </div>
        ) : null}
      </section>
      {asking ? (
        <ConfirmDialog
          testId="dlg-advance-on"
          texts={{
            title: local(d, 'confirm.title'),
            effects: ['who', 'cod', 'words', 'price'].map((k) => local(d, `confirm.effects.${k}`)),
            reason: local(d, 'confirm.reason'),
            cancel: local(d, 'confirm.cancel'),
            ok: local(d, 'confirm.ok'),
            working: local(d, 'confirm.working'),
            close: local(d, 'confirm.close'),
          }}
          onClose={() => setAsking(false)}
          onConfirm={(reason) => save(true, reason)}
        />
      ) : null}
    </>
  );
}
