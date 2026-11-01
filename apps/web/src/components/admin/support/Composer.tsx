'use client';
// S22 · PR 425 — the box under a conversation: a reply to the customer or an internal note for the team (the customer
// never sees it), with files. Each file is sent to the server first and checked there by its contents against Support
// settings; the message then carries the stored copies. One press of Send carries one key, so a double press is one
// message. A conversation changed in between (a new customer message, someone else's reply) is read again and the
// draft is kept, so nobody answers without seeing the latest message. Ctrl + Enter sends.
// PR 429: with products in the chat on, "Products" (or "/" typed in an empty reply) opens the catalogue drawer
// (ProductDrawer): one product sent as a card with its tracked link.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';
import type { Lang, Money } from '../products/model';
import { ShellIcon } from '../shell/ShellIcon';
import { ProductDrawer, type ProductDrawerTexts } from './ProductDrawer';

/** PR 429: the catalogue drawer's place in the reply box (null while `support.catalogue` is off). */
export interface ComposerProducts {
  searchUrl: string;
  shareUrl: string;
  lang: Lang;
  money: Money;
  photos: number;
  button: string;
  texts: ProductDrawerTexts;
  /** PR 430: the chat bag's address when orders from the chat are on for this person ("Add to bag"). */
  addUrl?: string | null;
}

export interface ComposerTexts {
  label: string;
  reply: string;
  note: string;
  phReply: string;
  phNote: string;
  attach: string;
  send: string;
  saveNote: string;
  sending: string;
  uploading: string;
  /** "{name}" is filled in. */
  remove: string;
  hint: string;
  sent: string;
  /** "{reason}" is filled in. */
  kept: string;
  noted: string;
  reasons: Record<string, string>;
  err: Record<string, string>;
}

