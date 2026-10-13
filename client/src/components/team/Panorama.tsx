"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FunctionReturnType } from 'convex/server';
import { Hexagon, Maximize2, Minus, Plus } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { api, usePaginatedQuery, useQuery } from '@/lib/convex';
import { viewAsAtom } from './state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { dexScreenerLogo } from '@/components/token/TokenAvatar';
import type { HomeData } from './data';
import { pct, signedSol } from './format';
import { DecisionDialog } from './Parts';
import s from './team.module.css';

export type PanoramaCoin = FunctionReturnType<typeof api.team.panorama>['page'][number];
type Coin = PanoramaCoin;
type Outcome = Coin['outcome'];
type Filter = 'all' | 'picked' | 'bought' | 'down';
export type Island = { id: string; name: string; x: number; y: number; radius: number; coins: { coin: Coin; x: number; y: number }[] };
type Engine = { sync: (islands: Island[], names: Map<string, string>, refit: boolean) => void; filter: (filter: Filter, hide: boolean) => void; zoom: (factor: number) => void; fit: () => void };
type Handlers = { more: () => void; open: (id: string) => void; hover: (id: string | null) => void };
/** A still render of the panorama (the invite card): no controls, the best coin pinned at `x`/`y` (fractions of the stage) at `zoom`, every coin drawn at full resolution, `data-ready` once all logos are in. */
export type PanoramaArt = { x: number; y: number; zoom: number };
type Node = { coin: Coin; x: number; y: number; tx: number; ty: number; base: number; born: number; sprite: HTMLCanvasElement | null; res: number; loading: number; logo?: string | null; used: number; sx: number; sy: number; size: number; lens: number };

const GAP = 60, PAGE = 200, LIMIT = 3000, COIN = 48, SMALL = 48, SPRITE = 128, BUDGET = 64 * 2 ** 20, LOADS = 12, TAU = Math.PI * 2;
const OUTCOME: Record<Outcome, string> = { down: 'Turned down', picked: 'Picked', held: 'Holding', won: 'Sold in profit', lost: 'Sold at a loss' };
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'picked', label: 'Picked' }, { id: 'bought', label: 'Bought' }, { id: 'down', label: 'Turned down' }];
const NONE: Record<Exclude<Filter, 'all'>, string> = { picked: 'No coin picked yet.', bought: 'Nothing bought yet.', down: 'Nothing turned down yet.' };
const matches = (coin: Coin, filter: Filter) => filter === 'all' || (filter === 'down' ? coin.outcome === 'down' : filter === 'picked' ? coin.outcome !== 'down' : coin.outcome === 'held' || coin.outcome === 'won' || coin.outcome === 'lost');
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** A coin's profit when it was bought: realised once sold, from the live mark while held. */
const profit = (coin: Coin) => coin.outcome === 'down' || coin.outcome === 'picked' ? null : coin.pnlSol;
/** Sold-in-profit rings are thicker and a brighter green than the money green, so winners read at a glance across thousands of coins. */
const WON = '#2fe486';

/** Hex rings around a centre: the centre first, then each ring in turn. */
function spiral(count: number) {
  const spots: [number, number][] = [[0, 0]];
  for (let ring = 1; spots.length < count; ring++) {
    let q = ring, r = 0;
    for (const [dq, dr] of [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]]) for (let i = 0; i < ring; i++) { spots.push([q, r]); q += dq; r += dr; }
  }
  return spots.slice(0, count).map(([q, r]) => ({ x: GAP * (q + r / 2), y: GAP * r * 0.866 }));
}

/** One honeycomb island per strategy (or one for everything): the coin that made the most in its middle, then newest verdicts outward; the biggest island sits in the centre and the rest are packed around it. */
export function layout(coins: Coin[], names: Map<string, string>, grouped: boolean): Island[] {
  const groups = new Map<string, Coin[]>();
  for (const coin of coins) { const key = grouped ? coin.strategyId : 'all', own = groups.get(key); if (own) own.push(coin); else groups.set(key, [coin]); }
  for (const own of groups.values()) {
    const top = own.reduce((best, coin, index) => (profit(coin) ?? 0) > (profit(own[best]) ?? 0) ? index : best, 0);
    if (top) own.unshift(...own.splice(top, 1));
  }
  const placed: Island[] = [];
  for (const [id, own] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const spots = spiral(own.length), radius = Math.max(...spots.map(spot => Math.hypot(spot.x, spot.y))) + GAP;
    let x = 0, y = 0;
    for (let step = 0; placed.length && step < 5000; step++) {
      const angle = step * 0.45, distance = 60 + step * 10;
      x = Math.cos(angle) * distance; y = Math.sin(angle) * distance;
      if (placed.every(other => Math.hypot(other.x - x, other.y - y) >= other.radius + radius + GAP * 0.8)) break;
    }
    placed.push({ id, name: grouped ? names.get(id) ?? 'Strategy' : '', x, y, radius, coins: own.map((coin, index) => ({ coin, x: x + spots[index].x, y: y + spots[index].y })) });
  }
  return placed;
}

