"use client";
import { Fragment, memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, ArrowUpDown, Check, ChevronRight, Copy, ExternalLink, Info, LoaderCircle, Mail, Plus, Search, Shield as ShieldIcon, ShieldCheck, ThumbsUp, Trash2, TriangleAlert, X } from 'lucide-react';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { change, type Bag, type HomeData, type StrategyRow, type Trade } from './data';
import type { Card as PortfolioCard } from './Portfolios';
import { ProfitSpark, SparkBackdrop } from './ProfitSpark';
import { ago, appHref, pct, signedSol, sol, solscan, tone } from './format';
import { AtLimit, useStrategyLimit } from './Limits';
import { checkCoinAtom, coinLookAtom, seenTipsAtom, settingSpotAtom, useCommand, viewedAtom } from './state';
import { SETTINGS_GUIDE, isSettingId } from '../../../../types/settingsGuide';
import { SignedPercentText } from './SignedPercentText';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { formatTokenPrice, type PriceUnit } from '@/lib/chartUnits';
import type { TraderStatus } from '../../../../types/team';
import { STALE_PRICE_MS, costSol, openProfit } from '../../../../types/home';
import s from './team.module.css';
import { Link, type BackLink } from '@/lib/appNavigation';

const mounted = () => true, unmounted = () => false, noop = () => () => {};
/** The current time, ticking; 0 during server rendering so time-based markup never mismatches on hydration. */
export function useNow(every = 15_000) {
  const client = useSyncExternalStore(noop, mounted, unmounted);
  const [now, setNow] = useState(0);
  useEffect(() => { const tick = () => setNow(Date.now()); const timer = setInterval(tick, every); tick(); return () => clearInterval(timer); }, [every]);
  return client && now ? now : 0;
}

/** A figure with its meaning on hover or focus: what the number is and what moves it. The trigger is focusable so keyboards reach it too. A touch
 *  screen never opens a tooltip, so there a tap on the figure opens the same words. Inside a button or a link a tap belongs to that control, so
 *  there an (i) inside the hint takes it instead; React passes a portal's click up to them, so the (i), a span, and the popover keep their taps to
 *  themselves. */
export function Hint({ text, className, children }: { text: ReactNode; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLSpanElement>(null);
  const tap = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (!matchMedia('(hover: none)').matches || event.currentTarget.parentElement?.closest('a, button, [role=button]')) return;
    setOpen(value => !value);
  };
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip><PopoverAnchor asChild><TooltipTrigger asChild><span ref={anchor} tabIndex={0} className={`${s.hint} ${className ?? ''}`} onClick={tap}>{children}
      <PopoverTrigger asChild><Button asChild variant="ghost" size="icon-xs" className={s.hintTap}>
        <span role="button" aria-label="What this means" onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(value => !value); }}><Info/></span>
      </Button></PopoverTrigger>
    </span></TooltipTrigger></PopoverAnchor><TooltipContent sideOffset={6} className="max-w-[17rem] leading-snug">{text}</TooltipContent></Tooltip>
    <PopoverContent side="top" className="max-w-[17rem] text-sm leading-snug" onClick={event => event.stopPropagation()}
      onInteractOutside={event => { if (anchor.current?.contains(event.target as Node)) event.preventDefault(); }}>{text}</PopoverContent>
  </Popover>;
}

/** The tip on screen, by instance: one tip can sit on two controls (HOTBOT's disc on desktop, the phone bar's button), and only one tip shows at a time. */
const tipAtom = atom<string | null>(null);
/** A one-time tip beside a real control. It opens once the control is on screen and no other tip is open. It stays until Got it, Escape or a use of the
 *  control, and then this device never shows it again. A click elsewhere leaves it open. No tips while an admin views someone else's team. */
export function FirstTip({ id, anchor, title, text, when = true, side = 'top', align = 'center' }: { id: string; anchor: RefObject<HTMLElement | null>; title: string; text: ReactNode; when?: boolean; side?: 'top' | 'right' | 'bottom' | 'left'; align?: 'start' | 'center' | 'end' }) {
  const key = useId(), [seen, setSeen] = useAtom(seenTipsAtom), [shown, setShown] = useAtom(tipAtom), viewed = useAtomValue(viewedAtom);
  const due = when && !viewed && !(Array.isArray(seen) && seen.includes(id));
  useEffect(() => {
    if (!due || shown) return;
    // After the page settles, so the tip lands beside the control and not where it sat mid-layout.
    const timer = setTimeout(() => { if (anchor.current?.getClientRects().length) setShown(current => current ?? key); }, 800);
    return () => clearTimeout(timer);
  }, [due, shown, anchor, key, setShown]);
  // A tip that stops being due (another page, a hidden control) or leaves frees the slot unseen, so it shows another time.
  useEffect(() => { if (!due) setShown(current => current === key ? null : current); }, [due, key, setShown]);
  useEffect(() => () => setShown(current => current === key ? null : current), [key, setShown]);
  const done = () => { setSeen(list => Array.isArray(list) && !list.includes(id) ? [...list, id] : list); setShown(null); };
  return <Popover open={shown === key} onOpenChange={open => { if (!open) done(); }}>
    <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>}/>
    <PopoverContent side={side} align={align} sideOffset={10} className={s.tip} onOpenAutoFocus={event => event.preventDefault()}
      onInteractOutside={event => { if (!anchor.current?.contains(event.target as Node)) event.preventDefault(); }}>
      <b><BotAvatar role="coordinator" size={18}/>{title}</b>
      <p>{text}</p>
      <Button size="xs" variant="secondary" onClick={done}>Got it</Button>
    </PopoverContent>
  </Popover>;
}

