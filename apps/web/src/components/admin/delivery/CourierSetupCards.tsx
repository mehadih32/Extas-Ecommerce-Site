'use client';
// S28 · PR 803 — Couriers › Setup as the prototype v5 draws it (m-couriers.js renderSetup): one card per courier with its
// connection badge, pick-up, rate card, "Smallest payout to request" and "Days the courier takes to pay", "Use as backup
// courier" and "Edit rates in Settings"; then the Alerts card (parcel stuck after N hours) and the Default courier card.
// Saves go through PUT /api/admin/delivery/settings (`delivery.charges`, the card's version, so a stale tap is refused):
// `delivery.courier.setup` (per courier) and `fulfilment.courierWatch` (stuck hours, backup). The default courier is
// changed on All couriers (Make default), as the prototype says.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Dict } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface SetupCourier {
  id: string;
  name: string;
  connected: boolean;
  enabled: boolean;
  isDefault: boolean;
  isBackup: boolean;
  /** "Inside Dhaka" … and what the courier charges us there (already formatted). */
  rates: { label: string; value: string }[];
  codFee: string;
  returnCharge: string;
}
export interface SetupEntry {
  pickupPlace: string;
  pickupTime: string;
  minPayoutMinor: number;
  payDays: number;
}
interface Card {
  version: string;
  value: Record<string, unknown>;
}
interface Props {
  dict: Dict;
  couriers: SetupCourier[];
  entries: Record<string, SetupEntry>;
  setup: Card;
  watch: Card;
  digits: number;
  canEdit: boolean;
  keysHref: string;
  ratesHref: string;
}

const PUT = '/api/admin/delivery/settings';

