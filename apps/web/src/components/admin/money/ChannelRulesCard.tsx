'use client';
// S16 · PR 355 — the UTM words of Money → Profit by channel (`reports.channels`), in a "More options" fold: the mediums
// that mean a paid visit and each ad platform's sources, as comma-separated words. Saving asks once more and sends the
// version it was read at. Without `costs.write` it is read-only. A report rule only: nothing is charged or changed.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { ReportChannels } from '@extas/settings';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';

const PLATFORMS = ['META', 'GOOGLE', 'YOUTUBE', 'TIKTOK'] as const;
const words = (s: string) => [...new Set(s.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean))];

export function ChannelRulesCard(p: { dict: Dict; rules: ReportChannels; version: number; canEdit: boolean }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string) => t(p.dict, `moneyProfitChannels.rules.${k}`);
  const [paid, setPaid] = useState(p.rules.paidMediums.join(', '));
  const [src, setSrc] = useState<Record<string, string>>(Object.fromEntries(PLATFORMS.map((k) => [k, (p.rules.platforms.find((x) => x.platform === k)?.sources ?? []).join(', ')])));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !p.canEdit || busy;

  async function save() {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    setBusy(true);
    const value: ReportChannels = { paidMediums: words(paid), platforms: PLATFORMS.map((platform) => ({ platform, sources: words(src[platform] ?? '') })) };
    const a = await call('PUT', '/api/admin/money/profit/channels/rules', { value, version: p.version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: c('saved'), bad: false });
      return router.refresh();
    }
    setSaid({ text: a.status === 409 ? c('stale') : c('bad'), bad: true });
  }

  return (
    <details className="a2-more-opts pc-rules-more a2-mt12" data-testid="pc-rules">
      <summary>{c('title')}</summary>
      <p className="a2-cs a2-mt6">{c('sub')}</p>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor={`${id}-paid`}>
          {c('paid')}
        </label>
        <input id={`${id}-paid`} className="a2-inp" value={paid} disabled={off} onChange={(e) => setPaid(e.target.value)} data-testid="pc-rules-paid" />
      </div>
      {PLATFORMS.map((k) => (
        <div key={k} className="a2-fld a2-mt12">
          <label className="a2-lbl" htmlFor={`${id}-${k}`}>
            {t(p.dict, `moneyProfitChannels.channel.ads:${k}`)}
          </label>
          <input id={`${id}-${k}`} className="a2-inp" value={src[k] ?? ''} disabled={off} onChange={(e) => setSrc({ ...src, [k]: e.target.value })} data-testid={`pc-rules-${k}`} />
        </div>
      ))}
      {p.canEdit ? (
        <div className="ct-actions a2-mt12">
          <button type="button" className={`a2-btn ${confirm ? 'pri' : ''}`} disabled={busy} onClick={save} data-testid="pc-rules-save">
            {confirm ? c('confirm') : c('save')}
          </button>
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt6">{c('readOnly')}</p>
      )}
      {said ? (
        <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="pc-rules-said">
          {said.text}
        </p>
      ) : null}
    </details>
  );
}
