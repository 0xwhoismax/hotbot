"use client";
import { STARTER_AGENTS, type AgentRole } from '../../../../types/hotbot';
import { Hotbot, type HotbotProps } from './Hotbot';
import { AppFlame } from './AppFlame';

/** Flat bot mascot: HOTBOT is the app icon's flame, specialists are clouds. Small ones stay still (see `Hotbot`); a sleeping one stops following the cursor. */
export function BotAvatar({ role, size = 28, menuIcon = false, mood, faceLeft }: { role: AgentRole; size?: number; menuIcon?: boolean; mood?: HotbotProps['mood']; faceLeft?: boolean }) {
  const bot = STARTER_AGENTS.find(agent => agent.role === role)!;
  return <span className="inline-grid shrink-0 place-items-center" data-sidebar={menuIcon ? 'menu-icon' : undefined} style={{ width: size, height: size }} aria-hidden>
    {role === 'coordinator' ? <AppFlame size={size} faceLeft={faceLeft} mood={mood === 'shy' ? 'shy' : undefined}/>
      : <Hotbot size={size} color={bot.color} mood={mood} followCursor={mood !== 'asleep'}/>}
  </span>;
}
