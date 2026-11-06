'use client';
// S14 · PR 300 — a draft win-back campaign's form (Messages › Campaigns › a campaign): its name, the channel (SMS or
// WhatsApp), the shop's template on that channel with a phone preview, who it names (no order for N days, not longer
// than M days, at least K delivered orders, inside a saved segment or everyone); "Save draft"
// (`messages.campaigns.write`). Once saved, "Schedule" (now or at a time; `messages.campaigns.send`) asks first, with how
// many it reaches and the estimated cost. The API checks everything again; nothing is sent from here, only scheduled.
// PR 277: a campaign to a group (`kind` blast) has no rule: it names one saved segment (or every customer, only when
// the owner allowed it), and points to Messages › E-mail for an e-mail campaign.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { CampaignChannel, CampaignKind, CampaignTemplate, WinbackRule } from '@extas/customers';
import { t, type Dict } from '@/lib/i18n';
import { emailPost } from './emailPost';
import { showToast } from '../lumen/Toast';

export interface CampaignFormProps {
  dict: Dict;
  /** PR 277: `blast` — a campaign to a group (no rule; a saved segment, or every customer when allowed). */
  kind: CampaignKind;
  /** A blast may name every customer (`customers.blast.allowEveryone`). */
  allowEveryone: boolean;
  id: string | null;
  version: string | null;
  name: string;
  channel: CampaignChannel;
  templateId: string | null;
  segmentId: string | null;
  rule: WinbackRule;
  templates: CampaignTemplate[];
  segments: { id: string; name: string }[];
  segmentsOn: boolean;
  /** How many get it now (the saved draft's audience), or null when not counted. */
  willGet: number | null;
  /** The estimated cost, already written in the store's money, or null when not known. */
  cost: string | null;
  canWrite: boolean;
  canSend: boolean;
}

const INT = /^\d+$/;
/** The segment choice that means every customer (a blast, only when allowed). */
const ALL = '*';

