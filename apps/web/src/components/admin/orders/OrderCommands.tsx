'use client';
// PR 141 — the order page's commands in the browser (demo V12.3 a2Confirm, §5.0 [confirm] actions): a button opens a
// dialog that says what will happen, asks for the reason or note the command needs, and sends it through the admin
// API with the order's version and an idempotency key (lib/admin-orders/commands.ts). A STALE answer reads the order
// again and says so (the dialog stays open on the fresh order); any other refusal is said in words. After a command the
// page is read again from the server, so the buttons are always the commands open now.
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { newKey, refundRequestsOf, send } from '@/lib/admin-orders/commands';
import { bodyOf, missingOf, noteNeeded, startOf, type CommandSpec, type CommandTexts, type FieldSpec } from '@/lib/admin-orders/spec';
import { ShellIcon } from '../shell/ShellIcon';

interface Ctx {
  texts: CommandTexts;
  say(text: string): void;
}
const CommandsContext = createContext<Ctx | null>(null);

const TOAST_MS = 3600;

/** The page's dialog words and its one message line ("Confirmed", "Reloaded …"), read out by screen readers. */
export function CommandsProvider({ texts, children }: { texts: CommandTexts; children: ReactNode }) {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = useCallback((text: string) => {
    clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(''), TOAST_MS);
  }, []);
  return (
    <CommandsContext.Provider value={{ texts, say }}>
      {children}
      <div className="a2-toast-slot" role="status" aria-live="polite">
        {toast ? (
          <div className="a2-toast" data-testid="orders-toast">
            {toast}
          </div>
        ) : null}
      </div>
    </CommandsContext.Provider>
  );
}

function useCommands(): Ctx {
  const c = useContext(CommandsContext);
  if (!c) throw new Error('CommandButton needs a CommandsProvider');
  return c;
}