/** Opens ResearchBot's panorama: every coin it checked, as islands you can move around. */
export function PanoramaButton({ data, strategyId }: { data: HomeData; strategyId?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Hexagon/>Panorama</Button>
    {open && <Dialog open onOpenChange={next => { if (!next) setOpen(false); }}>
      <DialogContent layout="panel" className="h-dvh max-h-dvh w-screen max-w-none rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] [&>[data-slot=dialog-close]]:top-[calc(1em+env(safe-area-inset-top))] sm:p-0 sm:[&>[data-slot=dialog-close]]:top-[1em] sm:h-[min(48rem,calc(100dvh-2rem))] sm:w-full sm:max-w-[min(76rem,calc(100vw-3rem))] sm:rounded-[1.5em]" aria-describedby={undefined}>
        <DialogTitle className="sr-only">ResearchBot’s panorama</DialogTitle>
        <Panorama data={data} strategyId={strategyId}/>
      </DialogContent>
    </Dialog>}
  </>;
}

function Panorama({ data, strategyId }: { data: HomeData; strategyId?: string }) {
  const as = useAtomValue(viewAsAtom), scope = { mode: data.workspace.mode, ...(strategyId ? { strategyId } : {}), ...as };
  const { results: history, status, loadMore } = usePaginatedQuery(api.team.panorama, scope, { initialNumItems: PAGE });
  // The coin that made the most is read on its own (pages arrive newest first); the panorama opens on it.
  const best = useQuery(api.team.panoramaBest, scope);
  // Historical pages stay cached across price ticks; the existing home subscription carries every open bag's live mark.
  const results = useMemo(() => {
    const bags = new Map(data.bags.map(bag => [bag.id, bag]));
    const coins = best && !history.some(coin => coin.id === best.id) ? [best, ...history] : history;
    return coins.map(coin => {
      const bag = bags.get(coin.id);
      return coin.outcome === 'held' && coin.entry && bag?.markPriceUsd
        ? { ...coin, pnlSol: coin.entry.sol * (bag.markPriceUsd / coin.entry.priceUsd - 1), pnlPct: (bag.markPriceUsd / coin.entry.priceUsd - 1) * 100 } : coin;
    });
  }, [history, best, data.bags]);
  const [filter, setFilter] = useState<Filter>('all'), [hideRest, setHideRest] = useState(false), [grouped, setGrouped] = useState(!strategyId), [hover, setHover] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null);
  // The decision loads once the pointer rests on a coin (or presses it), so its dialog opens without waiting.
  useQuery(api.team.item, hover ? { id: hover, ...as } : 'skip');
  const nameKey = data.strategies.map(row => row.id + '\u0000' + row.name).join('\u0001');
  const names = useMemo(() => new Map(nameKey ? nameKey.split('\u0001').map(row => row.split('\u0000') as [string, string]) : []), [nameKey]);
  const islands = useMemo(() => layout(results, names, grouped), [results, names, grouped]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(row => [row.id, results.filter(entry => matches(entry, row.id)).length])) as Record<Filter, number>, [results]);
  const more = () => { if (status === 'CanLoadMore' && results.length < LIMIT) loadMore(PAGE); };
  return <div className={s.panorama}>
    <header className={s.panoramaHead}>
      <div><h2>ResearchBot’s panorama</h2><small>{status === 'LoadingFirstPage' ? 'Loading coins…' : `${results.length.toLocaleString()} ${results.length === 1 ? 'coin' : 'coins'} checked${status === 'LoadingMore' ? ' · loading older' : ''}`}</small></div>
      <div className={s.panoramaControls}>
        <div className={s.panoramaSwitches}>
          {!strategyId && <label className={s.panoramaSwitch}><Switch checked={grouped} onCheckedChange={setGrouped} aria-label="Group coins into strategy islands"/>Islands</label>}
          <label className={s.panoramaSwitch}><Switch checked={hideRest} onCheckedChange={setHideRest} disabled={filter === 'all'} aria-label="Hide coins outside the filter"/>Hide others</label>
        </div>
        <div className={s.panoramaFilters} role="group" aria-label="Show">{FILTERS.map(row => <button key={row.id} type="button" className={s.panoramaFilter} aria-pressed={filter === row.id} data-filter={row.id} onClick={() => setFilter(row.id)}>{row.id !== 'all' && <i aria-hidden/>}{row.label}<b>{counts[row.id].toLocaleString()}</b></button>)}</div>
      </div>
    </header>
    {/* The first sync waits for the best coin, so the panorama opens on it instead of jumping there. */}
    <PanoramaStage islands={islands} names={names} grouped={grouped} filter={filter} hideRest={hideRest} ready={best !== undefined && status !== 'LoadingFirstPage'} onMore={more} onOpen={setOpen} onHover={setHover}>
      {status !== 'LoadingFirstPage' && !results.length && <p className={s.panoramaEmpty}>ResearchBot’s verdicts land here as it checks coins.</p>}
      {hideRest && filter !== 'all' && results.length > 0 && !counts[filter] && <p className={s.panoramaEmpty}>{NONE[filter]}</p>}
    </PanoramaStage>
    {open && <DecisionDialog id={open} onClose={() => setOpen(null)}/>}
  </div>;
}

