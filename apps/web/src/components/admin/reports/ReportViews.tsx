'use client';
// Prototype v5 parity — "Saved views" and "Save view" of a report's toolbar. A view is the period and the comparison choice a person
// saved under a name (the Report library's own `ReportView` rows, POST /api/admin/reports/library {action:'save-view'}); picking one
// opens the report with those choices. Nothing is sent anywhere and nothing is deleted.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface ViewOption {
  id: string;
  name: string;
  href: string;
}

export interface ViewTexts {
  saved: string;
  savedN: string;
  save: string;
  name: string;
  done: string;
  failed: string;
}

export function ReportViews({ reportKey, views, preset, compare, filters, texts: x, canSave, testId }: { reportKey: string; views: readonly ViewOption[]; preset: string; compare: boolean; filters: Record<string, string>; texts: ViewTexts; canSave: boolean; testId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch('/api/admin/reports/library', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save-view', reportKey, name: name.trim(), params: { preset, compare, filters } }) });
      setMsg(res.ok ? x.done : x.failed);
      if (res.ok) {
        setOpen(false);
        setName('');
        router.refresh();
      }
    } catch {
      setMsg(x.failed);
    }
  };
  return (
    <>
      <select className="a2-inp rpb2-sel" aria-label={x.saved} defaultValue="" onChange={(e) => e.target.value && router.push(e.target.value)} data-testid={`${testId}-views`}>
        <option value="">{views.length ? x.savedN.replace('{n}', String(views.length)) : x.saved}</option>
        {views.map((v) => (
          <option key={v.id} value={v.href}>
            {v.name}
          </option>
        ))}
      </select>
      {canSave ? (
        open ? (
          <span className="rpb2-save">
            <input className="a2-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={x.name} aria-label={x.name} maxLength={60} data-testid={`${testId}-viewname`} />
            <button type="button" className="a2-btn sm cr-tap" onClick={save} data-testid={`${testId}-viewok`}>
              {x.save}
            </button>
          </span>
        ) : (
          <button type="button" className="a2-btn sm ghost cr-tap" onClick={() => setOpen(true)} data-testid={`${testId}-viewsave`}>
            ☆ {x.save}
          </button>
        )
      ) : null}
      {msg ? (
        <span className="a2-xs a2-mute" role="status">
          {msg}
        </span>
      ) : null}
    </>
  );
}
