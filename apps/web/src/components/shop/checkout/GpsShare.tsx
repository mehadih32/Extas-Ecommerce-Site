'use client';
// S06 · PR 159 — "Share my location" under the checkout's address (Blueprint B6.4; `risk.capture.gpsButton`, on by
// default, never on a gift). The browser asks for the location only after the customer taps (never on page load); the
// point is rounded here and again on the server (`gpsDecimals`), helps the rider find the door, and is deleted after the
// owner's days (`retentionDays`, shown under the button). Saying no, or a phone without location, is fine: the typed
// address is enough and nothing else changes. One 44 px tap target either way.
import { useState } from 'react';

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface GpsConfig {
  /** Decimal places kept (`risk.capture.gpsDecimals`). */
  decimals: number;
  /** Days the point is kept (`risk.capture.retentionDays`). */
  days: number;
  /** How long the page waits for the phone's answer (`risk.capture.gpsWaitSeconds`). */
  waitMs: number;
}

/** A coordinate kept only as finely as the owner allows. */
export function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

type Words = (k: string, vars?: Record<string, string | number>) => string;

export interface GpsShareProps {
  cfg: GpsConfig;
  value: GpsPoint | null;
  onChange(p: GpsPoint | null): void;
  w: Words;
}

export function GpsShare({ cfg, value, onChange, w }: GpsShareProps) {
  const [state, setState] = useState<'idle' | 'asking' | 'off'>('idle');
  const ask = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return setState('off');
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({ lat: roundTo(p.coords.latitude, cfg.decimals), lng: roundTo(p.coords.longitude, cfg.decimals) });
        setState('idle');
      },
      () => setState('off'),
      { enableHighAccuracy: false, timeout: cfg.waitMs },
    );
  };
  return (
    <div className="co-gps" data-testid="co-gps">
      {value ? (
        <div className="co-gps-on" data-testid="co-gps-on">
          <span className="small">{w('gps.added')}</span>
          <button type="button" className="link co-gps-x" onClick={() => onChange(null)}>
            {w('gps.remove')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost co-gps-btn" data-testid="co-gps-btn" onClick={ask} disabled={state === 'asking'} aria-busy={state === 'asking'}>
          {w(state === 'asking' ? 'gps.asking' : 'gps.add')}
        </button>
      )}
      {state === 'off' && !value ? (
        <p className="small text2 mt8" role="status">
          {w('gps.off')}
        </p>
      ) : null}
      <p className="small text2 mt8">{w('gps.note', { days: cfg.days })}</p>
    </div>
  );
}