/** How a number field reads: dollars, minutes and seconds compact ($20K, 2h, 5m) until focused, then the plain number for the phone's number pad. */
export type NumKind = 'usd' | 'pct' | 'min' | 'sec' | 'x' | 'sol' | 'count';
const short = (n: number) => n >= 1e9 ? +(n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? +(n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K' : String(+n.toFixed(2));
export const minutesText = (n: number) => n < 60 ? `${Math.round(n)}m` : n < 2880 ? `${+(n / 60).toFixed(1)}h` : `${+(n / 1440).toFixed(1)}d`;
/** A value as a field shows it at rest. */
export const numText = (kind: NumKind, n: number) => kind === 'usd' ? short(n) : kind === 'min' ? minutesText(n) : kind === 'sec' ? n % 60 ? `${Math.round(n)}s` : minutesText(n / 60) : String(+n.toFixed(kind === 'sol' ? 3 : 2));
const typed = (kind: NumKind, n: number) => kind === 'usd' || kind === 'min' || kind === 'sec' ? String(Math.round(n * 100) / 100) : numText(kind, n);
/** What someone typed: 20k, 1.5m and $20,000 for dollars; 90, 1.5h and 2d for minutes; 30, 5m and 1h for seconds; a plain number otherwise. */
function parse(kind: NumKind, text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[$,\s%×+]|sol/g, '');
  const match = kind === 'min' ? /^(\d*\.?\d+)(m|h|d)?$/.exec(t) : kind === 'sec' ? /^(\d*\.?\d+)(s|m|h)?$/.exec(t) : /^(\d*\.?\d+)(k|m|b)?$/.exec(t);
  if (!match) return null;
  const unit = match[2] ? kind === 'min' ? { m: 1, h: 60, d: 1440 }[match[2]] : kind === 'sec' ? { s: 1, m: 60, h: 3600 }[match[2]] : kind === 'usd' ? { k: 1e3, m: 1e6, b: 1e9 }[match[2]] : null : 1;
  return unit ? Number(match[1]) * unit : null;
}
/** A number edited where it stands: click or tap, type, Enter. Arrow keys step through `steps`; Escape or a value it can't read keeps the old one;
 *  anything outside `min`–`max` is pulled inside. Its unit sits outside the field, in the words around it. */
export type NumProps = { value: number; kind: NumKind; onChange: (n: number) => void; label: string; min?: number; max?: number; steps?: number[]; integer?: boolean; big?: boolean; autoFocus?: boolean };
export function Num({ value, kind, onChange, label, min = 0, max = Infinity, steps, integer, big, autoFocus }: NumProps) {
  const [text, setText] = useState<string | null>(null), cancel = useRef(false);
  const shown = text ?? numText(kind, value);
  const fit = (n: number) => Math.min(max, Math.max(min, integer ? Math.round(n) : Math.round(n * 1e6) / 1e6));
  const commit = () => {
    if (cancel.current || text === null) { cancel.current = false; return; }
    const n = parse(kind, text);
    if (n !== null && Number.isFinite(n) && fit(n) !== value) onChange(fit(n));
  };
  const step = (up: boolean) => {
    const next = up ? steps?.find(n => n > value + 1e-9) : steps?.slice().reverse().find(n => n < value - 1e-9);
    if (next === undefined) return;
    onChange(fit(next));
    setText(typed(kind, fit(next)));
  };
  return <input className={s.num} data-big={big || undefined} type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" spellCheck={false} aria-label={label} autoFocus={autoFocus} value={shown}
    style={{ '--chars': Math.max(1, shown.length) } as CSSProperties}
    onFocus={event => { setText(typed(kind, value)); const field = event.currentTarget; requestAnimationFrame(() => { if (document.activeElement === field) field.select(); }); }}
    onChange={event => setText(event.target.value)}
    onBlur={() => { commit(); setText(null); }}
    onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur();
      else if (event.key === 'Escape') { cancel.current = true; event.currentTarget.blur(); }
      else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && steps) { event.preventDefault(); step(event.key === 'ArrowUp'); }
    }}/>;
}

const PHONE = '(max-width: 48rem)';
const onPhoneChange = (callback: () => void) => { const list = matchMedia(PHONE); list.addEventListener('change', callback); return () => list.removeEventListener('change', callback); };
/** Matches the stylesheet's phone breakpoint; server rendering and hydration start with a desktop snapshot. */
export function usePhone() { return useSyncExternalStore(onPhoneChange, () => matchMedia(PHONE).matches, () => false); }

/** Measures the page area's column breakpoint in a layout effect and tracks subsequent resizes. */
export function useTwoColumns(minRem = 50) {
  const [page, setPage] = useState<HTMLDivElement | null>(null), [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const area = page?.parentElement;
    if (!area) return;
    const measure = () => setWide(area.clientWidth >= minRem * parseFloat(getComputedStyle(document.documentElement).fontSize));
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    measure();
    return () => observer.disconnect();
  }, [page, minRem]);
  return [setPage, wide] as const;
}

const shortAddress = (value: string) => value.slice(0, 5) + '…' + value.slice(-5);
/** A copyable address or id: label, the value shortened, the whole value in its tooltip. Its click stays off any link around it. */
function useCopy(value: string) {
  const [copied, setCopied] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { toast.error('Could not copy address'); }
  }
  return [copied, copy] as const;
}
export function AddressChip({ label, address }: { label: string; address: string }) {
  const [copied, copy] = useCopy(address);
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="link" size="xs" className={s.addressChip} data-copied={copied || undefined} aria-label={`Copy ${label === 'CA' ? 'contract address' : label} ${address}`} onClick={event => { event.preventDefault(); event.stopPropagation(); void copy(); }}>
    <span>{label}</span><code>{shortAddress(address)}</code><span className={s.copyIcon}><Copy/><Check/></span><span className="sr-only" role="status">{copied ? 'Copied' : ''}</span>
  </Button></TooltipTrigger><TooltipContent sideOffset={6}><span className={s.addressTooltip}>{copied ? 'Copied' : address}</span></TooltipContent></Tooltip>;
}

/** A page's way back, above its title: where `useBack` says the person came from. */
export const Back = ({ href, label, onClick }: BackLink) => <Link href={href} onClick={onClick} className={s.back}><ArrowLeft size={14}/>{label}</Link>;

/** A coin's name that copies its contract address: the one place the address lives in a header. */
export function CopyName({ name, address }: { name: string; address: string }) {
  const [copied, copy] = useCopy(address);
  return <Tooltip><TooltipTrigger asChild><button type="button" className={s.copyName} data-copied={copied || undefined} aria-label={`Copy contract address of ${name}`} onClick={() => void copy()}>
    <span>{name}</span><span className={s.copyIcon}><Copy/><Check/></span><span className="sr-only" role="status">{copied ? 'Copied' : ''}</span>
  </button></TooltipTrigger><TooltipContent sideOffset={6}><span className={s.addressTooltip}>{copied ? 'Copied' : shortAddress(address)}</span></TooltipContent></Tooltip>;
}

