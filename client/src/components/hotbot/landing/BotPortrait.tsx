'use client';

import { useId } from 'react';
import { CharacterAccessories, CharacterDefs, CharacterEye, CharacterSurface, Cigarette } from './CharacterArt';
import design from '../../../../public/hotbot/cloud-agents/character-design.json';
import s from './hotbot.module.css';

export type BotRole = 'hotbot' | 'research' | 'sniper' | 'trader' | 'launch';
export const botInfo = {
  hotbot: { name: 'HOTBOT', job: 'Keeps the work moving.', color: design.colors.hotbot },
  research: { name: 'ResearchBot', job: 'Hunts the alpha.', color: design.colors.research },
  sniper: { name: 'SniperBot', job: 'Watches your entries.', color: design.colors.sniper },
  trader: { name: 'TraderBot', job: 'Trades inside your rules.', color: design.colors.trader },
  launch: { name: 'LaunchBot', job: 'Prepares your launch.', color: design.colors.launch },
} as const;

/** Sculpted vector characters sharing their palette and geometry with the animated worlds. */
export function BotPortrait({ role, className = '', decorative = false, animated = false, reaction }: { role: BotRole; className?: string; decorative?: boolean; animated?: boolean; reaction?: number }) {
  const id = `portrait-${useId().replace(/:/g, '')}`;
  const p = botInfo[role];
  const hotbot = role === 'hotbot';
  return <svg viewBox="0 0 220 220" className={`${className} ${animated ? s.animatedPortrait : ''} ${role === 'research' ? s.researchPortrait : ''}`} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : p.name} aria-hidden={decorative || undefined} xmlns="http://www.w3.org/2000/svg">
    <CharacterDefs id={id} role={role}/>
    <ellipse cx="114" cy="187" rx="72" ry="11" fill={`url(#${id}-shadow)`}/>
    <ellipse cx="110" cy="184" rx="43" ry="4" fill={`url(#${id}-shadow)`} opacity=".65"/>
    <g className="hotbot-portrait-body" transform="translate(110 127)">
      <g className={s.portraitActing}>
        <g key={reaction ?? 'rest'} className={reaction ? s.portraitSquish : undefined}>
        <CharacterSurface id={id} role={role}/>
        <g transform={hotbot ? 'translate(0 10)' : undefined}>
          <g className={s.portraitGaze}>
            <g className={s.portraitRestEyes} transform={role === 'research' ? design.researchGlassesPose : undefined}>
            <g className={s.portraitEyes} fill={design.ink}>
              {role === 'sniper' ? <path d="M-26-1Q-20-5-14-1" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"/> : <CharacterEye x={hotbot ? -17 : -20}/>}
              <CharacterEye x={hotbot ? 17 : 20}/>
            </g>
            {animated && <g className={s.portraitLids} fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><path d={hotbot ? 'M-23-2Q-17 2-11-2M11-2Q17 2 23-2' : 'M-26-2Q-20 2-14-2M14-2Q20 2 26-2'}/></g>}
            </g>
            {reaction && <g className={s.portraitSqueezeEyes} transform={role === 'research' ? design.researchGlassesPose : undefined} fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d={hotbot ? 'M-23-7L-12 0-23 7M23-7L12 0 23 7' : 'M-27-7L-16 0-27 7M27-7L16 0 27 7'}/></g>}
            {role === 'sniper' && <path d="M-34-23L-10-16M10-16L34-25" fill="none" stroke={design.ink} strokeWidth="4" strokeLinecap="round"/>}
            {role === 'research' && <path d={design.researchBrows} fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round"/>}
          </g>
        </g>
        {role === 'sniper' && <Cigarette/>}
        <CharacterAccessories id={id} role={role}/>
        </g>
      </g>
    </g>
  </svg>;
}
