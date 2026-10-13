"use client";
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useAction, useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { toast } from 'sonner';
import { Archive, ArrowLeft, ArrowUp, Check, ChevronRight, Eye, Pause, Play, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { api, useQuery } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { FLOOR, MANDATE, hookText, pctFrom, profit, type Autonomy, type Hook, type Mandate } from '../../../../types/portfolio';
import { ago, appHref, pct, price, signedSol, sol, tone, usd } from './format';
import { Loading, Num, QuickPicks, useNow } from './Parts';
import { failToast, readOnly, viewAsAtom, viewedAtom } from './state';
import s from './team.module.css';

type Card = NonNullable<FunctionReturnType<typeof api.portfolios.list>>[number];
type PageData = NonNullable<FunctionReturnType<typeof api.portfolios.page>>;
type Entry = PageData['journal'][number];
type CoinRow = PageData['coins'][number];
type Draft = FunctionReturnType<typeof api.portfolios.draft>;

/** Words an idea card or an example hands to the new-portfolio screen. */
const wordsAtom = atom('');

const AUTONOMY_TEXT: Record<Autonomy, { label: string; note: string }> = {
  ask: { label: 'Ask me first', note: 'Every trade waits for your yes. Asks you don’t answer in 2 hours are skipped.' },
  limits: { label: 'Inside my limits', note: 'Trades inside your limits go ahead. Anything bigger asks you first.' },
  full: { label: 'Fully', note: 'Every trade goes ahead, cut down to your limits.' },
};
const STATUS_TEXT: Record<Card['status'], string> = { picking: 'Picking coins', running: 'Running', paused: 'Paused', stopped: 'Stopped at its floor', archived: 'Archived' };
const IDEAS = [
  { name: 'Cat coins', words: 'Good cat coins with real communities, held for weeks. Add on dips.' },
  { name: 'AI agents', words: 'AI agent coins whose teams ship, held for months. Ask me before each buy.' },
  { name: 'Blue-chip memes', words: 'Big, older memecoins held for months, 10 SOL. Add on dips.' },
] as const;
const EXAMPLES = ['Dog coins, 2 SOL a coin, ask me before each buy', 'Only coins older than 3 months', 'Frog coins for a few weeks, 3 SOL'] as const;

/** Mutations that act on the person's own portfolios; a viewing admin gets the read-only note instead. */
function useAct() {
  const viewed = useAtomValue(viewedAtom);
  return async <T,>(run: () => Promise<T>): Promise<T | undefined> => {
    if (viewed) { toast.error(readOnly(viewed)); return undefined; }
    try { return await run(); } catch (cause) { failToast(cause); return undefined; }
  };
}

const coinAvatar = (coin: { address: string; symbol: string; logo?: string | null }, className: string) =>
  <TokenAvatar className={className} address={coin.address} logoUrl={coin.logo ?? undefined} symbol={coin.symbol} network="solana" fallback="letter" disableDetailFallback/>;

/** Paper trading, said once per screen: no SOL moves until the shadow test passes. */
function PaperNote({ compact }: { compact?: boolean }) {
  return <p className={s.paperNote}><ShieldCheck aria-hidden/>{compact ? 'Paper trading: no SOL moves.' : 'Paper trading for now. Portfolios trade on paper until they beat buy-and-hold over weeks of tests. No SOL moves, and every decision still comes to your phone.'}</p>;
}

/** The value line and, dashed, the same picks bought once and never touched. */
function ValueLine({ points, start }: { points: { at: number; value: number; hold: number }[]; start: number }) {
  const gradient = useId().replace(/:/g, '');
  const line = useMemo(() => {
    if (points.length < 2) return null;
    const first = points[0].at, span = Math.max(1, points.at(-1)!.at - first);
    const values = points.flatMap(point => [point.value, point.hold, start]), low = Math.min(...values), high = Math.max(...values), pad = Math.max(start * 0.01, (high - low) * 0.15);
    const y = (value: number) => 4 + (1 - (value - (low - pad)) / (high - low + 2 * pad)) * 34;
    const path = (key: 'value' | 'hold') => points.map((point, index) => `${index ? 'L' : 'M'}${((point.at - first) / span * 100).toFixed(2)} ${y(point[key]).toFixed(2)}`).join(' ');
    return { value: path('value'), hold: path('hold'), base: y(start) };
  }, [points, start]);
  const last = points.at(-1), shade = tone((last?.value ?? start) - start) === 'down' ? 'var(--destructive)' : tone((last?.value ?? start) - start) === 'up' ? 'var(--positive)' : 'var(--muted-foreground)';
  if (!line) return <div className={s.folioChartEmpty}>The line starts once HOTBOT has picked and priced the coins.</div>;
  return <svg className={s.folioChart} viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Portfolio value over time, against buy-and-hold">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={shade} stopOpacity={0.2}/><stop offset="100%" stopColor={shade} stopOpacity={0}/></linearGradient></defs>
    <path d={`M0 ${line.base.toFixed(2)} L100 ${line.base.toFixed(2)}`} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke"/>
    <path d={`${line.value} L100 40 L0 40 Z`} fill={`url(#${gradient})`}/>
    <path d={line.hold} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.7} strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/>
    <path d={line.value} fill="none" stroke={shade} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

/** How long until `at`, in `ago`'s units. */
const until = (at: number, now: number) => { const left = ago(2 * now - at, now); return left === 'now' ? 'a minute' : left; };
const lookText = (at: number | null, now: number) => at == null ? null : at <= now ? 'looking now' : `next look in ${until(at, now)}`;

function PortfolioCard({ row, now }: { row: Card; now: number }) {
  const pnl = row.valueSol - row.startSol, vsHold = row.valueSol - row.holdSol, look = lookText(row.nextLookAt, now);
  return <Link href={appHref('portfolios', row.id)} className={`${s.surface} ${s.folioCard}`} aria-label={`${row.name}: worth ${sol(row.valueSol, 2)}, ${signedSol(pnl, 2)}`}>
    <span className={s.folioCover} data-art={row.cover ? undefined : true}>
      {row.cover && <img src={row.cover} alt="" loading="lazy" referrerPolicy="no-referrer"/>}
      <span className={s.folioStatus} data-tone={row.asks ? 'warn' : row.status === 'running' ? 'live' : row.status === 'picking' ? 'ember' : undefined}>{row.asks ? 'Needs you' : STATUS_TEXT[row.status]}</span>
    </span>
    <span className={s.folioCoins}>{row.coins.slice(0, 5).map(coin => <span key={coin.address}>{coinAvatar(coin, 'size-11 rounded-full')}</span>)}{row.coins.length > 5 && <small>+{row.coins.length - 5}</small>}</span>
    <span className={s.folioBody}>
      <span className={s.folioName}><b>{row.name}</b><span className={s.num}>{sol(row.valueSol, 2)}</span></span>
      <span className={s.folioMoney}><b className={`${s.num} ${s[tone(pnl) ?? 'muted']}`}>{signedSol(pnl, 2)} · {pct(pnl / row.startSol * 100)}</b>{row.coins.length > 0 && <small className={s[tone(vsHold) ?? 'muted']}>{signedSol(vsHold, 2)} vs holding</small>}</span>
      <small className={s.folioSummary}>{row.summary}</small>
      {row.last && <span className={s.folioLast}><span>{row.last.line}</span><small>{ago(row.last.at, now)}</small></span>}
      <small className={s.folioFoot}>{row.coins.length ? `${row.coins.length} coin${row.coins.length === 1 ? '' : 's'}` : 'No coins yet'}{look && row.status === 'running' ? ` · ${look}` : ''} · {AUTONOMY_TEXT[row.autonomy].label}</small>
    </span>
  </Link>;
}

/** Ideas to start from, and words that show how to say it. Each opens the new-portfolio screen with the words filled in. */
function Ideas() {
  const router = useRouter(), [, setWords] = useAtom(wordsAtom);
  const go = (words: string) => { setWords(words); router.push(appHref('portfolios', 'new')); };
  return <section className={s.section} aria-label="Start from an idea">
    <div className={s.sectionHead}><h2>Start from an idea</h2></div>
    <div className={s.folioIdeas}>{IDEAS.map(idea => <button key={idea.name} type="button" className={`${s.surface} ${s.folioIdea}`} onClick={() => go(idea.words)}><b>{idea.name}</b><small>{idea.words}</small><span>Use this<ChevronRight aria-hidden/></span></button>)}</div>
    <div className={s.folioSay}><small>Or say it your way</small>{EXAMPLES.map(words => <button key={words} type="button" onClick={() => go(words)}>“{words}”</button>)}</div>
  </section>;
}

/** Every portfolio as a card with its cover, worth, the newest thing HOTBOT did and what it watches next; then ideas to start another. */
export function PortfoliosPage() {
  const rows = useQuery(api.portfolios.list, { ...useAtomValue(viewAsAtom) }), now = useNow(30_000);
  const running = rows?.filter(row => row.status === 'running' || row.status === 'picking').length ?? 0;
  return <div className={s.page}>
    <header className={s.head}>
      <div><h1 className={s.title}>Portfolios{rows ? <span className={s.titleCount}>{running} running</span> : null}</h1><p className={s.sub}>Tell HOTBOT what you want to hold. It picks the coins, holds them and tells you why.</p></div>
      <div className={s.headActions}><Button asChild size="sm"><Link href={appHref('portfolios', 'new')}><Sparkles/>New portfolio</Link></Button></div>
    </header>
    <PaperNote/>
    {rows === undefined ? <Loading variant="box" height="16rem"/>
      : rows === null ? <p className={s.empty}>Start your team first.</p>
      : rows.length ? <div className={s.folioGrid}>{rows.map(row => <PortfolioCard key={row.id} row={row} now={now}/>)}</div>
      : <p className={s.empty}>No portfolios yet. Pick an idea below or describe your own, and HOTBOT sets it up.</p>}
    <Ideas/>
  </div>;
}

const limitChips = (mandate: Mandate) => [AUTONOMY_TEXT[mandate.autonomy].label, `${sol(mandate.perCoinSol, 2)} a coin at most`, `${mandate.tradesPerDay} trades a day`, `Stops under ${sol(mandate.stopAllSol, 2)}`, `Holds about ${mandate.holdDays} days`, `Looks every ${mandate.reviewHours} h`];
const AGE_TEXT: Record<Mandate['age'], string> = { established: 'weeks or months old', new: 'launched in the last weeks', any: 'new or old' };

/** Words to a portfolio: the person says what to hold, HOTBOT reads it into a mandate with limits and shows what fits now, they change
 *  it in words or with quick changes, then start it. */
export function NewPortfolio() {
  const router = useRouter(), act = useAct(), [initial, setInitial] = useAtom(wordsAtom);
  const draftAction = useAction(api.portfolios.draft), start = useMutation(api.portfolios.start);
  const [words, setWords] = useState(initial), [change, setChange] = useState(''), [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState<'draft' | 'start' | null>(null);
  const changeRef = useRef<HTMLInputElement>(null);
  const read = async (text: string, current?: Draft) => {
    if (busy || text.trim().length < 3) return;
    setBusy('draft');
    const next = await act(() => draftAction({ text, ...(current ? { current: { name: current.name, mandate: current.mandate } } : {}) }));
    setBusy(null);
    if (next) { setDraft(next); setChange(''); setInitial(''); }
  };
  const begin = async () => {
    if (!draft || busy) return;
    setBusy('start');
    const id = await act(() => start({ name: draft.name, mandate: draft.mandate }));
    setBusy(null);
    if (id) router.push(appHref('portfolios', id));
  };
  return <div className={`${s.page} ${s.folioNew}`}>
    <Link href={appHref('portfolios')} className={s.back}><ArrowLeft size={14}/>Portfolios</Link>
    <header className={s.head}><div><h1 className={s.title}>New portfolio</h1><p className={s.sub}>Say what to hold and for how long, in your own words. HOTBOT sets it up; you check it before it starts.</p></div></header>
    {!draft ? <section className={`${s.surface} ${s.folioAsk}`} aria-label="Describe your portfolio">
      <label htmlFor="folio-words" className="sr-only">What should HOTBOT hold?</label>
      <textarea id="folio-words" value={words} maxLength={MANDATE.words} rows={3} autoFocus placeholder="Good cat coins with real communities, held for weeks. 6 SOL." onChange={event => setWords(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void read(words); } }}/>
      <div className={s.folioAskBar}>
        <span className={s.folioSay}>{EXAMPLES.map(example => <button key={example} type="button" onClick={() => setWords(example)}>{example}</button>)}</span>
        <Button size="sm" onClick={() => void read(words)} disabled={busy !== null || words.trim().length < 3}>{busy === 'draft' ? 'Reading…' : <>Set it up<ArrowUp/></>}</Button>
      </div>
    </section>
    : <section className={`${s.surface} ${s.folioDraft}`} aria-label="Your portfolio, before it starts">
      <div className={s.folioDraftHead}>
        <div className={s.grow}><b>{draft.name}</b><small>Portfolio · {sol(draft.mandate.budgetSol, 2)} on paper</small></div>
        <span className={s.pill}>Draft</span>
      </div>
      <p className={s.folioWords}>“{draft.mandate.words}”</p>
      <ul className={s.folioSteps}>
        <li><BotAvatar role="research" size={24}/><span><b>ResearchBot</b> finds coins that fit: {draft.mandate.summary.replace(/\.$/, '')}. Coins {AGE_TEXT[draft.mandate.age]}.</span></li>
        <li><BotAvatar role="sniper" size={24}/><span><b>SniperBot</b> buys {draft.mandate.coins} of them, up to {sol(draft.mandate.perCoinSol, 2)} each, and keeps some SOL free to add on dips.</span></li>
        <li><BotAvatar role="trader" size={24}/><span><b>TraderBot</b> holds for about {draft.mandate.holdDays} days, and sells when a coin’s story fades.</span></li>
        <li><BotAvatar role="coordinator" size={24}/><span><b>HOTBOT</b> wakes on price and liquidity moves and at least every {draft.mandate.reviewHours} h. Each decision comes to your phone.</span></li>
      </ul>
      <div className={s.folioChips}>{limitChips(draft.mandate).map(chip => <span key={chip} className={s.folioChip}>{chip}</span>)}</div>
      <div className={s.folioFits}><small>Fits now</small>{draft.fits.length ? draft.fits.slice(0, 6).map(coin => <span key={coin.address} className={s.folioFit}>{coinAvatar(coin, 'size-5 rounded-full')}<b>{coin.symbol}</b><small>{usd(coin.capUsd)}</small></span>) : <span className={s.muted}>Nothing passes the checks right now. HOTBOT keeps looking once it starts.</span>}{draft.fits.length > 6 && <small>+{draft.fits.length - 6}</small>}</div>
      <div className={s.folioDraftActions}>
        <Button className={s.emberButton} onClick={() => void begin()} disabled={busy !== null}>{busy === 'start' ? 'Starting…' : 'Start portfolio'}</Button>
        <Button variant="outline" onClick={() => changeRef.current?.focus()} disabled={busy !== null}>Change</Button>
      </div>
      <div className={s.folioChange}>
        <span className={s.folioSay}>{['Ask me before each trade', 'Only coins older than 2 months', `${Math.max(1, Math.round(draft.mandate.budgetSol * 2))} SOL`].map(quick => <button key={quick} type="button" disabled={busy !== null} onClick={() => void read(quick, draft)}>{quick}</button>)}</span>
        <form className={s.folioChangeBox} onSubmit={event => { event.preventDefault(); void read(change, draft); }}>
          <label htmlFor="folio-change" className="sr-only">Tell HOTBOT what to change</label>
          <input id="folio-change" ref={changeRef} value={change} maxLength={MANDATE.words} placeholder="Tell HOTBOT what to change" onChange={event => setChange(event.target.value)}/>
          <Button type="submit" size="icon" aria-label="Send the change" disabled={busy !== null || change.trim().length < 3}><ArrowUp/></Button>
        </form>
      </div>
      <PaperNote compact/>
    </section>}
  </div>;
}

const hookChips = (hooks: Hook[], now: number) => hooks.filter(hook => hook.kind !== 'review').map(hook => hookText(hook, now));
const reviewAt = (hooks: Hook[]) => hooks.find((hook): hook is Extract<Hook, { kind: 'review' }> => hook.kind === 'review')?.at ?? null;

function Holding({ coin, data, now }: { coin: CoinRow; data: PageData; now: number }) {
  const worth = coin.position.qty * coin.mark.priceUsd / (data.solUsd || 1), gain = profit(coin.position, coin.mark.priceUsd, data.solUsd || 1), gainPct = coin.position.paidSol > 0 ? gain / coin.position.paidSol * 100 : 0;
  const share = data.startSol > 0 ? worth / Math.max(1e-9, totalWorth(data)) * 100 : 0, look = reviewAt(coin.hooks), chips = hookChips(coin.hooks, now);
  return <li className={`${s.surface} ${s.folioHolding}`}>
    <div className={s.folioHoldingHead}>
      {coinAvatar(coin, 'size-10 rounded-full')}
      <span className={s.grow}><b>{coin.symbol}<small> · {Math.round(share)}% of it</small></b><small>{sol(worth, 2)} · held {Math.max(1, Math.round((now - coin.position.boughtAt) / 86_400_000))} d · {price(coin.mark.priceUsd)}</small></span>
      <span className={s.folioHoldingMoney}><b className={`${s.num} ${s[tone(gain) ?? 'muted']}`}>{pct(gainPct)}</b><small className={s[tone(gain) ?? 'muted']}>{signedSol(gain, 2)}</small></span>
    </div>
    <p className={s.folioThesis}>{coin.thesis.why}</p>
    {coin.thesis.wrong && <p className={s.folioWrong}><b>Wrong if</b> {coin.thesis.wrong}</p>}
    <div className={s.folioHooks}><small>Wakes if</small>{chips.length ? chips.map(chip => <span key={chip} className={s.folioChip}>{chip}</span>) : <span className={s.muted}>only its review clock</span>}</div>
    <small className={s.folioFoot}>{look ? (look <= now ? 'Looking now' : `Next look in ${until(look, now)}`) : 'No look set'} · the floor sells at −{FLOOR.dropPct}% on its own</small>
  </li>;
}
const totalWorth = (data: PageData) => data.cashSol + data.coins.filter(coin => coin.status === 'held').reduce((sum, coin) => sum + coin.position.qty * coin.mark.priceUsd / (data.solUsd || 1), 0);

const ENTRY_TONE: Partial<Record<Entry['kind'], string>> = { floor: 'down', stop: 'down', pick: 'ember' };
function JournalRow({ entry, now, onOpen }: { entry: Entry; now: number; onOpen: () => void }) {
  const money = entry.pnlSol != null ? <b className={`${s.num} ${s[tone(entry.pnlSol) ?? 'muted']}`}>{signedSol(entry.pnlSol, 2)}</b> : entry.sol != null && entry.action === 'add' ? <b className={s.num}>{sol(entry.sol, 2)}</b> : null;
  return <li><button type="button" className={s.folioEntry} onClick={onOpen} data-tone={ENTRY_TONE[entry.kind]}>
    {entry.address && entry.symbol ? coinAvatar({ address: entry.address, symbol: entry.symbol, logo: entry.logo }, 'size-7 rounded-full') : <BotAvatar role="coordinator" size={24}/>}
    <span className={s.grow}><span>{entry.line}</span>{entry.why && <small>{entry.why}</small>}</span>
    <span className={s.folioEntryEnd}>{entry.status === 'pending' ? <span className={s.folioAskTag}>Asks you</span> : entry.status === 'skipped' ? <small>Skipped</small> : money}<small>{ago(entry.at, now)}</small></span>
  </button></li>;
}

/** One journal entry in full: why it woke, what it read, what it decided and what it watches next. An open ask can be answered here. */
function EntryDialog({ entry, data, onClose }: { entry: Entry; data: PageData; onClose: () => void }) {
  const answer = useMutation(api.portfolios.answer), act = useAct(), now = useNow(30_000);
  const coin = data.coins.find(row => row.id === entry.coinId), mark = entry.read?.mark;
  const reply = async (approve: boolean) => { if (await act(() => answer({ entryId: entry.id, approve })) !== undefined) { toast.success(approve ? 'Approved: filled on paper' : 'Skipped'); onClose(); } };
  const tiles: [string, ReactNode][] = mark ? [['Price', price(mark.priceUsd)], ['24 h', <span key="d" className={s[tone(mark.change24hPct) ?? 'muted']}>{pct(mark.change24hPct)}</span>], ['Liquidity', usd(mark.liquidityUsd)], ['Market cap', usd(mark.capUsd)], ['Volume, 24 h', usd(mark.volume24hUsd)],
    ...(coin ? [['From entry', <span key="e" className={s[tone(pctFrom(coin.position.entryPriceUsd, mark.priceUsd)) ?? 'muted']}>{pct(pctFrom(coin.position.entryPriceUsd, mark.priceUsd))}</span>] as [string, ReactNode]] : []),
    ...(entry.read?.pumpUsers != null ? [['pump.fun holders', entry.read.pumpUsers.toLocaleString('en-US')] as [string, ReactNode]] : []), ...(entry.read?.callouts != null ? [['Callouts', String(entry.read.callouts)] as [string, ReactNode]] : []), ...(entry.read?.theses != null ? [['Fomo theses', entry.read.theses.toLocaleString('en-US')] as [string, ReactNode]] : [])] : [];
  const hooks = entry.hooks ? [...hookChips(entry.hooks, entry.at), ...(reviewAt(entry.hooks) ? [hookText({ kind: 'review', at: reviewAt(entry.hooks)! }, entry.at)] : [])] : [];
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={`${s.folioDialog} sm:max-w-[40rem]`}>
      <div className={s.folioDialogHead}>
        {entry.address && entry.symbol ? coinAvatar({ address: entry.address, symbol: entry.symbol, logo: entry.logo }, 'size-12 rounded-full') : <BotAvatar role="coordinator" size={40}/>}
        <div className={s.grow}><DialogTitle className={s.folioDialogTitle}>{entry.line}</DialogTitle><DialogDescription>{data.name} · {new Date(entry.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · paper</DialogDescription></div>
      </div>
      {(entry.pnlSol != null || entry.sol != null) && <div className={s.folioFigures}>
        {entry.pnlSol != null && <div><small>Made</small><b className={`${s.num} ${s[tone(entry.pnlSol) ?? 'muted']}`}>{signedSol(entry.pnlSol, 3)}</b></div>}
        {entry.sol != null && <div><small>{entry.action === 'add' ? 'Put in' : 'Sold for'}</small><b className={s.num}>{sol(entry.sol, 3)}</b></div>}
        {coin && coin.status === 'held' && <div><small>Still held</small><b className={s.num}>{sol(coin.position.qty * coin.mark.priceUsd / (data.solUsd || 1), 2)}</b></div>}
      </div>}
      {entry.fired && entry.fired.length > 0 && <div className={s.folioStep}><BotAvatar role="coordinator" size={22}/><div><b>Why it woke</b><div className={s.folioChips}>{entry.fired.map(chip => <span key={chip} className={s.folioChip} data-fired>{chip}</span>)}</div></div></div>}
      {tiles.length > 0 && <div className={s.folioStep}><BotAvatar role="research" size={22}/><div><b>What it read</b><div className={s.folioTiles}>{tiles.map(([label, value]) => <span key={label}><small>{label}</small><b className={s.num}>{value}</b></span>)}</div></div></div>}
      {entry.why && <div className={s.folioStep}><BotAvatar role="trader" size={22}/><div><b>{entry.kind === 'pick' ? 'Why it picked it' : entry.kind === 'pass' ? 'Why it passed' : 'What it decided'}</b><p>{entry.why}</p>
        {entry.kind === 'pick' && coin?.thesis.wrong && <p className={s.folioWrong}><b>Wrong if</b> {coin.thesis.wrong}</p>}
        {entry.kind === 'pick' && coin?.thesis.add && <p className={s.folioWrong}><b>Adds when</b> {coin.thesis.add}</p>}
        {entry.planned && <p className={s.folioWrong}><b>Wants to</b> {entry.planned.action === 'add' ? `add ${sol(entry.planned.sol, 2)}` : entry.planned.action === 'exit' ? 'sell all of it' : `sell ${coin && coin.position.qty > 0 ? Math.round(entry.planned.qty / coin.position.qty * 100) : '?'}%`}{entry.planned.note ? `, ${entry.planned.note}` : ''}</p>}
        {hooks.length > 0 && <div className={s.folioChips}>{hooks.map(chip => <span key={chip} className={s.folioChip}>{chip}</span>)}</div>}</div></div>}
      <div className={s.folioDialogFoot}>
        <small className={s.muted}><ShieldCheck aria-hidden/>The floor stays on: sells at −{FLOOR.dropPct}% or a drained pool, and the limits bound every trade.</small>
        {entry.status === 'pending' && (entry.expiresAt ?? 0) > now ? <span className={s.headActions}><Button variant="outline" size="sm" onClick={() => void reply(false)}><X/>Skip</Button><Button size="sm" onClick={() => void reply(true)}><Check/>Approve</Button></span> : <Button size="sm" variant="outline" onClick={onClose}>Done</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}

/** The limits a person may change after the start, bounded again on the server. */
function LimitsDialog({ data, onClose }: { data: PageData; onClose: () => void }) {
  const setLimits = useMutation(api.portfolios.setLimits), act = useAct();
  const [perCoin, setPerCoin] = useState(data.mandate.perCoinSol), [trades, setTrades] = useState(data.mandate.tradesPerDay), [stop, setStop] = useState(data.mandate.stopAllSol);
  const save = async () => { if (await act(() => setLimits({ id: data.id, perCoinSol: perCoin, tradesPerDay: trades, stopAllSol: stop })) !== undefined) { toast.success('Limits saved'); onClose(); } };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={`${s.folioDialog} sm:max-w-[40rem]`}>
      <DialogTitle>Limits</DialogTitle>
      <DialogDescription>HOTBOT’s trades stay inside these. Trades over them ask you first unless it acts fully.</DialogDescription>
      <div className={s.folioLimits}>
        <label><span>Most SOL in one coin</span><Num kind="sol" label="Most SOL in one coin" value={perCoin} onChange={setPerCoin} min={0.05} max={data.startSol}/></label>
        <label><span>Trades a day</span><Num kind="count" label="Trades a day" value={trades} onChange={setTrades} min={1} max={MANDATE.tradesPerDay.max} integer/></label>
        <label><span>Sell everything and stop under</span><Num kind="sol" label="Stop all under" value={stop} onChange={setStop} min={0} max={data.startSol * 0.95}/></label>
      </div>
      <div className={s.folioDialogFoot}><span/><span className={s.headActions}><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void save()}>Save</Button></span></div>
    </DialogContent>
  </Dialog>;
}

/** One portfolio: how it's going against buy-and-hold, what it holds and why, how much HOTBOT does alone, and its journal. */
export function PortfolioPage({ id }: { id: string }) {
  const data = useQuery(api.portfolios.page, { id, ...useAtomValue(viewAsAtom) }), now = useNow(30_000), act = useAct(), router = useRouter();
  const setStatus = useMutation(api.portfolios.setStatus), setLimits = useMutation(api.portfolios.setLimits);
  const [open, setOpen] = useState<Entry | null>(null), [limits, setLimitsOpen] = useState(false), [archiving, setArchiving] = useState(false);
  if (data === undefined) return <div className={s.page}><Loading variant="page"/></div>;
  if (data === null) return <div className={s.page}><Link href={appHref('portfolios')} className={s.back}><ArrowLeft size={14}/>Portfolios</Link><p className={s.empty}>This portfolio isn’t there any more.</p></div>;
  const held = data.coins.filter(coin => coin.status === 'held'), sold = data.coins.filter(coin => coin.status === 'exited');
  const worth = totalWorth(data), last = data.points.at(-1), hold = last?.hold ?? data.startSol, pnl = worth - data.startSol, vsHold = worth - hold;
  const cover = held.map(coin => coin.header).find(Boolean), asks = data.journal.filter(entry => entry.status === 'pending' && (entry.expiresAt ?? 0) > now);
  const looks = held.map(coin => reviewAt(coin.hooks)).filter((at): at is number => at != null), next = looks.length ? Math.min(...looks) : null;
  const archive = async () => { if (await act(() => setStatus({ id: data.id, status: 'archived' })) !== undefined) router.push(appHref('portfolios')); };
  return <div className={s.page}>
    <Link href={appHref('portfolios')} className={s.back}><ArrowLeft size={14}/>Portfolios</Link>
    <header className={s.folioHero} data-art={cover ? undefined : true}>
      {cover && <img src={cover} alt="" referrerPolicy="no-referrer"/>}
      <div className={s.folioHeroText}>
        <span className={s.folioCoins}>{held.slice(0, 5).map(coin => <span key={coin.id}>{coinAvatar(coin, 'size-12 rounded-full')}</span>)}</span>
        <div><span className={s.folioKicker}>Portfolio · paper</span><h1 className={s.title}>{data.name}</h1><p className={s.sub}>{data.mandate.summary}</p></div>
      </div>
      <div className={s.folioHeroActions}>
        {data.status === 'running' || data.status === 'picking' ? <button type="button" className={s.toggleButton} onClick={() => void act(() => setStatus({ id: data.id, status: 'paused' }))}><Pause/>Pause</button>
          : data.status === 'paused' ? <button type="button" className={s.toggleButton} data-go onClick={() => void act(() => setStatus({ id: data.id, status: 'running' }))}><Play/>Run</button> : null}
        <button type="button" className={s.toggleButton} onClick={() => setLimitsOpen(true)}><SlidersHorizontal/>Limits</button>
        <button type="button" className={s.toggleButton} onClick={() => setArchiving(true)}><Archive/>Archive</button>
      </div>
    </header>
    <PaperNote compact/>
    <div className={s.split}>
      <div className={s.col}>
        <section className={`${s.surface} ${s.folioPanel}`} aria-label="How it's going">
          <div className={s.sectionHead}><h2>How it’s going</h2><span>{STATUS_TEXT[data.status]}{next && data.status === 'running' ? ` · next look in ${until(next, now)}` : ''}</span></div>
          <div className={s.folioNow}>
            <div><p className={s.big}>{worth.toFixed(2)}<small>SOL</small></p><div className={s.moneyLine}><b className={s[tone(pnl) ?? 'muted']}>{signedSol(pnl, 2)} · {pct(pnl / data.startSol * 100)}</b><span>since {new Date(data.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>{data.solUsd > 0 && <span>{usd(worth * data.solUsd)} now</span>}</div></div>
            <div className={s.folioVs}><small>Buy-and-hold of the same picks</small><b className={s.num}>{sol(hold, 2)}</b><small className={s[tone(vsHold) ?? 'muted']}>{held.length || sold.length ? `${signedSol(vsHold, 2)} ${vsHold >= 0 ? 'ahead' : 'behind'}` : 'Starts with the first picks'}</small></div>
          </div>
          <ValueLine points={data.points} start={data.startSol}/>
          <div className={s.folioLegend}><span><i data-line="value"/>This portfolio</span><span><i data-line="hold"/>Bought once, never touched</span></div>
          {worth > 0 && <div className={s.folioAlloc} role="img" aria-label="What it holds, by share of its worth">
            {held.map(coin => { const part = coin.position.qty * coin.mark.priceUsd / (data.solUsd || 1) / worth * 100; return <span key={coin.id} style={{ flexGrow: part }} title={`${coin.symbol} ${Math.round(part)}%`}><b>{coin.symbol}</b><small>{Math.round(part)}%</small></span>; })}
            <span data-free style={{ flexGrow: data.cashSol / worth * 100 }}><b>Free SOL</b><small>{sol(data.cashSol, 2)}</small></span>
          </div>}
        </section>
        <section className={s.section} aria-label="What it holds">
          <div className={s.sectionHead}><h2>What it holds<small>{held.length}</small></h2>{data.status === 'picking' && <span>Picking now…</span>}</div>
          {held.length ? <ul className={s.folioHoldings}>{held.map(coin => <Holding key={coin.id} coin={coin} data={data} now={now}/>)}</ul>
            : <p className={s.empty}>{data.status === 'picking' ? 'HOTBOT is looking for coins that fit. It picks within a few minutes and tells you why.' : data.status === 'stopped' ? 'It sold everything at its stop floor.' : 'Nothing held. HOTBOT looks for more coins once a day.'}</p>}
          {sold.length > 0 && <Collapsible className={s.exact}><CollapsibleTrigger><ChevronRight/>Sold<small>{sold.length}</small></CollapsibleTrigger><CollapsibleContent>
            <ul className={s.folioSold}>{sold.map(coin => { const gain = coin.position.realizedSol - coin.position.paidSol; return <li key={coin.id}>{coinAvatar(coin, 'size-7 rounded-full')}<span className={s.grow}><b>{coin.symbol}</b><small>held {Math.max(1, Math.round(((coin.exitedAt ?? now) - coin.position.boughtAt) / 86_400_000))} d</small></span><b className={`${s.num} ${s[tone(gain) ?? 'muted']}`}>{signedSol(gain, 2)}</b></li>; })}</ul>
          </CollapsibleContent></Collapsible>}
        </section>
      </div>
      <aside className={s.col}>
        {asks.length > 0 && <section className={`${s.surface} ${s.folioNeeds}`} aria-label="Needs you">
          <div className={s.sectionHead}><h2>Needs you<small>{asks.length}</small></h2></div>
          {asks.map(entry => <button key={entry.id} type="button" className={s.folioNeed} onClick={() => setOpen(entry)}><b>{entry.line}</b><small>{entry.planned?.note ? `${entry.planned.note} · ` : ''}skips in {until(entry.expiresAt ?? now, now)}</small><span>Review<ChevronRight aria-hidden/></span></button>)}
        </section>}
        <section className={`${s.surface} ${s.folioPanel}`} aria-label="How much HOTBOT does alone">
          <div className={s.sectionHead}><h2>How much HOTBOT does alone</h2></div>
          <QuickPicks options={(['ask', 'limits', 'full'] as const).map(value => ({ value, text: AUTONOMY_TEXT[value].label }))} value={data.mandate.autonomy} onPick={value => void act(() => setLimits({ id: data.id, autonomy: value }))}/>
          <small className={s.muted}>{AUTONOMY_TEXT[data.mandate.autonomy].note}</small>
          <div className={s.folioChips}>{limitChips(data.mandate).slice(1).map(chip => <span key={chip} className={s.folioChip}>{chip}</span>)}</div>
          <small className={s.muted}>{data.tradesToday} trade{data.tradesToday === 1 ? '' : 's'} today · theme: “{data.mandate.words}”</small>
        </section>
        <section className={s.section} aria-label="What HOTBOT did">
          <div className={s.sectionHead}><h2>What HOTBOT did</h2><span><Eye size={13} aria-hidden/> Tap for the why</span></div>
          {data.journal.length ? <ul className={s.folioJournal}>{data.journal.map(entry => <JournalRow key={entry.id} entry={entry} now={now} onOpen={() => setOpen(entry)}/>)}</ul> : <p className={s.empty}>Nothing yet.</p>}
        </section>
      </aside>
    </div>
    {open && <EntryDialog entry={data.journal.find(entry => entry.id === open.id) ?? open} data={data} onClose={() => setOpen(null)}/>}
    {limits && <LimitsDialog data={data} onClose={() => setLimitsOpen(false)}/>}
    <Dialog open={archiving} onOpenChange={setArchiving}>
      <DialogContent className="sm:max-w-[26rem]">
        <DialogTitle>Archive {data.name}?</DialogTitle>
        <DialogDescription>It stops watching its coins and leaves your list. It trades on paper, so no SOL moves.</DialogDescription>
        <div className={s.folioDialogFoot}><span/><span className={s.headActions}><Button variant="outline" size="sm" onClick={() => setArchiving(false)}>Keep it</Button><Button size="sm" variant="destructive" onClick={() => void archive()}><Archive/>Archive</Button></span></div>
      </DialogContent>
    </Dialog>
  </div>;
}