/** The one "Add new" button: to the new-strategy page, or `onClick` where the page makes strategies itself (the Lab). */
export function AddStrategyButton({ onClick }: { onClick?: () => void } = {}) {
  return <AtLimit limit={useStrategyLimit()}>{onClick ? <Button size="sm" onClick={onClick} aria-label="Add a new strategy"><Plus/>Add new</Button> : <Button size="sm" asChild><Link href={appHref('new')} aria-label="Add a new strategy"><Plus/>Add new</Link></Button>}</AtLimit>;
}
/** The one "Check a coin" button: opens the search that sends any coin to ResearchBot. */
export function CheckCoinButton() { const open = useSetAtom(checkCoinAtom); return <Button size="sm" variant="outline" onClick={() => open({})}><Search/><span className={s.wideLabel}>Check a coin</span></Button>; }

/** A coin named inline: stacked logos, symbol(s) and one fact that matters right there (price to buy at, size, move). */
export function CoinPill({ coins, total = coins.length, note, tone: noteTone, onClick, href }: { coins: { symbol: string; address?: string }[]; total?: number; note?: ReactNode; tone?: 'up' | 'down' | 'warn'; onClick?: () => void; href?: string }) {
  const shown = coins.slice(0, 3), label = total === 1 ? coins[0].symbol : total <= 3 && coins.length === total ? coins.map(coin => coin.symbol).join(', ') : `${coins.slice(0, 2).map(coin => coin.symbol).join(', ')} +${total - 2}`;
  const body = <><span className={s.pillLogos}>{shown.map((coin, index) => <TokenAvatar key={coin.address ?? coin.symbol + index} className="size-[1.15rem] rounded-[28%]" address={coin.address} symbol={coin.symbol}/>)}</span><b>{label}</b>{note != null && <small className={noteTone ? s[noteTone === 'warn' ? 'warnText' : noteTone] : undefined}>{note}</small>}</>;
  if (href) return <Link href={href} className={s.coinPill} onClick={event => event.stopPropagation()}>{body}</Link>;
  if (onClick) return <button type="button" className={s.coinPill} onClick={event => { event.stopPropagation(); onClick(); }}>{body}</button>;
  return <span className={s.coinPill}>{body}</span>;
}

/** Opens one coin in the quick look (CoinLook) while mounted, and tells its owner when the person closes it. */
export function DecisionDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [look, setLook] = useAtom(coinLookAtom), shown = useRef(false);
  useEffect(() => { setLook(id); return () => setLook(null); }, [id, setLook]);
  useEffect(() => { if (look === id) shown.current = true; else if (shown.current && look === null) onClose(); }, [look, id, onClose]);
  return null;
}

