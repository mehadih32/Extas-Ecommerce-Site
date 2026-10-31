'use client';
// CN-020 (4) · SIM-F-047 — "Say your address" under the checkout's address box (`checkout.voice`, off as shipped). One
// tap asks for the microphone (never on page load) and listens for at most `maxSeconds`; a second tap stops. Where the
// phone has its own speech engine (Chrome on Android) the words come from the phone, in the store's speech language;
// the recording is made beside it when the owner keeps recordings, or when there is no engine (then the server's
// speech connection reads it — its mock hears nothing until the key is in, and the team listens). The words go into
// the address box for him to check; an unsure reading tells him the team may call. Saying no to the microphone, or a
// browser that cannot record, is fine: he types. One 44 px tap target. Review R3 (M1): before the first tap a line
// tells him his voice is recorded to write the address, read by a speech service, and how many days it is kept
// (`retentionDays`); a reading that kept no recording asks him to type instead of saying the team will listen.
import { useEffect, useRef, useState } from 'react';

export const VOICE_URL = '/api/checkout/voice';

export interface VoiceConfig {
  /** The speech language (`checkout.voice.speechLang`, e.g. bn-BD). */
  speechLang: string;
  /** The longest recording (`checkout.voice.maxSeconds`). */
  maxSeconds: number;
  /** The largest recording sent (`checkout.voice.maxKb`). */
  maxKb: number;
  /** The recording is kept with the order (`checkout.voice.keepRecording`). */
  keepRecording: boolean;
  /** Review R3 (M1): days a kept recording stays before it is wiped (`checkout.voice.retentionDays`). */
  retentionDays: number;
}

/** What the page keeps once a recording is saved: its id goes with the order. */
export interface VoiceSaved {
  id: string;
  low: boolean;
}

type Words = (k: string, vars?: Record<string, string | number>) => string;
type State = 'idle' | 'listening' | 'sending' | 'done' | 'low' | 'none' | 'noneTyped' | 'off' | 'denied' | 'error';

