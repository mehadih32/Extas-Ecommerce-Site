'use client';
// PR 630 (CN-036) — Settings › General › Admin look, the theme part: the four looks of ADMIN-LOOKS-V1.html (ঘ Lumen
// built and in use; ক Clear Day, খ Night Atelier, গ Studio shown as "Planned", never selectable until PR 649–651
// build them), light or dark, the accent colour (ready swatches, coral first, or any colour) and "Reduce motion".
// Each is the person's own (StaffUser.adminPrefs.theme through PUT /api/admin/look, scope "me"): it changes only how
// the admin looks to them. With settings.write the team's accent and the team's "Reduce motion" (setting
// `admin.theme`, the change log keeps who and when) sit under "For the whole team". A save redraws the admin at once.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';

export interface ThemeLookCard {
  id: string;
  letter: string;
  built: boolean;
  name: string;
  desc: string;
}

export interface ThemeChooserProps {
  looks: readonly ThemeLookCard[];
  /** What this person sees now. */
  now: { look: string; mode: 'light' | 'dark'; motion: 'full' | 'reduce'; accent: string };
  /** Their own accent (none = the team's). */
  mine: { accent: string | null };
  team: { accent: string; reduceMotion: boolean } | null;
  swatches: readonly { id: string; hex: string; name: string }[];
  words: Record<string, string>;
  testId?: string;
}

async function put(body: Record<string, unknown>): Promise<boolean> {
  const r = await fetch('/api/admin/look', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return !!r?.ok;
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function ThemeChooser({ looks, now, mine, team, swatches, words: w, testId = 'look-theme' }: ThemeChooserProps) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [custom, setCustom] = useState(now.accent || swatches[0]?.hex || '');
  const save = (body: Record<string, unknown>) =>
    start(async () => {
      const ok = await put(body);
      showToast(ok ? { text: w.saved ?? '' } : { text: w.failed ?? '', tone: 'bad' });
      if (ok) router.refresh();
    });
  const me = (theme: Record<string, unknown>) => save({ scope: 'me', theme });
  const accentNow = now.accent || team?.accent || swatches[0]?.hex || '';
  const reduced = now.motion === 'reduce';

  return (
    <section className="lm-theme" aria-labelledby="look-theme-t" data-testid={testId}>
      <div className="lm-theme-h">
        <h2 id="look-theme-t">{w.title}</h2>
        <p>{w.sub}</p>
      </div>

      <div className="lm-theme-b lm-card">
        <h3>{w.looksTitle}</h3>
        <div className="lm-looks">
          {looks.map((l) => {
            const on = l.id === now.look;
            return (
              <article key={l.id} className={`lm-lookc${on ? ' on' : ''}${l.built ? '' : ' planned'}`} aria-disabled={!l.built || undefined} data-testid={`look-theme-${l.id}`}>
                <div className="lm-lookpv" data-look={l.id} aria-hidden="true">
                  <i className="s" />
                  <i className="c" />
                  <i className="c2" />
                  <i className="a" />
                </div>
                <div className="lm-lookc-t">
                  <b>
                    <span className="lm-letter">{l.letter}</span> {l.name}
                  </b>
                  {on ? (
                    <span className="lm-pill ok">
                      <ShellIcon name="check" size={13} />
                      {w.inUse}
                    </span>
                  ) : !l.built ? (
                    <span className="lm-pill">{w.planned}</span>
                  ) : null}
                </div>
                <p>{l.built ? l.desc : `${l.desc} ${w.plannedNote}`}</p>
                {l.built && !on ? (
                  <button type="button" className="lm-btn sm" disabled={busy} onClick={() => me({ look: l.id })}>
                    {w.use}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <div className="lm-theme-row">
        <div className="lm-theme-b lm-card">
          <h3 id="look-theme-mode">{w.mode}</h3>
          <div className="lm-choice" role="radiogroup" aria-labelledby="look-theme-mode" data-testid="look-theme-mode">
            {(['light', 'dark'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={now.mode === m} className={now.mode === m ? 'on' : undefined} disabled={busy} onClick={() => now.mode !== m && me({ mode: m })} data-value={m}>
                <ShellIcon name={m === 'light' ? 'sun' : 'moon'} size={16} />
                {w[m]}
              </button>
            ))}
          </div>
          <p className="lm-sub">{w.modeNote}</p>
        </div>

        <div className="lm-theme-b lm-card">
          <div className="lm-setr">
            <div>
              <h3 id="look-theme-motion">{w.motion}</h3>
              <p>{w.motionNote}</p>
            </div>
            <button type="button" role="switch" aria-checked={reduced} aria-labelledby="look-theme-motion" className={`lm-sw${reduced ? ' on' : ''}`} disabled={busy} onClick={() => me({ motion: reduced ? 'full' : 'reduce' })} data-testid="look-theme-motion">
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="lm-theme-b lm-card">
        <h3 id="look-theme-accent">{w.accent}</h3>
        <p className="lm-sub">{w.accentNote}</p>
        <div className="lm-swatches" role="radiogroup" aria-labelledby="look-theme-accent" data-testid="look-theme-accent">
          {swatches.map((s) => {
            const on = same(s.hex, accentNow);
            return (
              <button key={s.id} type="button" role="radio" aria-checked={on} className={`lm-swatch${on ? ' on' : ''}`} disabled={busy} onClick={() => !on && me({ accent: s.hex })} data-value={s.id}>
                <i style={{ background: s.hex }} aria-hidden="true" />
                {s.name}
              </button>
            );
          })}
          <label className="lm-swatch own">
            <input type="color" value={custom.toLowerCase()} onChange={(e) => setCustom(e.target.value)} onBlur={() => !same(custom, accentNow) && me({ accent: custom.toUpperCase() })} aria-label={w.own} disabled={busy} />
            {w.own}
          </label>
        </div>
        <div className="lm-theme-acts">
          {mine.accent ? (
            <>
              <span className="lm-pill">{w.mine}</span>
              <button type="button" className="lm-btn sm gh" disabled={busy} onClick={() => me({ accent: null })}>
                {w.followTeam}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {team ? (
        <div className="lm-theme-b lm-card" data-testid="look-theme-team">
          <h3>{w.forTeam}</h3>
          <div className="lm-grow2">
            <span className="lm-teamc">
              <i style={{ background: team.accent }} aria-hidden="true" />
              {w.teamNow}
            </span>
            {!same(team.accent, accentNow) ? (
              <button type="button" className="lm-btn sm" disabled={busy} onClick={() => save({ scope: 'team', theme: { accent: accentNow.toUpperCase() } })} data-testid="look-theme-team-accent">
                {w.teamAccent}
              </button>
            ) : null}
          </div>
          <div className="lm-setr">
            <div>
              <h3 id="look-theme-tmotion">{w.motionTeam}</h3>
              <p>{w.motionTeamNote}</p>
            </div>
            <button type="button" role="switch" aria-checked={team.reduceMotion} aria-labelledby="look-theme-tmotion" className={`lm-sw${team.reduceMotion ? ' on' : ''}`} disabled={busy} onClick={() => save({ scope: 'team', theme: { reduceMotion: !team.reduceMotion } })} data-testid="look-theme-team-motion">
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
