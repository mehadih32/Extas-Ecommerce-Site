'use client';
// PR 1010 (admin prototype v5 m-settings.js `renderCouriers`) — Settings › Couriers, drawn the prototype's way: the courier accounts with what each
// one charges the shop (inside Dhaka, suburbs, outside, cash fee), the share that came back and the Fees / Connect / Disconnect buttons;
// the Default courier card (the connected couriers only, Different courier by area, Pickup from, Daily pickup time, Save); the Auto-booking card
// with the packed orders waiting; and the Keys & connections line. Every change goes through POST /api/admin/settings/couriers (the server
// checks the permission again; new fees need the owner's PIN). Words come from messages/admin-courier-settings.<lang>.json.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMoney, moneyOf, toMajor, toMinor } from '../products/model';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { ShellIcon } from '../shell/ShellIcon';
import { LmSwitch } from './LmSwitch';
import { SettingsDialog } from './SettingsDialog';
import type { CourierRow, CourierSettingsView } from '@/lib/admin-courier-settings/service';
import './courier-settings.css';

const ZONES = ['inside', 'sub', 'outside'] as const;
type Zone = (typeof ZONES)[number];
const URL = '/api/admin/settings/couriers';

export interface CourierSettingsProps {
  view: CourierSettingsView;
  x: Record<string, string>;
  locale: string;
  can: { fees: boolean; charges: boolean; couriers: boolean; book: boolean };
  links: { delivery: string; keys: string; store: string; orders: string };
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? `{${k}}`));