interface Chosen {
  id: string;
  name: string;
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

export function Composer({
  url,
  filesUrl,
  version,
  maxChars,
  files,
  products = null,
  texts: x,
}: {
  url: string;
  filesUrl: string;
  version: string;
  maxChars: number;
  files: { enabled: boolean; max: number; accept: string };
  products?: ComposerProducts | null;
  texts: ComposerTexts;
}) {
  const id = useId();
  const router = useRouter();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [busy, setBusy] = useState<'' | 'send' | 'upload'>('');
  const [key, setKey] = useState(newKey);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [drawer, setDrawer] = useState<'' | 'button' | 'slash'>('');
  const err = (code: string | undefined) => x.err[code ?? 'other'] ?? x.err.other ?? '';

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const room = Math.max(0, files.max - chosen.length);
    const picked = [...list].slice(0, room);
    if (list.length > room) setSaid({ text: err('TOO_MANY_FILES'), bad: true });
    setBusy('upload');
    const added: Chosen[] = [];
    for (const f of picked) {
      const form = new FormData();
      form.append('file', f);
      try {
        const res = await fetch(filesUrl, { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; file?: { id: string; fileName: string | null } };
        if (res.ok && data.file) added.push({ id: data.file.id, name: data.file.fileName ?? f.name });
        else setSaid({ text: `${f.name}: ${err(data.error)}`, bad: true });
      } catch {
        setSaid({ text: err('network'), bad: true });
      }
    }
    setChosen((c) => [...c, ...added]);
    setBusy('');
  }

  async function send() {
    if (busy) return;
    if (!body.trim() && !chosen.length) return setSaid({ text: err('EMPTY'), bad: true });
    setBusy('send');
    const a = await call('POST', url, { body, note: mode === 'note', assetIds: chosen.map((c) => c.id), requestKey: key, version });
    setBusy('');
    if (a.status === 200) {
      const delivery = a.data.delivery as string | null;
      const reason = a.data.failReason as string | null;
      setSaid({ text: mode === 'note' ? x.noted : delivery === 'SENT' ? x.sent : x.kept.replace('{reason}', x.reasons[reason ?? ''] ?? reason ?? ''), bad: delivery === 'FAILED' });
      setBody('');
      setChosen([]);
      setKey(newKey());
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : a.data.error;
    if (code === 'STALE') router.refresh();
    if (code === 'IDEMPOTENCY_MISMATCH') setKey(newKey());
    setSaid({ text: err(code).replace('{fields}', (a.data.details ?? []).join(', ')), bad: true });
  }

  const note = mode === 'note';
  return (
    <section className={`a2-card sp-comp${note ? ' note' : ''}`} aria-labelledby={`${id}-l`} data-testid="support-composer">
      <h2 className="a2-h4" id={`${id}-l`} style={{ marginBottom: 8 }}>
        {x.label}
      </h2>
      <div className="a2-seg" role="tablist" aria-label={x.label} style={{ marginBottom: 8 }}>
        <button type="button" role="tab" aria-selected={!note} className={!note ? 'on' : ''} onClick={() => setMode('reply')} data-testid="support-mode-reply">
          {x.reply}
        </button>
        <button type="button" role="tab" aria-selected={note} className={note ? 'on' : ''} onClick={() => setMode('note')} data-testid="support-mode-note">
          <ShellIcon name="lock" size={13} />
          {x.note}
        </button>
      </div>
      {products && drawer && !note ? (
        <ProductDrawer
          searchUrl={products.searchUrl}
          shareUrl={products.shareUrl}
          version={version}
          lang={products.lang}
          money={products.money}
          photos={products.photos}
          addUrl={products.addUrl ?? null}
          autoFocus
          onClose={() => setDrawer('')}
          texts={products.texts}
        />
      ) : null}
      <textarea
        className="a2-inp a2-ta"
        value={body}
        maxLength={maxChars}
        placeholder={note ? x.phNote : x.phReply}
        aria-label={note ? x.note : x.reply}
        onChange={(e) => {
          setBody(e.target.value);
          setSaid(null);
        }}
        onKeyDown={(e) => {
          // PR 429: "/" in an empty reply opens the products
          if (products && !note && e.key === '/' && body === '' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            setDrawer('slash');
            return;
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
        data-testid="support-body"
      />
      {chosen.length ? (
        <div className="sp-chips">
          {chosen.map((c) => (
            <span key={c.id} className="sp-file">
              <ShellIcon name="file" size={13} />
              <span>{c.name}</span>
              <button type="button" aria-label={x.remove.replace('{name}', c.name)} onClick={() => setChosen((all) => all.filter((y) => y.id !== c.id))}>
                <ShellIcon name="x" size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="sp-cbar">
        {files.enabled ? (
          <label className="a2-btn sp-attach" aria-disabled={busy !== '' || chosen.length >= files.max}>
            <ShellIcon name="plus" size={14} />
            {busy === 'upload' ? x.uploading : x.attach}
            <input
              type="file"
              multiple
              accept={files.accept}
              disabled={busy !== '' || chosen.length >= files.max}
              aria-label={x.attach}
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = '';
              }}
              data-testid="support-attach"
            />
          </label>
        ) : null}
        {products && !note ? (
          <button type="button" className={`a2-btn${drawer ? ' on' : ''}`} aria-expanded={drawer !== ''} onClick={() => setDrawer(drawer ? '' : 'button')} data-testid="support-products-open">
            <ShellIcon name="shirt" size={14} />
            {products.button}
          </button>
        ) : null}
        <span className="sp-grow a2-xs a2-mute">
          {body.length}/{maxChars} · {x.hint}
        </span>
        <button type="button" className="a2-btn pri" disabled={busy !== ''} onClick={() => void send()} data-testid="support-send">
          {busy === 'send' ? x.sending : note ? x.saveNote : x.send}
        </button>
      </div>
      <p className={`a2-sm a2-mt6${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="support-said">
        {said?.text ?? ''}
      </p>
    </section>
  );
}
