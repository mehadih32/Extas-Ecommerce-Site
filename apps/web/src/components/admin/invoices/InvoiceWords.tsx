'use client';
// S20 · PR 409 (ORD-04d; B2.1) — "Every word on the invoice": each word the invoice prints, with the shop's own word
// shown and a box for the owner's in English and in Bengali; a search narrows the list. Save sends only the changed
// words (PUT /api/admin/invoices/words, with the list's version; STALE when someone saved in between); an empty box
// gives the word back to the shop's. A {slot} in a word is filled when the invoice prints (e.g. {total}).
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';

interface Word {
  key: string;
  byDefault: { en: string; bn: string };
  en: string;
  bn: string;
}

export function InvoiceWords({ dict, words, version, canEdit }: { dict: Dict; words: Word[]; version: string; canEdit: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(words);
  const [ver, setVer] = useState(version);
  const [draft, setDraft] = useState<Record<string, { en: string; bn: string }>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const w = (k: string, v?: Record<string, string | number>) => t(dict, `inv.words.${k}`, v);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((x) => [x.byDefault.en, x.byDefault.bn, x.en, x.bn, x.key].some((v) => v.toLowerCase().includes(s)));
  }, [list, q]);
  const changed = Object.keys(draft).length;
  const edit = (key: string, lang: 'en' | 'bn', text: string) => {
    const base = list.find((x) => x.key === key)!;
    const next = { en: draft[key]?.en ?? base.en, bn: draft[key]?.bn ?? base.bn, [lang]: text };
    const d = { ...draft };
    if (next.en === base.en && next.bn === base.bn) delete d[key];
    else d[key] = next;
    setDraft(d);
  };
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/invoices/words', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ words: draft, version: ver }) });
      const j = (await r.json()) as { ok: boolean; error?: string; details?: string[]; version?: string; words?: Word[] };
      if (!r.ok || !j.ok) {
        setMsg({ ok: false, text: j.error === 'STALE' ? w('stale') : j.error === 'INVALID_INPUT' ? w('invalid', { n: j.details?.length ?? 0 }) : w('err') });
        return;
      }
      setList(j.words ?? list);
      setVer(j.version ?? ver);
      setDraft({});
      setMsg({ ok: true, text: w('saved', { n: changed }) });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: w('err') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="a2-card a2-mt12 a2-more-opts" data-testid="invoice-words">
      <summary className="a2-h4">{w('h')}</summary>
      <p className="a2-xs a2-mute a2-mt6">{w('d')}</p>
      <input className="a2-inp a2-mt12" type="search" value={q} placeholder={w('search')} aria-label={w('search')} onChange={(e) => setQ(e.target.value)} data-testid="invoice-words-search" />
      <div className="inv-words a2-mt12">
        {shown.map((x) => (
          <div key={x.key} className="inv-word" data-testid="invoice-word">
            <p className="a2-xs a2-mute">
              {w('shop')}: <b>{x.byDefault.en}</b> · <b>{x.byDefault.bn}</b>
            </p>
            {(['en', 'bn'] as const).map((lang) => (
              <label key={lang} className="a2-stack" style={{ gap: 4 }}>
                <span className="a2-lbl">{w(`own.${lang}`)}</span>
                <input className="a2-inp" value={draft[x.key]?.[lang] ?? x[lang]} placeholder={x.byDefault[lang]} maxLength={300} disabled={!canEdit} onChange={(e) => edit(x.key, lang, e.target.value)} data-testid={`invoice-word-${x.key}-${lang}`} />
              </label>
            ))}
          </div>
        ))}
        {!shown.length ? <p className="a2-xs a2-mute">{w('none')}</p> : null}
      </div>
      {canEdit ? (
        <div className="a2-gap8 a2-mt12">
          <button type="button" className="a2-btn pri" onClick={save} disabled={busy || !changed} data-testid="invoice-words-save">
            {busy ? w('saving') : w('save', { n: changed })}
          </button>
          {changed ? (
            <button type="button" className="a2-btn ghost" onClick={() => setDraft({})} disabled={busy}>
              {w('discard')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt6">{w('readOnly')}</p>
      )}
      {msg ? (
        <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </details>
  );
}
