/* Shared material language: rounded, softly lit objects in a neutral graphite world. */
window.CloudMaterials = (() => {
  const palette = {page:'#0b0c10',edge:'#898e9c',surface:'#2a2d36',shadow:'#14171e',ink:'#f0eff4',muted:'#a1a2ad',positive:'#8dbfa4',negative:'#dc8a85'};
  const url=(id,name)=>`url(#${id}-${name})`;
  function defs(id,p){const light=p.light||p.hi;return `<defs>
    <radialGradient id="${id}-glow"><stop stop-color="${p.accent}" stop-opacity=".2"/><stop offset=".5" stop-color="${p.accent}" stop-opacity=".07"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-fire"><stop stop-color="#ffd58a" stop-opacity=".85"/><stop offset=".35" stop-color="#f2994f" stop-opacity=".35"/><stop offset="1" stop-color="#f2994f" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.hi}" stop-opacity=".27"/><stop offset=".5" stop-color="${p.accent}" stop-opacity=".05"/><stop offset="1" stop-color="${p.accent}" stop-opacity=".2"/></linearGradient>
    <linearGradient id="${id}-cone" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${light}" stop-opacity=".13"/><stop offset=".6" stop-color="${light}" stop-opacity=".07"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></linearGradient>

    <radialGradient id="${id}-shadow"><stop stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-ceramic" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#474b56"/><stop offset=".38" stop-color="#303541"/><stop offset="1" stop-color="#191d27"/></linearGradient>
    <linearGradient id="${id}-shell" x1="0" y1="0" x2=".75" y2="1"><stop stop-color="#363c49"/><stop offset=".42" stop-color="#232935"/><stop offset="1" stop-color="#141822"/></linearGradient>
    <linearGradient id="${id}-ledge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3c414c"/><stop offset=".18" stop-color="#303641"/><stop offset="1" stop-color="#151923"/></linearGradient>
    <linearGradient id="${id}-paper" x1="0" y1="0" x2=".6" y2="1"><stop stop-color="#d4d0c5"/><stop offset="1" stop-color="#98999d"/></linearGradient>
    <linearGradient id="${id}-enamel" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="${p.hi}"/><stop offset=".45" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.low}"/></linearGradient>
    <radialGradient id="${id}-screen" cx="32%" cy="0%" r="110%"><stop stop-color="#202c3f"/><stop offset="1" stop-color="#101725"/></radialGradient>
    <linearGradient id="${id}-building" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#252d3d"/><stop offset="1" stop-color="#131b28"/></linearGradient>
    <radialGradient id="${id}-moon" cx="28%" cy="22%" r="90%"><stop stop-color="#e5e2d9"/><stop offset=".6" stop-color="#b7bac4"/><stop offset="1" stop-color="#65718a"/></radialGradient>
    <linearGradient id="${id}-rimlight" x1="0" x2="1"><stop stop-color="#c0c7db" stop-opacity=".02"/><stop offset=".35" stop-color="#c0c7db" stop-opacity=".3"/><stop offset="1" stop-color="#c0c7db" stop-opacity=".02"/></linearGradient>
  </defs>`}
  const box=(id,x,y,w,h,r=12,mat='shell')=>`<rect x="${x}" y="${y+3}" width="${w}" height="${h}" rx="${r}" fill="#080a10" opacity=".35"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${url(id,mat)}" stroke="#8d98ac" stroke-opacity=".2" stroke-width="1.2"/>`;
  const shadow=(id,x,y,rx,ry)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${url(id,'shadow')}"/>`;
  const ledge=(id,x,y,w)=>`<rect x="${x}" y="${y}" width="${w}" height="27" rx="10" fill="${url(id,'ledge')}"/><path d="M${x+12} ${y+1}H${x+w-12}" fill="none" stroke="${url(id,'rimlight')}" stroke-width="2"/>`;
  const glass=(id,x,y,w,h,r=8)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${url(id,'screen')}"/><path d="M${x+r} ${y+2}H${x+w-r}" stroke="#bbcade" stroke-opacity=".12" stroke-width="1.5"/>`;
  return {palette,defs,url,box,shadow,ledge,glass};
})();
