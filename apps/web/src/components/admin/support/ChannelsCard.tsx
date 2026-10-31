'use client';
// S22 · PR 426 — Support settings › Channels: where the inbox's messages come from. A person with "Change Support
// settings" adds a Facebook Page or a WhatsApp number by its id from the Meta app (it comes in switched off), renames
// it, switches it on or off, or puts it away and back (never deleted: its conversations stay). The site's live chat is
// one row too, made when the chat is switched on. Each change is saved at once and audited; a change made by someone
// else in between is refused and the list is read again.
import { useState } from 'react';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

export interface ChannelRow {
  id: string;
  kind: string;
  externalId: string;
  name: string;
  enabled: boolean;
  archived: boolean;
  conversations: number;
  liveChatOn: boolean | null;
  version: string;
}

export interface ChannelsTexts {
  h: string;
  d: string;
  readOnly: string;
  empty: string;
  kinds: Record<string, string>;
  /** "{n}" is filled in. */
  conversations: string;
  on: string;
  off: string;
  archivedTag: string;
  chatOff: string;
  switchOn: string;
  switchOff: string;
  archive: string;
  restore: string;
  rename: string;
  save: string;
  cancel: string;
  addH: string;
  addKind: string;
  addId: string;
  addIdHelp: string;
  addName: string;
  add: string;
  added: string;
  saved: string;
  err: Record<string, string>;
}

const API = '/api/admin/support/channels';

export function ChannelsCard({ rows: first, canEdit, texts: x }: Readonly<{ rows: ChannelRow[]; canEdit: boolean; texts: ChannelsTexts }>) {
  const [rows, setRows] = useState(first);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState({ kind: 'messenger', externalId: '', name: '' });

  async function act(tag: string, input: Record<string, unknown>, ok: string): Promise<boolean> {
    if (busy) return false;
    setBusy(tag);
    const a = await call('POST', API, input);
    setBusy('');
    if (a.status === 200 && Array.isArray(a.data.rows)) {
      setRows(a.data.rows as ChannelRow[]);
      setSaid({ text: ok, bad: false });
      return true;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const r = await call('GET', API);
      if (Array.isArray(r.data.rows)) setRows(r.data.rows as ChannelRow[]);
    }
    setSaid({ text: (x.err[code] ?? x.err.other ?? '').replace('{fields}', (a.data.details ?? []).join(', ')), bad: true });
    return false;
  }

  const kindName = (k: string) => x.kinds[k] ?? k;

  return (
    <section className="a2-sc a2-mt12" aria-labelledby="sup-ch-h" data-testid="support-set-channels">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id="sup-ch-h">
            {x.h}
          </h2>
          <p className="a2-scd">{x.d}</p>
        </div>
      </div>
      {!canEdit ? (
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{x.readOnly}</span>
        </div>
      ) : null}
      {rows.length ? (
        <ul className="a2-stack a2-mt12" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
          {rows.map((r) => (
            <li key={r.id} className="a2-card" data-testid="support-channel" data-kind={r.kind} data-on={r.enabled && !r.archived ? '1' : '0'}>
              <div className="a2-row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  {editing?.id === r.id ? (
                    <input className="a2-inp" aria-label={x.rename} value={editing.name} maxLength={80} onChange={(e) => setEditing({ id: r.id, name: e.target.value })} data-testid="support-channel-name" />
                  ) : (
                    <strong className="a2-h4" style={{ overflowWrap: 'anywhere' }}>
                      {r.name}
                    </strong>
                  )}
                  <p className="a2-xs a2-mute a2-mt6" style={{ overflowWrap: 'anywhere' }}>
                    {kindName(r.kind)} · {r.externalId} · {x.conversations.replace('{n}', String(r.conversations))}
                  </p>
                  <p className="a2-xs a2-mt6">
                    <span className={`a2-pill${r.enabled && !r.archived ? ' ok' : ''}`}>{r.archived ? x.archivedTag : r.enabled ? x.on : x.off}</span>
                    {r.liveChatOn === false ? <span className="a2-mute"> · {x.chatOff}</span> : null}
                  </p>
                </div>
                {canEdit ? (
                  <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
                    {editing?.id === r.id ? (
                      <>
                        <button type="button" className="a2-btn pri" disabled={!!busy || !editing.name.trim()} onClick={async () => (await act(`n${r.id}`, { action: 'rename', id: r.id, name: editing.name, version: r.version }, x.saved)) && setEditing(null)}>
                          {x.save}
                        </button>
                        <button type="button" className="a2-btn" onClick={() => setEditing(null)}>
                          {x.cancel}
                        </button>
                      </>
                    ) : (
                      <>
                        {!r.archived ? (
                          <button type="button" className="a2-btn" disabled={!!busy} onClick={() => act(`s${r.id}`, { action: 'switch', id: r.id, enabled: !r.enabled, version: r.version }, x.saved)} data-testid="support-channel-switch">
                            {r.enabled ? x.switchOff : x.switchOn}
                          </button>
                        ) : null}
                        <button type="button" className="a2-btn" disabled={!!busy} onClick={() => setEditing({ id: r.id, name: r.name })}>
                          {x.rename}
                        </button>
                        <button type="button" className="a2-btn" disabled={!!busy} onClick={() => act(`a${r.id}`, { action: 'archive', id: r.id, archived: !r.archived, version: r.version }, x.saved)}>
                          {r.archived ? x.restore : x.archive}
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-sm a2-mute a2-mt12" data-testid="support-channels-empty">
          {x.empty}
        </p>
      )}
      {canEdit ? (
        <form
          className="a2-mt12"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act('add', { action: 'add', kind: draft.kind, externalId: draft.externalId.trim(), name: draft.name.trim() }, x.added)) setDraft({ kind: draft.kind, externalId: '', name: '' });
          }}
          data-testid="support-channel-add"
        >
          <h3 className="a2-h4">{x.addH}</h3>
          <div className="a2-fg a2-mt6">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="sup-ch-kind">
                {x.addKind}
              </label>
              <select id="sup-ch-kind" className="a2-sel" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {(['messenger', 'whatsapp'] as const).map((k) => (
                  <option key={k} value={k}>
                    {kindName(k)}
                  </option>
                ))}
              </select>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="sup-ch-id">
                {x.addId}
              </label>
              <input id="sup-ch-id" className="a2-inp" inputMode="numeric" maxLength={30} value={draft.externalId} onChange={(e) => setDraft({ ...draft, externalId: e.target.value })} data-testid="support-channel-add-id" />
              <p className="a2-xs a2-mute">{x.addIdHelp}</p>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="sup-ch-name">
                {x.addName}
              </label>
              <input id="sup-ch-name" className="a2-inp" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="support-channel-add-name" />
            </div>
          </div>
          <div className="a2-scbar">
            <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="support-channels-status">
              {said?.text ?? ''}
            </span>
            <button type="submit" className="a2-btn pri" disabled={!!busy || !draft.externalId.trim() || !draft.name.trim()} data-testid="support-channel-add-go">
              {busy === 'add' ? '…' : x.add}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