export const ORDERS = [{ value: 'newest', label: 'Newest' }, { value: 'best', label: 'Best' }, { value: 'worst', label: 'Worst' }] as const;
export type Order = typeof ORDERS[number]['value'];
/** Newest keeps the list's time order; Best and Worst rank by SOL profit, with coins still entering last. */
export const ranked = <T,>(rows: T[], order: Order, at: (row: T) => number, profit: (row: T) => number | null) => [...rows].sort((a, b) => {
  if (order === 'newest') return at(b) - at(a);
  const x = profit(a), y = profit(b);
  return x == null ? (y == null ? 0 : 1) : y == null ? -1 : order === 'best' ? y - x : x - y;
});
export const bagProfit = (bag: Bag) => bag.entry ? openProfit(bag) : null;
/** The Newest / Best / Worst dropdown that sorts a coin list. `iconOnly` is a round button for a tab bar, lit while the order is not Newest. */
export function CoinSort({ order, onChange, iconOnly }: { order: Order; onChange: (order: Order) => void; iconOnly?: boolean }) {
  return <Select value={order} onValueChange={value => onChange(value as Order)}>
    <SelectTrigger size="sm" className={iconOnly ? s.feedIcon : s.feedFilter} data-active={iconOnly && order !== 'newest' || undefined} aria-label="Sort coins">{iconOnly ? <><ArrowUpDown/><span className="sr-only"><SelectValue/></span></> : <SelectValue/>}</SelectTrigger>
    <SelectContent position="popper" align="end">{ORDERS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
  </Select>;
}

/** One step of a coin's exits as a meter: what the step is and the price's distance from it, over how far the coin has moved toward it,
 *  from 0 to 1 (1: it fires). `done`: the step fired or has nothing left to do. `title`: the step in full, on hover. */
export type Wire = { key: string; label: string; value: string; fill: number; tone: 'up' | 'down' | 'warn' | 'ember'; done?: boolean; title?: string };
export const Meter = ({ wire }: { wire: Wire }) => <li className={s.meter} title={wire.title} data-tone={wire.tone} data-done={wire.done || undefined} data-hot={(!wire.done && wire.fill >= 0.75) || undefined}>
  <span>{wire.label}</span><b className={s.num}>{wire.value}</b>
  <i role="meter" aria-label={`${wire.label}, ${wire.value}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(wire.fill * 100)} style={{ '--fill': wire.fill } as CSSProperties}/>
</li>;

type Word = { text: string; tone: 'up' | 'down' | 'warn' | 'ember' | 'muted'; title?: string };
/** TraderBot's last read of a held coin as one word and its tone; the full reason stays on hover and in the decision. */
const STATUS_WORD: Record<TraderStatus, [string, Word['tone']]> = {
  riding: ['Riding', 'up'], pullback: ['Pullback', 'warn'], support: ['At support', 'warn'], fading: ['Fading', 'warn'], sliding: ['Sliding', 'down'], dump: ['Dump watch', 'down'],
  flat: ['Quiet', 'muted'], confirming: ['Confirming sell', 'down'], second_opinion: ['Second opinion', 'muted'], offline: ['Waiting', 'muted'],
};
const WORD_CLASS = { up: s.up, down: s.down, warn: s.warnText, ember: s.emberText, muted: s.muted };
const BOT_LOOK = { trader: 'TraderBot is watching it', coordinator: 'HOTBOT took a look', sniper: 'SniperBot ranks it' };

/** Shared held/sold/let-go row. The row opens the coin's quick look; hover (always, on touch) shows Rate (the same look, its rating panel under the chart), and `act`:
 *  Sell on a held coin. A coin with no pick yet (`id` null: Next up) is a plain row. Nested controls stop propagation so they do not open the look. A row without a `value` has no
 *  worth column, and `end` takes the profit column's place with figures of its own. */
type RowAct = { label: string; pending: string; run: () => void };
export function CoinRow({ id, token, bot, word, strategy, real, facts, value, valueNote, valueLabel, pnl = null, move = null, end, act, acting }: { id: string | null; token: Bag['token']; bot?: keyof typeof BOT_LOOK; word?: Word | null; strategy?: Pick<StrategyRow, 'id' | 'name'>; real?: boolean; facts: ReactNode; value?: number; valueNote?: string; valueLabel?: string; pnl?: number | null; move?: number | null; end?: ReactNode; act?: RowAct; acting?: boolean }) {
  const look = useSetAtom(coinLookAtom), viewed = useAtomValue(viewedAtom), open = () => { if (id) look(id); };
  const opens = id ? { role: 'button', tabIndex: 0, 'data-report': `coin:${id}`, 'data-acts': act ? acting ? 'busy' : viewed ? 'sell' : 'both' : viewed ? undefined : 'rate', 'aria-label': `Open ${token.symbol}`, onClick: open,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } } } : {};
  return <>
    <div className={s.holdRow} data-report-label={token.symbol} {...opens}>
      <span className={s.holdFace}>
        <TokenAvatar className="size-10 rounded-[28%]" address={token.address} symbol={token.symbol}/>
        {bot && <span className={s.holdBot} title={BOT_LOOK[bot]}><BotAvatar role={bot} size={18}/><span className="sr-only">{BOT_LOOK[bot]}</span></span>}
      </span>
      <span className={s.holdMain}>
        <span className={s.holdName}><b title={token.name}>{token.symbol}</b>{word && <em className={WORD_CLASS[word.tone]} title={word.title}>{word.text}</em>}{strategy && <Link href={appHref('strategies', strategy.id)} className={s.holdTag} title={strategy.name} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{strategy.name}</Link>}{real && <RealSolMark mode="live"/>}</span>
        {facts && <span className={s.holdFacts}>{facts}</span>}
      </span>
      {id && <span className={s.holdSell} data-busy={acting || undefined}><span>
        {!viewed && <Button size="xs" variant="secondary" className={s.rateButton} data-verdict="none" onClick={event => { event.stopPropagation(); open(); }} onKeyDown={event => event.stopPropagation()} aria-label={`Rate ${token.symbol}`}><span className={s.rateIcon}><ThumbsUp/></span>Rate</Button>}
        {act && <Button size="xs" variant="secondary" disabled={acting} onClick={event => { event.stopPropagation(); act.run(); }} onKeyDown={event => event.stopPropagation()} aria-label={`${act.label} ${token.symbol}`}>{acting ? act.pending : act.label}</Button>}
      </span></span>}
      {value !== undefined && <span className={s.holdWorth} title={`${valueLabel} in SOL`}><b><span className="sr-only">{valueLabel} </span>{sol(value).replace(' SOL', '')}</b><small>{valueNote}</small></span>}
      {end ?? <span className={s.holdProfit} data-tone={tone(pnl)} title="Profit in SOL, and the return">
        <b><span className="sr-only">Profit </span>{pnl == null ? '—' : signedSol(pnl, Math.abs(pnl) < 0.01 ? 4 : 3).replace(' SOL', '')}</b>
        {pnl != null && <small><span className="sr-only">Return </span>{pct(move)}</small>}
      </span>}
    </div>
  </>;
}

/** A held coin's status word: in flight while buying or selling, otherwise TraderBot's last status, with its reason on hover. Without a
 *  status there is no word; the watching mascot on the logo says it. */
const heldWord = (bag: Bag): Word | null => bag.stage === 'buying' ? { text: 'Buying…', tone: 'ember' } : bag.stage === 'selling' ? { text: 'Selling…', tone: 'warn', title: bag.exitReason ?? undefined }
  : bag.lastReview?.status ? { text: STATUS_WORD[bag.lastReview.status][0], tone: STATUS_WORD[bag.lastReview.status][1], title: bag.lastReview.reason } : null;
/** A setting's meaning behind an (i) beside its name: a tooltip on hover or focus, a tap opens the same words where no tooltip opens (touch).
 *  `warn`: a setting best left alone, a warning sign before its name. */
export function InfoTip({ text, label, warn }: { text: ReactNode; label: string; warn?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip><PopoverAnchor asChild><TooltipTrigger asChild>
      <button type="button" className={s.infoTip} data-warn={warn || undefined} aria-label={`About ${label}`} onClick={event => { event.stopPropagation(); if (matchMedia('(hover: none)').matches) setOpen(value => !value); }}>{warn ? <TriangleAlert aria-hidden/> : <Info aria-hidden/>}</button>
    </TooltipTrigger></PopoverAnchor><TooltipContent sideOffset={6} className="max-w-[17rem] leading-snug">{text}</TooltipContent></Tooltip>
    <PopoverContent side="top" className="max-w-[17rem] text-sm leading-snug" onClick={event => event.stopPropagation()}>{text}</PopoverContent>
  </Popover>;
}

/** HOTBOT wears the coin while its note about it is newer than TraderBot's last review; otherwise TraderBot, who manages every held coin. */
const heldBot = (bag: Bag) => bag.hotbotAt != null && bag.hotbotAt > (bag.lastReview?.at ?? 0) ? 'coordinator' as const : 'trader' as const;
const soldAgo = (trade: Trade, now?: number) => ago(trade.closedAt, now) === 'now' ? 'just now' : ago(trade.closedAt, now) + ' ago';
/** A held coin's price when it is old: its age once past STALE_PRICE_MS, or no price yet, when the coin counts at its entry price. Null while
 *  the price is fresh, for a coin not bought yet, and before the clock starts (`now` 0). */
export function priceAgeNote(coin: { entry: object | null; markPriceUsd: number | null; markAt: number | null }, now: number) {
  if (!coin.entry || !now) return null;
  // No-break spaces inside each phrase, so a narrow column wraps it only at the dot.
  if (coin.markPriceUsd == null) return <span className={s.warnText} title="No trade price has arrived for this coin, so it counts at the price it was bought at">No&nbsp;price&nbsp;yet · at&nbsp;entry</span>;
  if (coin.markAt == null || now - coin.markAt < STALE_PRICE_MS) return null;
  const age = ago(coin.markAt, now);
  return <span className={s.warnText} title={`Its last trade was ${age} ago, and its value uses that trade’s price`}>{age} old</span>;
}
/** A held coin's facts under its symbol: price or market cap and its age once it is old, how far below its high once that matters, SOL
 *  already taken out. */
const heldFacts = (bag: Bag, unit: PriceUnit, now: number) => {
  const off = bag.entry && bag.markPriceUsd && bag.peakPriceUsd ? (bag.markPriceUsd / bag.peakPriceUsd - 1) * 100 : null;
  const mark = bag.markPriceUsd ? formatTokenPrice(bag.markPriceUsd, unit, bag.supply) : '—';
  const facts = [mark !== '—' ? <>{mark}{unit === 'marketCap' && <span className={s.holdUnit}> mcap</span>}</> : null, priceAgeNote(bag, now),
    off != null && off <= -5 ? <span className={s.warnText}>{pct(off)} from high</span> : null, bag.sold ? <span className={s.up}>{sol(bag.sold.sol, 2)} taken</span> : null].filter(Boolean);
  return facts.length ? facts.map((fact, index) => <Fragment key={index}>{index > 0 && ' · '}{fact}</Fragment>) : null;
};

/** A held coin's row. Home recomposes on every price tick and keeps unchanged coins' objects (useHome), so a row renders again only when its
 *  coin, its strategy, the clock or its Sell state changes. */
const BagRow = memo(function BagRow({ bag, strategyId, strategyName, real, unit, now, acting, onAct }: { bag: Bag; strategyId?: StrategyRow['id']; strategyName?: string; real: boolean; unit: PriceUnit; now: number; acting: boolean; onAct: (id: string, type: 'sell' | 'cancel') => void }) {
  return <CoinRow id={bag.id} token={bag.token} bot={heldBot(bag)} word={heldWord(bag)} strategy={strategyId && strategyName ? { id: strategyId, name: strategyName } : undefined} real={real} facts={heldFacts(bag, unit, now)}
    value={bag.entry ? bag.valueSol : bag.amountSol} valueNote={bag.entry ? `in ${sol(costSol(bag.entry), 2).replace(' SOL', '')}` : 'buying'} valueLabel={bag.entry ? 'Worth' : 'Buying with'} pnl={bag.entry && bag.markPriceUsd != null ? openProfit(bag) : null} move={change(bag)}
    act={bag.stage === 'held' ? { label: 'Sell', pending: 'Selling…', run: () => onAct(bag.id, 'sell') } : undefined} acting={acting}/>;
});

/** A coin a replay shows held at its clock: what went in, how long it had been held, and once its token chart has loaded, its worth then and its
 *  profit (worth plus what take-profits brought back, less what went in). */
export type HeldThen = { id: string; token: Bag['token']; inSol: number; boughtAt: number; worth?: number; pnl?: number };
/** The one coin list: holdings, or coins already sold, as the same compact rows. A replay passes `held` (coins held at its clock) or `sold` with
 *  `now`, its clock, which sold times count from. */
export function Coins({ bags = [], sold, held, now, strategies, empty }: { bags?: Bag[]; sold?: Trade[]; held?: HeldThen[]; now?: number; strategies?: StrategyRow[]; empty: string }) {
  const display = usePriceDisplay(), clock = useNow();
  const command = useCommand(), [acting, setActing] = useState<string | null>(null);
  // The latest command, so the rows' one action callback stays the same object across renders and memoized rows skip.
  const commandRef = useRef(command);
  useLayoutEffect(() => { commandRef.current = command; });
  const run = useCallback(async (id: string, type: 'sell' | 'cancel') => { setActing(id); await commandRef.current({ type, itemId: id }); setActing(null); }, []);
  if (!(held ?? sold ?? bags).length) return <p className={s.empty}>{empty}</p>;
  // A list of both portfolios' coins names the Real SOL ones.
  const mixed = bags.some(bag => bag.mode === 'live') && bags.some(bag => bag.mode === 'paper');
  return <div className={s.holdings}>
    <div className={s.holdList}>{held ? held.map(coin => <CoinRow key={coin.id} id={coin.id} token={coin.token} bot="trader"
      word={{ text: `Held ${minutesText(Math.max(0, (now ?? coin.boughtAt) - coin.boughtAt) / 60_000)}`, tone: 'muted' }} facts={null} value={coin.worth ?? coin.inSol} valueNote={coin.worth != null ? `in ${sol(coin.inSol, 2).replace(' SOL', '')}` : 'in'} valueLabel={coin.worth != null ? 'Worth' : 'Bought with'} pnl={coin.pnl ?? null} move={coin.pnl != null && coin.inSol > 0 ? coin.pnl / coin.inSol * 100 : null}/>)
    : sold ? sold.map(trade => <CoinRow key={trade.id} id={trade.id} token={trade.token}
      word={{ text: soldAgo(trade, now), tone: 'muted', title: [trade.boughtAt ? `Held ${ago(trade.boughtAt, trade.closedAt)}` : null, `sold ${soldAgo(trade, now)}`].filter(Boolean).join(' · ') }}
      facts={trade.reason ? <SignedPercentText>{trade.reason}</SignedPercentText> : null} value={trade.outSol} valueNote={`in ${sol(trade.inSol, 2).replace(' SOL', '')}`} valueLabel="Sold for" pnl={trade.pnlSol} move={trade.changePct}/>)
    : bags.map(bag => { const strategy = strategies?.find(row => row.id === bag.strategyId); return <BagRow key={bag.id} bag={bag} strategyId={strategy?.id} strategyName={strategy?.name} real={mixed && bag.mode === 'live'} unit={display.unit} now={clock} acting={acting === bag.id} onAct={run}/>; })}</div>
  </div>;
}

/** Buys waiting for the person. */
export function NeedsYou({ items, strategies }: { items: HomeData['needs']; strategies?: StrategyRow[] }) {
  const { describe: price } = usePriceDisplay();
  const command = useCommand();
  const [coin, setCoin] = useState<string | null>(null);
  return <>{items.map(item => {
    // The price is live while the ask is open: show what buying would cost now and how far it moved since SniperBot asked.
    const drift = item.askedPriceUsd && item.markPriceUsd ? (item.markPriceUsd / item.askedPriceUsd - 1) * 100 : null, own = strategies?.find(row => row.id === item.strategyId), strategy = own?.name;
    return <div key={item.id} className={s.need} role="button" tabIndex={0} aria-label={`Open ${item.token.symbol}`} onClick={() => setCoin(item.id)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setCoin(item.id); } }}>
      <TokenAvatar className="size-8 rounded-[28%]" address={item.token.address} symbol={item.token.symbol}/>
      <span><b>Buy {item.token.symbol}?</b><small>{sol(item.amountSol)}{item.markPriceUsd ? ' · ' + price(item.markPriceUsd, item.supply) : ''}{drift != null && Math.abs(drift) >= 1 && <> · <em className={drift > 0 ? s.warnText : s.up}>{pct(drift)} since asked</em></>}{strategy && <> · {strategy}</>}</small></span>
      <div>
        <Button size="icon-sm" variant="ghost" className="bg-positive/15 text-positive hover:bg-positive/25 hover:text-positive dark:hover:bg-positive/25" aria-label={`Buy ${item.token.symbol}`} title="Buy" onClick={event => { event.stopPropagation(); command({ type: 'approve', itemId: item.id, ...(own ? { seen: own.rev } : {}) }); }}><Check strokeWidth={2.5}/></Button>
        <Button size="icon-sm" variant="ghost" className="bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive dark:hover:bg-destructive/25" aria-label={`Skip ${item.token.symbol}`} title="Skip" onClick={event => { event.stopPropagation(); command({ type: 'skip', itemId: item.id }); }}><X strokeWidth={2.5}/></Button>
      </div>
    </div>;
  })}{coin && <DecisionDialog id={coin} onClose={() => setCoin(null)}/>}</>;
}

/** Found → picked → bought → holding, as four short bars. */
export function Pipe({ row }: { row: StrategyRow }) {
  const top = Math.max(1, row.funnel.found);
  const steps: [string, number][] = [['found', row.funnel.found], ['picked', row.funnel.passed], ['bought', row.funnel.bought], ['holding', row.held]];
  return <div className={s.pipe}>{steps.map(([label, value]) => <div key={label}><i style={{ ['--fill' as string]: `${Math.max(value ? 4 : 0, Math.round(value / top * 100))}%` }}/><span><b>{value}</b> {label}</span></div>)}</div>;
}

/** A strategy's state as its card shows it: a live dot while it runs, ember while it sells to archive, warning while its Real SOL loss stop
 *  holds its buys (`stopped`). */
export function StrategyStatus({ status, stopped = false }: { status: StrategyRow['status']; stopped?: boolean }) {
  return <span className={s.status} data-archiving={status === 'archiving' || undefined} data-stopped={stopped || undefined}><span className={s.dot} data-live={status === 'running' || undefined} data-off={status === 'paused' || undefined}/>{stopped ? status === 'archiving' ? 'Stopped · selling out' : 'Stopped' : status === 'running' ? 'Running' : status === 'archiving' ? 'Selling to archive' : 'Paused'}</span>;
}

/** A strategy's state in a few words, for its tile and its sidebar row: why it is not buying, else what it holds. */
export const strategyLine = (row: StrategyRow) => row.loss?.stoppedAt != null ? row.status === 'archiving' ? 'Stopped · selling out' : 'Stopped' : row.status === 'paused' ? 'Paused' : row.status === 'archiving' ? 'Selling to archive' : row.held ? `${row.held} holding` : 'No coins';
export const PORTFOLIO_STATUS: Record<PortfolioCard['status'], string> = { picking: 'Picking coins', running: 'Running', paused: 'Paused', stopped: 'Stopped at its floor', archived: 'Archived' };

/** Marks a Real SOL strategy in ember. Practice is the default portfolio, so it carries no mark. */
export const RealSolMark = ({ mode }: { mode: StrategyRow['mode'] }) => mode === 'live' ? <span className={s.realSol}>Real SOL</span> : null;

/** One strategy as a compact card: name and what it does, profit beside its line, and the funnel as bars (holding lives there). Admins also get its id to copy.
 *  `tile` is the phone Home's small version: name, profit and what it holds, over its profit line. A Real SOL tile has no room for the mark's words,
 *  so its edge and its SOL unit turn ember. */
export function StrategyCard({ row, tile = false }: { row: StrategyRow; tile?: boolean }) {
  const pnl = row.realizedPnlSol + row.openPnlSol, stopped = row.loss?.stoppedAt != null, real = row.mode === 'live';
  if (tile) return <Link href={appHref('strategies', row.id)} className={`${s.surface} ${s.strategyTile}`} data-real={real || undefined} data-report={`strategy:${row.id}`} data-report-label={row.name} aria-label={`${row.name}${real ? ', Real SOL' : ''}: ${signedSol(pnl)}, ${row.status === 'running' ? `${row.held} held` : row.status}`}>
    <SparkBackdrop points={row.spark} pnl={pnl}/>
    <span className={s.strategyTileName}><span className={s.dot} data-live={row.status === 'running' || undefined} data-off={row.status !== 'running' || undefined}/><b>{row.name}</b></span>
    <b className={`${s.strategyTileProfit} ${s[tone(pnl, 2) ?? 'muted']}`}>{signedSol(pnl, 2).replace(' SOL', '')}<small>SOL</small></b>
    <small data-warn={stopped || undefined}>{strategyLine(row)}</small>
  </Link>;
  return <Link href={appHref('strategies', row.id)} className={`${s.surface} ${s.strategy}`} data-report={`strategy:${row.id}`} data-report-label={row.name}>
    <span className={s.strategyTop}>
      <span className={s.grow}><b>{row.name}</b><small>{row.description}</small></span>
      <RealSolMark mode={row.mode}/>
      <StrategyStatus status={row.status} stopped={stopped}/>
    </span>
    <ProfitSpark points={row.spark} pnl={pnl}/>
    <Pipe row={row}/>
  </Link>;
}

const GHOST_WIDTHS = [62, 44, 70, 52, 38, 58];
/** Holds a list's, a box's or a whole page's place until its data arrives. It shows only after a short wait, so a quick (cached) load never flashes it.
 *  `height` sizes a box (any CSS length; `100%` fills a parent with a set height). */
export function Loading({ variant = 'rows', rows = 4, height, label = 'Loading', className }: { variant?: 'rows' | 'box' | 'page'; rows?: number; height?: string; label?: string; className?: string }) {
  const list = Array.from({ length: rows }, (_, index) => <span key={index} className={s.ghostRow}><i/><span><i style={{ width: `${GHOST_WIDTHS[index % GHOST_WIDTHS.length]}%` }}/><i/></span><i/></span>);
  return <div className={className ? `${s.ghost} ${className}` : s.ghost} role="status" aria-label={label} style={height ? { '--ghost-h': height } as CSSProperties : undefined}>
    {variant === 'page' && <i className={s.ghostTitle}/>}
    {variant !== 'rows' && <i className={s.ghostBox}/>}
    {variant !== 'box' && list}
  </div>;
}

/** A setting's value: its text at rest, Num boxes to type over while its row is open. `zero` names a 0 (Off, Right away); `pre` and `post` carry the unit. */
export function Val({ editing, zero, pre = '', post = '', ...num }: NumProps & { editing: boolean; zero?: string; pre?: string; post?: string }) {
  if (!editing) return <span className={s.valText}>{num.value === 0 && zero ? zero : `${pre}${numText(num.kind, num.value)}${post}`}</span>;
  return <span className={s.valEdit}>{pre && <i>{pre}</i>}<Num {...num}/>{post && <i>{post.trim()}</i>}</span>;
}
/** The two units a time setting's box takes, smaller first: how many of the setting's own unit each holds. `days` holds minutes too. */
const TIME_UNITS = { min: [{ id: 'min', per: 1, word: 'minutes' }, { id: 'hour', per: 60, word: 'hours' }], days: [{ id: 'hour', per: 60, word: 'hours' }, { id: 'day', per: 1440, word: 'days' }], sec: [{ id: 'sec', per: 1, word: 'seconds' }, { id: 'min', per: 60, word: 'minutes' }] } as const;
/** A time setting's value, in minutes (`min`, or `days` for an age edited in hours and days) or seconds (`sec`): its text at rest (2h, 5d, 90s);
 *  open, a box in either of its two units with a selector beside it. */
export function TimeVal({ kind, editing, value, zero, min = 0, max = Infinity, steps, label, onChange }: { kind: keyof typeof TIME_UNITS; editing: boolean; value: number; zero?: string; min?: number; max?: number; steps?: number[]; label: string; onChange: (value: number) => void }) {
  const units = TIME_UNITS[kind], [unitId, setUnit] = useState<string>(value % units[1].per ? units[0].id : units[1].id), unit = units.find(u => u.id === unitId) ?? units[0], per = unit.per;
  if (!editing) return <span className={s.valText}>{value === 0 && zero ? zero : numText(kind === 'sec' ? 'sec' : 'min', value)}</span>;
  return <span className={s.valEdit}>
    <Num autoFocus value={value / per} kind="count" min={min / per} max={max / per} steps={steps?.map(n => n / per)} label={`${label} in ${unit.word}`} onChange={n => { if (Math.round(n * per) !== value) onChange(Math.round(n * per)); }}/>
    <span className={`${s.seg} ${s.valUnit}`} role="group" aria-label={`${label} unit`}>{units.map(u => <button type="button" key={u.id} aria-pressed={unit.id === u.id} onClick={() => setUnit(u.id)}>{u.id}</button>)}</span>
  </span>;
}

/** Whether a rule must pass: a coin that misses a shielded rule never passes; the rest add up to a score. `fixed` is a rule that always must pass. */
export function Shield({ on, fixed, label, onToggle }: { on: boolean; fixed?: boolean; label: string; onToggle?: () => void }) {
  const tip = fixed ? 'Always must pass: a coin that misses it never passes.' : on ? 'Must pass: a coin that misses it never passes. Click to let it count toward the score instead.' : 'Counts toward the score. Click to make it must pass.';
  const icon = on || fixed ? <ShieldCheck/> : <ShieldIcon/>;
  return <Tooltip><TooltipTrigger asChild>{fixed
    ? <span tabIndex={0} className={s.shield} data-on data-fixed aria-label={`${label}: always must pass`}>{icon}</span>
    : <button type="button" className={s.shield} data-on={on || undefined} aria-pressed={on} aria-label={`${label} must pass`} onClick={event => { event.stopPropagation(); onToggle?.(); }}>{icon}</button>}
  </TooltipTrigger><TooltipContent sideOffset={6} className="max-w-[17rem] leading-snug">{tip}</TooltipContent></Tooltip>;
}

/** A main action while it works: the step it is on, in the button's own place. */
export const StepButton = ({ label }: { label: string }) => <Button type="button" disabled className={s.stepButton}><LoaderCircle className="animate-spin"/>{label}</Button>;

/** An emailed code in a main action's place: the field with Confirm in it, then the code's state, Resend and Cancel. Nothing focuses the
 *  field by itself, so a phone opens its keyboard only on a tap. `busy`: the press under way. */
export function CodeEntry({ label, code, onCode, onConfirm, onResend, onCancel, busy, disabled = false, sending = false }: { label: string; code: string;
  onCode: (code: string) => void; onConfirm: () => void; onResend: () => void; onCancel?: () => void; busy: 'confirm' | 'resend' | null; disabled?: boolean; sending?: boolean }) {
  const off = disabled || busy !== null;
  return <form className={s.codeEntry} onSubmit={event => { event.preventDefault(); if (!off && code.trim()) onConfirm(); }}>
    <div className={s.codeField}>
      <Input value={code} onChange={event => onCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="Code from your email" aria-label={label}/>
      <Button type="submit" size="sm" disabled={off || !code.trim()}>{busy === 'confirm' ? <LoaderCircle className="animate-spin"/> : <Check/>}Confirm</Button>
    </div>
    <div className={s.codeMeta}>
      <span>{sending ? <><LoaderCircle size={12} className="animate-spin"/>Sending code</> : <><Mail size={12}/>Code sent</>}</span>
      <button type="button" disabled={off || sending} onClick={onResend}>{busy === 'resend' && <LoaderCircle size={12} className="animate-spin"/>}Resend</button>
      {onCancel && <button type="button" disabled={off} onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}

/** Room above a stop as ten cells that go from green to warning to red as it runs out: a portfolio's floor. `room`: 0–1. */
export function RoomMeter({ room, label }: { room: number; label: string }) {
  return <span className={s.folioLife} data-tone={room > 0.5 ? 'up' : room > 0.25 ? 'warn' : 'down'} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(room * 100)}>{Array.from({ length: 10 }, (_, index) => <i key={index} data-on={index < Math.ceil(room * 10) || undefined}/>)}</span>;
}

/** The coins a strategy holds out of the ones it may hold at once, a cell each. */
export function CoinSlots({ held, max, label }: { held: number; max: number; label: string }) {
  return <span className={s.folioLife} data-tone="ember" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={held}>{Array.from({ length: Math.max(max, held) }, (_, index) => <i key={index} data-on={index < held || undefined}/>)}</span>;
}
/** Round values to pick with one click under an open row. */
export function QuickPicks<T>({ label, options, value, onPick }: { label?: string; options: { value: T; text: string }[]; value: T; onPick: (value: T) => void }) {
  return <div className={s.quick}>{label && <small>{label}</small>}
    <span className={s.seg} role="group" aria-label={label}>{options.map(option => <button type="button" key={option.text} aria-pressed={JSON.stringify(option.value) === JSON.stringify(value)} onClick={() => onPick(option.value)}>{option.text}</button>)}</span>
  </div>;
}

/** A Settings part's id for HOTBOT (`types/settingsGuide.ts`), and its glow while HOTBOT points at it. */
export function useSpotAttrs(id?: string) {
  const spot = useAtomValue(settingSpotAtom);
  return id ? { 'data-setting': id, 'data-spot': spot?.ids.includes(id) ? '' : undefined } : {};
}
/** Scrolls the first part HOTBOT points at into view once its view and tab have rendered, and clears the glow after it. A part with no row on
 *  screen glows through the one that holds it: a re-buy or breakout field through its switch, a search check that is off through Add a rule. */
export function useSettingSpot(root: RefObject<HTMLElement | null>) {
  const [spot, setSpot] = useAtom(settingSpotAtom);
  useEffect(() => {
    if (!spot) return;
    const find = (id: string) => root.current?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(id)}"]`) ?? null;
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
      const holders = spot.ids.filter(id => !find(id)).map(id => find(id.split('.')[0]) ? id.split('.')[0] : isSettingId(id) && (SETTINGS_GUIDE[id] as { tab?: string }).tab === 'search' && find('addRule') ? 'addRule' : null)
        .filter((id): id is string => id !== null && !spot.ids.includes(id));
      if (holders.length) { setSpot({ ids: [...spot.ids, ...new Set(holders)], at: spot.at }); return; }
      const first = spot.ids.map(find).find(Boolean);
      first?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }); });
    const timer = setTimeout(() => setSpot(current => current?.at === spot.at ? null : current), 2600);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [spot, root, setSpot]);
}
/** One setting as a row: its name and a short line, then its value. An openable row opens in place: its values become boxes to type over and
 *  `children` (quick picks, a list) show under it. A removable rule shows a trash button on hover that pushes the name aside; `suggest` (the
 *  Lab's suggested value for it, an icon) sits before the shield. `leave`: a setting advised to stay at its default; its meaning opens from a
 *  warning sign before its name. */
