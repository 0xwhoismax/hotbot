import design from '../../../../public/hotbot/cloud-agents/character-design.json';

type Role = keyof typeof design.colors;

/** A single upper-left key, soft fill and low bounce light, authored entirely in SVG. */
export function CharacterDefs({ id, role }: { id: string; role: Role }) {
  const p = design.materials[role];
  return <defs>
    <radialGradient id={`${id}-body`} cx="38%" cy="32%" r="68%" fx="30%" fy="24%"><stop stopColor={p.highlight}/><stop offset=".24" stopColor={p.light}/><stop offset=".5" stopColor={p.base}/><stop offset=".77" stopColor={p.shade}/><stop offset=".94" stopColor={p.deep}/><stop offset="1" stopColor={p.shade}/></radialGradient>
    <radialGradient id={`${id}-softbox`}><stop stopColor={p.highlight} stopOpacity=".82"/><stop offset=".45" stopColor={p.highlight} stopOpacity=".4"/><stop offset="1" stopColor={p.highlight} stopOpacity="0"/></radialGradient>
    <linearGradient id={`${id}-edge`} x1=".12" y1="0" x2=".78" y2="1"><stop stopColor={p.highlight} stopOpacity=".85"/><stop offset=".36" stopColor={p.light} stopOpacity=".2"/><stop offset=".72" stopColor={p.deep} stopOpacity=".6"/><stop offset="1" stopColor={p.light} stopOpacity=".35"/></linearGradient>
    <radialGradient id={`${id}-graphite`} cx="32%" cy="18%" r="88%"><stop stopColor="#788898"/><stop offset=".3" stopColor="#465264"/><stop offset=".64" stopColor="#242c3b"/><stop offset=".88" stopColor="#101622"/><stop offset="1" stopColor="#354154"/></radialGradient>
    <linearGradient id={`${id}-metal`} x1="0" y1="0" x2=".3" y2="1"><stop stopColor="#8e9cab"/><stop offset=".22" stopColor="#56677a"/><stop offset=".5" stopColor="#283448"/><stop offset=".8" stopColor="#151c29"/><stop offset="1" stopColor="#57677b"/></linearGradient>
    <radialGradient id={`${id}-occlusion`}><stop stopColor="#090d18" stopOpacity=".65"/><stop offset=".5" stopColor="#090d18" stopOpacity=".28"/><stop offset="1" stopColor="#090d18" stopOpacity="0"/></radialGradient>
    <radialGradient id={`${id}-shadow`}><stop stopColor="#000" stopOpacity=".72"/><stop offset=".36" stopColor="#000" stopOpacity=".44"/><stop offset="1" stopColor="#000" stopOpacity="0"/></radialGradient>
    <filter id={`${id}-volume`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="rounded"/>
      <feOffset in="rounded" dx="-3" dy="-4" result="shadeOffset"/>
      <feComposite in="SourceAlpha" in2="shadeOffset" operator="out" result="shadeEdge"/>
      <feFlood floodColor={p.deep} floodOpacity=".58"/>
      <feComposite in2="shadeEdge" operator="in" result="contourShade"/>
      <feOffset in="rounded" dx="2" dy="3" result="lightOffset"/>
      <feComposite in="SourceAlpha" in2="lightOffset" operator="out" result="lightEdge"/>
      <feFlood floodColor={p.highlight} floodOpacity=".42"/>
      <feComposite in2="lightEdge" operator="in" result="contourLight"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="contourShade"/><feMergeNode in="contourLight"/></feMerge>
    </filter>
    <clipPath id={`${id}-cloud-clip`}><path d={design.cloud}/></clipPath>
    <clipPath id={`${id}-flame-clip`}><path d={design.flame}/></clipPath>
  </defs>;
}

export function CharacterSurface({ id, role }: { id: string; role: Role }) {
  if (role === 'hotbot') return <g transform="translate(-60 -88)">
    <path d={design.flame} fill={`url(#${id}-body)`} filter={`url(#${id}-volume)`}/>
    <g clipPath={`url(#${id}-flame-clip)`}>
      <ellipse cx="37" cy="65" rx="19" ry="36" transform="rotate(25 37 65)" fill={`url(#${id}-softbox)`} opacity=".55"/>
      <path d={design.flameEdge} fill="#fff1b0" opacity=".35"/>
    </g>
    <path d={design.flame} fill="none" stroke={`url(#${id}-edge)`} strokeWidth=".65"/>
  </g>;
  return <>
    <path d={design.cloud} fill={`url(#${id}-body)`} filter={`url(#${id}-volume)`}/>
    <g clipPath={`url(#${id}-cloud-clip)`}>
      <ellipse cx="-29" cy="-35" rx="36" ry="25" transform="rotate(-30 -29 -35)" fill={`url(#${id}-softbox)`} opacity=".5"/>
    </g>
    <path d={design.cloud} fill="none" stroke={`url(#${id}-edge)`} strokeWidth=".65"/>
  </>;
}

/** Solid eyes stay crisp; only the surrounding body and accessories receive lighting. */
export function CharacterEye({ x = 0, y = -2 }: { x?: number; y?: number }) {
  return <ellipse cx={x} cy={y} rx="6.5" ry="10.5" fill="#000"/>;
}

export function CharacterAccessories({ id, role }: { id: string; role: Role }) {
  if (role === 'research') return <>
    <g>
      <path d={design.foilHat} fill={`url(#${id}-metal)`} stroke="#abb8c8" strokeWidth=".8" strokeLinejoin="round"/>
      <path d={design.foilLight} fill="#edf4ff"/>
      <path d={design.foilShade} fill="#77889e"/>
      <path d={design.foilCreases} fill="none" stroke="#cad7e8" strokeWidth=".9" strokeLinejoin="round"/>
      <path d={design.foilRim} fill="#b4c2d4" stroke="#798aa0" strokeWidth=".8"/>
      <path d="M-44-51Q-4-43 39-53M-35-48L-31-44M-17-45L-12-41M8-45L13-43M27-48L31-46" fill="none" stroke="#edf4ff" strokeWidth="1.1" strokeLinecap="round"/>
    </g>
    <g transform={design.researchGlassesPose}>
    <path d={design.glasses} transform="translate(1 2.5)" fill="none" stroke="#192133" strokeOpacity=".24" strokeWidth="5" strokeLinecap="round"/>
    <path d={design.glasses} fill="none" stroke={`url(#${id}-graphite)`} strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M-31-12Q-31-17-25-17H-17M9-12Q9-17 15-17H23" fill="none" stroke="#dce8f7" strokeOpacity=".6" strokeWidth=".85" strokeLinecap="round"/>
    <path d="M-4-11L4-10 3-3-4-4Z" fill="#f1ae68"/>
    <path d="M-2-10L-3-4M1-10V-4" stroke="#ffdb9b" strokeWidth=".9"/>
    </g>
  </>;
  if (role === 'trader') return <g>
    <path d={design.headband} transform="translate(0 2)" fill="none" stroke="#101723" strokeWidth="13"/>
    <path d={design.headband} fill="none" stroke={`url(#${id}-metal)`} strokeWidth="9"/>
    <path d="M-59-26C-55-81 53-81 59-26" fill="none" stroke="#b9cce3" strokeOpacity=".55" strokeWidth="1.2"/>
    {[-1, 1].map(side => <g key={side} transform={`translate(${side * 60} 4)`}>
      <ellipse cx={-side * 5} cy="2" rx="13" ry="24" fill={`url(#${id}-occlusion)`}/>
      <rect x="-10" y="-20" width="20" height="40" rx="10" fill="#111925"/>
      <rect x="-9" y="-21" width="18" height="38" rx="9" fill={`url(#${id}-graphite)`}/>
      <rect x="-5.5" y="-15" width="11" height="27" rx="5.5" fill={`url(#${id}-metal)`}/>
      <path d="M-5-13V3" stroke="#a3bad6" strokeOpacity=".4" strokeWidth="1" strokeLinecap="round"/>
    </g>)}
  </g>;
  if (role === 'launch') return <>
    <g clipPath={`url(#${id}-cloud-clip)`}><ellipse cx="2" cy="-43" rx="57" ry="15" transform="rotate(8 0 -50)" fill={`url(#${id}-occlusion)`}/></g>
    <g transform="rotate(8 0 -50)">
      <path d={design.capCrown} fill={`url(#${id}-graphite)`}/>
      <path d="M-45-56C-41-73-26-83-7-83" fill="none" stroke="#a2b4cb" strokeOpacity=".42" strokeWidth="1.2"/>
      <path d="M-6-83Q13-72 15-50" fill="none" stroke="#0f1725" strokeOpacity=".5" strokeWidth="1"/>
      <path d={design.capBrim} transform="translate(0 2.5)" fill="#101622"/>
      <path d={design.capBrim} fill={`url(#${id}-metal)`}/>
      <path d="M-45-46H7L18-39H62" fill="none" stroke="#a0b3cc" strokeOpacity=".38" strokeWidth=".8"/>
      <rect x="-22" y="-55" width="27" height="8" rx="4" fill="#12151d"/>
      <path d="M-18-54H1" stroke="#697990" strokeOpacity=".5" strokeWidth=".7"/>
    </g>
  </>;
  return null;
}

/** Filled silhouettes prevent rounded global stroke caps from turning the filter into a capsule. */
export function CigaretteProp() {
  return <g>
    <path d="M0-1.5H19.5Q20.5-1.5 20.5 0Q20.5 1.5 19.5 1.5H0Z" fill="#ede9df"/>
    <path d="M0 .6H20V1.5H0Z" fill="#bdb9ae"/>
    <path d="M0-1.5H4.6V1.5H0Z" fill="#b48760"/>
    <path d="M0 .6H4.6V1.5H0Z" fill="#8b6248"/>
    <path d="M.5-1H19.3" fill="none" stroke="#fff8eb" strokeWidth=".55" strokeOpacity=".65"/>
    <path d="M19-1.5H20.4L21-.7 20.6.3 21 1.2 19 1.5Z" fill="#6e6863"/>
    <path d="M19-1.25L19.5-.6 19.2.1 19.7.8 19.3 1.35" fill="none" stroke="#e58b58" strokeWidth=".7"/>
    <path d="M20-.8L20.5-.3M20 .4L20.4.8" stroke="#bfb9af" strokeWidth=".6" strokeLinecap="round"/>
  </g>;
}

export function Cigarette() {
  return <g transform="translate(18 17) rotate(12)">
    <CigaretteProp/>
    <path d="M20-3C16-10 25-14 21-22" fill="none" stroke="#d5d4d8" strokeWidth=".9" strokeOpacity=".24" strokeLinecap="round"/>
  </g>;
}
