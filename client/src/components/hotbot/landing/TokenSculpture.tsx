import { useId } from 'react';
import { CharacterDefs, CharacterEye, CharacterSurface } from './CharacterArt';
import s from './hotbot.module.css';

/** A warm minted token, with the same flame and lighting as the character family. */
export function TokenSculpture() {
  const id = `hot-token-${useId().replace(/:/g, '')}`;
  return <div className={s.tokenSculpture} data-ambient-motion aria-hidden="true">
    <div className={s.tokenAura}/>
    <svg className={s.tokenSparks} viewBox="0 0 540 460" fill="none">
      <g stroke="#ff9e46" strokeLinecap="round">
        <path d="M94 113l3-7M431 81l2-5M458 286l4-8M74 311l2-4" strokeWidth="2" opacity=".65"/>
        <path d="M139 58l1-3M464 181l2-5M381 375l2-4M123 379l1-3" opacity=".35"/>
      </g>
      <g fill="#ffd18a"><circle cx="404" cy="121" r="1.5"/><circle cx="98" cy="245" r="1.2"/><circle cx="445" cy="338" r="1"/></g>
    </svg>
    <div className={s.coinShadow}/>
    <svg className={s.coin} viewBox="0 0 460 460" fill="none">
      <CharacterDefs id={id} role="hotbot"/>
      <defs>
        <linearGradient id={`${id}-rim`} x1="80" y1="52" x2="335" y2="365" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff1b8"/><stop offset=".18" stopColor="#ffc56a"/><stop offset=".39" stopColor="#e88827"/><stop offset=".57" stopColor="#8d360c"/><stop offset=".77" stopColor="#ef8b2d"/><stop offset="1" stopColor="#ffcf77"/>
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="71" y1="155" x2="354" y2="387" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c280c"/><stop offset=".36" stopColor="#da6419"/><stop offset=".6" stopColor="#59200b"/><stop offset=".83" stopColor="#9f430f"/><stop offset="1" stopColor="#f59e36"/>
        </linearGradient>
        <radialGradient id={`${id}-face`} cx=".33" cy=".22" r=".88">
          <stop stopColor="#a7471c"/><stop offset=".43" stopColor="#57200e"/><stop offset=".76" stopColor="#2a110c"/><stop offset="1" stopColor="#7d2f13"/>
        </radialGradient>
        <linearGradient id={`${id}-bevel`} x1="106" y1="75" x2="295" y2="355" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4d1d0d"/><stop offset=".5" stopColor="#b55118"/><stop offset="1" stopColor="#ffcf79"/>
        </linearGradient>
        <linearGradient id={`${id}-stamp`} x1="185" y1="309" x2="238" y2="335" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffe1a3"/><stop offset="1" stopColor="#ed973d"/>
        </linearGradient>
      </defs>
      {/* Offset discs form a solid edge; the face covers their upper-left seams. */}
      <circle cx="235" cy="233" r="173" fill={`url(#${id}-side)`} stroke="#b65a1b"/>
      <circle cx="230" cy="229" r="173" stroke="#ffb34b" strokeOpacity=".24"/>
      <circle cx="223" cy="223" r="173" stroke="#321207" strokeOpacity=".55" strokeWidth="2"/>
      <circle cx="215" cy="215" r="173" fill={`url(#${id}-rim)`} stroke="#ffd895" strokeWidth="1.5"/>
      <circle cx="215" cy="215" r="165" stroke="#63260d" strokeWidth="7" strokeDasharray="1.5 7" opacity=".55"/>
      <circle cx="215" cy="215" r="157" fill={`url(#${id}-bevel)`} stroke="#ffcc78" strokeOpacity=".65"/>
      <circle cx="215" cy="215" r="149" fill={`url(#${id}-face)`} stroke="#371507" strokeWidth="2"/>
      <circle cx="215" cy="215" r="143" stroke="#fbb25c" strokeOpacity=".19"/>
      <path d="M50 207A165 165 0 0 1 280 63" stroke="#fff4cf" strokeWidth="2.5" strokeLinecap="round" opacity=".8"/>
      <path d="M321 342A165 165 0 0 1 186 377" stroke="#ffe0a2" strokeWidth="1.5" strokeLinecap="round" opacity=".65"/>
      <ellipse cx="219" cy="285" rx="83" ry="19" fill={`url(#${id}-shadow)`}/>
      <g transform="translate(215 207) scale(1.45)">
        <CharacterSurface id={id} role="hotbot"/>
        <CharacterEye x={-17} y={8}/><CharacterEye x={17} y={8}/>
      </g>
      <text x="219" y="329" fill={`url(#${id}-stamp)`} textAnchor="middle" fontSize="26" fontWeight="750" letterSpacing="4">$HOTBOT</text>
    </svg>
  </div>;
}
