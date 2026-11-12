'use client';
// S15 · PR 321 (C1.7 "Skill library") — AI › Skills' own "Import a skill" button and modal: a skill name and an
// agent (the demo's own AIC-04 "Skills, Library" import form — only these two fields, see skills.ts's own header
// comment on why). POSTs `{action:'import', name, agentKey}` to `/api/admin/ai/skills` (`ai.skills.write`); the
// new card lands "waiting for approval" — a decision is `AI › Approvals`' own job, not this dialog's.
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { showToast } from '@/components/admin/lumen/Toast';
import { useDialogKeys } from '@/components/admin/orders/OrderCommands';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/skills' };
const noSubscribe = () => () => {};

export interface SkillAgentOption {
  key: string;
  label: string;
}

export function SkillImportDialog({
  buttonLabel,
  agents,
  texts,
}: {
  buttonLabel: string;
  agents: readonly SkillAgentOption[];
  texts: {
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    agentLabel: string;
    cancel: string;
    ok: string;
    working: string;
    close: string;
    effect1: string;
    effect2: string;
    toastOk: string;
    toastFailed: string;
  };
}) {
  const router = useRouter();
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [agentKey, setAgentKey] = useState(agents[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  useDialogKeys(box, () => setOpen(false));

  const submit = async () => {
    if (busy || !name.trim() || !agentKey) return;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { action: 'import', name: name.trim(), agentKey }));
    setBusy(false);
    if (!ok) {
      showToast({ text: texts.toastFailed, tone: 'bad' });
      return;
    }
    setOpen(false);
    setName('');
    showToast({ text: texts.toastOk });
    router.refresh();
  };

  return (
    <>
      <button type="button" className="a2-btn pri" data-testid="ai-sk-import-open" onClick={() => setOpen(true)}>
        <ShellIcon name="plus" size={15} />
        {buttonLabel}
      </button>
      {open && mounted
        ? createPortal(
            <div className="adm2 a2-z a2-ov mid" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
              <div ref={box} className="a2-dlg" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} data-testid="ai-sk-import-dialog">
                <div className="a2-dlgh">
                  <h2 className="a2-h3" id={`${uid}-t`}>
                    {texts.title}
                  </h2>
                  <button type="button" className="a2-icb" onClick={() => setOpen(false)} aria-label={texts.close}>
                    <ShellIcon name="x" size={18} />
                  </button>
                </div>
                <div className="a2-dlgb">
                  <div className="a2-fg">
                    <div className="a2-fld full">
                      <label className="a2-lbl" htmlFor={`${uid}-n`}>
                        {texts.nameLabel}
                      </label>
                      <input
                        id={`${uid}-n`}
                        className="a2-inp"
                        value={name}
                        placeholder={texts.namePlaceholder}
                        maxLength={120}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="ai-sk-import-name"
                        autoComplete="off"
                      />
                    </div>
                    <div className="a2-fld full">
                      <label className="a2-lbl" htmlFor={`${uid}-a`}>
                        {texts.agentLabel}
                      </label>
                      <select id={`${uid}-a`} className="a2-sel" value={agentKey} onChange={(e) => setAgentKey(e.target.value)} data-testid="ai-sk-import-agent">
                        {agents.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <ul className="a2-eff a2-mt12">
                    <li>
                      <ShellIcon name="check" size={14} />
                      <span>{texts.effect1}</span>
                    </li>
                    <li>
                      <ShellIcon name="check" size={14} />
                      <span>{texts.effect2}</span>
                    </li>
                  </ul>
                </div>
                <div className="a2-dlgf">
                  <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
                    {texts.cancel}
                  </button>
                  <button type="button" className="a2-btn pri" data-ok onClick={submit} disabled={busy || !name.trim()} aria-busy={busy || undefined} data-testid="ai-sk-import-submit">
                    {busy ? texts.working : texts.ok}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