export function SettingRow({ id, open, onToggle, label, sub, warn, leave, value, shield, suggest, control, onRemove, changed, add, children }: { id?: string; open?: boolean; onToggle?: () => void; label: ReactNode; sub?: ReactNode; warn?: boolean; leave?: boolean; value?: ReactNode; shield?: ReactNode; suggest?: ReactNode; control?: ReactNode; onRemove?: () => void; changed?: boolean; add?: boolean; children?: ReactNode }) {
  const openable = Boolean(onToggle), about = id && isSettingId(id) ? (SETTINGS_GUIDE[id] as { about?: string }).about : undefined;
  return <div className={s.setRow} data-open={open || undefined} data-changed={changed || undefined} {...useSpotAttrs(id)}>
    <div className={s.setHead} data-add={add || undefined} role={openable ? 'button' : undefined} tabIndex={openable ? 0 : undefined} aria-expanded={openable ? Boolean(open) : undefined}
      onClick={event => { if (openable && !(event.target as HTMLElement).closest('input, button, a, [role=switch]')) onToggle!(); }}
      onKeyDown={event => { if (openable && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle!(); } }}>
      {onRemove && <button type="button" className={s.setTrash} aria-label={`Remove ${typeof label === 'string' ? label.toLowerCase() : 'this rule'}`} onClick={event => { event.stopPropagation(); onRemove(); }}><Trash2/></button>}
      {add && <Plus className={s.setAdd} aria-hidden/>}
      <span className={s.setText}><b>{about && leave && <InfoTip warn text={`Advised not to touch. ${about}`} label={typeof label === 'string' ? label : 'this setting'}/>}{label}{about && !leave && <InfoTip text={about} label={typeof label === 'string' ? label : 'this setting'}/>}</b>{sub && <small className={warn ? s.warnText : undefined} title={typeof sub === 'string' ? sub : undefined}>{sub}</small>}</span>
      {suggest}
      {shield}
      {value != null && <span className={s.setValue}>{value}</span>}
      {control}
      {openable && !add && <ChevronRight className={s.setChev} aria-hidden/>}
    </div>
    {/* Opens and closes with the collapsible's height keyframe; closed content unmounts. */}
    {children && <Collapsible open={Boolean(open)}><CollapsibleContent><div className={s.setMore}>{children}</div></CollapsibleContent></Collapsible>}
  </div>;
}

/** A transaction or an address on Solscan, as a small icon link; nothing when the value is not a well-formed one (`solscan`). */
export function SolscanLink({ kind, value, label }: { kind: 'account' | 'tx'; value: string | null | undefined; label: string }) {
  const href = solscan(kind, value);
  return href ? <a className={s.walletTransactionLink} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title="View on Solscan"><ExternalLink size={14}/></a> : null;
}
