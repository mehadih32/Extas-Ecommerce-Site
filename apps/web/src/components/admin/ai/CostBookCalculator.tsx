'use client';
// S15 · PR 316 (Blueprint C2.5 "the free-form cost calculator") — beside the per-job table: the owner (or whoever
// has `ai.control`) describes a piece of work as one or more lines (an existing job, how many runs, optionally how
// much bigger/smaller than usual) and gets a cost before committing — `POST /api/admin/ai/cost-book/calculator`,
// the same server-side cost model the book's own rows use. Nothing here is saved unless "Save as plan" is pressed.
import { useId, useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface CalcJobOption {
  key: string;
  name: string;
  sectionName: string;
  models: { modelKey: string; label: string; isRecommended: boolean }[];
}

interface Line {
  jobTypeKey: string;
  quantity: string;
  scale: string;
  modelKey: string;
}

interface LineAnswer {
  jobTypeKey: string;
  nameEn: string;
  nameBn: string;
  modelKey: string;
  isRecommended: boolean;
  quantity: number;
  perRunUsdMinor: number;
  totalUsdMinor: number;
  totalStoreMinor: number | null;
  alternatives: { modelKey: string; displayName: string; totalUsdMinor: number; totalStoreMinor: number | null }[];
}

interface PlanAnswer {
  lines: LineAnswer[];
  totalUsdMinor: number;
  totalStoreMinor: number | null;
  recommendationNote: string | null;
}

/** How many lines the form offers at once — a display limit on one free-form question, never a business number. */
const MAX_LINES = 5; // hardcode-ok

function newLine(jobTypeKey: string): Line {
  return { jobTypeKey, quantity: '', scale: '', modelKey: '' };
}

export function CostBookCalculator({
  jobs,
  money,
  lang,
  labels,
}: {
  jobs: CalcJobOption[];
  money: (storeMinor: number | null, usdMinor: number) => string;
  lang: 'en' | 'bn';
  labels: {
    title: string;
    jobLabel: string;
    quantityLabel: string;
    scaleLabel: string;
    scaleHint: string;
    modelLabel: string;
    modelAuto: string;
    addLine: string;
    removeLine: string;
    calculate: string;
    calculating: string;
    total: string;
    altLabel: string;
    saveLabel: string;
    savePlaceholder: string;
    saveButton: string;
    saved: string;
    failed: string;
    invalid: string;
  };
}) {
  const id = useId();
  const [lines, setLines] = useState<Line[]>([newLine(jobs[0]?.key ?? '')]);
  const [plan, setPlan] = useState<PlanAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const nameOf = (j: CalcJobOption) => j.name;
  const jobsByKey = new Map(jobs.map((j) => [j.key, j]));

  const parsedBody = () => {
    const parsed: { jobTypeKey: string; quantity: number; scale?: number; modelKey: string | null }[] = [];
    for (const l of lines) {
      const quantity = Number(l.quantity);
      if (!l.jobTypeKey || !(quantity > 0)) return null;
      const scale = l.scale.trim() ? Number(l.scale) : undefined;
      if (scale !== undefined && !(scale > 0)) return null;
      parsed.push({ jobTypeKey: l.jobTypeKey, quantity, scale, modelKey: l.modelKey || null });
    }
    return parsed;
  };

  const calculate = async () => {
    const parsed = parsedBody();
    if (!parsed) {
      showToast({ text: labels.invalid, tone: 'bad' });
      return;
    }
    setBusy(true);
    const res = await call('POST', '/api/admin/ai/cost-book/calculator', { lines: parsed });
    setBusy(false);
    if (!res.data.ok) {
      showToast({ text: labels.failed, tone: 'bad' });
      setPlan(null);
      return;
    }
    setPlan((res.data as unknown as { plan: PlanAnswer }).plan);
  };

  const save = async () => {
    const parsed = parsedBody();
    if (!parsed || !desc.trim()) {
      showToast({ text: labels.invalid, tone: 'bad' });
      return;
    }
    setSaving(true);
    const res = await call('POST', '/api/admin/ai/cost-book/calculator', { lines: parsed, description: desc, save: true });
    setSaving(false);
    if (!res.data.ok) {
      showToast({ text: labels.failed, tone: 'bad' });
      return;
    }
    showToast({ text: labels.saved });
    setPlan((res.data as unknown as { plan: PlanAnswer }).plan);
  };

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <section className="a2-sc a2-mt12 cb-calc" aria-labelledby="cb-calc-h" data-testid="cb-calc">
      <h2 className="a2-h3" id="cb-calc-h">
        {labels.title}
      </h2>
      <div className="cb-calc-lines">
        {lines.map((l, i) => {
          const job = jobsByKey.get(l.jobTypeKey);
          return (
            <div className="cb-calc-line" key={i} data-testid={`cb-calc-line-${i}`}>
              <label className="cb-calc-f">
                <span className="a2-xs a2-mute">{labels.jobLabel}</span>
                <select
                  value={l.jobTypeKey}
                  data-testid={`cb-calc-job-${i}`}
                  onChange={(e) => setLine(i, { jobTypeKey: e.target.value, modelKey: '' })}
                >
                  {jobs.map((j) => (
                    <option key={j.key} value={j.key}>
                      {j.sectionName} — {nameOf(j)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cb-calc-f cb-calc-f-sm">
                <span className="a2-xs a2-mute">{labels.quantityLabel}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={l.quantity}
                  data-testid={`cb-calc-qty-${i}`}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                />
              </label>
              <label className="cb-calc-f cb-calc-f-sm" title={labels.scaleHint}>
                <span className="a2-xs a2-mute">{labels.scaleLabel}</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  placeholder="1"
                  value={l.scale}
                  data-testid={`cb-calc-scale-${i}`}
                  onChange={(e) => setLine(i, { scale: e.target.value })}
                />
              </label>
              <label className="cb-calc-f">
                <span className="a2-xs a2-mute">{labels.modelLabel}</span>
                <select value={l.modelKey} data-testid={`cb-calc-model-${i}`} onChange={(e) => setLine(i, { modelKey: e.target.value })}>
                  <option value="">{labels.modelAuto}</option>
                  {job?.models.map((m) => (
                    <option key={m.modelKey} value={m.modelKey}>
                      {m.label}
                      {m.isRecommended ? ` (${labels.modelAuto})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {lines.length > 1 ? (
                <button type="button" className="a2-btn a2-ghost cb-calc-rm" data-testid={`cb-calc-remove-${i}`} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                  {labels.removeLine}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {lines.length < MAX_LINES ? (
        <button type="button" className="a2-btn a2-ghost a2-mt8" data-testid="cb-calc-add" onClick={() => setLines((ls) => [...ls, newLine(jobs[0]?.key ?? '')])}>
          {labels.addLine}
        </button>
      ) : null}
      <div className="a2-mt12">
        <button type="button" className="a2-btn" disabled={busy} data-testid="cb-calc-run" onClick={calculate}>
          {busy ? labels.calculating : labels.calculate}
        </button>
      </div>

      {plan ? (
        <div className="cb-calc-result a2-mt12" data-testid="cb-calc-result">
          {plan.lines.map((l, i) => (
            <div className="cb-calc-row" key={i} data-testid={`cb-calc-result-${i}`}>
              <div className="n">
                {lang === 'bn' ? l.nameBn : l.nameEn} × {l.quantity}
              </div>
              <div className="a2-xs a2-mute">{money(l.totalStoreMinor, l.totalUsdMinor)}</div>
              {l.alternatives.length ? (
                <div className="cb-alts a2-xs a2-mute" data-testid={`cb-calc-alts-${i}`}>
                  {labels.altLabel}:{' '}
                  {l.alternatives.map((a) => `${a.displayName}: ${money(a.totalStoreMinor, a.totalUsdMinor)}`).join(' · ')}
                </div>
              ) : null}
            </div>
          ))}
          <div className="cb-calc-total" data-testid="cb-calc-total">
            {labels.total}: <b>{money(plan.totalStoreMinor, plan.totalUsdMinor)}</b>
          </div>
          {plan.recommendationNote ? (
            <div className="a2-note cb-note a2-mt8" role="note" data-testid="cb-calc-note">
              {plan.recommendationNote}
            </div>
          ) : null}

          <div className="cb-calc-save a2-mt12">
            <label className="cb-calc-f" htmlFor={`${id}-desc`}>
              <span className="a2-xs a2-mute">{labels.saveLabel}</span>
              <input id={`${id}-desc`} type="text" placeholder={labels.savePlaceholder} value={desc} data-testid="cb-calc-desc" onChange={(e) => setDesc(e.target.value)} />
            </label>
            <button type="button" className="a2-btn a2-ghost" disabled={saving} data-testid="cb-calc-save" onClick={save}>
              {labels.saveButton}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
