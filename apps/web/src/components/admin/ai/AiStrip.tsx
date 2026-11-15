// PR 792 — the AI switch strip every AI Center tab starts with in prototype v5 (m-ai.js `strip()`): a green or grey dot, "AI is on /
// AI is off", what that means in one line, what staff and the shop see while AI is off, and the master switch (only for someone who
// may control AI). It reads the one setting `ai.enabled` and flips it through the same call as the Control room's switch
// (MasterSwitch). Words: messages/admin-ai-strip.<lang>.json (`aiStrip.*`). Server component: no state of its own.
import { MasterSwitch } from './MasterSwitch';
import { t, type Dict } from '@/lib/i18n';

export function AiStrip({ dict, on, canControl }: { dict: Dict; on: boolean; canControl: boolean }) {
  const s = (k: string) => t(dict, `aiStrip.${k}`);
  return (
    <section className="a2-card ai-strip" data-testid="ai-strip" data-on={on ? 'yes' : 'no'}>
      <span className={`ai-strip-dot${on ? '' : ' off'}`} aria-hidden="true" />
      <div className="ai-strip-t">
        <b className="ai-strip-b">{on ? s('on') : s('off')}</b>
        <span className="a2-xs a2-mute a2-blk">{on ? s('onHint') : s('offHint')}</span>
      </div>
      <span className="a2-sm a2-mute ai-strip-h">
        <b>{s('fallbackH')}</b> “{s('fallback')}”
      </span>
      {canControl ? <MasterSwitch on={on} label={s('switchLabel')} onText={s('toastOn')} offText={s('toastOff')} failedText={s('toastFailed')} /> : null}
    </section>
  );
}