export function Field({ f, value, set, missing, id, label }: { f: FieldSpec; value: string | string[]; set(v: string | string[]): void; missing: boolean; id: string; label: string }) {
  const err = missing ? { 'aria-invalid': true as const } : {};
  if (f.kind === 'checks') {
    const on = new Set(Array.isArray(value) ? value : []);
    return (
      <fieldset className="a2-fld">
        <legend className="a2-lbl">{f.label}</legend>
        {(f.options ?? []).map((o) => (
          <label key={o.value} className="a2-chkl">
            <input
              type="checkbox"
              className="a2-chk"
              checked={on.has(o.value)}
              onChange={(e) => {
                const n = new Set(on);
                if (e.target.checked) n.add(o.value);
                else n.delete(o.value);
                set([...n]);
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={id}>
        {label}
      </label>
      {f.kind === 'select' ? (
        <select id={id} className="a2-sel" value={String(value)} onChange={(e) => set(e.target.value)} {...err}>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.kind === 'textarea' ? (
        <textarea id={id} className="a2-ta" rows={2} value={String(value)} placeholder={f.placeholder} maxLength={f.maxLength} onChange={(e) => set(e.target.value)} {...err} />
      ) : (
        <input id={id} className="a2-inp" value={String(value)} placeholder={f.placeholder} maxLength={f.maxLength} onChange={(e) => set(e.target.value)} {...err} />
      )}
    </div>
  );
}

/** A dialog's keys: focus its first field (or its OK button), Esc closes it, Tab stays inside it. */
export function useDialogKeys(box: RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const el = box.current;
    el?.querySelector<HTMLElement>('select, input, textarea, [data-ok]')?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onClose();
      } else if (ev.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea')];
        if (!f.length) return;
        if (ev.shiftKey && document.activeElement === f[0]) {
          ev.preventDefault();
          f[f.length - 1]!.focus();
        } else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) {
          ev.preventDefault();
          f[0]!.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [box, onClose]);
}

/** The [confirm] dialog: what will happen, the fields, Cancel and the command's own button. Esc or the scrim closes it. */
function Dialog({ spec, onClose }: { spec: CommandSpec; onClose(): void }) {
  const { texts, say } = useCommands();
  const router = useRouter();
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string | string[]>>(() => Object.fromEntries(spec.fields.map((f) => [f.name, startOf(f)])));
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const missing = missingOf(spec, values);
  useDialogKeys(box, onClose);
  const go = async () => {
    setTried(true);
    if (missing.length || busy) return;
    setBusy(true);
    setProblem(null);
    const answer = await send(spec.url, bodyOf(spec, values), key);
    setBusy(false);
    if (answer.ok) {
      const n = refundRequestsOf(answer);
      say(n && spec.doneRefund ? spec.doneRefund.replace('{n}', String(n)) : spec.done);
      onClose();
      router.refresh();
      return;
    }
    // The order changed meanwhile: read it again; the dialog now acts on the fresh version, with a new key.
    if (answer.code === 'STALE') {
      setKey(newKey());
      router.refresh();
      setProblem(texts.stale);
      return;
    }
    setKey(newKey());
    setProblem(texts.errors[answer.code] ?? texts.errors.other ?? answer.code);
    if (answer.code === 'ILLEGAL_TRANSITION' || answer.code.startsWith('NO_') || answer.code === 'BOOKED' || answer.code === 'NOT_BOOKED') router.refresh();
  };

  return (
    <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} data-testid={`dlg-${spec.id}`}>
        <div className="a2-dlgh">
          <div>
            <h2 className="a2-h3" id={`${uid}-t`}>
              {spec.title}
            </h2>
            {spec.sub ? <div className="a2-cs">{spec.sub}</div> : null}
          </div>
          <button type="button" className="a2-icb" onClick={onClose} aria-label={texts.close}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-dlgb">
          {spec.effects.length ? (
            <>
              <div className="a2-xs a2-mute a2-b">{texts.willHappen}</div>
              <ul className="a2-eff">
                {spec.effects.map((e) => (
                  <li key={e}>
                    <ShellIcon name="check" size={14} />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="a2-stack a2-dlgf-fields">
            {spec.fields.map((f) => (
              <Field key={f.name} id={`${uid}-${f.name}`} f={f} value={values[f.name] ?? ''} set={(v) => setValues((s) => ({ ...s, [f.name]: v }))} missing={tried && missing.includes(f.name)} label={f.labelNeeded && noteNeeded(spec, values, f) ? f.labelNeeded : f.label} />
            ))}
          </div>
          {tried && missing.length ? <div className="a2-note warn">{texts.required}</div> : null}
          {problem ? (
            <div className="a2-note bad" role="alert" data-testid="dlg-problem">
              <ShellIcon name="alert" size={15} />
              <span>{problem}</span>
            </div>
          ) : null}
        </div>
        <div className="a2-dlgf">
          <button type="button" className="a2-btn" onClick={onClose}>
            {texts.cancel}
          </button>
          <button type="button" className={`a2-btn ${spec.okTone}`} data-ok onClick={go} disabled={busy} aria-busy={busy || undefined}>
            {busy ? texts.working : spec.ok}
          </button>
        </div>
      </div>
    </div>
  );
}

const noSubscribe = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

/** One command: a button (or a menu row) and its dialog. `open` opens the dialog at once (the `?do=` deep link). */
export function CommandButton({ spec, size, menu, open: openAtStart }: { spec: CommandSpec; size?: 'sm' | 'lg'; menu?: boolean; open?: boolean }) {
  const [open, setOpen] = useState(!!openAtStart);
  const mounted = useSyncExternalStore(noSubscribe, inBrowser, onServer); // the portal needs document.body
  const close = useCallback(() => setOpen(false), []);
  const cls = menu ? 'a2-mi' : `a2-btn${size ? ` ${size}` : ''}${spec.tone ? ` ${spec.tone}` : ''}`;
  return (
    <>
      <button type="button" className={cls} role={menu ? 'menuitem' : undefined} onClick={() => setOpen(true)} data-testid={`cmd-${spec.id}`}>
        {spec.icon ? <ShellIcon name={spec.icon} size={15} /> : null}
        {spec.label}
      </button>
      {/* on the page's body: a button inside a closed menu still opens its dialog (the ?do= deep link) */}
      {open && mounted ? createPortal(<Dialog spec={spec} onClose={close} />, document.body) : null}
    </>
  );
}

/** "More actions ▾": the rarer commands in a small menu (closes on Esc, a tap outside, or a choice). */
export function MoreMenu({ label, specs, open: openId }: { label: string; specs: CommandSpec[]; open?: string | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!specs.length) return null;
  return (
    <div className="a2-more" ref={box}>
      <button type="button" className="a2-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="orders-more">
        {label}
        <ShellIcon name="cd" size={14} />
      </button>
      <div className="a2-morepop" hidden={!open}>
        <div className="a2-menu a2-menu-o" role="menu" onClick={() => setOpen(false)}>
          {specs.map((s) => (
            <CommandButton key={s.id} spec={s} menu open={openId === s.id} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** "Details · Timeline" on a phone and a tablet (one column); both side by side on a computer (CSS). */
export function DetailGrid({ labels, main, side }: { labels: { aria: string; main: string; side: string }; main: ReactNode; side: ReactNode }) {
  const [tab, setTab] = useState<'main' | 'side'>('main');
  return (
    <>
      <div className="a2-seg a2-dtabs" role="tablist" aria-label={labels.aria}>
        <button type="button" role="tab" aria-selected={tab === 'main'} className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>
          {labels.main}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'side'} className={tab === 'side' ? 'on' : ''} onClick={() => setTab('side')} data-testid="orders-tab-timeline">
          {labels.side}
        </button>
      </div>
      <div className="a2-dgrid" data-dt={tab}>
        <div className="a2-dmain a2-stack">{main}</div>
        <div className="a2-dside a2-stack">{side}</div>
      </div>
    </>
  );
}

/** The note box above the timeline (internal by default; archived, never deleted). */
export function NoteForm({ url, labels, maxLength }: { url: string; labels: { placeholder: string; add: string; done: string; label: string }; maxLength: number }) {
  const { texts, say } = useCommands();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const add = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    const a = await send(url, { body: body.trim() }, key);
    setBusy(false);
    setKey(newKey());
    if (a.ok) {
      setBody('');
      setProblem(null);
      say(labels.done);
      router.refresh();
    } else setProblem(texts.errors[a.code] ?? texts.errors.other ?? a.code);
  };
  return (
    <div className="a2-noteform">
      <div className="a2-gap8 a2-nowrapf">
        <label className="a2-sr" htmlFor="order-note">
          {labels.label}
        </label>
        <input id="order-note" className="a2-inp" value={body} maxLength={maxLength} placeholder={labels.placeholder} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} data-testid="order-note" />
        <button type="button" className="a2-btn" onClick={add} disabled={busy || !body.trim()}>
          {labels.add}
        </button>
      </div>
      {problem ? (
        <div className="a2-note bad" role="alert">
          {problem}
        </div>
      ) : null}
    </div>
  );
}

/** Archive one note (it stays, struck from the list; never deleted). */
export function ArchiveNote({ url, label, done }: { url: string; label: string; done: string }) {
  const { texts, say } = useCommands();
  const router = useRouter();
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="a2-btn sm ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const a = await send(url, {}, key);
        setBusy(false);
        if (a.ok) {
          say(done);
          router.refresh();
        } else say(texts.errors[a.code] ?? texts.errors.other ?? a.code);
      }}
    >
      {label}
    </button>
  );
}