export function CourierSettings({ view, x, locale, can, links }: CourierSettingsProps) {
  const router = useRouter();
  const money = moneyOf(view.currency, locale);
  const mny = (n: number | null) => (n === null ? x.noRate! : formatMoney(n, money));
  const connected = view.couriers.filter((c) => c.connected);
  const [defaultId, setDefaultId] = useState(connected.some((c) => c.id === view.defaultId) ? view.defaultId : (connected[0]?.id ?? ''));
  const [from, setFrom] = useState(view.pickup.from);
  const [time, setTime] = useState(view.pickup.time);
  const [routing, setRouting] = useState(view.routing);
  const [auto, setAuto] = useState(view.autoBook);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<{ kind: 'fees' | 'connect' | 'disconnect'; c: CourierRow } | null>(null);

  const say = (a: { status: number; data: Record<string, unknown> }) => {
    const code = a.status === 0 ? 'network' : a.status === 403 && a.data.error !== 'WRONG_PIN' ? 'forbidden' : typeof a.data.error === 'string' ? a.data.error : 'other';
    return x[`err.${code}`] ?? x['err.other']!;
  };
  const post = async (body: Record<string, unknown>, okText: string, after?: () => void) => {
    setBusy(true);
    const a = await call('POST', URL, body);
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      showToast({ text: okText, tone: 'ok' });
      after?.();
      router.refresh();
      return true;
    }
    showToast({ text: say(a), tone: 'bad' });
    return false;
  };

  const saveDefault = () => post({ action: 'default', courierId: defaultId, from, time }, x.defaultSaved!);
  const flipRouting = async (next: boolean) => {
    setRouting(next);
    if (!(await post({ action: 'routing', enabled: next }, x.saved!))) setRouting(!next);
  };
  const flipAuto = async (next: boolean) => {
    setAuto(next);
    if (!(await post({ action: 'autoBook', enabled: next }, next ? x.autoOn! : x.autoOff!))) setAuto(!next);
  };
  const disconnect = (c: CourierRow) => {
    if (c.isDefault) {
      showToast({ text: fill(x.isDefault!, { name: c.name }), tone: 'bad' });
      return;
    }
    setDlg({ kind: 'disconnect', c });
  };

  const cell = (c: CourierRow, z: Zone) => mny(c.fees.charge[z]);
  const options = connected.map((c) => `${c.name} · ${mny(c.fees.charge.inside)} / ${mny(c.fees.charge.outside)}`);

  return (
    <div className="cs-wrap" data-testid="cs-wrap">
      <section className="a2-card cs-card" data-testid="cs-accounts" aria-labelledby="cs-acc-h">
        <div className="cs-ch">
          <h2 className="a2-h3" id="cs-acc-h">
            {x.accounts}
          </h2>
          <div className="a2-xs a2-mute">{x.shopCost}</div>
        </div>
        {view.couriers.length ? (
          <div className="a2-tblw cs-tbl">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th scope="col">{x['col.courier']}</th>
                  <th scope="col">{x['col.status']}</th>
                  <th scope="col" className="r">
                    {x['col.inside']}
                  </th>
                  <th scope="col" className="r cs-hide">
                    {x['col.sub']}
                  </th>
                  <th scope="col" className="r cs-hide">
                    {x['col.outside']}
                  </th>
                  <th scope="col" className="r cs-hide">
                    {x['col.cash']}
                  </th>
                  <th scope="col" className="r cs-hide">
                    {x['col.returned']}
                  </th>
                  <th scope="col">
                    <span className="a2-sr">{x.fees}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.couriers.map((c) => (
                  <tr key={c.id} data-testid="cs-row" data-courier={c.id} data-connected={c.connected ? '1' : '0'}>
                    <td className="cs-name">
                      <b>{c.name}</b>
                      <div className="a2-xs a2-mute">{fill(x.parcels30!, { n: c.parcels30 })}</div>
                    </td>
                    <td>
                      <span className={`a2-pill ${c.connected ? 'ok' : ''}`}>{c.connected ? x.connected : x.notConnected}</span>
                      {c.connected && c.practice ? <div className="a2-xs a2-mute cs-prac">{x.practice}</div> : null}
                    </td>
                    <td className="r">{cell(c, 'inside')}</td>
                    <td className="r cs-hide">{cell(c, 'sub')}</td>
                    <td className="r cs-hide">{cell(c, 'outside')}</td>
                    <td className="r cs-hide">{c.fees.codPct === null ? x.noRate : `${c.fees.codPct}%`}</td>
                    <td className="r cs-hide">{c.returnedPct === null ? x.noRate : `${c.returnedPct}%`}</td>
                    <td className="r">
                      <div className="cs-acts">
                        {can.fees ? (
                          <button type="button" className="a2-btn sm" onClick={() => setDlg({ kind: 'fees', c })} data-testid="cs-fees">
                            {x.fees}
                          </button>
                        ) : null}
                        {can.couriers ? (
                          c.connected ? (
                            <button type="button" className="a2-btn sm ghost" onClick={() => disconnect(c)} data-testid="cs-disconnect">
                              {x.disconnect}
                            </button>
                          ) : (
                            <button type="button" className="a2-btn sm pri" onClick={() => setDlg({ kind: 'connect', c })} data-testid="cs-connect">
                              {x.connect}
                            </button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute" data-testid="cs-empty">
            {x.empty}
          </p>
        )}
        <div className="a2-note cs-note" role="note">
          <ShellIcon name="info" size={15} />
          <span>
            {x.note}{' '}
            <Link className="a2-lnk" href={links.delivery}>
              {x.open} →
            </Link>
          </span>
        </div>
      </section>

      <div className="a2-row a2-r2 cs-two">
        <section className="a2-card cs-card" data-testid="cs-default" aria-labelledby="cs-def-h">
          <h2 className="a2-h3" id="cs-def-h">
            {x.defaultCourier}
          </h2>
          <div className="cs-stack">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cs-dc-one">
                {x.allGo}
              </label>
              <select id="cs-dc-one" className="a2-sel" value={defaultId} onChange={(e) => setDefaultId(e.target.value)} disabled={!can.charges || busy || !connected.length} data-testid="cs-default-select">
                {connected.length ? (
                  connected.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      {options[i]}
                    </option>
                  ))
                ) : (
                  <option value="">{x.noConnected}</option>
                )}
              </select>
              <div className="a2-xs a2-mute">{x.sameSetting}</div>
            </div>
            <div className="cs-sw">
              <div>
                <b>{x.byArea}</b>
                <div className="a2-xs a2-mute">{x.byAreaHelp}</div>
              </div>
              <LmSwitch on={routing} label={x.byArea!} onFlip={flipRouting} disabled={!can.charges || busy} testId="cs-routing" />
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cs-dc-pk">
                {x.pickupFrom}
              </label>
              <select id="cs-dc-pk" className="a2-sel" value={from} onChange={(e) => setFrom(e.target.value as 'warehouse' | 'office')} disabled={!can.charges || busy} data-testid="cs-pickup-from">
                <option value="warehouse">{`${x.warehouse} — ${view.addresses.warehouse || x.noAddress}`}</option>
                <option value="office">{`${x.office} — ${view.addresses.office || x.noAddress}`}</option>
              </select>
              <Link className="a2-lnk a2-xs" href={links.store}>
                {x.editAddresses} →
              </Link>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cs-dc-pt">
                {x.pickupTime}
              </label>
              <input id="cs-dc-pt" className="a2-inp" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!can.charges || busy} data-testid="cs-pickup-time" />
            </div>
            {can.charges ? (
              <button type="button" className="a2-btn sm cs-save" onClick={saveDefault} disabled={busy || !defaultId} data-testid="cs-default-save">
                {x.save}
              </button>
            ) : null}
          </div>
        </section>

        <section className="a2-card cs-card" data-testid="cs-auto" aria-labelledby="cs-book-h">
          <h2 className="a2-h3" id="cs-book-h">
            {x.bookTitle}
          </h2>
          <div className="cs-sw">
            <div>
              <b>{x.autoBooking}</b>
              <div className="a2-xs a2-mute">{x.autoHelp}</div>
            </div>
            <LmSwitch on={auto} label={x.autoBooking!} onFlip={flipAuto} disabled={!can.charges || !can.book || busy} testId="cs-autobook" />
          </div>
          <div className="a2-note cs-note" role="note" data-testid="cs-waiting">
            <ShellIcon name="info" size={15} />
            <span>
              {fill(x.waiting!, { n: view.waiting })}{' '}
              <Link className="a2-lnk" href={links.orders}>
                {x.open} →
              </Link>
            </span>
          </div>
        </section>
      </div>

      <div className="a2-note cs-keys" role="note">
        <ShellIcon name="info" size={15} />
        <span>
          <KeysLine text={x.keysNote!} /> <Link className="a2-lnk" href={links.keys}>{x.open} →</Link>
        </span>
      </div>

      {dlg?.kind === 'fees' ? <FeesDialog c={dlg.c} view={view} x={x} money={money} onClose={() => setDlg(null)} onSaved={() => router.refresh()} /> : null}
      {dlg?.kind === 'disconnect' ? (
        <SettingsDialog
          title={fill(x.disconnectTitle!, { name: dlg.c.name })}
          close={x.close!}
          cancel={x.cancel!}
          ok={x.disconnect!}
          tone="badf"
          busy={busy}
          testId="cs-disconnect-dlg"
          onClose={() => setDlg(null)}
          onOk={async () => {
            const c = dlg.c;
            if (await post({ action: 'connect', courierId: c.id, connected: false }, x.disconnected!)) setDlg(null);
          }}
        >
          <p className="a2-sm">{x.disconnectText}</p>
        </SettingsDialog>
      ) : null}
      {dlg?.kind === 'connect' ? (
        <SettingsDialog
          title={fill(x.connectTitle!, { name: dlg.c.name })}
          close={x.close!}
          cancel={x.cancel!}
          ok={x.connect!}
          busy={busy}
          testId="cs-connect-dlg"
          onClose={() => setDlg(null)}
          onOk={async () => {
            const c = dlg.c;
            if (await post({ action: 'connect', courierId: c.id, connected: true }, fill(x.connectedDone!, { name: c.name }))) setDlg(null);
          }}
        >
          <p className="a2-sm">{x.connectText}</p>
          <p className="a2-sm a2-mt12">
            <Link className="a2-lnk" href={links.keys}>
              {x.connectKeys} →
            </Link>
          </p>
        </SettingsDialog>
      ) : null}
    </div>
  );
}

/** The one line with a bold part (`<b>…</b>` in the words file), drawn without raw HTML. */
function KeysLine({ text }: { text: string }) {
  const m = /^(.*?)<b>(.*?)<\/b>(.*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <b>{m[2]}</b>
      {m[3]}
    </>
  );
}

function FeesDialog({
  c,
  view,
  x,
  money,
  onClose,
  onSaved,
}: {
  c: CourierRow;
  view: CourierSettingsView;
  x: Record<string, string>;
  money: ReturnType<typeof moneyOf>;
  onClose(): void;
  onSaved(): void;
}) {
  const [v, setV] = useState<Record<Zone, string>>({ inside: toMajor(c.fees.charge.inside, money), sub: toMajor(c.fees.charge.sub, money), outside: toMajor(c.fees.charge.outside, money) });
  const [cod, setCod] = useState(c.fees.codPct === null ? '' : String(c.fees.codPct));
  const [step, setStep] = useState<'form' | 'pin'>('form');
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const minor = (z: Zone) => toMinor(v[z], money);
  const codNum = cod.trim() === '' ? NaN : Number(cod);
  const valid = ZONES.every((z) => typeof minor(z) === 'number') && Number.isFinite(codNum) && codNum >= 0 && codNum <= view.maxCodPct;
  const zoneName: Record<Zone, string> = { inside: x['col.inside']!, sub: x['col.sub']!, outside: x['col.outside']! };
  const changes = ZONES.map((z) => `${zoneName[z]} ${formatMoney(c.fees.charge[z] ?? 0, money)} → ${formatMoney(minor(z) ?? 0, money)}`).join(', ');

  if (step === 'form')
    return (
      <SettingsDialog
        title={fill(x.feesTitle!, { name: c.name })}
        close={x.close!}
        cancel={x.cancel!}
        ok={x.saveFees!}
        testId="cs-fees-dlg"
        onClose={onClose}
        onOk={() => {
          if (!valid) setProblem(x.enterEvery!);
          else {
            setProblem(null);
            setStep('pin');
          }
        }}
      >
        <div className="cs-fgrid">
          {ZONES.map((z) => (
            <div className="a2-fld" key={z}>
              <label className="a2-lbl" htmlFor={`cs-fe-${z}`}>
                {zoneName[z]}
              </label>
              <div className="cs-money">
                <span aria-hidden="true">{formatMoney(0, money).replace(/[\d.,\s]/g, '')}</span>
                <input id={`cs-fe-${z}`} className="a2-inp" type="number" inputMode="decimal" min={0} step="any" value={v[z]} onChange={(e) => setV({ ...v, [z]: e.target.value })} data-testid={`cs-fe-${z}`} />
              </div>
            </div>
          ))}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="cs-fe-cod">
              {x.cashFee}
            </label>
            <input id="cs-fe-cod" className="a2-inp" type="number" inputMode="decimal" min={0} max={view.maxCodPct} step="0.1" value={cod} onChange={(e) => setCod(e.target.value)} data-testid="cs-fe-cod" />
          </div>
        </div>
        <p className="a2-xs a2-mute a2-mt12">{x.feesHint}</p>
        {problem ? (
          <div className="a2-note bad" role="alert">
            <ShellIcon name="alert" size={15} />
            <span>{problem}</span>
          </div>
        ) : null}
      </SettingsDialog>
    );

  return (
    <SettingsDialog
      title={x.pinTitle!}
      close={x.close!}
      cancel={x.cancel!}
      ok={x.save!}
      busy={busy}
      testId="cs-pin-dlg"
      onClose={onClose}
      onOk={async () => {
        if (!/^\d{4,12}$/.test(pin.trim())) {
          setProblem(x.pinAsk!);
          return;
        }
        setBusy(true);
        const a = await call('POST', URL, { action: 'fees', courierId: c.id, inside: minor('inside'), sub: minor('sub'), outside: minor('outside'), codPct: codNum, pin: pin.trim() });
        setBusy(false);
        if (a.status === 200 && a.data.ok) {
          showToast({ text: x.feesSaved!, tone: 'ok' });
          onClose();
          onSaved();
          return;
        }
        const code = a.status === 0 ? 'network' : typeof a.data.error === 'string' ? a.data.error : 'other';
        setProblem(x[`err.${code}`] ?? x['err.other']!);
      }}
    >
      <p className="a2-sm">{fill(x.pinText!, { name: c.name, changes })}</p>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor="cs-pin">
          {x.pinLabel}
        </label>
        <input id="cs-pin" className="a2-inp cs-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="••••" value={pin} onChange={(e) => (setPin(e.target.value), setProblem(null))} data-testid="cs-pin" />
      </div>
      {problem ? (
        <div className="a2-note bad" role="alert">
          <ShellIcon name="alert" size={15} />
          <span>{problem}</span>
        </div>
      ) : null}
    </SettingsDialog>
  );
}