export function CampaignForm(p: CampaignFormProps) {
  const d = p.dict;
  const uid = useId();
  const router = useRouter();
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.wb.f.${k}`, v);
  const [name, setName] = useState(p.name);
  const [channel, setChannel] = useState<CampaignChannel>(p.channel);
  const [templateId, setTemplateId] = useState(p.templateId ?? '');
  const blast = p.kind === 'blast';
  const [segmentId, setSegmentId] = useState(p.segmentId ?? (blast && p.id && p.allowEveryone ? ALL : ''));
  const [lapsed, setLapsed] = useState(String(p.rule.lapsedDays));
  const [maxLapsed, setMaxLapsed] = useState(p.rule.maxLapsedDays === null ? '' : String(p.rule.maxLapsedDays));
  const [minDelivered, setMinDelivered] = useState(String(p.rule.minDelivered));
  const [later, setLater] = useState(false);
  const [at, setAt] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ruleNow = `${lapsed}|${maxLapsed}|${minDelivered}`;
  const ruleWas = `${p.rule.lapsedDays}|${p.rule.maxLapsedDays ?? ''}|${p.rule.minDelivered}`;
  const segWas = p.segmentId ?? (blast && p.id && p.allowEveryone ? ALL : '');
  const changed = name !== p.name || channel !== p.channel || templateId !== (p.templateId ?? '') || segmentId !== segWas || (!blast && ruleNow !== ruleWas);
  const choices = p.templates.filter((tp) => tp.channel === channel);
  const picked = choices.find((tp) => tp.id === templateId) ?? null;

  const save = async () => {
    const bad = blast
      ? [!segmentId ? x('blastSegment') : '', !templateId ? x('template') : '']
      : [!INT.test(lapsed.trim()) ? x('lapsed') : '', maxLapsed.trim() && !INT.test(maxLapsed.trim()) ? x('maxLapsed') : '', !INT.test(minDelivered.trim()) ? x('minDelivered') : '', !templateId ? x('template') : ''];
    if (bad.some(Boolean)) return setMsg({ ok: false, text: t(d, 'cus.err.INVALID_INPUT', { fields: bad.filter(Boolean).join(', ') }) });
    setBusy(true);
    setMsg(null);
    const rule = blast ? null : { lapsedDays: Number(lapsed.trim()), maxLapsedDays: maxLapsed.trim() ? Number(maxLapsed.trim()) : null, minDelivered: Number(minDelivered.trim()) };
    const seg = segmentId && segmentId !== ALL ? segmentId : null;
    const r = await emailPost(d, `/api/admin/messages/campaigns/items${p.id ? `/${p.id}` : ''}`, { ...(p.id ? {} : { kind: p.kind }), name, channel, templateId, segmentId: seg, rule, ...(p.version ? { version: p.version } : {}) });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    showToast({ text: x('saved'), tone: 'ok' });
    const id = (r.data.editor as { campaign?: { id: string } } | undefined)?.campaign?.id;
    if (!p.id && id) router.push(`/admin/messages/campaigns/${id}`);
    else router.refresh();
  };

  const schedule = async () => {
    if (!p.id) return;
    const when = later && at ? new Date(at) : null;
    if (later && (!when || Number.isNaN(when.getTime()))) return setMsg({ ok: false, text: t(d, 'cus.err.INVALID_INPUT', { fields: x('time') }) });
    setBusy(true);
    setMsg(null);
    const r = await emailPost(d, `/api/admin/messages/campaigns/items/${p.id}/state`, { action: 'schedule', at: when ? when.toISOString() : null, ...(p.version ? { version: p.version } : {}) });
    setBusy(false);
    setAsking(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    router.refresh();
  };

  return (
    <section className="a2-card a2-mt12 mail-form" data-testid="wb-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {x('name')}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={80} placeholder={x(blast ? 'namePhBlast' : 'namePh')} disabled={!p.canWrite} onChange={(e) => setName(e.target.value)} />
      </div>
      <h2 className="a2-h3">{x('who')}</h2>
      {blast ? (
        p.segmentsOn || p.allowEveryone ? (
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-g`}>
              {x('blastSegment')}
            </label>
            <select id={`${uid}-g`} className="a2-sel" value={segmentId} disabled={!p.canWrite} onChange={(e) => setSegmentId(e.target.value)} data-testid="wb-segment">
              <option value="">{x('pickSegment')}</option>
              {p.segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {p.allowEveryone ? <option value={ALL}>{x('everyoneBlast')}</option> : null}
            </select>
            {!p.segments.length ? <p className="a2-xs a2-mute a2-mt6">{x('noSegments')}</p> : null}
          </div>
        ) : (
          <p className="a2-xs a2-mute">{x('noSegments')}</p>
        )
      ) : null}
      {blast ? null : (
        <div className="wb-rule">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-l`}>
              {x('lapsed')}
            </label>
            <input id={`${uid}-l`} className="a2-inp" inputMode="numeric" value={lapsed} disabled={!p.canWrite} onChange={(e) => setLapsed(e.target.value)} data-testid="wb-lapsed" />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-m`}>
              {x('maxLapsed')}
            </label>
            <input id={`${uid}-m`} className="a2-inp" inputMode="numeric" value={maxLapsed} placeholder={x('noLimit')} disabled={!p.canWrite} onChange={(e) => setMaxLapsed(e.target.value)} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${uid}-k`}>
              {x('minDelivered')}
            </label>
            <input id={`${uid}-k`} className="a2-inp" inputMode="numeric" value={minDelivered} disabled={!p.canWrite} onChange={(e) => setMinDelivered(e.target.value)} />
          </div>
        </div>
      )}
      {blast ? null : p.segmentsOn ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-g`}>
            {x('segment')}
          </label>
          <select id={`${uid}-g`} className="a2-sel" value={segmentId} disabled={!p.canWrite} onChange={(e) => setSegmentId(e.target.value)} data-testid="wb-segment">
            <option value="">{x('everyone')}</option>
            {p.segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="a2-xs a2-mute">{x('segmentsOff')}</p>
      )}
      <h2 className="a2-h3">{x('what')}</h2>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-c`}>
          {x('channel')}
        </label>
        <select
          id={`${uid}-c`}
          className="a2-sel"
          value={channel}
          disabled={!p.canWrite}
          onChange={(e) => {
            setChannel(e.target.value as CampaignChannel);
            setTemplateId('');
          }}
          data-testid="wb-channel"
        >
          <option value="SMS">{t(d, 'msg.channel.SMS')}</option>
          <option value="WHATSAPP">{t(d, 'msg.channel.WHATSAPP')}</option>
        </select>
        {blast ? (
          <>
            <p className="a2-xs a2-mute a2-mt6">{x('emailNote')}</p>
            <Link className="a2-btn a2-mt6" href="/admin/messages/email" data-testid="wb-email-go">
              {x('emailGo')}
            </Link>
          </>
        ) : null}
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-t`}>
          {x('template')}
        </label>
        <select id={`${uid}-t`} className="a2-sel" value={templateId} disabled={!p.canWrite} onChange={(e) => setTemplateId(e.target.value)} data-testid="wb-template">
          <option value="">{x('pickTemplate')}</option>
          {choices.map((tp) => (
            <option key={tp.id} value={tp.id}>
              {tp.name}
            </option>
          ))}
        </select>
        {!choices.length ? <p className="a2-xs a2-mute a2-mt6">{x('noTemplates')}</p> : null}
      </div>
      {picked ? (
        <div>
          <p className="a2-xs a2-mute">{x('preview')}</p>
          <div className="wb-phone a2-sm a2-mt6" data-testid="wb-preview">
            {picked.body}
          </div>
          {channel === 'WHATSAPP' && !picked.approved ? <p className="a2-xs a2-mt6">{x('waNotApproved')}</p> : null}
        </div>
      ) : null}
      <p className="a2-xs a2-mute">{x('noOffer')}</p>
      {p.canWrite ? (
        <span>
          <button type="button" className="a2-btn" onClick={save} disabled={busy} data-testid="wb-save">
            {busy ? x('saving') : x('save')}
          </button>
        </span>
      ) : (
        <p className="a2-xs a2-mute">{x('readOnly')}</p>
      )}
      {p.id ? (
        <>
          <div className="a2-hr" />
          <h2 className="a2-h3">{x('when')}</h2>
          {p.canSend ? (
            <>
              <div className="mail-when">
                <label className="a2-ckb">
                  <input type="radio" name={`${uid}-w`} checked={!later} onChange={() => setLater(false)} />
                  {x('now')}
                </label>
                <label className="a2-ckb">
                  <input type="radio" name={`${uid}-w`} checked={later} onChange={() => setLater(true)} />
                  {x('later')}
                </label>
                {later ? <input type="datetime-local" className="a2-inp" aria-label={x('time')} value={at} onChange={(e) => setAt(e.target.value)} /> : null}
              </div>
              {asking ? (
                <div className="mail-ask" role="alertdialog" aria-label={x('scheduleAsk')} data-testid="wb-schedule-ask">
                  <p className="a2-sm a2-b">{x('scheduleAsk')}</p>
                  <ul className="a2-sm a2-mt6">
                    <li>{x('scheduleEff1', { n: String(p.willGet ?? 0) })}</li>
                    <li>{p.cost ? x('scheduleCost', { cost: p.cost }) : x('scheduleNoCost')}</li>
                    <li>{x('scheduleEff2')}</li>
                    <li>{x('scheduleEff3')}</li>
                  </ul>
                  <span className="a2-gap8 a2-mt12">
                    <button type="button" className="a2-btn pri" onClick={schedule} disabled={busy} data-testid="wb-schedule-yes">
                      {x('scheduleYes')}
                    </button>
                    <button type="button" className="a2-btn" onClick={() => setAsking(false)} disabled={busy}>
                      {t(d, 'cus.merge.cancel')}
                    </button>
                  </span>
                </div>
              ) : (
                <span>
                  <button type="button" className="a2-btn pri" onClick={() => setAsking(true)} disabled={busy || changed || !p.willGet} data-testid="wb-schedule">
                    {x('schedule')}
                  </button>
                </span>
              )}
              {changed ? <p className="a2-xs a2-mute">{x('saveFirst')}</p> : null}
            </>
          ) : (
            <p className="a2-xs a2-mute">{x('noSendRight')}</p>
          )}
        </>
      ) : null}
      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
