import { ImageResponse } from 'next/og';
import { Children, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { CharacterAccessories, CharacterDefs, CharacterEye, CharacterSurface, Cigarette } from '@/components/hotbot/landing/CharacterArt';
import design from '../../../../public/hotbot/cloud-agents/character-design.json';

export const dynamic = 'force-static';

type Role = keyof typeof design.colors;
const size = { width: 1200, height: 630 };
const ember = design.colors.hotbot;
const crew: { role: Role; name: string }[] = [
  { role: 'research', name: 'ResearchBot' },
  { role: 'sniper', name: 'SniperBot' },
  { role: 'hotbot', name: 'HOTBOT' },
  { role: 'trader', name: 'TraderBot' },
  { role: 'launch', name: 'LaunchBot' },
];
const headline = ['Your private', 'trading team.'];
const subtitle = 'Specialist bots working together wherever you trade.';

/** Satori copies an inline <svg> verbatim, so expand the character art's components and fragments and drop unset props first. */
function plain(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  const { type, props } = node as ReactElement<{ children?: ReactNode }>;
  if (typeof type === 'function') return plain((type as (props: object) => ReactNode)(props));
  const children = Children.toArray(props.children).map(plain);
  if ((type as unknown) === Fragment) return children;
  return createElement(type, Object.fromEntries(Object.entries(props).filter(([name, value]) => name !== 'children' && value !== undefined)), ...children);
}

/** The landing's BotPortrait at rest, without hooks or motion, so it renders to a plain SVG. */
function Portrait({ role, side }: { role: Role; side: number }) {
  const hotbot = role === 'hotbot';
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width={side} height={side}>
    <CharacterDefs id={role} role={role}/>
    <ellipse cx="114" cy="187" rx="72" ry="11" fill={`url(#${role}-shadow)`}/>
    <ellipse cx="110" cy="184" rx="43" ry="4" fill={`url(#${role}-shadow)`} opacity=".65"/>
    <g transform="translate(110 127)">
      <CharacterSurface id={role} role={role}/>
      <g transform={hotbot ? 'translate(0 10)' : undefined}>
        <g transform={role === 'research' ? design.researchGlassesPose : undefined} fill={design.ink}>
          {role === 'sniper' ? <path d="M-26-1Q-20-5-14-1" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"/> : <CharacterEye x={hotbot ? -17 : -20}/>}
          <CharacterEye x={hotbot ? 17 : 20}/>
        </g>
        {role === 'sniper' && <path d="M-34-23L-10-16M10-16L34-25" fill="none" stroke={design.ink} strokeWidth="4" strokeLinecap="round"/>}
        {role === 'research' && <path d={design.researchBrows} fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round"/>}
      </g>
      {role === 'sniper' && <Cigarette/>}
      <CharacterAccessories id={role} role={role}/>
    </g>
  </svg>;
}

/** The landing's FlameMark. */
function Flame() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 144" width={25} height={30}>
    <CharacterDefs id="mark" role="hotbot"/>
    <g transform="translate(60 88)"><CharacterSurface id="mark" role="hotbot"/></g>
    <CharacterEye x={43} y={96}/>
    <CharacterEye x={77} y={96}/>
  </svg>;
}

/** Geist Medium from Google Fonts, subset to the card's text; the bundled Geist Regular is the fallback. */
async function geist(weight: number, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Geist:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const font = await fetch(url);
    return font.ok ? { name: 'Geist', data: await font.arrayBuffer(), weight: weight as 500, style: 'normal' as const } : null;
  } catch { return null; }
}

export async function GET() {
  const medium = await geist(500, [...headline, subtitle, 'hotbot', ...crew.map(bot => bot.name)].join(''));
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', background: '#0b0c10', color: '#f0eff4', fontFamily: 'Geist', fontWeight: 500 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1200, height: 630, display: 'flex', background: 'radial-gradient(ellipse 760px 380px at 50% 82%, rgba(57, 64, 86, .42), rgba(11, 12, 16, 0))' }}/>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1200, height: 630, display: 'flex', background: `radial-gradient(circle 270px at 50% 74%, ${ember}33, rgba(11, 12, 16, 0))` }}/>

      <div style={{ position: 'absolute', left: 56, top: 48, display: 'flex', alignItems: 'center', gap: 10 }}>
        {plain(<Flame/>)}
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: '-0.03em' }}>hotbot</div>
      </div>

      <div style={{ display: 'flex', marginTop: 108, fontSize: 84, lineHeight: 1.05, letterSpacing: '-0.052em' }}>
        <span>{headline[0]}</span><span style={{ color: ember, marginLeft: 10 }}>{headline[1]}</span>
      </div>
      <div style={{ display: 'flex', marginTop: 20, fontSize: 30, letterSpacing: '-0.015em', color: '#a3a3ad' }}>{subtitle}</div>

      <div style={{ position: 'absolute', left: 0, bottom: 34, width: 1200, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
        {crew.map(({ role, name }) => {
          const hotbot = role === 'hotbot';
          const side = hotbot ? 280 : 214;
          return <div key={role} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: hotbot ? 250 : 206 }}>
            {plain(<Portrait role={role} side={side}/>)}
            <div style={{ display: 'flex', marginTop: -16, fontSize: hotbot ? 19 : 20, letterSpacing: hotbot ? '0.08em' : '-0.01em', color: hotbot ? ember : '#c9c9d1' }}>{name}</div>
          </div>;
        })}
      </div>
    </div>,
    { ...size, fonts: medium ? [medium] : undefined },
  );
}