export function CourierSetupCards({ dict, couriers, entries, setup, watch, digits, canEdit, keysHref, ratesHref }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const unit = 10 ** digits;
  const w = watch.value as { stuckAlert: boolean; stuckHours: number; backupCourierId: string };
  const [stuck, setStuck] = useState(String(w.stuckHours));
  const [draft, setDraft] = useState<Record<string, { place: string; time: string; min: string; days: string }>>(() =>
    Object.fromEntries(couriers.map((c) => [c.id, { place: entries[c.id]?.pickupPlace ?? '', time: entries[c.id]?.pickupTime ?? '', min: entries[c.id]?.minPayoutMinor ? String(entries[c.id]!.minPayoutMinor / unit) : '', days: entries[c.id]?.payDays ? String(entries[c.id]!.payDays) : '' }])),
  );
  const set = (id: string, k: 'place' | 'time' | 'min' | 'days', v: string) => setDraft((d) => ({ ...d, [id]: { ...d[id]!, [k]: v } }));

  const save = async (id: string, key: string, version: string, value: unknown) => {
    setBusy(id);
    const a = await call('PUT', PUT, { key, version, value });
    setBusy('');
    if (a.status === 200 && a.data.ok) {
      showToast({ text: t(dict, 'cr.su.saved'), tone: 'ok' });
      router.refresh();
    } else showToast({ text: a.data.error === 'STALE' ? t(dict, 'cr.su.stale') : t(dict, 'cr.su.failed'), tone: 'bad' });
  };
  const saveCourier = (id: string) => {
    const d = draft[id]!;
    const entry: SetupEntry = {
      pickupPlace: d.place.trim(),
      pickupTime: d.time,
      minPayoutMinor: Math.max(0, Math.round((Number(d.min) || 0) * unit)),
      payDays: Math.max(0, Math.min(14, Math.round(Number(d.days) || 0))),
    };
    const next = { couriers: { ...(setup.value as { couriers: Record<string, SetupEntry> }).couriers, [id]: entry } };
    void save(id, 'delivery.courier.setup', setup.version, next);
  };
  const toggleBackup = (id: string, on: boolean) => void save(id, 'fulfilment.courierWatch', watch.version, { ...w, backupCourierId: on ? id : '' });
  const saveStuck = () => void save('stuck', 'fulfilment.courierWatch', watch.version, { ...w, stuckHours: Math.max(1, Math.min(720, Math.round(Number(stuck) || 48))) });
  const test = (c: SetupCourier) => showToast({ text: c.connected ? t(dict, 'cr.su.testOk', { name: c.name }) : t(dict, 'cr.su.testOff', { name: c.name }), tone: c.connected ? 'ok' : 'bad' });

  const def = couriers.find((c) => c.isDefault);
  const bak = couriers.find((c) => c.isBackup);
  return (
    <>
      <div className="cs-grid" data-testid="courier-setup-cards">
        {couriers.map((c) => {
          const d = draft[c.id]!;
          return (
            <section key={c.id} className="a2-card tight" data-testid="courier-setup-card" data-courier={c.id}>
              <h2 className="a2-h3" style={{ overflowWrap: 'anywhere' }}>
                {c.name}
              </h2>
              <div className="a2-between a2-mt6" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="a2-gap8">
                  <span className={`a2-pill ${c.connected ? 'ok' : 'bad'}`}>{c.connected ? t(dict, 'cr.su.connected') : t(dict, 'cr.su.notConnected')}</span>
                  {c.isDefault ? <span className="a2-pill info">{t(dict, 'cr.su.default')}</span> : c.isBackup ? <span className="a2-pill line">{t(dict, 'cr.su.backup')}</span> : null}
                </span>
                <button type="button" className="a2-btn sm" onClick={() => test(c)} data-testid="courier-test">
                  {t(dict, 'cr.su.test')}
                </button>
              </div>
              <h3 className="a2-xs a2-mute a2-mt12">{t(dict, 'cr.su.pickup')}</h3>
              <div className="a2-kv2 a2-mt6">
                <span>{t(dict, 'cr.su.pickupFrom')}</span>
                <span>
                  <input className="a2-inp" value={d.place} maxLength={120} placeholder={t(dict, 'cr.su.warehouse')} aria-label={t(dict, 'cr.su.pickupFrom')} disabled={!canEdit} onChange={(e) => set(c.id, 'place', e.target.value)} />
                </span>
                <span>{t(dict, 'cr.su.pickupTime')}</span>
                <span>
                  <input className="a2-inp" type="time" value={d.time} aria-label={t(dict, 'cr.su.pickupTime')} disabled={!canEdit} onChange={(e) => set(c.id, 'time', e.target.value)} />
                </span>
              </div>
              <h3 className="a2-xs a2-mute a2-mt12">{t(dict, 'cr.su.rates')}</h3>
              <div className="a2-kv2 a2-mt6">
                {c.rates.map((r) => (
                  <Pair key={r.label} k={r.label} v={r.value} />
                ))}
                <Pair k={t(dict, 'cr.su.codFee')} v={c.codFee} />
                <Pair k={t(dict, 'cr.su.returnCharge')} v={c.returnCharge} />
              </div>
              <h3 className="a2-xs a2-mute a2-mt12">{t(dict, 'cr.su.payout')}</h3>
              <div className="a2-stack a2-mt6" style={{ gap: 8 }}>
                <label className="a2-blk">
                  <span className="a2-lbl">{t(dict, 'cr.su.minPayout')}</span>
                  <input className="a2-inp" type="number" min={0} inputMode="decimal" value={d.min} disabled={!canEdit} onChange={(e) => set(c.id, 'min', e.target.value)} data-testid="courier-min" />
                </label>
                <label className="a2-blk">
                  <span className="a2-lbl">{t(dict, 'cr.su.payDays')}</span>
                  <input className="a2-inp" type="number" min={1} max={14} value={d.days} disabled={!canEdit} onChange={(e) => set(c.id, 'days', e.target.value)} data-testid="courier-days" />
                  <span className="a2-xs a2-mute">{t(dict, 'cr.su.payDaysHelp')}</span>
                </label>
              </div>
              <div className="a2-cmds a2-mt12">
                {canEdit ? (
                  <button type="button" className="a2-btn sm pri" disabled={busy === c.id} onClick={() => saveCourier(c.id)} data-testid="courier-setup-save">
                    {t(dict, 'cr.su.save')}
                  </button>
                ) : null}
                {canEdit && !c.isDefault && c.connected && c.enabled ? (
                  <label className="a2-chkl" style={{ minHeight: 44 }}>
                    <input type="checkbox" checked={c.isBackup} disabled={busy === c.id} onChange={(e) => toggleBackup(c.id, e.target.checked)} data-testid="courier-backup" />
                    <span>{t(dict, 'cr.su.useBackup')}</span>
                  </label>
                ) : null}
                <Link className="a2-btn sm ghost" href={ratesHref}>
                  {t(dict, 'cr.su.editRates')} →
                </Link>
              </div>
            </section>
          );
        })}
      </div>
      <div className="cs-grid2 a2-mt12">
        <section className="a2-card tight" data-testid="courier-setup-alerts">
          <h2 className="a2-h3">{t(dict, 'cr.su.alerts')}</h2>
          <p className="a2-xs a2-mute">{t(dict, 'cr.su.alertsSub')}</p>
          <label className="a2-blk a2-mt6">
            <span className="a2-lbl">{t(dict, 'cr.su.stuckAfter')}</span>
            <input className="a2-inp" type="number" min={1} max={720} value={stuck} disabled={!canEdit} onChange={(e) => setStuck(e.target.value)} data-testid="courier-stuck" />
          </label>
          {canEdit ? (
            <button type="button" className="a2-btn sm pri a2-mt12" disabled={busy === 'stuck'} onClick={saveStuck} data-testid="courier-stuck-save">
              {t(dict, 'cr.su.save')}
            </button>
          ) : null}
        </section>
        <section className="a2-card tight" data-testid="courier-setup-default">
          <h2 className="a2-h3">{t(dict, 'cr.su.defaultCard')}</h2>
          <div className="a2-kv2 a2-mt6">
            <Pair k={t(dict, 'cr.su.newOrders')} v={def?.name ?? '—'} />
            <Pair k={t(dict, 'cr.su.backup')} v={bak?.name ?? '—'} />
          </div>
          <p className="a2-xs a2-mute a2-mt12">{t(dict, 'cr.su.defaultNote')}</p>
          <Link className="a2-btn sm ghost a2-mt6" href="/admin/delivery">
            {t(dict, 'cr.su.openAll')} →
          </Link>
        </section>
      </div>
      <p className="a2-xs a2-mute a2-mt12">
        <Link href={keysHref}>{t(dict, 'cr.su.keys')}</Link>
      </p>
    </>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span>{k}</span>
      <span>{v}</span>
    </>
  );
}
