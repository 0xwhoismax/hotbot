/* HOTBOT — sculpted vector characters in panoramic worlds, dependency-free SVG + one shared animation clock.
   Integration: CloudAgents.mount(element, "research" | "sniper" | "trader" | "launch").
   The returned controller exposes play(), destroy(). IDs are unique per instance.
   Scenes have no backdrop rectangle: every layer is composed directly on the page colour (#0b0c10),
   so the art sits in the page instead of being faded into it. */
(() => {
  'use strict';
  const Material=window.CloudMaterials, Assets=window.CloudSceneAssets, Characters=window.CloudCharacterDesign;
  const version=new URL(document.currentScript.src).searchParams.get('v');
  const PAGE=Material.palette.page, X0=-1500, X1=3100, VH=490, MONO='ui-monospace,SFMono-Regular,Menlo,monospace';
  const roles = {
    research: {name:'ResearchBot', world:'The Archive', accent:'#d7bf81', rim:'#e6dcac50', panel:'#292923', hi:'#e3e2cb', mid:'#bcbfb2', low:'#626871', flat:'#20272a', ground:'#191a20', light:'#f3dca0', period:9.7, offset:.8,
      desc:'An ivory cloud in a crumpled foil hat and crooked, taped glasses hunts alpha at a lamp-lit desk. Profile photos of rasmr and Frank DeGods are pinned among notes and red string on the archive board.'},
    sniper: {name:'SniperBot', world:'The Rooftop', accent:'#ec746c', rim:'#fa8e7355', panel:'#302126', hi:'#f6a380', mid:'#cf5360', low:'#641f3d', flat:'#302128', ground:'#15161a', light:'#cbd3ea', period:11.2, offset:2.3,
      desc:'A coral cloud crouches on a city rooftop at night behind a laptop and a tripod scope. A reticle sweeps the skyline, locks onto a token billboard, and fires.'},
    trader: {name:'TraderBot', world:'The Battlestation', accent:'#79a9dc', rim:'#99c1ed50', panel:'#1d283d', hi:'#9fcce8', mid:'#5685c7', low:'#263b75', flat:'#1d2742', ground:'#0e1420', light:'#9fc6f0', period:10.4, offset:1.2,
      desc:'Seen from behind, a blue cloud in headphones sits in a gaming chair facing a curved wall of monitors. The room flashes red on a dump and green on the pump, and its arms go up.'},
    launch: {name:'LaunchBot', world:'The Pad', accent:'#8db791', rim:'#b5d7a850', panel:'#1c3028', hi:'#b5dca0', mid:'#62a787', low:'#23524a', flat:'#1b302a', ground:'#151920', light:'#e6e7ee', period:12.6, offset:3.2,
      desc:'A mint cloud in a backwards cap counts down at a folding-table console in the desert, hits the red button, and sends a battered rocket to the moon in a wall of smoke.'}
  };
  let serial=0, disposed=false, raf=0, last=0, runningTime=0;
  const instances=new Set();
  const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
  const smooth=(a,b,v)=>{const k=clamp((v-a)/(b-a));return k*k*(3-2*k)};
  const bell=(v,a,b,c)=>smooth(a,b,v)*(1-smooth(b,c,v));
  const rnd=i=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v)};
  const f1=v=>v.toFixed(1);


  /* ---------- shared pieces ---------- */
  // Keep source artwork vector; prepare a display-sized texture once per viewport.
  // Motion then reuses the texture instead of running fixed SVG filters per frame.
  function vectorSource(art,definitions,box){
    return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+box[2]+'" height="'+box[3]+'" viewBox="'+box.join(' ')+'" stroke-linejoin="round" stroke-linecap="round">'+definitions+art+'</svg>');
  }
  function vectorImage(source,box,scale=1,extra=''){
    return '<image x="'+box[0]+'" y="'+box[1]+'" width="'+box[2]+'" height="'+box[3]+'" href="'+source+'" data-vector-scale="'+scale+'" '+extra+'/>';
  }
  function defs(id,p){
    return '<defs>'+
      '<radialGradient id="'+id+'-puff"><stop stop-color="#dfe5d6" stop-opacity=".95"/><stop offset=".55" stop-color="#b3bdae" stop-opacity=".55"/><stop offset="1" stop-color="#9aa597" stop-opacity="0"/></radialGradient>'+
      // Ground planes end in the exact page colour, so the scene settles into the page without a mask.
      '<linearGradient id="'+id+'-ground" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+p.ground+'"/><stop offset=".42" stop-color="'+PAGE+'"/></linearGradient>'+
      '<linearGradient id="'+id+'-fog" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+PAGE+'"/><stop offset="1" stop-color="'+PAGE+'" stop-opacity="0"/></linearGradient>'+
      '<linearGradient id="'+id+'-mist" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+PAGE+'" stop-opacity="0"/><stop offset=".75" stop-color="'+PAGE+'"/></linearGradient>'+
      '<linearGradient id="'+id+'-beam" x1="0" y1="1" x2="0" y2="0"><stop stop-color="'+p.light+'" stop-opacity=".11"/><stop offset=".55" stop-color="'+p.light+'" stop-opacity=".03"/><stop offset="1" stop-color="'+p.light+'" stop-opacity="0"/></linearGradient>'+
    '</defs>';
  }
  // Continuous silhouette shading; kept aligned with React CharacterArt.tsx.
  function characterDefs(id,role){
    const p=Characters.materials[role];
    return `<defs>
      <radialGradient id="${id}-character-body" cx="38%" cy="32%" r="68%" fx="30%" fy="24%">
      <stop stop-color="${p.highlight}"/>
      <stop offset=".24" stop-color="${p.light}"/>
      <stop offset=".5" stop-color="${p.base}"/>
      <stop offset=".77" stop-color="${p.shade}"/>
      <stop offset=".94" stop-color="${p.deep}"/>
      <stop offset="1" stop-color="${p.shade}"/>
      </radialGradient>
      <radialGradient id="${id}-character-softbox">
      <stop stop-color="${p.highlight}" stop-opacity=".82"/>
      <stop offset=".45" stop-color="${p.highlight}" stop-opacity=".4"/>
      <stop offset="1" stop-color="${p.highlight}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${id}-character-edge" x1=".12" y1="0" x2=".78" y2="1">
      <stop stop-color="${p.highlight}" stop-opacity=".85"/>
      <stop offset=".36" stop-color="${p.light}" stop-opacity=".2"/>
      <stop offset=".72" stop-color="${p.deep}" stop-opacity=".6"/>
      <stop offset="1" stop-color="${p.light}" stop-opacity=".35"/>
      </linearGradient>
      <radialGradient id="${id}-character-graphite" cx="32%" cy="18%" r="88%">
      <stop stop-color="#788898"/>
      <stop offset=".3" stop-color="#465264"/>
      <stop offset=".64" stop-color="#242c3b"/>
      <stop offset=".88" stop-color="#101622"/>
      <stop offset="1" stop-color="#354154"/>
      </radialGradient>
      <linearGradient id="${id}-character-metal" x1="0" y1="0" x2=".3" y2="1">
      <stop stop-color="#8e9cab"/>
      <stop offset=".22" stop-color="#56677a"/>
      <stop offset=".5" stop-color="#283448"/>
      <stop offset=".8" stop-color="#151c29"/>
      <stop offset="1" stop-color="#57677b"/>
      </linearGradient>
      <radialGradient id="${id}-character-occlusion">
      <stop stop-color="#090d18" stop-opacity=".65"/>
      <stop offset=".5" stop-color="#090d18" stop-opacity=".28"/>
      <stop offset="1" stop-color="#090d18" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${id}-character-shadow">
      <stop stop-color="#000" stop-opacity=".72"/>
      <stop offset=".36" stop-color="#000" stop-opacity=".44"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <filter id="${id}-character-volume" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="rounded"/>
      <feOffset in="rounded" dx="-3" dy="-4" result="shadeOffset"/>
      <feComposite in="SourceAlpha" in2="shadeOffset" operator="out" result="shadeEdge"/>
      <feFlood flood-color="${p.deep}" flood-opacity=".58"/>
      <feComposite in2="shadeEdge" operator="in" result="contourShade"/>
      <feOffset in="rounded" dx="2" dy="3" result="lightOffset"/>
      <feComposite in="SourceAlpha" in2="lightOffset" operator="out" result="lightEdge"/>
      <feFlood flood-color="${p.highlight}" flood-opacity=".42"/>
      <feComposite in2="lightEdge" operator="in" result="contourLight"/>
      <feMerge>
      <feMergeNode in="SourceGraphic"/>
      <feMergeNode in="contourShade"/>
      <feMergeNode in="contourLight"/>
      </feMerge>
      </filter>
      <clipPath id="${id}-character-cloud-clip">
      <path d="${Characters.cloud}"/>
      </clipPath>
      <clipPath id="${id}-character-flame-clip">
      <path d="${Characters.flame}"/>
      </clipPath>
      </defs>`;
  }
  function cloudSurface(id,role){
    const surface=`<path d="${Characters.cloud}" fill="url(#${id}-character-body)" filter="url(#${id}-character-volume)"/>
      <g clip-path="url(#${id}-character-cloud-clip)">
      <ellipse cx="-29" cy="-35" rx="36" ry="25" transform="rotate(-30 -29 -35)" fill="url(#${id}-character-softbox)" opacity=".5"/>
      </g>
      <path d="${Characters.cloud}" fill="none" stroke="url(#${id}-character-edge)" stroke-width=".65"/>`;
    if(role!=='launch'&&role!=='sniper')return surface;
    const box=[-100,-90,200,160];
    return vectorImage(vectorSource(surface,characterDefs(id,role),box),box,2.1);
  }
  // Eye shading stays entirely outside the eyes: open eyes and drawn lids are solid black.
  function eye(x,y=-2){return '<g transform="translate('+x+' '+y+')"><g data-eye><ellipse class="eye" rx="6.5" ry="10.5" fill="#000"/></g>'+
    '<path data-shut d="M-6 0Q0 4 6 0" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round" opacity="0"/>'+
    '<path data-squint d="M-6 0Q0-4 6 0" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round" opacity="0"/></g>'}
  function characterAccessories(id,role){
    if(role==='research')return `<g>
      <path d="${Characters.foilHat}" fill="url(#${id}-character-metal)" stroke="#abb8c8" stroke-width=".8" stroke-linejoin="round"/>
      <path d="${Characters.foilLight}" fill="#edf4ff"/>
      <path d="${Characters.foilShade}" fill="#77889e"/>
      <path d="${Characters.foilCreases}" fill="none" stroke="#cad7e8" stroke-width=".9" stroke-linejoin="round"/>
      <path d="${Characters.foilRim}" fill="#b4c2d4" stroke="#798aa0" stroke-width=".8"/>
      <path d="M-44-51Q-4-43 39-53M-35-48L-31-44M-17-45L-12-41M8-45L13-43M27-48L31-46" fill="none" stroke="#edf4ff" stroke-width="1.1" stroke-linecap="round"/>
      </g><g transform="${Characters.researchGlassesPose}">
      <path d="${Characters.glasses}" transform="translate(1 2.5)" fill="none" stroke="#192133" stroke-opacity=".24" stroke-width="5" stroke-linecap="round"/>
      <path d="${Characters.glasses}" fill="none" stroke="url(#${id}-character-graphite)" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M-31-12Q-31-17-25-17H-17M9-12Q9-17 15-17H23" fill="none" stroke="#dce8f7" stroke-opacity=".6" stroke-width=".85" stroke-linecap="round"/>
      <path d="M-4-11L4-10 3-3-4-4Z" fill="#f1ae68"/>
      <path d="M-2-10L-3-4M1-10V-4" stroke="#ffdb9b" stroke-width=".9"/>
      </g>`;
    if(role==='trader')return `<g>
      <path d="${Characters.headband}" transform="translate(0 2)" fill="none" stroke="#101723" stroke-width="13"/>
      <path d="${Characters.headband}" fill="none" stroke="url(#${id}-character-metal)" stroke-width="9"/>
      <path d="M-59-26C-55-81 53-81 59-26" fill="none" stroke="#b9cce3" stroke-opacity=".55" stroke-width="1.2"/>
      <g transform="translate(-60 4)">
      <ellipse cx="5" cy="2" rx="13" ry="24" fill="url(#${id}-character-occlusion)"/>
      <rect x="-10" y="-20" width="20" height="40" rx="10" fill="#111925"/>
      <rect x="-9" y="-21" width="18" height="38" rx="9" fill="url(#${id}-character-graphite)"/>
      <rect x="-5.5" y="-15" width="11" height="27" rx="5.5" fill="url(#${id}-character-metal)"/>
      <path d="M-5-13V3" stroke="#a3bad6" stroke-opacity=".4" stroke-width="1" stroke-linecap="round"/>
      </g>
      <g transform="translate(60 4)">
      <ellipse cx="-5" cy="2" rx="13" ry="24" fill="url(#${id}-character-occlusion)"/>
      <rect x="-10" y="-20" width="20" height="40" rx="10" fill="#111925"/>
      <rect x="-9" y="-21" width="18" height="38" rx="9" fill="url(#${id}-character-graphite)"/>
      <rect x="-5.5" y="-15" width="11" height="27" rx="5.5" fill="url(#${id}-character-metal)"/>
      <path d="M-5-13V3" stroke="#a3bad6" stroke-opacity=".4" stroke-width="1" stroke-linecap="round"/>
      </g>
      </g>`;
    if(role==='launch')return `<g clip-path="url(#${id}-character-cloud-clip)">
      <ellipse cx="2" cy="-43" rx="57" ry="15" transform="rotate(8 0 -50)" fill="url(#${id}-character-occlusion)"/>
      </g>
      <g transform="rotate(8 0 -50)">
      <path d="${Characters.capCrown}" fill="url(#${id}-character-graphite)"/>
      <path d="M-45-56C-41-73-26-83-7-83" fill="none" stroke="#a2b4cb" stroke-opacity=".42" stroke-width="1.2"/>
      <path d="M-6-83Q13-72 15-50" fill="none" stroke="#0f1725" stroke-opacity=".5" stroke-width="1"/>
      <path d="${Characters.capBrim}" transform="translate(0 2.5)" fill="#101622"/>
      <path d="${Characters.capBrim}" fill="url(#${id}-character-metal)"/>
      <path d="M-45-46H7L18-39H62" fill="none" stroke="#a0b3cc" stroke-opacity=".38" stroke-width=".8"/>
      <rect x="-22" y="-55" width="27" height="8" rx="4" fill="#12151d"/>
      <path d="M-18-54H1" stroke="#697990" stroke-opacity=".5" stroke-width=".7"/>
      </g>`;
    return '';
  }
  function headphones(id){return characterAccessories(id,'trader')}
  function body(id,role){
    return `<g data-move="cloud">${cloudSurface(id,role)}
      <g data-move="gaze"><g${role==='research'?` transform="${Characters.researchGlassesPose}"`:''}>${eye(-20)}${eye(20)}</g>
        ${role==='sniper'?`<path d="M-34-23L-10-16M10-16L34-25" fill="none" stroke="${Characters.ink}" stroke-width="4" stroke-linecap="round"/>`:''}
        ${role==='research'?`<path d="${Characters.researchBrows}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>`:''}
      </g>${characterAccessories(id,role)}
      ${role==='sniper'?cigarette(18,17,12,1):role==='launch'?cigarette(20,17,18,.62):''}
    </g>`;
  }
  const hand=(id,name,x,y,s=1,rx=18,ry=12)=>'<g transform="translate('+x+' '+y+') scale('+s+')"><g data-move="'+name+'"><ellipse rx="'+rx+'" ry="'+ry+'" fill="url(#'+id+'-character-body)" class="cloud-solid"/></g></g>';
  function cigarette(x,y,angle=0,s=1){
    return '<g transform="translate('+x+' '+y+') rotate('+angle+') scale('+s+')"><g><path d="M0-1.5H19.5Q20.5-1.5 20.5 0Q20.5 1.5 19.5 1.5H0Z" fill="#ede9df"></path><path d="M0 .6H20V1.5H0Z" fill="#bdb9ae"></path><path d="M0-1.5H4.6V1.5H0Z" fill="#b48760"></path><path d="M0 .6H4.6V1.5H0Z" fill="#8b6248"></path><path d="M.5-1H19.3" fill="none" stroke="#fff8eb" stroke-width=".55" stroke-opacity=".65"></path><path d="M19-1.5H20.4L21-.7 20.6.3 21 1.2 19 1.5Z" fill="#6e6863"></path><path d="M19-1.25L19.5-.6 19.2.1 19.7.8 19.3 1.35" fill="none" stroke="#e58b58" stroke-width=".7"></path><path d="M20-.8L20.5-.3M20 .4L20.4.8" stroke="#bfb9af" stroke-width=".6" stroke-linecap="round"></path></g><g data-move="smoke-cig"><path d="M20-3C14-12 29-17 21-28S25-41 20-49" fill="none" stroke="#d5d4d8" stroke-opacity=".24" stroke-width=".9"/><path d="M21-10C27-18 17-26 23-36" fill="none" stroke="#d5d4d8" stroke-opacity=".09" stroke-width="2"/></g></g>';
  }
  function coin(x,y,s,index){
    return '<g transform="translate('+x+' '+y+') scale('+s+')"><g data-move="coin'+index+'"><ellipse cx="2" rx="10" ry="13" fill="#364253"/><ellipse rx="10" ry="13" fill="#89b0c5" stroke="#d2e2e1" stroke-width=".8"/><ellipse rx="7" ry="9" fill="none" stroke="#304756" stroke-width=".8"/><path d="M-2-6L3-2-1 2 3 5" fill="none" stroke="#263c4d" stroke-width="1.8"/></g></g>';
  }
  const at=(x,y,s,inner,rot=0)=>'<g transform="translate('+x+' '+y+') rotate('+rot+') scale('+s+')">'+inner+'</g>';
  // ResearchBot's vice: an open tin of "HEAT" nicotine pouches.
  // Everything that lies on the desk is drawn in the desk plane, then foreshortened (scale y by K),
  // so pouches, lid and label all share one consistent perspective.
  const pouchTin=(id,x,y,s=1)=>{
    const K=.33,R=20,H=6.5,g=id+'-tin';
    const flat=(inner,tx=0,ty=0)=>'<g transform="translate('+tx+' '+ty+') scale(1 '+K+')">'+inner+'</g>';
    const pouch=(u,v,r,w=6,l=9)=>'<g transform="translate('+u+' '+v+') rotate('+r+')"><rect x="'+(-w/2)+'" y="'+(-l/2)+'" width="'+w+'" height="'+l+'" rx="1.8" fill="#efeadf" stroke="#cbc2ad" stroke-width=".5"/><rect x="'+(-w/2+1.1)+'" y="'+(-l/2+1.1)+'" width="'+(w-2.2)+'" height="'+(l-2.2)+'" rx="1.2" fill="#f8f5ee"/></g>';
    // A fresh can: pouches fanned in a ring, overlapping like petals, a few in the middle.
    let ring='';const n=9,pts=[];
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pts.push([Math.cos(a)*11.5,Math.sin(a)*11.5,a*57.3+90])}
    pts.sort((p,q)=>p[1]-q[1]).forEach(([u,v,r])=>ring+=pouch(u.toFixed(2),v.toFixed(2),r.toFixed(1)));
    ring+=pouch(-2.5,-1,20,6,8.5)+pouch(3,1.5,-35,6,8.5);
    let loose='';for(const [u,v,r] of [[-26,26,-50],[31,20,15]])loose+=flat('<rect x="-3" y="-4.5" width="6" height="9" rx="1.8" fill="#000" opacity=".25" transform="translate('+(u+.8)+' '+(v+2.5)+') rotate('+r+')"/>'+pouch(u,v,r));
    const label='<path id="'+g+'-arc" d="M-15.5 2.2A'+R+' '+(R*K)+' 0 0 0 15.5 2.2" fill="none"/><text font-family="Helvetica Neue,Arial,sans-serif" font-size="4.6" font-weight="800" letter-spacing="1.1" fill="#fff4ec"><textPath href="#'+g+'-arc" startOffset="50%" text-anchor="middle">HEAT</textPath></text>';
    return '<defs>'+
        '<linearGradient id="'+g+'-side" x1="0" x2="1"><stop stop-color="#4a1712"/><stop offset=".3" stop-color="#b8412e"/><stop offset=".45" stop-color="#d9644a"/><stop offset=".75" stop-color="#8f2c20"/><stop offset="1" stop-color="#3c120e"/></linearGradient>'+
        '<radialGradient id="'+g+'-lid" cx="40%" cy="35%" r="75%"><stop stop-color="#e2735a"/><stop offset=".6" stop-color="#b4402d"/><stop offset="1" stop-color="#7e271c"/></radialGradient>'+
        '<linearGradient id="'+g+'-well" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1a0806"/><stop offset="1" stop-color="#3a1510"/></linearGradient>'+
        '<clipPath id="'+g+'-clip"><ellipse cy="'+(-H)+'" rx="'+(R-2.2)+'" ry="'+((R-2.2)*K)+'"/></clipPath>'+
      '</defs>'+at(x,y,s,
      loose+
      '<ellipse cy="1.2" rx="'+(R+3)+'" ry="'+((R+3)*K)+'" fill="#000" opacity=".4"/>'+
      // Body: a low glossy cylinder.
      '<path d="M'+(-R)+' '+(-H)+'V0A'+R+' '+(R*K)+' 0 0 0 '+R+' 0V'+(-H)+'Z" fill="url(#'+g+'-side)"/>'+
      '<path d="M'+(-R)+' 0A'+R+' '+(R*K)+' 0 0 0 '+R+' 0" fill="none" stroke="#2a0c09" stroke-width=".6"/>'+label+
      // Rim, then the well with its back wall in shadow and the pouches below the lip.
      '<ellipse cy="'+(-H)+'" rx="'+R+'" ry="'+(R*K)+'" fill="#c65540"/>'+
      '<ellipse cy="'+(-H)+'" rx="'+(R-2.2)+'" ry="'+((R-2.2)*K)+'" fill="url(#'+g+'-well)"/>'+
      '<g clip-path="url(#'+g+'-clip)">'+flat(ring,0,-H+1.6)+'<path d="M'+(-R)+' '+(-H)+'A'+(R-2.2)+' '+((R-2.2)*K)+' 0 0 1 '+R+' '+(-H)+'V'+(-H-8)+'H'+(-R)+'Z" fill="#000" opacity=".28"/></g>'+
      (()=>{const pt=d=>[(R*Math.cos(d/57.3)).toFixed(2),(-H+R*K*Math.sin(d/57.3)).toFixed(2)],[x1,y1]=pt(195),[x2,y2]=pt(250);return '<path d="M'+x1+' '+y1+'A'+R+' '+(R*K)+' 0 0 1 '+x2+' '+y2+'" fill="none" stroke="#ffd2c2" stroke-opacity=".6" stroke-width=".7" stroke-linecap="round"/>'})()+
      // Lid lying flat beside the tin, brand in the desk plane.
      '<g transform="translate(-40 6)"><ellipse cy="1.6" rx="'+(R-.5)+'" ry="'+((R-.5)*K)+'" fill="#000" opacity=".35"/><path d="M'+(-R+.5)+' -1.8V0A'+(R-.5)+' '+((R-.5)*K)+' 0 0 0 '+(R-.5)+' 0V-1.8Z" fill="url(#'+g+'-side)"/>'+
        '<ellipse cy="-1.8" rx="'+(R-.5)+'" ry="'+((R-.5)*K)+'" fill="url(#'+g+'-lid)"/><ellipse cy="-1.8" rx="'+(R-3)+'" ry="'+((R-3)*K)+'" fill="none" stroke="#ffb49f" stroke-opacity=".45" stroke-width=".5"/>'+
        flat('<text y="1.5" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" font-weight="900" letter-spacing="1.2" fill="#fff4ec">HEAT</text><text y="7" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="2.4" font-weight="700" letter-spacing=".4" fill="#ffd9cc" opacity=".8">POUCHES · 11MG</text>',0,-1.8)+
      '</g>');
  };
  const groundPlane=(id,y)=>'<rect x="'+X0+'" y="'+y+'" width="'+(X1-X0)+'" height="'+(600-y)+'" fill="url(#'+id+'-ground)"/>';
  const label=(x,y,text,size,fill,extra='')=>'<text x="'+x+'" y="'+y+'" font-family="'+MONO+'" font-size="'+size+'" fill="'+fill+'" '+extra+'>'+text+'</text>';

  /* ---------- ResearchBot: The Archive ---------- */
  function research(id,p){
    const shelves=Assets.shelves(id);
    const photo=(x,y,r,profile)=>Assets.photo(id,x,y,r,profile);
    const note=(x,y,r,text)=>Assets.note(id,x,y,r,text);
    const pin=([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="5" fill="#d6564a"/><circle cx="'+(x-1.5)+'" cy="'+(y-1.5)+'" r="1.6" fill="#fff" opacity=".6"/>';
    const N={A:[560,96],B:[650,228],C:[800,74],D:[990,98],E:[1050,216],F:[300,200],G:[1390,150],H:[-700,236],I:[2300,140],J:[-1300,120],K:[2920,250]};
    const sag=(a,b)=>{const [x1,y1]=N[a],[x2,y2]=N[b];return 'M'+x1+' '+y1+'Q'+((x1+x2)/2)+' '+((y1+y2)/2+14+Math.abs(x2-x1)*.04)+' '+x2+' '+y2};
    const strings=[['F','A'],['A','C'],['C','D'],['D','G'],['A','B'],['C','E'],['F','H'],['H','J'],['G','I'],['I','K'],['B','F']].map(([a,b])=>sag(a,b)).join('');
    const trace=['J','H','F','A','C','E'].reduce((d,n,i,arr)=>i?d+sag(arr[i-1],n).replace(/^M[^Q]+/,''):'M'+N[n].join(' '),'');
    const farNotes=note(300,232,-4,'CEX IN','#c2ab62')+note(1390,182,5,'BUNDLED?')+note(-700,268,3,'0x4c…9e','#bfa95e')+note(2300,172,-6,'SNIPER #2')+note(-1300,152,6,'FRESH')+note(2920,282,-3,'RUG CHK','#c2ab62');
    let papers='';for(let i=0;i<4;i++)papers+='<g data-move="paper'+i+'"><path d="M-12-15H10L12 15H-10Z" fill="#c9c0a0" opacity=".55"/><path d="M-7-8H6M-7-2H4M-6 4H5" stroke="#5a5540" stroke-width="1.4"/></g>';
    let motes='';for(let i=0;i<16;i++)motes+='<circle data-move="mote'+i+'" r="'+(1+rnd(i*9)*1.2).toFixed(1)+'" fill="#f3e2b0"/>';
    return '<g data-move="far">'+shelves+papers+
        '<rect x="'+X0+'" y="-20" width="'+(X1-X0)+'" height="170" fill="url(#'+id+'-fog)"/>'+
      '</g>'+
      '<g data-move="mid">'+
        '<rect x="458" y="55" width="684" height="312" rx="9" fill="url(#'+id+'-warm-wood)" stroke="#81818c" stroke-opacity=".25"/><rect x="468" y="65" width="664" height="292" rx="3" fill="url(#'+id+'-cork)"/><path d="M473 66H1127" stroke="#a6a0a0" stroke-opacity=".18"/>'+
        photo(560,130,-6,{src:'/hotbot/cloud-agents/profiles/rasmr-eth.jpg',handle:'@rasmr_eth'})+note(650,252,4,'SAME WALLET?')+photo(800,108,3)+note(990,122,-5,"DEV'S ALT?")+photo(1050,250,7,{src:'/hotbot/cloud-agents/profiles/frankdegods.jpg',handle:'@frankdegods'})+
        '<g opacity=".25">'+farNotes+'</g>'+
        '<path d="'+strings+'" fill="none" stroke="#b14a3e" stroke-width="1.6" stroke-opacity=".85"/>'+
        '<path data-move="trace" d="'+trace+'" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" fill="none" stroke="#f0c46a" stroke-width="3" stroke-linecap="round"/>'+
        Object.values(N).map(pin).join('')+
        '<g data-move="found"><circle cx="1050" cy="216" r="22" fill="none" stroke="#f0c46a" stroke-width="2"/><circle cx="1050" cy="216" r="40" fill="url(#'+id+'-glow)"/><g transform="translate(1050 262) rotate(-12)"><rect x="-44" y="-15" width="88" height="30" rx="3" fill="none" stroke="#d6564a" stroke-width="3"/>'+label(0,7,'MATCH',19,'#d6564a','text-anchor="middle" font-weight="800" letter-spacing="2"')+'</g></g>'+
        Assets.lamp(id)+
        motes+
        '<ellipse data-move="shadow" cx="800" cy="440" rx="260" ry="26" fill="url(#'+id+'-shadow)"/>'+
        '<g transform="translate(800 322) scale(2.1)">'+body(id,'research',p)+'</g>'+
      '</g>'+
      '<g data-move="near">'+groundPlane(id,428)+
        '<path d="M430 420H1170L1212 452H388Z" fill="url(#'+id+'-warm-wood)" stroke="'+p.accent+'" stroke-opacity=".35"/><path d="M388 452H1212V468H388Z" fill="#151209"/><path d="M430 420H1170" stroke="#f3dca0" stroke-opacity=".35" stroke-width="2"/>'+
        '<path d="M838 428L962 424 972 448 846 452Z" fill="#cfc6a6"/><path d="M856 433L930 431M858 440L946 437M860 446L912 445" stroke="#645c44" stroke-width="2"/>'+
        '<g transform="translate(1010 424)"><path d="M-40 0L-36-8H34L40 0Z" fill="#cfc6a6"/><path d="M-36-8L-30-15H32L34-8Z" fill="#bfb594"/><path d="M-30-15L-26-21H30L32-15Z" fill="#d8cfb0"/></g>'+
        Assets.mug(id,1105,428,1.15)+
        Assets.yarn(id,492,428,1.35)+pouchTin(id,615,432,1.35)+Assets.books(id,1180,430,1.4)+
        hand(id,'hand2',700,426,1.9)+
        Assets.magnifier(id)+
      '</g>';
  }

  /* ---------- SniperBot: The Rooftop ---------- */
  // Three snipes per loop: a fresh token pings in a window, the scope hunts, locks, fires, and moves on.
  const snipes=[{x:1128,y:300,a:.04,f:.27,gain:'+38%'},{x:1428,y:232,a:.27,f:.47,gain:'+117%'},{x:1251,y:126,a:.47,f:.69,gain:'+420%'}];
  const SCOPE=[905,352];
  function sniper(id,p){
    const skyline=(seed,minH,maxH,minW,maxW,windows,left=X0,right=X1)=>{
      let d='',side='',warm='',hot='',flick='',antenna='',roof='',x=X0;
      while(x<X1){
        const w=minW+Math.floor(rnd(seed+x*.011)*(maxW-minW)),h=minH+Math.floor(rnd(seed+x*.017+2)*(maxH-minH)),top=410-h;
        if(x+w>1140&&x<1360&&windows){x=1360;continue}
        if(x+w<left||x>right){x+=w+5+Math.floor(rnd(x*.3)*12);continue}
        d+=`M${x} 410V${top+4}Q${x} ${top} ${x+4} ${top}H${x+w-4}Q${x+w} ${top} ${x+w} ${top+4}V410Z`;
        side+=`M${x+w-12} ${top+2}H${x+w}V410H${x+w-12}Z`;
        roof+=`M${x+4} ${top+1}H${x+w-13}`;
        if(h>maxH*.7){d+=`M${x+w*.3} ${top}V${top-9}H${x+w*.65}V${top}Z`;antenna+=`M${x+w*.47} ${top-9}V${top-25}`}
        if(windows)for(let wy=top+13;wy<401;wy+=17)for(let wx=x+9;wx<x+w-18;wx+=13){
          const q=rnd(wx*.37+wy*.91+seed);if(q<.62)continue;
          const r=`M${wx} ${wy}h4.5v6.5h-4.5z`;if(q>.97)flick+=r;else if(q>.9)hot+=r;else warm+=r;
        }
        x+=w+5+Math.floor(rnd(x*.3)*12);
      }
      return {d,side,warm,hot,flick,antenna,roof};
    };
    const far=skyline(3,45,190,60,110,false),mid=skyline(9,45,215,80,140,true);
    // The scope only travels over this strip. Never magnify the 4,600-unit city.
    const lensFar=skyline(3,45,190,60,110,false,850,1510),lensMid=skyline(9,45,215,80,140,true,850,1510);
    const buildings=(far,mid)=>
      '<path d="'+far.d+'" fill="#202a3b" fill-opacity=".65"/><path d="'+far.antenna+'" stroke="#283344" stroke-width="1.5"/>'+
      '<path d="'+mid.d+'" fill="url(#'+id+'-building)"/><path d="'+mid.side+'" fill="#121b2a" opacity=".65"/><path d="'+mid.roof+'" stroke="#96a3b7" stroke-opacity=".18" stroke-width=".8"/>'+
      '<path d="'+mid.warm+'" fill="#c9c8b6" opacity=".35"/><path d="'+mid.hot+'" fill="'+p.accent+'" opacity=".6"/>';
    const beam=(x,name)=>'<g transform="translate('+x+' 420)"><g data-move="'+name+'"><path d="M-10 0L-110-440H110L10 0Z" fill="url(#'+id+'-beam)"/></g></g>';
    const mast=(x,name)=>'<g transform="translate('+x+' 0)"><path d="M0 404V190M-16 404L0 250 16 404M-12 300H12M-9 250H9" stroke="#232c31" stroke-width="3" fill="none"/><circle data-move="'+name+'" cy="186" r="4.5" fill="#ff5a4e"/></g>';
    let rain='';for(let i=0;i<70;i++){const x=X0+rnd(i*4.1)*(X1-X0),y=rnd(i*2.7)*520-20;rain+='M'+x.toFixed(0)+' '+y.toFixed(0)+'l-5 16'}
    const targets=snipes.map((q,i)=>'<g id="'+id+'-target'+i+'" data-move="tgt'+i+'"><rect x="'+(q.x-15)+'" y="'+(q.y-15)+'" width="30" height="30" rx="2" fill="#2a1a1c" stroke="#ffd9a8" stroke-opacity=".5"/><circle cx="'+q.x+'" cy="'+q.y+'" r="10" fill="#e5c07b" stroke="#fff3c9"/>'+label(q.x,q.y+4,'$',12,'#3a2a12','text-anchor="middle" font-weight="800"')+'</g><circle data-move="ping'+i+'" cx="'+q.x+'" cy="'+q.y+'" r="20" fill="none" stroke="#ffd9a8" stroke-width="2"/>').join('');
    const billboard='<g id="'+id+'-billboard">'+
      '<path d="M1150 410V180H1352V410Z" fill="#171f24" stroke="'+p.accent+'" stroke-opacity=".15"/><path d="M1190 180V160M1312 180V160" stroke="#2b3438" stroke-width="5"/>'+
      '<rect x="1157" y="78" width="188" height="92" rx="5" fill="url(#'+id+'-alloy)" stroke="#9b899f" stroke-opacity=".35"/><rect x="1162" y="82" width="178" height="82" rx="2" fill="url(#'+id+'-display)"/><path d="M1164 80H1337" stroke="#b9c9d4" stroke-opacity=".35"/><rect x="1162" y="82" width="178" height="82" fill="url(#'+id+'-screen-reflection)"/>'+
      '<path d="M1172 150L1196 138 1214 144 1236 120 1262 128 1290 104 1328 96" fill="none" stroke="#78d1a5" stroke-width="2.4"/>'+label(1172,100,'$CLOUD',11,'#f1b38c','font-weight="700"')+label(1330,100,'NEW',10,p.accent,'text-anchor="end"')+
      '<path d="'+Array.from({length:12},(_, i)=>'M'+(1162+i*16)+' 200h6v8h-6z').join('')+'" fill="#f1b38c" opacity=".2"/></g>';
    const city=buildings(far,mid)+'<path data-move="flick" d="'+mid.flick+'" fill="#ffd9a8"/>'+billboard+
      '<g transform="translate(-620 250) rotate(-3)"><rect x="-70" y="-22" width="140" height="44" rx="6" fill="none" stroke="'+p.accent+'" stroke-width="3" data-move="neon"/>'+label(0,8,'OPEN 24/7',18,p.accent,'text-anchor="middle" font-weight="800" letter-spacing="2"')+'</g>'+
      targets;
    const lensBox=[820,40,730,400];
    const lensArt=finishMaterials(buildings(lensFar,lensMid)+'<path d="'+lensMid.flick+'" fill="#ffd9a8" opacity=".6"/>'+billboard,id);
    const lens=vectorImage(vectorSource(lensArt,Material.defs(id,p)+Assets.defs(id),lensBox),lensBox,2.8)+snipes.map((_,i)=>'<use href="#'+id+'-target'+i+'"/>').join('');
    const pops=snipes.map((q,i)=>'<g data-move="pop'+i+'"><circle cx="'+q.x+'" cy="'+q.y+'" r="'+(i===2?60:36)+'" fill="url(#'+id+'-fire)"/><path d="M'+(q.x-26)+' '+q.y+'h-14M'+(q.x+26)+' '+q.y+'h14M'+q.x+' '+(q.y-26)+'v-14M'+q.x+' '+(q.y+26)+'v14M'+(q.x-19)+' '+(q.y-19)+'l-9-9M'+(q.x+19)+' '+(q.y-19)+'l9-9M'+(q.x-19)+' '+(q.y+19)+'l-9 9M'+(q.x+19)+' '+(q.y+19)+'l9 9" stroke="#ffe0a3" stroke-width="3" stroke-linecap="round"/>'+
      (i===2?label(q.x,q.y-66,'SNIPED',18,'#ffe0a3','text-anchor="middle" font-weight="800" letter-spacing="3"'):'')+label(q.x,q.y-(i===2?46:34),q.gain,i===2?15:13,'#78d1a5','text-anchor="middle" font-weight="800"')+'</g>').join('');
    return '<defs><clipPath id="'+id+'-lens" clipPathUnits="userSpaceOnUse"><circle r="54"/></clipPath></defs>'+
      '<g data-move="far">'+Assets.sky(id)+Assets.moon(id,430,112,30)+
        '<g data-move="heli"><path d="M-22 0H22M0 0V5" stroke="#2c353a" stroke-width="2"/><path d="M-16 10Q-14 3 2 3Q16 3 18 12Q14 17 -2 17Q-16 17 -16 10Z" fill="#1b2328"/><path d="M8 5Q15 6 16 11H8Z" fill="#3a4a52" opacity=".8"/><path d="M-14 9H-42" stroke="#1b2328" stroke-width="3"/><path d="M-42 3V15" stroke="#2c353a" stroke-width="1.5"/><path d="M-6 20H10M-2 17V20M6 17V20" stroke="#2c353a" stroke-width="1.5"/><circle data-move="helilight" cx="-10" cy="8" r="2.2" fill="#ff5a4e"/><path data-move="helibeam" d="M4 17L-56 330H64Z" fill="url(#'+id+'-cone)" opacity=".5"/></g>'+
        '<g opacity=".45">'+beam(120,'beam1')+beam(1740,'beam2')+'</g>'+
        city+
        '<g data-move="blink">'+[[-1060,190],[-400,210],[240,200],[1560,175],[2240,205],[2780,190]].map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="3" fill="#ff5a4e"/>').join('')+'</g>'+
        pops+
        '<g data-move="lens"><g clip-path="url(#'+id+'-lens)"><circle r="54" fill="#07090b"/><g data-move="zoom">'+lens+'</g><circle r="54" fill="'+p.accent+'" fill-opacity=".08"/></g></g>'+
        '<g data-move="reticle"><circle r="56" fill="none" stroke="#10161a" stroke-width="7"/><circle r="56" fill="none" stroke="'+p.accent+'" stroke-width="1.6"/><path d="M-78 0H-12M12 0H78M0-78V-12M0 12V78" stroke="'+p.accent+'" stroke-width="1.4"/><path d="M-30-3v6M-20-2v4M20-2v4M30-3v6M-3 30h6M-2 20h4" stroke="'+p.accent+'" stroke-width="1.2"/><circle r="2.5" fill="#ff5a4e"/><g data-move="lock"><path d="M-40-20V-40H-20M20-40H40V-20M40 20V40H20M-20 40H-40V20" stroke="#ffe0a3" stroke-width="2.5" fill="none"/></g>'+
          '<g transform="translate(64 -58)"><rect x="0" y="-12" width="96" height="18" rx="3" fill="#10161a" fill-opacity=".85" stroke="'+p.accent+'" stroke-opacity=".5"/>'+label(8,1,'SCANNING',10,p.accent,'font-weight="700" letter-spacing="1.2" data-text="hud"')+'</g></g>'+
        '<line data-move="laser" x1="1030" y1="308" x2="1251" y2="126" stroke="#ff5a4e" stroke-width="1.2" stroke-dasharray="3 5"/>'+
        '<line data-move="tracer" x1="1030" y1="308" x2="1251" y2="126" stroke="#ffe7b0" stroke-width="3.5" stroke-linecap="round"/>'+
      '</g>'+
      '<g data-move="mid">'+
        '<g opacity=".5">'+Assets.waterTower(id,120)+Assets.vent(id,-330,'fan2')+Assets.vent(id,2150,'fan3')+mast(1480,'blink2')+'</g>'+
        '<g transform="translate(1650 402)"><path d="M0 0V-44" stroke="#232c31" stroke-width="4"/><path d="M-30-40Q0-90 34-58Z" fill="#1d2529" stroke="#46525a" stroke-opacity=".6"/><path d="M0-58L16-78" stroke="#46525a" stroke-width="2"/></g>'+
        '<ellipse cx="740" cy="398" rx="170" ry="30" fill="url(#'+id+'-glow)"/>'+
        '<g transform="translate(760 334) scale(2)">'+body(id,'sniper',p)+'</g>'+
      '</g>'+
      '<g data-move="near">'+groundPlane(id,439)+
        '<g data-prop="parapet"><rect x="'+X0+'" y="389" width="'+(X1-X0)+'" height="32" fill="url(#'+id+'-ceramic)"/><rect x="'+X0+'" y="421" width="'+(X1-X0)+'" height="19" fill="url(#'+id+'-shell)"/><path d="M'+X0+' 389H'+X1+'" stroke="#a2a8b7" stroke-opacity=".2" stroke-width="1"/><path d="M'+X0+' 421H'+X1+'" stroke="#99a1b2" stroke-opacity=".32" stroke-width="1.2"/><path d="M'+X0+' 424H'+X1+'" stroke="#0d1017" stroke-opacity=".6" stroke-width="1"/></g>'+
        Assets.laptop(id,568,394,1.05)+
        '<ellipse data-move="screenglow" cx="610" cy="330" rx="90" ry="40" fill="url(#'+id+'-glow)"/>'+
        hand(id,'hand1',666,387,1.65)+
        '<g data-prop="scope-tripod"><ellipse cx="909" cy="408" rx="46" ry="6" fill="url(#'+id+'-shadow)"/><path d="M905 365L912 399" stroke="#252b36" stroke-width="5"/><ellipse cx="912" cy="399" rx="5" ry="2" fill="#0b0e15"/><path d="M898 363L873 409M912 363L944 409" fill="none" stroke="url(#'+id+'-ceramic)" stroke-width="6"/><path d="M897 366L875 405M914 367L941 405" fill="none" stroke="#a2a8b7" stroke-opacity=".32" stroke-width="1"/><path d="M905 352V371" stroke="url(#'+id+'-ceramic)" stroke-width="10"/><ellipse cx="873" cy="409" rx="6" ry="2" fill="#0b0e15"/><ellipse cx="944" cy="409" rx="6" ry="2" fill="#0b0e15"/></g>'+
        Assets.scope(id)+
        '<circle cx="905" cy="352" r="6" fill="url(#'+id+'-ceramic)" stroke="#8f97a7" stroke-opacity=".5" stroke-width=".8"/><circle cx="905" cy="352" r="2" fill="#151924"/>'+
        hand(id,'hand2',0,0,1,29,19)+
        '<g data-move="casing"><rect x="-5" y="-2" width="10" height="4" rx="1" fill="#e2b86a"/></g>'+
        Assets.binoculars(id,442,401,1.45)+Assets.wind(id,1360,405,1.2)+Assets.ammo(id,1080,405,1.4)+
        '<g data-move="rain"><path d="'+rain+'" stroke="#c9d6dc" stroke-opacity=".065" stroke-width="1"/><path transform="translate(0 -520)" d="'+rain+'" stroke="#c9d6dc" stroke-opacity=".065" stroke-width="1"/></g>'+
      '</g>';
  }

  /* ---------- TraderBot: The Battlestation ---------- */
  // A dense wraparound wall: the number of screens is part of this character's story.
  const COL=169,ROWS=[54,157,260],MW=153,MH=86;
  const BIG={x:565,y:54,w:470,h:188};
  const battleLayout=(()=>{
    const out=[],types=['line','candles','book','term','heat','line','candles','book'];
    for(let c=-10;c<=10;c++)for(let r=0;r<3;r++){
      if(Math.abs(c)<=1&&r<2)continue;
      const k=Math.min(1,Math.max(0,Math.abs(c)-1)/9),x=800+c*COL-MW/2,y=ROWS[r]+k*k*34;
      out.push({c,r,x,y,k,skew:Math.sign(c)*k*8,sc:1-k*.1,type:types[Math.floor(rnd(c*3.7+r*1.3)*types.length)],live:Math.abs(c)<=4,cx:x+MW/2,cy:y+MH/2});
    }
    return out;
  })();
  const battleFocus=[{x:BIG.x,y:BIG.y,w:BIG.w,h:BIG.h}].concat(battleLayout.filter(m=>Math.abs(m.c)<=3&&m.r<2).map(m=>({x:m.x,y:m.y,w:MW,h:MH})));
  function backBody(id){
    return `<g data-move="cloud">${cloudSurface(id)}${headphones(id)}</g>`;
  }
  function screenContent(m,w,h){
    const k=m.c*7.3+m.r*3.1,ticker=['SOL / USDC','WIF · 1M','BONK · 5S','CLOUD / SOL','PERPS','FLOWS','JUP · 15M','MEMES'][Math.floor(rnd(k)*8)];
    let out=`<path d="M6 17H${w-6}" stroke="#879eb7" stroke-opacity=".13"/><circle cx="8" cy="9" r="1.8" fill="#83b4ac"/>${Assets.text(14,11,ticker,6.3,'#91a8bf')}${Assets.text(w-8,11,'LIVE',4.7,'#708899','text-anchor="end"')}`;
    if(m.type==='line'){
      out+=`<path d="M8 35H${w-8}M8 56H${w-8}M38 23V${h-7}M77 23V${h-7}M116 23V${h-7}" stroke="#7b91ad" stroke-opacity=".1" stroke-width=".6"/>`;
      if(m.live)out+=`<path data-live data-w="${w}" data-h="${h}" data-seed="${k.toFixed(2)}" fill="none" stroke="${rnd(k+1)>.35?'#8ec9c0':'#d89a9d'}" stroke-width="1.35"/>`;
      else{let d='';for(let i=0;i<=25;i++)d+=(i?'L':'M')+(8+i*(w-16)/25).toFixed(1)+' '+(h*.57-(Math.sin(i*.5+k)*.16+Math.sin(i*.2+k)*.16)*h).toFixed(1);out+=`<path d="${d}" fill="none" stroke="#84b9c2" stroke-width="1.2"/>`}
      out+=Assets.text(9,h-5,(.13+rnd(k)*6).toFixed(4),5,'#667d96');
    }else if(m.type==='candles'){
      out+=`<path d="M8 39H${w-8}M8 61H${w-8}" stroke="#7e94af" stroke-opacity=".12" stroke-width=".6"/>`;
      for(let i=0;i<15;i++){const x=11+i*(w-20)/15,y=27+rnd(k+i)*(h-53),hh=4+rnd(k*2+i)*17,c=rnd(k+i*3)>.42?'#83bcb1':'#cd8c9c';out+=`<path d="M${x.toFixed(1)} ${(y-4).toFixed(1)}v${(hh+8).toFixed(1)}" stroke="${c}" stroke-width=".75"/><rect x="${(x-2.2).toFixed(1)}" y="${y.toFixed(1)}" width="4.4" height="${hh.toFixed(1)}" rx=".5" fill="${c}"/>`}
    }else if(m.type==='book'){
      let g='';for(let i=0;i<7;i++){const y=24+i*7.3;g+=`<rect x="8" y="${y}" width="${(20+rnd(k+i)*48).toFixed(1)}" height="5" rx=".8" fill="#508b88" opacity=".35"/><rect x="${w/2+3}" y="${y}" width="${(20+rnd(k+i*2)*42).toFixed(1)}" height="5" rx=".8" fill="#a66d81" opacity=".35"/>${Assets.text(13,y+4,(.012+i*.0003).toFixed(4),4.9,'#86b9b4')}${Assets.text(w-12,y+4,(23+rnd(i+k)*870).toFixed(2),4.9,'#c291a4','text-anchor="end"')}`}
      out+=m.live?`<g data-book>${g}</g>`:g;
    }else if(m.type==='term'){
      const words=['wallet.connected','sync_block: 293104','route: jupiter','tx.confirmed','balance.updated','watch: active','latency: 12ms'];
      for(let i=0;i<7;i++)out+=Assets.text(8,27+i*7.2,'› '+words[(i+Math.floor(rnd(k)*7))%7],5.1,i===4?'#d4ba8c':'#7396b5');
    }else{
      for(let i=0;i<7;i++)for(let j=0;j<4;j++){const q=rnd(k+i*4+j);out+=`<rect x="${(8+i*(w-16)/7).toFixed(1)}" y="${(23+j*(h-29)/4).toFixed(1)}" width="${((w-16)/7-2).toFixed(1)}" height="${((h-29)/4-2).toFixed(1)}" rx="1.2" fill="${q>.45?'#70a7a1':'#b68093'}" opacity="${(.2+q*.45).toFixed(2)}"/>`}
    }
    return out;
  }
  function battlestation(id,p){
    const frame=(w,h,inner)=>`<rect x="-6" y="-4" width="${w+12}" height="${h+14}" rx="7" fill="#090e16"/><rect x="-5" y="-6" width="${w+10}" height="${h+12}" rx="7" fill="url(#${id}-monitor-frame)" stroke="#728999" stroke-opacity=".3"/><rect width="${w}" height="${h}" rx="3" fill="url(#${id}-display)"/>${inner}<rect width="${w}" height="${h}" rx="3" fill="url(#${id}-screen-reflection)"/><path d="M3-4H${w-3}" stroke="#bbccdc" stroke-opacity=".2" stroke-width=".8"/><circle cx="${w-5}" cy="${h+3}" r="1" fill="#9ec4c6" opacity=".65"/>`;
    let wall='',stands='';
    for(const m of battleLayout){
      wall+=`<g data-monitor transform="translate(${m.x} ${m.y}) translate(${MW/2} ${MH/2}) skewY(${m.skew.toFixed(1)}) scale(${m.sc.toFixed(3)}) translate(${-MW/2} ${-MH/2})" opacity="${(.95-m.k*.43).toFixed(2)}">${frame(MW,MH,screenContent(m,MW,MH))}</g>`;
      if(m.r===2)stands+=`M${m.cx} ${m.y+MH}V365`;
    }
    let vol='';for(let i=0;i<43;i++){const hh=4+rnd(i*1.9)*24;vol+=`<rect x="${(14+i*10.6).toFixed(1)}" y="${BIG.h-27-hh}" width="6" height="${hh}" rx=".5" fill="${rnd(i)>.4?'#82bbae':'#bc899b'}" opacity=".3"/>`}
    const ticker='$CLOUD +69%   ·   SOL 148.32   ·   DEV SOLD   ·   $BONK +8%   ·   NEW PAIR: $SLEEP   ·   FUNDING 0.08%   ·   WHALE BOUGHT 420 SOL   ·   ';
    const big=`<g data-monitor transform="translate(${BIG.x} ${BIG.y})">${frame(BIG.w,BIG.h,
      `<path d="M0 23H${BIG.w}" stroke="#89a7c4" stroke-opacity=".15"/>${Assets.text(12,15,'$CLOUD / SOL',10,'#c0d4df','font-weight="650"')}${Assets.text(124,15,'1s   1m   5m   1h',7,'#6c839d')}${Assets.text(BIG.w-12,15,'● LIVE',7,'#89bcb0','text-anchor="end"')}
      <path d="M12 52H458M12 84H458M12 116H458M12 148H458M76 30V164M150 30V164M224 30V164M298 30V164M372 30V164" stroke="#6e87a7" stroke-opacity=".14" stroke-width=".6"/>${vol}
      <path data-live data-big="1" data-w="${BIG.w}" data-h="${BIG.h}" data-seed="1.7" fill="none" stroke="#8dc9b9" stroke-width="2.4" stroke-linejoin="round"/>
      ${Assets.text(BIG.w-14,50,'+12.0%',23,'#8dc9b9','text-anchor="end" font-weight="700" data-text="bigpnl"')}${Assets.text(BIG.w-14,64,'HOLDING',7,'#9eb6ca','text-anchor="end" letter-spacing="1.7" data-text="bigstatus"')}
      <clipPath id="${id}-tick"><rect y="${BIG.h-17}" width="${BIG.w}" height="17"/></clipPath><rect y="${BIG.h-17}" width="${BIG.w}" height="17" fill="#132131"/><g clip-path="url(#${id}-tick)"><g data-move="ticker">${Assets.text(0,BIG.h-6,ticker+ticker,7.5,'#a5adbd')}</g></g>`)}
    </g>`;
    const desk=`<path d="M${X0} 350Q800 366 ${X1} 350V379Q800 399 ${X0} 379Z" fill="url(#${id}-rubber)"/><path d="M${X0} 350Q800 366 ${X1} 350" fill="none" stroke="#9aaec5" stroke-opacity=".28" stroke-width="1.5"/><path d="M${X0} 380Q800 400 ${X1} 380" fill="none" stroke="#10151f" stroke-width="5"/>`;
    return `<defs>
      <radialGradient id="${id}-redglow"><stop stop-color="#dc566d" stop-opacity=".33"/><stop offset="1" stop-color="#dc566d" stop-opacity="0"/></radialGradient><radialGradient id="${id}-greenglow"><stop stop-color="#76c8c0" stop-opacity=".32"/><stop offset="1" stop-color="#76c8c0" stop-opacity="0"/></radialGradient>
      </defs>
      <g data-move="far"><ellipse cx="800" cy="230" rx="1400" ry="235" fill="url(#${id}-sky-blue)"/><path d="${stands}" stroke="#29394d" stroke-width="4"/>${wall}${big}
        <rect data-move="focus" x="${BIG.x}" y="${BIG.y}" width="${BIG.w}" height="${BIG.h}" rx="4" fill="none" stroke="#b0cce3" stroke-width="1" stroke-opacity=".4"/>
        <ellipse data-move="redwash" cx="800" cy="200" rx="1300" ry="225" fill="url(#${id}-redglow)"/><ellipse data-move="greenwash" cx="800" cy="200" rx="1300" ry="225" fill="url(#${id}-greenglow)"/>
      </g>
      <g data-move="mid">${desk}<ellipse cx="800" cy="365" rx="580" ry="32" fill="url(#${id}-sky-blue)"/>
        ${Assets.keyboard(id,800,370,.92)}<g transform="translate(990 370)"><ellipse cy="2" rx="19" ry="9" fill="url(#${id}-shadow)"/><path d="M-15 0Q-17-11 0-12Q17-11 15 0Q0 9-15 0Z" fill="url(#${id}-alloy)"/><path d="M0-10V-3" stroke="#afc4d6" stroke-opacity=".5"/><rect x="-1" y="-9" width="2" height="4" rx="1" fill="#d1dce2"/></g>
        ${Assets.can(id,555,361,0,1.35)}${Assets.can(id,587,363,-8,1.18)}${Assets.can(id,1090,364,0,1.3)}${Assets.can(id,1130,369,80,1.14)}${Assets.can(id,175,356,-3,1.1)}${Assets.can(id,1510,358,0,1.1)}
        ${Assets.ashtray(id,1220,365,1.35)}${cigarette(1210,359,-10,1.1)}${coin(430,345,1.1,0)}${coin(1310,344,1.05,1)}
        ${hand(id,'hand1',668,374,1.9)}${hand(id,'hand2',984,366,1.8)}<g transform="translate(800 277) scale(1.95)">${backBody(id)}</g>
      </g>
      <g data-move="near">${groundPlane(id,410)}
        <g data-move="chair"><ellipse cx="800" cy="474" rx="128" ry="20" fill="url(#${id}-shadow)"/><path d="M800 420V454M738 475L800 454 862 475M766 484L800 454 834 484" stroke="url(#${id}-alloy)" stroke-width="7"/>
          ${[738,766,834,862].map(x=>`<rect x="${x-7}" y="${x<750||x>850?470:479}" width="14" height="10" rx="4" fill="#111722" stroke="#344459" stroke-width="1"/>`).join('')}
          <path d="M707 410Q800 441 893 410L891 427Q800 454 709 427Z" fill="url(#${id}-rubber)"/>
          <path d="M718 327Q722 300 752 299Q800 289 848 299Q878 300 882 327L894 408Q889 428 800 430Q711 428 706 408Z" fill="url(#${id}-monitor-frame)" stroke="#637c98" stroke-opacity=".38" stroke-width="1.3"/>
          <path d="M748 310Q800 299 852 310L862 409Q800 422 738 409Z" fill="#18263a"/><path d="M745 315L736 407M855 315L864 407" fill="none" stroke="#6b93b3" stroke-width="2" stroke-opacity=".4"/>
          <path d="M727 319Q727 311 738 307M869 319Q869 311 858 307" stroke="#bac9d6" stroke-opacity=".24" fill="none"/>
          ${Assets.text(800,347,'degen',10,'#809db6','text-anchor="middle" letter-spacing="2.2"')}
          <path d="M687 360L726 363V373L683 370ZM874 363L913 360 917 370 874 373Z" fill="url(#${id}-alloy)"/><path d="M690 372V397M910 372V397" stroke="#1c2a3c" stroke-width="5"/>
        </g>${Assets.can(id,1390,428,82,1.15)}
      </g>`;
  }

  /* ---------- LaunchBot: The Pad ---------- */
  function launch(id,p){
    let terrain='';
    for(let layer=0;layer<3;layer++){
      const pts=[];for(let x=X0-160;x<=X1+160;x+=160)pts.push([x,335+layer*27+Math.sin(x*.003+layer*1.3)*(28-layer*5)+Math.cos(x*.006+layer)*12]);
      let d=`M${pts[0][0]} 430L${pts[0][0]} ${pts[0][1]}`;
      for(let i=1;i<pts.length;i++)d+=`Q${pts[i-1][0]} ${pts[i-1][1].toFixed(1)} ${(pts[i-1][0]+pts[i][0])/2} ${((pts[i-1][1]+pts[i][1])/2).toFixed(1)}`;
      d+=`L${X1+160} 440H${X0-160}Z`;
      terrain+=`<path d="${d}" fill="${['#293044','#20283a','#171f30'][layer]}" opacity="${[.6,.8,1][layer]}"/>`;
    }
    let fence='';for(let x=X0;x<X1;x+=120){if(x>940&&x<1280)continue;fence+='M'+x+' 406V384'}
    // Reuse one vector smoke tile instead of shading 24 overlapping gradients.
    const puffBox=[-44,-44,88,88],puffSource=vectorSource('<circle r="44" fill="url(#'+id+'-puff)"/>',defs(id,p),puffBox);
    let puffs='';for(let i=0;i<24;i++)puffs+=vectorImage(puffSource,puffBox,3.2,'data-move="smoke'+i+'"');
    const flood=(x,dir)=>Assets.flood(id,x,dir);
    return '<g data-move="far">'+Assets.sky(id,true)+Assets.moon(id,1380,118,31,true)+
        '<g data-move="flag"><path d="M1362 100V76" stroke="#dfead8" stroke-width="1.5"/><path d="M1362 76H1378L1374 81 1378 86H1362Z" fill="'+p.accent+'"/><circle cx="1364" cy="102" r="22" fill="url(#'+id+'-glow)"/></g>'+
        '<ellipse cx="800" cy="404" rx="1300" ry="70" fill="url(#'+id+'-glow)" opacity=".5"/>'+
        terrain+
        '<path d="'+fence+'" stroke="#2d3745" stroke-width="3"/><path d="M'+X0+' 390H940M1280 390H'+X1+'M'+X0+' 398H940M1280 398H'+X1+'" stroke="#2d3745" stroke-width="1.2"/>'+
      '</g>'+
      '<g data-move="mid">'+flood(300,1)+flood(1540,-1)+
        Assets.gantry(id)+
        Assets.countdown(id)+
        '<g data-move="arm"><path d="M1046 300H1092" stroke="#405165" stroke-width="8"/><path d="M1086 292V308" stroke="#d0c077" stroke-width="4"/></g>'+
        '<ellipse data-move="padglow" cx="1120" cy="412" rx="240" ry="50" fill="url(#'+id+'-fire)"/>'+
        '<g transform="translate(1120 339) scale(2.2)">'+Assets.rocket(id)+'</g>'+
        '<path d="M1022 406H1218L1234 422H1006Z" fill="#26302b" stroke="#5c6f60"/><path d="M1006 422H1234V432H1006Z" fill="#c6b364"/><path d="'+Array.from({length:12},(_, i)=>'M'+(1012+i*19)+' 432L'+(1020+i*19)+' 422').join('')+'" stroke="#182423" stroke-width="7"/>'+
        '<g data-move="puffs">'+puffs+'</g>'+
        '<ellipse cx="610" cy="428" rx="220" ry="22" fill="url(#'+id+'-shadow)"/>'+
        '<g transform="translate(610 318) scale(2.05)">'+body(id,'launch',p)+'</g>'+
      '</g>'+
      '<g data-move="near">'+groundPlane(id,430)+
        '<path d="M452 418H780L770 428H462Z" fill="#2c3a33" stroke="'+p.accent+'" stroke-opacity=".35"/><path d="M476 428L462 520M756 428L770 520" stroke="#2c3544" stroke-width="4"/>'+
        // The console monitor faces the cloud, so we see its back; its screen light spills onto the cloud.
        '<ellipse data-move="crtglow" cx="530" cy="330" rx="80" ry="46" fill="url(#'+id+'-glow)"/>'+
        Assets.crt(id,470,356)+
        '<g transform="translate(655 420) rotate(-4)"><path d="M-30-2L26-6 32 2-24 6Z" fill="#c9c3a4"/><path d="M-20-2L-16 1-10-5M-4-3L12-4M-18 3L-14 5-8 0M-2 2L14 1" stroke="#53667f" stroke-width="1.5" fill="none"/></g>'+
        Assets.launchButton(id)+
        hand(id,'hand1',700,406,1.9)+hand(id,'hand2',560,420,1.7)+
        Assets.radio(id,805,428,1.5)+Assets.cone(id,1270,420,1.25)+
        
      '</g>';
  }
  const artworks={research,sniper,trader:battlestation,launch};

  // Explicit material families keep environmental objects in the same lighting system as the clouds.
  // Do not remap semantic feedback, character paint, glass, or black contact shadows.
  const materialFills={
    shell: '#11171a #1b2328 #1b2226 #141b1f #111a17 #1b2622 #141d1a #18221e #1d2529 #171f24 #151c21 #0c121d #111a2c #0f1626 #141d30 #1b2233 #1d2b4d #1a2336 #182544 #1c1016 #06090f',
    ceramic: '#262e33 #262e32 #2c3438 #20282c #28342f #405165 #26302b #2c3a33 #3c4a44 #35403b #26332d #34402f #2a3326 #2a3631 #39444a #1b2436 #2b3337 #2c3544 #232c31 #1b2327 #26332d #2f3a33 #161f30 #2a2419 #3a3021 #2c2a21 #383222 #252a27 #3d3727 #2f2c26 #4a3b2a #2d3b36 #5a2a28',
    paper: '#d8cfb0 #cfc6a6 #bfb594 #c9c3a4 #c9c0a0 #cdb866 #c2ab62 #bfa95e #b8a45c #bdc3b0',
    screen: '#0a1220 #07100d #0d1a2e',
    building: '#10161a #0f1816',
    enamel: '#48675c #a76154'
  };
  function finishMaterials(markup,id){
    for(const [name,values] of Object.entries(materialFills)){
      for(const value of values.split(' ')) markup=markup.replaceAll('fill="'+value+'"','fill="url(#'+id+'-'+name+')"');
    }
    return markup;
  }

  function createSVG(role){
    const p=roles[role],id='cloud-'+(++serial);
    return '<svg class="cloud-scene immersive-scene" viewBox="0 0 1600 '+VH+'" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+p.name+' — '+p.world+'" aria-describedby="'+id+'-desc" style="--cloud-color:'+Characters.colors[role]+';--accent:'+p.accent+';--rim:'+p.rim+';--panel:'+p.panel+';--flat:'+p.flat+'"><desc id="'+id+'-desc">'+p.desc+'</desc>'+defs(id,p)+characterDefs(id,role)+Material.defs(id,p)+Assets.defs(id)+'<g data-move="cam"><g class="environment">'+finishMaterials(artworks[role](id,p),id)+'</g></g><rect x="'+X0+'" y="-30" width="'+(X1-X0)+'" height="96" fill="url(#'+id+'-fog)"/></svg>';
  }

  /* ---------- animation ---------- */
  // Rewriting an unchanged ancestor transform invalidates an entire SVG layer in some renderers.
  function attr(s,node,name,value){
    if(!node)return;
    let saved=s.attributes.get(node);if(!saved){saved={};s.attributes.set(node,saved)}
    const next=String(value);if(saved[name]===next)return;
    saved[name]=next;node.setAttribute(name,next);
  }
  function cameraShake(s,x,y){
    const value=x||y?'translate3d('+f1(x*s.sceneScale)+'px,'+f1(y*s.sceneScale)+'px,0)':'none';
    if(value!==s.cameraTransform){s.cameraTransform=value;s.camera.style.transform=value}
  }
  function cacheVectorTiles(s){
    for(const tile of s.tiles){
      const density=Math.min(3,Math.max(1,s.sceneScale*tile.scale*window.devicePixelRatio),2048/Math.max(tile.width,tile.height));
      const width=Math.ceil(tile.width*density),height=Math.ceil(tile.height*density),key=width+'x'+height;
      if(tile.key===key)continue;
      tile.key=key;
      const source=new Image();
      source.onload=()=>{
        if(s.destroyed||tile.key!==key)return;
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');if(!context)return;
        context.drawImage(source,0,0,width,height);
        const texture=canvas.toDataURL('image/png');
        for(const node of tile.nodes)node.setAttribute('href',texture);
        canvas.width=canvas.height=0;
      };
      source.src=tile.source;
    }
  }
  function paint(s,t,dt=1/60){
    const p=roles[s.role],phase=((t+s.offset)%p.period)/p.period;
    const wave=Math.sin(t*1.6+s.seed),wave2=Math.sin(t*.8+s.seed);
    const tr=(name,value)=>attr(s,s.parts[name],'transform',value);
    const op=(name,value)=>attr(s,s.parts[name],'opacity',clamp(value).toFixed(3));
    const pt=s.pointer;
    // Pointer movement is eased and bounded so attention feels curious, never twitchy.
    const pointerEase=1-Math.exp(-4.68*dt);
    pt.x+=(pt.tx-pt.x)*pointerEase;pt.y+=(pt.ty-pt.y)*pointerEase;
    // Three depth layers make the panorama read as a place rather than a picture.
    tr('far','translate('+f1(-pt.x*6)+' '+f1(-pt.y*2)+')');
    tr('mid','translate('+f1(-pt.x*14)+' '+f1(-pt.y*4)+')');
    tr('near','translate('+f1(-pt.x*26)+' '+f1(-pt.y*6)+')');
    if(s.role!=='launch')tr('cloud','translate(0 '+f1(-1+wave*1.1)+') rotate('+((s.role==='sniper'?-3:s.role==='research'?-5:2)+wave2*.7+pt.x*1.6).toFixed(2)+')');
    const glanceTime=t+s.seed,glanceStep=Math.floor(glanceTime/1.45),glanceBlend=smooth(0,.13,glanceTime%1.45);
    const glance=(Math.sin((glanceStep-1)*2.3)*(1-glanceBlend)+Math.sin(glanceStep*2.3)*glanceBlend)*3;
    const lookX=pt.x*3+glance;
    tr('gaze','translate('+lookX.toFixed(2)+' '+(pt.y*2+Math.sin(t*.8)*.6).toFixed(2)+')');
    let blink=1;const blinkPhase=(t+s.seed*2)%5.3;if(blinkPhase>4.96&&blinkPhase<5.14)blink=Math.max(.06,Math.abs(blinkPhase-5.05)/.09);
    for(let i=0;i<3;i++)attr(s,s.parts['tw'+i],'fill-opacity',(.08+.07*Math.sin(t*(.22+i*.09)+i*2)).toFixed(2));
    op('sparkle',.72+.12*Math.sin(t*.7));tr('sky-drift','translate('+f1(Math.sin(t*.018)*24)+' 0)');
    tr('smoke-cig','translate('+Math.sin(t*.8)*2+' '+(-((t*3)%7))+')');op('smoke-cig',.6+.2*Math.sin(t*.7));
    attr(s,s.shadow,'opacity',(.7-wave*.12).toFixed(3));
    let eyeScale=1;

    if(s.role==='research'){
      tr('lamp','rotate('+(Math.sin(t*.9)*2.4).toFixed(2)+' 800 -60)');
      tr('mag','translate('+f1(Math.sin(t*.7)*38)+' '+f1(Math.abs(Math.cos(t*1.1))*-6)+') rotate('+f1(Math.sin(t*.7)*6)+')');
      tr('hand2','translate(0 '+f1(Math.max(0,Math.sin(t*5))*1.5)+')');
      tr('steam','translate(0 '+(-((t*4)%8))+')');op('steam',.5+.2*Math.sin(t*2));
      const traced=smooth(.18,.58,phase)*(1-smooth(.9,.99,phase));
      if(s.parts.trace)s.parts.trace.setAttribute('stroke-dashoffset',(1-traced).toFixed(4));
      const found=bell(phase,.56,.64,.9);op('found',found);
      tr('found','translate(1050 216) scale('+(.8+found*.2).toFixed(3)+') translate(-1050 -216)');
      for(let i=0;i<4;i++){const base=[-620,260,1360,2180][i],y=-40+((t*26+i*150)%520);tr('paper'+i,'translate('+f1(base+Math.sin(t*.8+i)*44)+' '+f1(y)+') rotate('+f1(Math.sin(t*.9+i*2)*35)+')')}
      for(let i=0;i<16;i++){const y=90+((rnd(i*3.3)*340+t*(5+i%4*3))%340),spread=(y-64)/406,x=800+(rnd(i*7.7)-.5)*520*spread+Math.sin(t*.4+i)*10;const m=s.parts['mote'+i];if(m){m.setAttribute('cx',f1(x));m.setAttribute('cy',f1(y));m.setAttribute('opacity',(.18+.3*(.5+.5*Math.sin(t*1.3+i))).toFixed(2))}}
      tr('gaze','translate('+f1(clamp(lookX*.5+Math.sin(t*.7)*1.6+found*2.5,-3.5,3.5))+' '+f1(clamp(pt.y*1.5-found*2,-3,2.5))+')');

    } else if(s.role==='sniper'){
      const idle={x:1010+Math.sin(t*.55)*90,y:250+Math.cos(t*.8)*40};
      let pos=idle,lock=0,fire=0,aim=0,hud='SCANNING';
      snipes.forEach((q,i)=>{
        const from=i?snipes[i-1]:idle;
        if(phase>=q.a){
          const k=smooth(q.a,q.a+.1,phase),wob=1-smooth(q.a+.05,q.f-.05,phase);
          pos={x:from.x+(q.x-from.x)*k+Math.sin(t*3.1+i)*16*wob*k,y:from.y+(q.y-from.y)*k+Math.cos(t*2.6+i)*11*wob*k};
          if(phase<q.f+.07){hud=phase<q.f-.06?'TRACKING':phase<q.f?'LOCKED':'FILLED '+q.gain}
        }
        lock=Math.max(lock,smooth(q.f-.08,q.f-.035,phase)*(1-smooth(q.f+.01,q.f+.05,phase)));
        fire=Math.max(fire,bell(phase,q.f-.004,q.f,q.f+.025));
        aim=Math.max(aim,smooth(q.a+.04,q.a+.1,phase)*(1-smooth(q.f+.02,q.f+.06,phase)));
        const vis=smooth(q.a,q.a+.02,phase)*(1-smooth(q.f,q.f+.008,phase));
        op('tgt'+i,vis);
        const ping=clamp((phase-q.a)/.06);op('ping'+i,phase>=q.a&&ping<1?1-ping:0);tr('ping'+i,'translate('+q.x+' '+q.y+') scale('+(1+ping*2.5).toFixed(3)+') translate('+(-q.x)+' '+(-q.y)+')');
        const pop=phase>=q.f?clamp((phase-q.f)/.16):0;op('pop'+i,phase>=q.f?bell(pop,0,.08,1):0);
        tr('pop'+i,'translate(0 '+f1(-pop*40)+') translate('+q.x+' '+q.y+') scale('+(.8+pop*.3).toFixed(3)+') translate('+(-q.x)+' '+(-q.y)+')');
      });
      if(phase>.76){const k=smooth(.76,.98,phase),q=snipes[2];pos={x:q.x+(idle.x-q.x)*k,y:q.y+(idle.y-q.y)*k}}
      const rx=pos.x,ry=pos.y;
      tr('reticle','translate('+f1(rx)+' '+f1(ry)+')');
      tr('lens','translate('+f1(rx)+' '+f1(ry)+')');
      const zoom=2.1+lock*.7;tr('zoom','scale('+zoom.toFixed(3)+') translate('+f1(-rx)+' '+f1(-ry)+')');
      tr('lock','scale('+(1.8-lock*.8).toFixed(3)+')');op('lock',.1+lock*.9);
      if(s.hud&&s.hud.textContent!==hud){s.hud.textContent=hud;s.hud.setAttribute('fill',hud[0]==='F'?'#78d1a5':hud[0]==='L'?'#ffe0a3':p.accent)}
      // The rifle scope physically follows the reticle, and the shot leaves from its muzzle.
      const ang=Math.atan2(ry-SCOPE[1],rx-SCOPE[0]),tipX=SCOPE[0]+Math.cos(ang)*146,tipY=SCOPE[1]+Math.sin(ang)*146;
      tr('scope','translate('+SCOPE[0]+' '+SCOPE[1]+') rotate('+f1(ang*57.3)+')');
      tr('recoil','translate('+f1(-fire*9)+' 0)');op('muzzle',fire);
      const line=(n,o)=>{const l=s.parts[n];if(!l)return;op(n,o);if(o<=0)return;attr(s,l,'x1',f1(tipX));attr(s,l,'y1',f1(tipY));attr(s,l,'x2',f1(rx));attr(s,l,'y2',f1(ry))};
      line('laser',aim*.7*(.7+.3*Math.sin(t*30)));line('tracer',fire);
      const since=snipes.reduce((m,q)=>phase>=q.f&&phase-q.f<m?phase-q.f:m,1),cf=clamp(since/.07);
      tr('casing','translate('+f1(890-cf*60)+' '+f1(350-Math.sin(cf*Math.PI)*60+cf*52)+') rotate('+f1(cf*720)+')');op('casing',since<.07?1:0);
      const shake=fire*3.5;cameraShake(s,Math.sin(t*71)*shake,Math.cos(t*57)*shake);
      op('screenglow',.7+fire*.3);
      tr('hand1','translate(0 '+f1(-Math.max(0,Math.sin(t*9))*(1-aim)*1.2)+')');
      // The supporting hand follows a point on the recoiling barrel in scope-local space.
      const gripX=-30-fire*9,gripY=20;
      tr('hand2','translate('+f1(SCOPE[0]+Math.cos(ang)*gripX-Math.sin(ang)*gripY)+' '+f1(SCOPE[1]+Math.sin(ang)*gripX+Math.cos(ang)*gripY)+') rotate('+f1(ang*57.3)+')');
      tr('beam1','rotate('+f1(-18+Math.sin(t*.35)*16)+')');tr('beam2','rotate('+f1(18+Math.sin(t*.29+1)*16)+')');
      tr('beam3','rotate('+f1(Math.sin(t*.25+2)*20)+')');tr('beam4','rotate('+f1(Math.sin(t*.31+3)*20)+')');
      const hx=((t*38)%4200)-1300;tr('heli','translate('+f1(hx)+' '+f1(60+Math.sin(t*.5)*8)+')');tr('helibeam','rotate('+f1(Math.sin(t*.6)*14)+')');op('helilight',Math.sin(t*5)>0?1:.1);
      tr('rain','translate('+f1(-((t*40)%80))+' '+f1((t*520)%520)+')');
      op('flick',Math.sin(t*3.1)>0?.9:.25);op('neon',Math.sin(t*13)>-.85?.9:.2);op('blink',Math.sin(t*2.2)>.4?1:.15);op('blink2',Math.sin(t*2.2+1)>.4?1:.15);op('blink3',Math.sin(t*2.2+2)>.4?1:.15);
      tr('windsock','rotate('+f1(Math.sin(t*1.3)*4+Math.sin(t*3.2)*1.5)+')');
      for(let i=1;i<=3;i++)tr('fan'+i,'rotate('+((t*420)%360).toFixed(0)+')');
      tr('gaze','translate('+f1(clamp((rx-760)/90,-3,6))+' '+f1(clamp((ry-300)/40,-6,3))+')');
      s.squint=aim;eyeScale=1-lock*.15;

    } else if(s.role==='trader'){
      // Ten-second loop: grind → dump (room goes red, slump) → pump (room goes green, arms up) → grind.
      const dump=smooth(.5,.54,phase)*(1-smooth(.68,.72,phase)),pump=smooth(.71,.75,phase)*(1-smooth(.9,.96,phase));
      const step=Math.floor(t*10);
      if(step!==s.liveStep){
        s.liveStep=step;
        s.lives.forEach(el=>{
          const w=+el.dataset.w,h=+el.dataset.h,seed=+el.dataset.seed,big=!!el.dataset.big,n=big?64:22;let d='';
          for(let i=0;i<=n;i++){
            const q=i+t*(big?4:3);let v=Math.sin(q*.33+seed)*.16+Math.sin(q*.11+seed*2)*.14+Math.sin(q*.9+seed)*.03;
            if(big){const tail=smooth(n*.55,n,i);v+=-dump*tail*.42+pump*tail*.5}
            d+=(i?'L':'M')+(10+i*(w-20)/n).toFixed(1)+' '+clamp(h*.55-v*h,20,h-22).toFixed(1);
          }
          el.setAttribute('d',d);
          if(big)el.setAttribute('stroke',dump>.5?'#ff6b62':'#78d1a5');
        });
        s.books.forEach((b,i)=>b.setAttribute('opacity',(.45+rnd(step*1.3+i)*.55).toFixed(2)));
        const base=12+Math.sin(t*.5)*6,pnl=base+(-42-base)*dump+(69-base)*pump;
        if(s.bigpnl){s.bigpnl.textContent=(pnl>=0?'+':'')+pnl.toFixed(1)+'%';s.bigpnl.setAttribute('fill',pnl>=0?'#78d1a5':'#ff6b62')}
        if(s.bigstatus)s.bigstatus.textContent=dump>.5?'LIQ WARNING':pump>.5?'SENT IT':'HOLDING';
      }
      op('redwash',dump*.45);op('greenwash',pump*.45);
      // The head turns between screens; a soft frame shows what it is reading.
      const idx=Math.floor(rnd(Math.floor((t+s.seed)/1.5))*battleFocus.length),f=(dump+pump)>.3?battleFocus[0]:battleFocus[idx];
      const fb=s.fb||(s.fb={...battleFocus[0]});for(const key of ['x','y','w','h'])fb[key]+=(f[key]-fb[key])*.1;
      if(s.parts.focus){const r=s.parts.focus;r.setAttribute('x',f1(fb.x));r.setAttribute('y',f1(fb.y));r.setAttribute('width',f1(fb.w));r.setAttribute('height',f1(fb.h))}
      op('focus',.18+.08*Math.sin(t*1.7));
      s.lookX=(s.lookX||800)+((fb.x+fb.w/2)-(s.lookX||800))*.08;
      const turn=(s.lookX-800)/600;
      tr('cloud','translate('+f1(turn*10)+' '+f1(dump*12-pump*Math.abs(Math.sin(t*9))*8+wave*.8)+') rotate('+f1(turn*6-dump*4)+')');
      const typing=(1-dump)*(1-pump);
      tr('hand1','translate('+f1(Math.sin(t*4)*3*typing-pump*8)+' '+f1(Math.max(0,Math.sin(t*15))*1.5*typing+dump*6-pump*(92+Math.sin(t*9)*4))+') rotate('+f1(-pump*25)+')');
      tr('hand2','translate('+f1(Math.sin(t*1.7)*5*typing+pump*8)+' '+f1(Math.max(0,Math.sin(t*6))*1*typing+dump*6-pump*(92+Math.sin(t*9+1)*4))+') rotate('+f1(pump*25)+')');
      tr('chair','translate('+f1(turn*3)+' '+f1(dump*3)+')');
      tr('ticker','translate('+f1(-((t*55)%1060))+' 0)');
      if(s.parts.rgb){s.parts.rgb.setAttribute('stroke',p.accent);s.parts.rgb.setAttribute('opacity',(.45+Math.sin(t*1.2)*.1).toFixed(2))}
      const shake=bell(phase,.5,.52,.58)*3;tr('cam','translate('+f1(Math.sin(t*61)*shake)+' '+f1(Math.cos(t*53)*shake)+')');
      for(let i=0;i<2;i++){const q=t*(1.1-i*.2)+i*2;tr('coin'+i,'translate(0 '+f1(Math.sin(q)*3)+') scale('+(.35+.65*Math.abs(Math.cos(q*.8))).toFixed(3)+' 1)')}

    } else {
      // A twelve-second story: countdown → press → ignition → liftoff → moon → reset.
      const press=bell(phase,.42,.46,.52),ignite=smooth(.45,.5,phase)*(1-smooth(.8,.86,phase));
      const lift=smooth(.52,.8,phase),back=smooth(.9,.99,phase);
      const rocketY=-560*lift*lift*(1-back);
      tr('rocket','translate('+f1(Math.sin(t*43)*ignite*(1-lift)*.8)+' '+f1(rocketY/2.2)+')');
      op('rocket',phase<.86?1:back);
      op('flame',ignite);tr('flame','scale('+(1+.12*Math.sin(t*28)).toFixed(3)+' '+(.7+.4*ignite+.2*Math.sin(t*31)).toFixed(3)+')');
      op('padglow',ignite*(1-lift*.7)*(.85+.15*Math.sin(t*25)));
      tr('arm','rotate('+f1(-38*smooth(.38,.46,phase)*(1-smooth(.9,.98,phase)))+' 1046 300)');
      tr('button','translate(0 '+f1(press*3)+')');
      // Liftoff celebration: both arms up, waving, with a little bounce.
      const cheer=smooth(.56,.62,phase)*(1-smooth(.84,.9,phase));
      tr('hand1','translate('+f1(press*26+bell(phase,.3,.4,.44)*14+cheer*(40+Math.sin(t*11)*5))+' '+f1(-press*6-cheer*(96+Math.sin(t*12)*7))+') rotate('+f1(cheer*(20+Math.sin(t*12)*12))+')');
      tr('hand2','translate('+f1(-cheer*(46+Math.sin(t*11+1)*5))+' '+f1(Math.max(0,Math.sin(t*3))*1.2*(1-cheer)-cheer*(92+Math.sin(t*12+1.4)*7))+') rotate('+f1(-cheer*(20+Math.sin(t*12+1)*12))+')');
      tr('cloud','translate(0 '+f1(-1+wave*1.1-cheer*Math.abs(Math.sin(t*8))*7)+') rotate('+f1(2+wave2*.7+pt.x*1.6+cheer*Math.sin(t*8)*3)+')');
      const shake=2.6*bell(phase,.47,.56,.72);cameraShake(s,Math.sin(t*61)*shake,Math.cos(t*53)*shake);
      const amount=smooth(.46,.52,phase)*(1-smooth(.82,.97,phase));
      // Remove the smoke layer from rendering between launches; only move visible puffs.
      attr(s,s.parts.puffs,'display',amount>0?'inline':'none');
      if(amount>0)for(let i=0;i<24;i++){
        const dir=i%2?1:-1,q=clamp((phase-.47-i*.005)/.42),reach=240+(i%6)*150;
        const opacity=.9*amount*(1-q*q)*(.55+(i%3)*.15);
        op('smoke'+i,opacity);if(opacity<.001)continue;
        const x=1120+dir*(20+q*reach*(1-.25*q)),y=404-18-q*(10+(i%4)*22)-Math.sin(i)*6,r=.35+q*(1.6+(i%3)*.6);
        tr('smoke'+i,'translate('+f1(x)+' '+f1(y)+') scale('+r.toFixed(3)+')');
      }
      const count=phase<.18?'STBY':phase<.26?'T-3':phase<.34?'T-2':phase<.42?'T-1':phase<.52?'IGN':phase<.82?'LIFT':'GG';
      if(s.count&&s.count.textContent!==count)s.count.textContent=count;
      op('flag',smooth(.8,.86,phase)*(1-smooth(.95,.99,phase)));
      op('beacon',Math.sin(t*4)>0?1:.2);op('crtglow',.55+.25*Math.sin(t*9)*Math.sin(t*3.1)+bell(phase,.42,.5,.6)*.3);op('crtled',Math.sin(t*3)>0?1:.3);op('walkieled',Math.sin(t*7)>.3||bell(phase,.3,.4,.5)>.2?1:.2);
      op('flood1',.8+.2*Math.sin(t*.9));op('flood2',.8+.2*Math.sin(t*1.1+1));
      tr('gaze','translate('+f1(lookX*.4+5+lift*4-press*3)+' '+f1(pt.y*2-lift*7+press*3)+')');
      eyeScale=1+lift*(1-back)*.2;
    }
    const shut=blink<.45;
    s.eyes.forEach((e,i)=>{
      const squint=i===0&&s.squint>.5;
      // Resting eye height is part of each character; it is a fixed shape, not a half-blink.
      const rest=s.role==='sniper'?.66:s.role==='research'?1:.78;
      attr(s,e,'transform','scale('+(eyeScale*.9+.1).toFixed(3)+' '+(eyeScale*rest).toFixed(3)+')');
      attr(s,e,'opacity',shut||squint?0:1);
      attr(s,s.shuts[i],'opacity',shut&&!squint?1:0);
      attr(s,s.squints[i],'opacity',squint?1:0);
    });
  }
  function shouldRun(){return !disposed&&!document.hidden&&[...instances].some(s=>s.visible)}
  function tick(now){
    raf=0;
    if(!shouldRun()){last=0;return}
    // Story time follows elapsed time, even on a phone delivering fewer frames.
    // sync() resets last when hidden or offscreen so suspension never advances the story.
    const dt=last?Math.max(0,(now-last)/1000):0;last=now;runningTime+=dt;
    for(const s of instances)if(s.visible)paint(s,runningTime+s.localTime,dt);
    raf=requestAnimationFrame(tick);
  }
  function sync(){if(shouldRun()&&!raf){last=0;raf=requestAnimationFrame(tick)}else if(!shouldRun()&&raf){cancelAnimationFrame(raf);raf=0;last=0}}
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const s=[...instances].find(s=>s.el===entry.target);if(s)s.visible=entry.isIntersecting}sync()},{rootMargin:'80px'});
  const focus={research:800,sniper:965,trader:800,launch:835};
  const minimumSpan={research:880,sniper:1000,trader:880,launch:1000};
  function mount(el,role='research'){
    if(!roles[role])throw new Error('Unknown cloud agent: '+role);
    el.innerHTML='<div class="cloud-camera" style="width:100%;height:100%">'+createSVG(role)+'</div>';el.classList.add('scene');
    const svg=el.querySelector('svg'),parts={};
    svg.setAttribute('width','100%');svg.setAttribute('height','100%');
    svg.querySelectorAll('[data-move]').forEach(n=>parts[n.dataset.move]=n);
    const s={el,svg,role,parts,eyes:[...svg.querySelectorAll('[data-eye]')],shuts:[...svg.querySelectorAll('[data-shut]')],squints:[...svg.querySelectorAll('[data-squint]')],shadow:parts.shadow,pnl:svg.querySelector('[data-text=pnl]'),hud:svg.querySelector('[data-text=hud]'),bigpnl:svg.querySelector('[data-text=bigpnl]'),bigstatus:svg.querySelector('[data-text=bigstatus]'),lives:[...svg.querySelectorAll('[data-live]')],books:[...svg.querySelectorAll('[data-book]')],liveStep:-1,squint:0,angle:0,count:svg.querySelector('[data-text=count]'),pnlStep:-1,
      attributes:new WeakMap(),camera:el.firstElementChild,cameraTransform:'none',sceneScale:1,tiles:[],cacheTimer:0,destroyed:false,seed:Object.keys(roles).indexOf(role)*1.9+.3,offset:roles[role].offset,localTime:0,visible:true,pointer:{x:0,y:0,tx:0,ty:0}};
    if(role==='launch'||role==='sniper')s.camera.style.willChange='transform';
    const tiles=new Map();
    svg.querySelectorAll('[data-vector-scale]').forEach(node=>{
      const source=node.getAttribute('href');let tile=tiles.get(source);
      if(!tile){tile={source,width:+node.getAttribute('width'),height:+node.getAttribute('height'),scale:+node.dataset.vectorScale,nodes:[],key:''};tiles.set(source,tile)}
      tile.nodes.push(node);
    });
    s.tiles=[...tiles.values()];
    const target=el.closest('[data-pointer-root]')||el;
    const move=e=>{if(e.pointerType==='touch')return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;s.pointer.tx=clamp((e.clientX-r.left)/r.width*2-1,-1,1);s.pointer.ty=clamp((e.clientY-r.top)/r.height*2-1,-1,1)};
    const leave=()=>{s.pointer.tx=0;s.pointer.ty=0};
    target.addEventListener('pointermove',move);target.addEventListener('pointerleave',leave);
    // Height stays fixed; wider windows reveal more of the world instead of zooming.
    const sizeScene=({width,height})=>{
      if(!width||!height)return;
      // Narrow screens aim the camera at each world's focal point instead of the dead centre.
      const naturalSpan=VH*width/height,span=Math.max(minimumSpan[role],naturalSpan),cx=naturalSpan>=1600?800:focus[role]+(800-focus[role])*clamp((naturalSpan-700)/900);
      s.sceneScale=Math.min(width/span,height/VH);
      attr(s,svg,'viewBox',[(cx-span/2).toFixed(1),0,span.toFixed(1),VH].join(' '));
      clearTimeout(s.cacheTimer);s.cacheTimer=setTimeout(()=>cacheVectorTiles(s),120);
    };
    // Establish a real viewport before the first paint, not only after an observer delivery.
    sizeScene(el.getBoundingClientRect());
    const resize=new ResizeObserver(entries=>sizeScene(entries[0].contentRect));resize.observe(el);
    instances.add(s);observer.observe(el);
    paint(s,runningTime);
    sync();
    s.destroy=()=>{s.destroyed=true;clearTimeout(s.cacheTimer);resize.disconnect();observer.unobserve(el);instances.delete(s);target.removeEventListener('pointermove',move);target.removeEventListener('pointerleave',leave);s.camera.remove();sync()};
    return {play(){const start=roles[role].period*(role==='sniper'?0:.12);s.localTime=start-runningTime-s.offset;paint(s,runningTime+s.localTime);sync()},
      destroy:s.destroy,
      svg(){return s.svg.outerHTML}
    };
  }
  document.addEventListener('visibilitychange',sync);
  function dispose(){
    disposed=true;sync();
    for(const s of [...instances])s.destroy();
    observer.disconnect();document.removeEventListener('visibilitychange',sync);
  }
  window.CloudAgents={version,mount,roles,dispose};
})();