interface SpeechAlt {
  transcript: string;
  confidence: number;
}
interface SpeechEvent {
  results: ArrayLike<{ isFinal: boolean; 0: SpeechAlt }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const MS = 1000;
const KB = 1024;

function speechEngine(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const canRecord = () => typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export interface VoiceAddressProps {
  cfg: VoiceConfig;
  w: Words;
  /** The words heard, for the address box. */
  onWords(text: string): void;
  onSaved(saved: VoiceSaved): void;
}

export function VoiceAddress({ cfg, w, onWords, onSaved }: VoiceAddressProps) {
  const [state, setState] = useState<State>('idle');
  const [left, setLeft] = useState(cfg.maxSeconds);
  const stopRef = useRef<(() => void) | null>(null);
  // the answer arrives after he stopped: it goes to the box as it is then, not as it was when he tapped
  const latest = useRef({ onWords, onSaved });
  useEffect(() => {
    latest.current = { onWords, onSaved };
  }, [onWords, onSaved]);
  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    const Engine = speechEngine();
    const record = (cfg.keepRecording || !Engine) && canRecord();
    if (!Engine && !record) return setState('off');
    let stream: MediaStream | null = null;
    if (record) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!Engine) return setState('denied');
      }
    }
    setState('listening');
    setLeft(cfg.maxSeconds);
    const began = Date.now();
    const heard: SpeechAlt[] = [];
    const chunks: Blob[] = [];
    let recorder: MediaRecorder | null = null;
    let recognition: Recognition | null = null;
    let pending = 0;
    let refused = false;
    let finished = false;
    const finish = () => {
      if (--pending > 0 || finished) return;
      finished = true;
      clearInterval(tick);
      stream?.getTracks().forEach((t) => t.stop());
      stopRef.current = null;
      void send();
    };
    const send = async () => {
      const text = heard.map((h) => h.transcript.trim()).filter(Boolean).join(' ');
      const type = recorder?.mimeType || chunks[0]?.type || '';
      const audio = chunks.length ? new Blob(chunks, { type }) : null;
      const usable = audio && audio.size > 0 && audio.size <= cfg.maxKb * KB ? audio : null;
      if (!text && !usable) return setState(refused ? 'denied' : 'none');
      setState('sending');
      const body = new FormData();
      if (text) {
        body.set('transcript', text);
        const scores = heard.map((h) => h.confidence).filter((c) => typeof c === 'number' && c > 0);
        if (scores.length) body.set('confidence', String(Math.min(...scores)));
      }
      body.set('durationMs', String(Date.now() - began));
      if (usable) body.set('audio', usable, 'address');
      try {
        const r = await fetch(VOICE_URL, { method: 'POST', body, credentials: 'same-origin' });
        const a = (await r.json().catch(() => null)) as { ok?: boolean; id?: string; transcript?: string | null; low?: boolean; kept?: boolean; error?: string } | null;
        if (!a?.ok || !a.id) return setState(a?.error === 'NOT_OPEN' ? 'off' : 'error');
        if (a.transcript) latest.current.onWords(a.transcript);
        latest.current.onSaved({ id: a.id, low: !!a.low });
        setState(a.transcript ? (a.low ? 'low' : 'done') : a.kept ? 'none' : 'noneTyped');
      } catch {
        setState('error');
      }
    };
    if (stream) {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = finish;
      pending++;
      recorder.start();
    }
    if (Engine) {
      recognition = new Engine();
      recognition.lang = cfg.speechLang;
      recognition.interimResults = false;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = (e) => {
        heard.length = 0;
        for (let i = 0; i < e.results.length; i++) if (e.results[i]!.isFinal) heard.push(e.results[i]![0]);
      };
      recognition.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') refused = true;
      };
      // the phone stops listening by itself after a pause: the recording stops with it
      recognition.onend = () => {
        if (recorder?.state === 'recording') recorder.stop();
        finish();
      };
      pending++;
      try {
        recognition.start();
      } catch {
        pending--;
        recognition = null;
      }
    }
    if (pending === 0) return setState('off');
    const stop = () => {
      if (recognition) recognition.stop();
      else if (recorder?.state === 'recording') recorder.stop();
    };
    stopRef.current = stop;
    const tick = setInterval(() => {
      const s = cfg.maxSeconds - Math.floor((Date.now() - began) / MS);
      setLeft(Math.max(0, s));
      if (s <= 0) stop();
    }, MS / 4);
  };

  const listening = state === 'listening';
  const note = state === 'done' || state === 'low' || state === 'none' || state === 'noneTyped' || state === 'off' || state === 'denied' || state === 'error' ? `voice.${state}` : null;
  return (
    <div className="co-voice" data-testid="co-voice" data-state={state}>
      <button
        type="button"
        className={`btn btn-ghost co-voice-btn${listening ? ' on' : ''}`}
        onClick={() => (listening ? stopRef.current?.() : void start())}
        disabled={state === 'sending'}
        aria-pressed={listening}
        aria-busy={state === 'sending'}
        data-testid="co-voice-btn"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        <span>{w(listening ? 'voice.stop' : state === 'sending' ? 'voice.sending' : 'voice.say')}</span>
        {listening ? (
          <span className="co-voice-left" aria-live="polite">
            {w('voice.left', { s: left })}
          </span>
        ) : null}
      </button>
      {note ? (
        <span className={`co-voice-note small${state === 'done' ? '' : ' muted'}`} role="status" data-testid="co-voice-note">
          {w(note)}
        </span>
      ) : null}
      {state === 'idle' || state === 'listening' ? (
        <span className="co-voice-consent xs muted" data-testid="co-voice-consent">
          {w(cfg.keepRecording ? 'voice.consentKept' : 'voice.consent', { days: cfg.retentionDays })}
        </span>
      ) : null}
    </div>
  );
}
