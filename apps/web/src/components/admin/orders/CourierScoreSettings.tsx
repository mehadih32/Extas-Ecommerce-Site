'use client';
// S28 · PR 662 — Rules › Order flow › Courier score (prototype m-rules.js "score"): the switch, the two limits, the six
// checks with weight and the two point limits, a live worked example, and where each number comes from. Saved whole to
// /api/admin/risk/courier-score with the card's version (STALE when someone else saved first). Staff only; customers never
// see the score. Words come from the page (`t`), numbers from the setting; nothing here moves an order or money.
import { useId, useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { LOWER_IS_BETTER, SCORE_METRICS, example, type ScoreCfg, type ScoreMetric } from '@/lib/admin-orders/courier-score-math';

export interface CourierScoreSettingsProps {
  url: string;
  screen: { key: string; value: ScoreCfg; version: string };
  canEdit: boolean;
  /** Worked-example figures (a sample number's history). */
  sample: Record<ScoreMetric, number>;
  /** The page's words. */
  t: Record<string, string>;
  /** Where each check's number comes from (one line per check, from the connected couriers). */
  sources: Record<ScoreMetric, string>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function CourierScoreSettings({ url, screen, canEdit, sample, t, sources }: CourierScoreSettingsProps) {
  const id = useId();
  const [base, setBase] = useState(screen);
  const [draft, setDraft] = useState<ScoreCfg>(screen.value);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const dirty = !same(draft, base.value);
  const off = !canEdit || busy;
  const ex = example(draft, sample);
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setMetric = (k: ScoreMetric, f: 'weight' | 'good' | 'ok', v: string) => {
    setDraft({ ...draft, [k]: { ...draft[k], [f]: num(v) } });
    setSaid(null);
  };

  async function save() {
    setBusy(true);
    const a = await call('PUT', url, { key: base.key, value: draft, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      const c = (a.data.cards as Record<string, { key: string; value: ScoreCfg; version: string }>).courierScore;
      if (c) {
        setBase(c);
        setDraft(c.value);
      }
      setSaid(null);
      return showToast({ text: t.saved ?? '', tone: 'ok' });
    }
    if (a.data.error === 'STALE') {
      const g = await call('GET', url);
      const c = g.status === 200 ? (g.data.cards as Record<string, { key: string; value: ScoreCfg; version: string }>).courierScore : null;
      if (c) {
        setBase(c);
        setDraft(c.value);
      }
    }
    setSaid(t[`err.${a.status === 0 ? 'network' : (a.data.error ?? 'other')}`] ?? t['err.other'] ?? '');
  }

  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="risk-courier-score">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {t.h}
          </h2>
          <p className="a2-scd">{t.d}</p>
        </div>
      </div>
      {!canEdit ? <div className="a2-note">{t.readOnly}</div> : null}
      <div className="a2-swl a2-mt12">
        <span>{t.enabled}</span>
        <button
          type="button"
          className={`a2-sw${draft.enabled ? ' on' : ''}`}
          role="switch"
          aria-checked={draft.enabled}
          aria-label={t.enabled}
          disabled={off}
          onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          data-testid="risk-courier-score-enabled"
        />
      </div>
      <div className="a2-fg a2-mt12">
        {(['upperScore', 'lowerScore'] as const).map((f) => (
          <div className="a2-fld" key={f}>
            <label className="a2-lbl" htmlFor={`${id}-${f}`}>
              {t[f]}
            </label>
            <input
              id={`${id}-${f}`}
              className="a2-inp"
              type="number"
              step={0.5}
              min={0}
              max={10}
              value={String(draft[f])}
              disabled={off}
              onChange={(e) => setDraft({ ...draft, [f]: num(e.target.value) })}
              data-testid={`risk-courier-score-${f}`}
            />
          </div>
        ))}
      </div>
      <div className="a2-tblw a2-mt12">
        <table className="a2-tbl">
          <thead>
            <tr>
              <th>{t.check}</th>
              <th className="r">{t.weight}</th>
              <th className="r">{t.p10}</th>
              <th className="r">{t.p5}</th>
            </tr>
          </thead>
          <tbody>
            {SCORE_METRICS.map((k) => (
              <tr key={k} data-metric={k}>
                <td className="a2-tdh">
                  {t[`m.${k}`]}
                  <span className="a2-xs a2-mute a2-blk">{LOWER_IS_BETTER.includes(k) ? t.lower : t.higher}</span>
                  <span className="a2-xs a2-mute a2-blk">{sources[k]}</span>
                </td>
                {(['weight', 'good', 'ok'] as const).map((f) => (
                  <td className="r" key={f} data-l={t[f === 'weight' ? 'weight' : f === 'good' ? 'p10' : 'p5']}>
                    <input
                      className="a2-inp"
                      style={{ maxWidth: 88 }}
                      type="number"
                      min={0}
                      aria-label={`${t[`m.${k}`]} ${t[f === 'weight' ? 'weight' : f === 'good' ? 'p10' : 'p5']}`}
                      value={String(draft[k][f])}
                      disabled={off}
                      onChange={(e) => setMetric(k, f, e.target.value)}
                      data-testid={`risk-courier-score-${k}-${f}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="a2-h4 a2-mt12">{t.exampleH}</h3>
      <div className="a2-lines" data-testid="risk-courier-score-example">
        {ex.rows.map((r) => (
          <div className="a2-rule" key={r.key}>
            <span>
              {t[`m.${r.key}`]}: <b>{r.value}</b>
            </span>
            <span className="a2-xs">
              {r.points} × {r.weightPct}%
            </span>
          </div>
        ))}
        <div className="a2-rule">
          <b>{t.score}</b>
          <b data-testid="risk-courier-score-total">
            {ex.score}/10 · {t[`band.${ex.band}`]}
          </b>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{t.unknownNote}</p>
      <div className="a2-scbar">
        <span className="a2-sm" role="status" aria-live="polite" data-testid="risk-courier-score-status">
          {said ?? (dirty ? t.unsaved : '')}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => setDraft(base.value)}>
                {t.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="risk-courier-score-save">
              {busy ? t.saving : t.save}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