/** The panorama's canvas and its overlays. The live panorama passes handlers; the invite card's still render passes `art` and gets no controls. */
export function PanoramaStage({ islands, names, grouped, filter = 'all', hideRest = false, ready = true, art, onMore, onOpen, onHover, children }: { islands: Island[]; names: Map<string, string>; grouped: boolean; filter?: Filter; hideRest?: boolean; ready?: boolean; art?: PanoramaArt; onMore?: () => void; onOpen?: (id: string) => void; onHover?: (id: string | null) => void; children?: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null), view = useRef<HTMLCanvasElement>(null), mini = useRef<HTMLCanvasElement>(null), card = useRef<HTMLDivElement>(null), live = useRef<HTMLParagraphElement>(null);
  const handlers = useRef<Handlers>({ more: () => {}, open: () => {}, hover: () => {} });
  useEffect(() => { handlers.current = { more: onMore ?? (() => {}), open: onOpen ?? (() => {}), hover: onHover ?? (() => {}) }; });
  // The engine draws every coin on one canvas outside React: each logo is pre-cut into a ringed sprite at the size it is drawn, a frame only stamps what is on screen, and it sleeps when nothing moves.
  const engine = useRef<Engine | null>(null);
  useEffect(() => {
    const root = stage.current, canvas = view.current, map = mini.current, info = card.current;
    const ctx = canvas?.getContext('2d'), mapCtx = map?.getContext('2d');
    if (!root || !canvas || !map || !info || !ctx || !mapCtx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches, styles = getComputedStyle(root), probe = document.createElement('canvas').getContext('2d')!, raster = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const color = (name: string, fallback: string) => { probe.fillStyle = fallback; const raw = styles.getPropertyValue(name).trim(); if (raw) probe.fillStyle = raw; return String(probe.fillStyle); };
    const theme = { surface: color('--popover', '#161618'), ink: color('--foreground', '#ececea'), muted: color('--muted-foreground', '#8d8d88'), font: styles.fontFamily,
      ring: { down: 'rgba(140,140,140,0.35)', picked: color('--ember', '#f47a38'), held: color('--ember', '#f47a38'), won: WON, lost: color('--destructive', '#f2555a') } as Record<Outcome, string> };
    const nodes = new Map<string, Node>(), grid = new Map<string, Node[]>(), cell = GAP * 3, moving = new Set<Node>(), queue: Node[] = [], cuts: { node: Node; logo: HTMLImageElement | null }[] = [], placeholders = new Map<Outcome, HTMLCanvasElement>();
    const ripples: { x: number; y: number; born: number }[] = [], cam = { x: 0, y: 0, z: 1 }, vel = { x: 0, y: 0 }, pointers = new Map<number, { x: number; y: number }>(), dots = document.createElement('canvas'), dotsCtx = dots.getContext('2d')!;
    let current: Island[] = [], labels = new Map<string, string>(), tally = new Map<string, number>(), shown: Filter = 'all', hide = false, fitted = false, newest = 0, maxProfit = 0, pointer: { x: number; y: number } | null = null, drag: { x: number; y: number; moved: number } | null = null, pinch = 0;
    let hot: Node | null = null, selected: Node | null = null, snap: Node | null = null, settling = false, frame = 0, running = false, dirty = true, mapDirty = true, dotsDirty = true, place = { k: 1, ox: 0, oy: 0 }, tickCount = 0, loads = 0, bytes = 0, dwell = 0, rest = 0, lastMove = 0, still = true, cardFor = '', cardBox = { w: 0, h: 0 };
    let w = root.clientWidth, h = root.clientHeight, dpr = window.devicePixelRatio || 1, drawn: Node[] = [];
    const focal = () => ({ x: art ? art.x * w : w / 2, y: art ? art.y * h : h / 2 });
    const wake = () => { if (!running) { running = true; frame = requestAnimationFrame(tick); } };
    const toWorld = (x: number, y: number) => ({ x: (x - w / 2) / cam.z + cam.x, y: (y - h / 2) / cam.z + cam.y });
    const toScreen = (x: number, y: number) => ({ x: (x - cam.x) * cam.z + w / 2, y: (y - cam.y) * cam.z + h / 2 });
    const near = (x0: number, y0: number, x1: number, y1: number) => { const found: Node[] = []; for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) { const bucket = grid.get(i + ',' + j); if (bucket) found.push(...bucket); } return found; };
    // A coin's sprite: its logo (or first letter) cut into a circle with the outcome ring baked in; turned-down coins are shaded.
    // Sprites live in memory, not on the GPU (stamping GPU canvases into the view costs a cross-context copy each, about three times the frame),
    // and are rasterised as they are cut, logo decode included, so that work lands inside the frame's cutting budget instead of on the sprite's first stamp.
    const cut = (outcome: Outcome, img: HTMLImageElement | null, symbol: string, size = SPRITE) => {
      const sprite = document.createElement('canvas'); sprite.width = sprite.height = size;
      const g = sprite.getContext('2d', { willReadFrequently: true })!, k = size / SPRITE, r = size / 2, inner = r - 8 * k;
      g.beginPath(); g.arc(r, r, inner, 0, TAU); g.fillStyle = theme.surface; g.fill(); g.globalAlpha = 0.1; g.fillStyle = theme.ink; g.fill(); g.globalAlpha = 1;
      if (img) { g.save(); g.beginPath(); g.arc(r, r, inner, 0, TAU); g.clip(); g.drawImage(img, r - inner, r - inner, inner * 2, inner * 2); g.restore(); }
      else if (symbol) { g.fillStyle = theme.muted; g.font = `600 ${Math.round(inner * 0.85)}px ${theme.font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(symbol.slice(0, 1).toUpperCase(), r, r + 3 * k); }
      if (outcome === 'down') { g.beginPath(); g.arc(r, r, inner, 0, TAU); g.globalAlpha = 0.42; g.fillStyle = theme.surface; g.fill(); g.globalAlpha = 1; }
      const ring = outcome === 'won' ? 11 : 6;
      g.lineWidth = ring * k; g.strokeStyle = theme.ring[outcome]; g.beginPath(); g.arc(r, r, r - (ring / 2 + 1) * k, 0, TAU); g.stroke();
      raster.drawImage(sprite, 0, 0, 1, 1);
      return sprite;
    };
    const placeholder = (outcome: Outcome) => { let sprite = placeholders.get(outcome); if (!sprite) { sprite = cut(outcome, null, ''); placeholders.set(outcome, sprite); } return sprite; };
    const drop = (node: Node) => { if (node.sprite) { bytes -= node.res ** 2 * 4; node.sprite = null; node.res = 0; } };
    // Logos load a dozen at a time, only for coins drawn on screen, small while zoomed out and full size up close: Mobula's first, then DexScreener's through the shared batched lookup, then a letter.
    const pump = () => {
      while (loads < LOADS && queue.length) {
        const node = queue.shift()!;
        if (tickCount - node.used > 2) { node.loading = 0; continue; }
        if (node.logo === null) { cuts.push({ node, logo: null }); continue; }
        loads++;
        const img = new Image();
        let fellBack = node.logo !== undefined;
        const done = (logo: HTMLImageElement | null) => { loads--; node.logo = logo ? img.src : null; cuts.push({ node, logo }); pump(); wake(); };
        img.onload = () => done(img);
        img.onerror = () => { if (fellBack) return done(null); fellBack = true; void dexScreenerLogo(node.coin.address).then(url => { if (url) img.src = url; else done(null); }); };
        const first = node.logo ?? node.coin.logoUri;
        if (first) img.src = first; else img.onerror(new Event('error'));
      }
    };
    const request = (node: Node, size: number) => { if (!node.loading) { node.loading = size; queue.push(node); pump(); } };
    const bounds = () => ({ l: Math.min(...current.map(i => i.x - i.radius)), r: Math.max(...current.map(i => i.x + i.radius)), t: Math.min(...current.map(i => i.y - i.radius)), b: Math.max(...current.map(i => i.y + i.radius)) });
    const fit = () => {
      if (!current.length) return;
      const box = bounds();
      cam.x = (box.l + box.r) / 2; cam.y = (box.t + box.b) / 2; cam.z = clamp(Math.min(w / (box.r - box.l + 80), h / (box.b - box.t + 120)), 0.25, 1.4);
      vel.x = vel.y = 0; snap = null; selected = null; dirty = mapDirty = true; wake();
    };
    // Opening: the coin that made the most sits at the focal point (the middle, or the art's spot), focused with its card, close enough to read the logos.
    const focusBest = () => {
      let top: Node | null = null;
      for (const node of nodes.values()) if ((profit(node.coin) ?? 0) > (top ? profit(top.coin) ?? 0 : 0)) top = node;
      if (!top) return false;
      const z = art?.zoom ?? 1, f = focal();
      cam.z = z; cam.x = top.tx - (f.x - w / 2) / z; cam.y = top.ty - (f.y - h / 2) / z;
      vel.x = vel.y = 0; snap = null; selected = top; dirty = mapDirty = true; wake();
      return true;
    };
    const zoomAt = (factor: number, sx: number, sy: number) => {
      const z = clamp(cam.z * factor, 0.25, 2.4), mx = sx - w / 2, my = sy - h / 2;
      cam.x += mx / cam.z - mx / z; cam.y += my / cam.z - my / z; cam.z = z; dirty = mapDirty = true; wake();
    };
    // Each island's label counts the coins the filter shows.
    const recount = () => { tally = new Map(current.map(island => [island.id, shown === 'all' ? island.coins.length : island.coins.filter(entry => matches(entry.coin, shown)).length])); };
    const sync = (next: Island[], names: Map<string, string>, refit: boolean) => {
      current = next; labels = names; grid.clear();
      const seen = new Set<string>(), top = Math.max(0, ...next.flatMap(island => island.coins.map(entry => entry.coin.at)));
      maxProfit = Math.max(0, ...next.flatMap(island => island.coins.map(entry => entry.coin.outcome === 'down' ? 0 : Math.abs(entry.coin.pnlSol ?? 0))));
      for (const island of next) for (const { coin, x, y } of island.coins) {
        seen.add(coin.id);
        let node = nodes.get(coin.id);
        if (!node) {
          // A verdict newer than anything shown drops into its island's middle with a ripple; older pages slide in quietly at the edges.
          const fresh = fitted && coin.at > newest && !reduced;
          node = { coin, x, y, tx: x, ty: y, base: 1, born: fresh ? performance.now() : 0, sprite: null, res: 0, loading: 0, used: 0, sx: 0, sy: 0, size: 0, lens: 0 };
          nodes.set(coin.id, node);
          if (fresh) ripples.push({ x: island.x, y: island.y, born: performance.now() });
        }
        if (node.coin.outcome !== coin.outcome) drop(node);
        const moved = node.tx !== x || node.ty !== y;
        node.coin = coin; node.tx = x; node.ty = y;
        if (reduced) { node.x = x; node.y = y; } else if (moved || node.born) moving.add(node);
        // Bought coins grow with how much they made or lost.
        node.base = maxProfit > 0 && coin.outcome !== 'down' && coin.pnlSol != null ? 1 + 0.8 * Math.min(1, Math.abs(coin.pnlSol) / maxProfit) : 1;
        const key = Math.floor(x / cell) + ',' + Math.floor(y / cell), bucket = grid.get(key);
        if (bucket) bucket.push(node); else grid.set(key, [node]);
      }
      for (const [id, node] of nodes) if (!seen.has(id)) { drop(node); nodes.delete(id); moving.delete(node); }
      newest = Math.max(newest, top); recount(); dirty = mapDirty = dotsDirty = true;
      if ((!fitted || refit) && next.length) { fitted = true; if (!focusBest()) fit(); }
      wake();
    };
    const hitAt = (sx: number, sy: number) => { let best: Node | null = null, distance = Infinity; for (const node of drawn) { if (!matches(node.coin, shown)) continue; const d = Math.hypot(node.sx - sx, node.sy - sy); if (d < node.size / 2 && d < distance) { best = node; distance = d; } } return best; };
    const nearestTo = (x: number, y: number) => { let best: Node | null = null, distance = Infinity; for (const node of nodes.values()) { if (!matches(node.coin, shown)) continue; const d = Math.hypot(node.tx - x, node.ty - y); if (d < distance) { best = node; distance = d; } } return best; };
    const describe = (node: Node | null) => {
      if (!node) { if (cardFor) { info.dataset.on = ''; cardFor = ''; } return; }
      if (cardFor !== node.coin.id) {
        const { coin } = node, [name, tag, made, meta, why] = Array.from(info.children) as HTMLElement[], [amount, share] = Array.from(made.children) as HTMLElement[], pnl = profit(coin);
        name.textContent = coin.symbol; tag.textContent = OUTCOME[coin.outcome]; tag.dataset.outcome = coin.outcome;
        made.hidden = pnl == null; made.dataset.tone = pnl == null ? '' : pnl >= 0 ? 'up' : 'down';
        amount.textContent = pnl == null ? '' : signedSol(pnl); share.textContent = coin.pnlPct == null ? '' : pct(coin.pnlPct);
        meta.textContent = [labels.get(coin.strategyId), coin.fit != null ? `fit ${coin.fit}` : null].filter(Boolean).join(' · ');
        why.textContent = coin.reason ?? ''; info.dataset.on = 'true'; cardFor = coin.id; cardBox = { w: info.offsetWidth, h: info.offsetHeight };
        if (node === selected && live.current) live.current.textContent = `${coin.symbol}, ${OUTCOME[coin.outcome]}${pnl == null ? '' : `, ${signedSol(pnl)}`}`;
      }
      // Under the coin, centred on it (above when there is no room below), its caret pointing at the logo.
      const x = clamp(node.sx - cardBox.w / 2, 8, w - cardBox.w - 8), below = node.sy + node.size / 2 + 12 + cardBox.h <= h - 8;
      const y = below ? node.sy + node.size / 2 + 12 : Math.max(8, node.sy - node.size / 2 - 12 - cardBox.h);
      info.dataset.side = below ? 'below' : 'above'; info.style.setProperty('--caret', `${clamp(node.sx - x, 18, cardBox.w - 18)}px`);
      info.style.transform = `translate(${x}px,${y}px)`;
    };
    const paint = (node: Node) => {
      ctx.globalAlpha = matches(node.coin, shown) ? 1 : 0.1;
      if (node.size < 7) { ctx.fillStyle = theme.ring[node.coin.outcome]; ctx.fillRect(node.sx - node.size / 2, node.sy - node.size / 2, node.size, node.size); return; }
      // A coin the lens enlarges sharpens once the pointer rests, so sweeping across the map never reloads the logos it passes.
      const need = art || node.size * dpr > SMALL ? SPRITE : SMALL;
      if (node.res < need && (!node.sprite || still || node.lens < 0.05)) request(node, need);
      ctx.drawImage(node.sprite ?? placeholder(node.coin.outcome), node.sx - node.size / 2, node.sy - node.size / 2, node.size, node.size);
    };
    const tick = (now: number) => {
      let active = false; tickCount++; still = now - lastMove > 120;
      // Logos that arrived are cut a few milliseconds' worth a frame, so a burst of big images never stalls a drag or a zoom.
      for (const start = performance.now(); cuts.length && performance.now() - start < 4;) {
        const { node, logo } = cuts.shift()!;
        if (nodes.get(node.coin.id) !== node || !node.loading) continue;
        drop(node); node.sprite = cut(node.coin.outcome, logo, node.coin.symbol, node.loading); node.res = node.loading; node.loading = 0; bytes += node.res ** 2 * 4; dirty = true;
      }
      if (!drag && !reduced && Math.hypot(vel.x, vel.y) > 0.02) { cam.x += vel.x; cam.y += vel.y; vel.x *= 0.92; vel.y *= 0.92; active = mapDirty = true; }
      // Snap: once a flick slows down, the coin nearest the middle glides to the centre and shows its card.
      if (settling && !drag && Math.hypot(vel.x, vel.y) < 0.4) { snap = nearestTo(cam.x, cam.y); settling = false; }
      if (snap) { const t = reduced ? 1 : 0.18; cam.x += (snap.tx - cam.x) * t; cam.y += (snap.ty - cam.y) * t; active = mapDirty = true; if (Math.hypot(snap.tx - cam.x, snap.ty - cam.y) < 0.5) { selected = snap; snap = null; } }
      for (const node of moving) {
        node.x += (node.tx - node.x) * 0.14; node.y += (node.ty - node.y) * 0.14;
        if (Math.abs(node.tx - node.x) < 0.3 && Math.abs(node.ty - node.y) < 0.3 && (!node.born || now - node.born > 650)) { node.x = node.tx; node.y = node.ty; node.born = 0; moving.delete(node); } else active = true;
      }
      if (active || dirty || ripples.length) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        // Apple Watch lens: coins near the cursor (or the middle on touch) grow and push their neighbours out, and shrink toward the edges.
        const fx = pointer?.x ?? focal().x, fy = pointer?.y ?? focal().y, sigma = 115, a = toWorld(-80, -80), b = toWorld(w + 80, h + 80), lensed: Node[] = [];
        drawn = [];
        let best: Node | null = null, bestDistance = Infinity;
        for (const node of near(a.x, a.y, b.x, b.y)) {
          if (hide && !matches(node.coin, shown)) continue;
          const px = (node.x - cam.x) * cam.z + w / 2, py = (node.y - cam.y) * cam.z + h / 2, dx = px - fx, dy = py - fy, lens = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          node.sx = fx + dx * (1 + 0.5 * lens); node.sy = fy + dy * (1 + 0.5 * lens); node.lens = lens; node.used = tickCount;
          const edge = clamp(Math.min(node.sx, w - node.sx, node.sy, h - node.sy) / 90, 0, 1), pop = node.born ? clamp((now - node.born) / 650, 0, 1) : 1;
          node.size = COIN * 0.72 * cam.z * node.base * (1 + 1.1 * lens) * (0.3 + 0.7 * edge) * (pop < 1 ? 1 + 2.7 * (pop - 1) ** 3 + 1.7 * (pop - 1) ** 2 : 1);
          if (node.size <= 0.5) continue;
          drawn.push(node);
          if (lens > 0.05) lensed.push(node); else paint(node);
          if (pointer && !drag && matches(node.coin, shown)) { const d = Math.hypot(node.sx - pointer.x, node.sy - pointer.y); if (d < node.size / 2 && d < bestDistance) { best = node; bestDistance = d; } }
        }
        lensed.sort((m, n) => m.lens - n.lens).forEach(paint);
        ctx.globalAlpha = 1;
        const focus = best ?? (drag ? null : selected);
        if (focus && focus.size >= 7) { ctx.lineWidth = 2; ctx.strokeStyle = theme.ink; ctx.beginPath(); ctx.arc(focus.sx, focus.sy, focus.size / 2 + 3, 0, TAU); ctx.stroke(); }
        if (current.length > 1 || current[0]?.name) {
          ctx.font = `600 13px ${theme.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (const island of current) {
            const count = tally.get(island.id) ?? island.coins.length;
            if (!island.name || (hide && !count)) continue;
            const at = toScreen(island.x, island.y - island.radius), label = `${island.name} · ${count.toLocaleString()}`, width = ctx.measureText(label).width + 22;
            ctx.globalAlpha = clamp(1.35 - cam.z, 0.35, 1); ctx.fillStyle = theme.surface; ctx.beginPath(); ctx.roundRect(at.x - width / 2, at.y - 30, width, 26, 13); ctx.fill();
            ctx.fillStyle = theme.ink; ctx.fillText(label, at.x, at.y - 17);
          }
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
          const ripple = ripples[i], t = (now - ripple.born) / 1000;
          if (t >= 1) { ripples.splice(i, 1); continue; }
          const at = toScreen(ripple.x, ripple.y);
          ctx.globalAlpha = 1 - t; ctx.lineWidth = 2; ctx.strokeStyle = theme.ring.picked; ctx.beginPath(); ctx.arc(at.x, at.y, cam.z * (20 + t * 110), 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // The decision under the pointer loads once it rests there, so a sweep across the map subscribes to nothing.
        if (hot !== best) { hot = best; root.style.cursor = best && !drag ? 'pointer' : ''; window.clearTimeout(dwell); if (best) { const id = best.coin.id; dwell = window.setTimeout(() => handlers.current.hover(id), 150); } }
        describe(focus);
        // Older coins sit at the islands' edges: page them in once an edge comes into view.
        if (current.some(island => { const cx = clamp(island.x, a.x, b.x), cy = clamp(island.y, a.y, b.y); return Math.hypot(cx - island.x, cy - island.y) < island.radius && ![[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y]].every(([x, y]) => Math.hypot(x - island.x, y - island.y) < island.radius - 2 * GAP); })) handlers.current.more();
        // Past the memory budget the logos off screen longest go first; nothing on screen is ever dropped.
        if (bytes > BUDGET) { const old: Node[] = []; for (const node of nodes.values()) if (node.sprite && node.used < tickCount) old.push(node); old.sort((m, n) => m.used - n.used); for (const node of old) { if (bytes <= BUDGET * 0.8) break; drop(node); } }
        dirty = false;
        // The still render is ready once every coin on screen has its full-size logo (or its letter) and nothing is loading.
        if (art && current.length && !loads && !queue.length && !cuts.length && drawn.every(node => node.size < 7 || node.res >= SPRITE)) root.dataset.ready = 'true';
      }
      if (mapDirty && current.length) {
        const cw = map.width, ch = map.height;
        // The dots only change with the coins or the filter; moving just redraws the frame over them.
        if (dotsDirty) {
          const box = bounds(), k = Math.min(cw / (box.r - box.l), ch / (box.b - box.t)) * 0.9;
          place = { k, ox: cw / 2 - (box.l + box.r) / 2 * k, oy: ch / 2 - (box.t + box.b) / 2 * k }; dots.width = cw; dots.height = ch;
          for (const node of nodes.values()) { const match = matches(node.coin, shown); if (hide && !match) continue; dotsCtx.globalAlpha = match ? 1 : 0.2; dotsCtx.fillStyle = theme.ring[node.coin.outcome]; dotsCtx.fillRect(place.ox + node.tx * place.k - 1.5, place.oy + node.ty * place.k - 1.5, 3, 3); }
          dotsDirty = false;
        }
        const a = toWorld(0, 0), b = toWorld(w, h), { k, ox, oy } = place;
        mapCtx.clearRect(0, 0, cw, ch); mapCtx.drawImage(dots, 0, 0);
        mapCtx.strokeStyle = theme.ink; mapCtx.lineWidth = 2; mapCtx.strokeRect(ox + a.x * k, oy + a.y * k, (b.x - a.x) * k, (b.y - a.y) * k);
        mapDirty = false;
      }
      if (active || snap || settling || ripples.length || cuts.length) frame = requestAnimationFrame(tick); else running = false;
    };
    const size = () => { w = root.clientWidth; h = root.clientHeight; dpr = window.devicePixelRatio || 1; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); dirty = mapDirty = true; if (!running) wake(); };
    const local = (event: PointerEvent) => { const box = root.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('button, [data-panorama-map]')) return;
      try { root.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
      const at = local(event); pointers.set(event.pointerId, at);
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = Math.hypot(p.x - q.x, p.y - q.y); drag = null; return; }
      drag = { ...at, moved: 0 }; vel.x = vel.y = 0; snap = null; settling = false;
      // On touch there is no hover: load the decision under the finger as it goes down.
      const under = hitAt(at.x, at.y); if (under) handlers.current.hover(under.coin.id);
      wake();
    };
    const move = (event: PointerEvent) => {
      const at = local(event);
      if (event.pointerType === 'mouse') { pointer = at; lastMove = performance.now(); dirty = true; wake(); window.clearTimeout(rest); rest = window.setTimeout(() => { dirty = true; wake(); }, 150); }
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, at);
      if (pointers.size === 2 && pinch) { const [p, q] = [...pointers.values()], distance = Math.hypot(p.x - q.x, p.y - q.y); zoomAt(distance / pinch, (p.x + q.x) / 2, (p.y + q.y) / 2); pinch = distance; return; }
      if (!drag) return;
      const dx = at.x - drag.x, dy = at.y - drag.y; drag.moved += Math.hypot(dx, dy); drag.x = at.x; drag.y = at.y;
      if (drag.moved > 6) root.dataset.drag = 'true';
      vel.x = -dx / cam.z; vel.y = -dy / cam.z; cam.x += vel.x; cam.y += vel.y; dirty = mapDirty = true; wake();
    };
    const up = (event: PointerEvent) => {
      const at = pointers.get(event.pointerId) ?? local(event);
      pointers.delete(event.pointerId); if (pointers.size < 2) pinch = 0;
      if (!drag) return;
      const tapped = drag.moved < 6;
      drag = null; delete root.dataset.drag;
      // A tap or click opens the coin under it, mouse or finger.
      if (tapped) { const target = hitAt(at.x, at.y); if (target) { selected = target; handlers.current.open(target.coin.id); } dirty = true; wake(); return; }
      selected = null; settling = true; wake();
    };
    const leave = () => { pointer = null; dirty = true; wake(); };
    const wheel = (event: WheelEvent) => { event.preventDefault(); const box = root.getBoundingClientRect(); zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX - box.left, event.clientY - box.top); snap = null; };
    const key = (event: KeyboardEvent) => {
      const step = 80 / cam.z, moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[event.key]) { event.preventDefault(); cam.x += moves[event.key][0]; cam.y += moves[event.key][1]; selected = null; settling = true; dirty = mapDirty = true; wake(); }
      else if (event.key === '+' || event.key === '=') zoomAt(1.25, w / 2, h / 2);
      else if (event.key === '-') zoomAt(0.8, w / 2, h / 2);
      else if (event.key === '0') fit();
      else if (event.key === 'Enter' && selected) handlers.current.open(selected.coin.id);
    };
    map.onclick = event => { const box = map.getBoundingClientRect(), { k, ox, oy } = place; cam.x = ((event.clientX - box.left) / box.width * map.width - ox) / k; cam.y = ((event.clientY - box.top) / box.height * map.height - oy) / k; vel.x = vel.y = 0; snap = null; selected = null; settling = true; dirty = mapDirty = true; wake(); };
    const resize = new ResizeObserver(size); resize.observe(root); size();
    root.addEventListener('pointerdown', down); root.addEventListener('pointermove', move); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up); root.addEventListener('pointerleave', leave);
    root.addEventListener('wheel', wheel, { passive: false }); root.addEventListener('keydown', key);
    engine.current = { sync, filter: (next, rest) => { shown = next; hide = rest && next !== 'all'; recount(); dirty = mapDirty = dotsDirty = true; wake(); }, zoom: factor => { zoomAt(factor, w / 2, h / 2); snap = null; }, fit };
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(dwell); window.clearTimeout(rest); resize.disconnect(); queue.length = cuts.length = 0; map.onclick = null;
      root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up); root.removeEventListener('pointerleave', leave);
      root.removeEventListener('wheel', wheel); root.removeEventListener('keydown', key);
      engine.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- a stage is either a still render or the live panorama for its whole life
  const regroup = useRef(grouped);
  useEffect(() => { if (!ready) return; engine.current?.sync(islands, names, regroup.current !== grouped); regroup.current = grouped; }, [islands, names, grouped, ready]);
  useEffect(() => { engine.current?.filter(filter, hideRest); }, [filter, hideRest]);
  return <div ref={stage} className={s.panoramaStage} data-art={art ? true : undefined} tabIndex={art ? -1 : 0} role="application" aria-label="Coin panorama. Drag or use the arrow keys to move, plus and minus to zoom, zero to see everything, Enter to open the centred coin.">
    <canvas ref={view} className={s.panoramaCanvas}/>
    {children}
    <div ref={card} className={s.panoramaCard} aria-hidden><b/><span/><strong><i/><em/></strong><small/><p/></div>
    {!art && <div className={s.panoramaZoom}>
      <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom in" onClick={() => engine.current?.zoom(1.3)}><Plus/></Button>
      <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom out" onClick={() => engine.current?.zoom(0.77)}><Minus/></Button>
      <Button type="button" variant="outline" size="icon-sm" aria-label="See everything" onClick={() => engine.current?.fit()}><Maximize2/></Button>
    </div>}
    <canvas ref={mini} data-panorama-map className={s.panoramaMini} hidden={Boolean(art)} width={320} height={216} aria-label="Map of every island; click to jump there"/>
    {!art && <p className={s.panoramaHint} aria-hidden>Drag to move · Scroll to zoom · Click a coin</p>}
    <p ref={live} className="sr-only" aria-live="polite"/>
  </div>;
}
