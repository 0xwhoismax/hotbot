"use client";
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { ArrowDown, ArrowRight, ArrowUp, Check, LoaderCircle, Skull, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { api, useQuery } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { failToast, viewedAtom } from './state';
import { FirstTip } from './Parts';
import { pct } from './format';
import type { ChartRating } from './CoinChart';
import { FEEDBACK, FEEDBACK_VERDICTS, type FeedbackMark, type FeedbackVerdict } from '../../../../types/feedback';
import s from './team.module.css';

/** The coin a rating is about: an item of the person's own pipeline (its page), or any coin by mint (the Lab). */
export type RateCoin = { mint: string; symbol: string; itemId?: string };
type Saved = { verdict: FeedbackVerdict; buy: FeedbackMark | null; sell: FeedbackMark | null; note: string };
export type CoinRating = ReturnType<typeof useCoinRating>;
const ICON = { want: ThumbsUp, untradable: Skull, not: ThumbsDown };
/** The sparks of a saved rating, by the angle each flies at. */
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

export function useCoinRating(coin: RateCoin | null | undefined) {
  const viewed = useAtomValue(viewedAtom), available = Boolean(coin) && !viewed;
  const mine = useQuery(api.feedback.mine, coin && !viewed ? { mint: coin.mint } : 'skip');
  const write = useMutation(api.feedback.save), erase = useMutation(api.feedback.remove), [busy, setBusy] = useState(false);
  // Counts the verdicts and marks saved here, so the button celebrates each one once.
  const [saved, setSaved] = useState(0);
  // Which mark the chart takes next. `placed` holds the buy while its save is in flight, so the sell after it never waits on the round trip.
  const [armed, setArmed] = useState<'buy' | 'sell' | null>(null), placed = useRef<FeedbackMark | null>(null), picked = useRef<FeedbackVerdict | null>(null);
  /** Saves the change; true once it saved (a failure shows its toast). */
  const save = async (change: Partial<Saved>) => {
    if (!coin) return false;
    // A rating needs a verdict: marks alone say the person would trade it.
    const next = { verdict: change.verdict ?? picked.current ?? mine?.verdict ?? 'want', buy: 'buy' in change ? change.buy! : mine?.buy ?? null, sell: 'sell' in change ? change.sell! : mine?.sell ?? null, note: change.note ?? mine?.note ?? '' };
    setBusy(true);
    try {
      await write({ ...(coin.itemId ? { itemId: coin.itemId } : {}), coin: { mint: coin.mint, symbol: coin.symbol }, verdict: next.verdict,
        ...(next.buy ? { buy: next.buy } : {}), ...(next.sell ? { sell: next.sell } : {}), ...(next.note.trim() ? { note: next.note.trim() } : {}) });
      if (change.verdict) picked.current = change.verdict;
      if (change.verdict || change.buy || change.sell) setSaved(count => count + 1);
      return true;
    } catch (cause) { failToast(cause); return false; } finally { setBusy(false); }
  };
  const remove = async () => { if (!coin) return; setBusy(true); try { await erase({ mint: coin.mint }); toast.success('Rating removed'); } catch (cause) { failToast(cause); } finally { setBusy(false); } };
  const arm = (kind: 'buy' | 'sell' | null) => {
    if (kind === 'sell' && !(placed.current ?? mine?.buy)) kind = 'buy';
    if (kind === 'buy') placed.current = null; else if (kind === 'sell') placed.current ??= mine?.buy ?? null;
    setArmed(kind);
  };
  const onMark = (kind: 'buy' | 'sell', mark: FeedbackMark) => {
    if (!armed) return;
    if (kind === 'buy' || !(placed.current ?? mine?.buy)) {
      placed.current = mark;
      void save({ buy: mark, sell: mine?.sell && mine.sell.t > mark.t ? mine.sell : null });
      return setArmed('sell');
    }
    const buy = (placed.current ?? mine?.buy)!;
    if (mark.t <= buy.t) return toast('Mark your sell after your buy.');
    setArmed(null);
    void save({ buy, sell: mark });
  };
  const stop = () => setArmed(null);
  useEffect(() => {
    if (!armed) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setArmed(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed]);
  const chart: ChartRating | undefined = armed
    ? { mode: armed, buy: armed === 'sell' ? placed.current ?? mine?.buy ?? null : null, sell: null, onMark, ghost: true }
    : mine ? { mode: null, buy: mine.buy, sell: mine.sell, onMark: () => {} } : undefined;
  return { available, mine, busy, saved, save, remove, armed, arm, marking: armed !== null, stop, chart };
}

const TONE = { want: 'positive', untradable: 'destructive', not: undefined } as const;

/** The rating as one panel, the same in the quick look and in the Rate popover. Standard parts only: three verdict keys (one click saves and moves the cursor to
 *  the note), the buy and sell keys in a section that opens in place after "would trade" and arms the chart, and a field for the note with its
 *  confirm key inside (Enter or leaving the field saves too). */
export function RatePanel({ rating, supply = null }: { rating: CoinRating; supply?: number | null }) {
  const { format } = usePriceDisplay(), mine = rating.mine, note = useRef<HTMLInputElement>(null), [draft, setDraft] = useState<string | null>(null);
  // When the note last saved, so its key turns green and fades once for each save; `writing` keeps Enter and the blur after it to one save.
  const [noted, setNoted] = useState(0), writing = useRef(false);
  if (!rating.available) return null;
  const verdict = mine?.verdict as FeedbackVerdict | undefined, buy = mine?.buy ?? null, sell = mine?.sell ?? null;
  const gain = buy && sell ? (sell.priceUsd / buy.priceUsd - 1) * 100 : null;
  const choose = (next: FeedbackVerdict) => {
    void rating.save({ verdict: next });
    if (next === 'want') rating.arm(buy ? sell ? null : 'sell' : 'buy'); else rating.stop();
    note.current?.focus();
  };
  const slot = (kind: 'buy' | 'sell', mark: FeedbackMark | null) => {
    const Icon = kind === 'buy' ? ArrowUp : ArrowDown;
    return <Button type="button" variant="secondary" tone={kind === 'buy' ? 'positive' : 'destructive'} className="min-w-[7.5rem] tabular-nums" data-state={mark ? 'set' : undefined} aria-pressed={rating.armed === kind}
      aria-label={kind === 'buy' ? 'Place your buy' : 'Place your sell'} disabled={rating.busy} onClick={() => rating.arm(kind)}>
      <Icon/>{rating.armed !== kind && mark ? format(mark.priceUsd, supply) : '···'}
    </Button>;
  };
  const kept = mine?.note ?? '', changed = draft !== null && draft.trim() !== kept.trim();
  const keep = async () => {
    if (!changed || writing.current) return;
    writing.current = true;
    if (await rating.save({ note: draft ?? kept })) setNoted(Date.now());
    writing.current = false;
  };
  return <div className="flex flex-col gap-2.5">
    <div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Would you trade it?">{FEEDBACK_VERDICTS.map(v => {
        const VerdictIcon = ICON[v.id];
        return <Button key={v.id} type="button" variant="secondary" tone={TONE[v.id]} className="min-w-0 px-2 max-sm:gap-1 max-sm:px-1 max-sm:text-[0.8125rem]" aria-pressed={verdict === v.id} title={v.detail} onClick={() => choose(v.id)}><VerdictIcon/>{v.label}</Button>;
      })}</div>
      <Collapsible open={verdict === 'want'}><CollapsibleContent>
        <div className="flex items-center justify-center gap-4 pt-2.5">
          {slot('buy', buy)}
          <span className={`min-w-10 text-center text-sm font-bold tabular-nums ${gain === null ? 'text-muted-foreground' : gain >= 0 ? 'text-[var(--positive)]' : 'text-[var(--destructive)]'}`}>{gain === null ? <ArrowRight className="mx-auto size-4"/> : pct(gain)}</span>
          {slot('sell', sell)}
        </div>
      </CollapsibleContent></Collapsible>
    </div>
    <div className="flex items-center gap-2">
      <div className={s.noteField} data-state={changed ? 'ready' : noted ? 'saved' : undefined}>
        <Input ref={note} value={draft ?? kept} maxLength={FEEDBACK.note} placeholder="Why?" aria-label="Note" onChange={event => setDraft(event.target.value)}
          onBlur={() => void keep()} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void keep(); event.currentTarget.blur(); } }}/>
        {/* Pressing it keeps the field focused, so its click saves once instead of the blur saving first. */}
        <button key={noted} type="button" className={s.noteKey} aria-label="Save the note" tabIndex={changed ? 0 : -1} aria-hidden={!changed || undefined} disabled={!changed || rating.busy}
          onPointerDown={event => event.preventDefault()} onClick={() => { void keep(); note.current?.blur(); }}><Check/></button>
      </div>
      {mine && <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={buy ? 'Clear the marks' : 'Remove the rating'} title={buy ? 'Clear the marks' : 'Remove the rating'} disabled={rating.busy}
        onClick={() => { if (buy) { void rating.save({ buy: null, sell: null }); rating.arm('buy'); } else void rating.remove(); }}>{buy ? <X/> : <Trash2/>}</Button>}
    </div>
  </div>;
}

/** Rate beside Report: one Button that asks to be pressed. Unrated it wears ember and its thumb nods now and then; a saved verdict takes the
 *  verdict's colour and bursts once. It opens the rating panel in a popover, where arming a mark and clicking the chart dismisses it; with
 *  `onToggle` its owner shows the panel in place instead (the quick look) and `open` says whether it is showing. Either way it reads pressed
 *  while the rating shows. */
export function RateButton({ rating, symbol, supply = null, className, tip = true, open: shown, onToggle }: { rating: CoinRating; symbol: string; supply?: number | null; className?: string; tip?: boolean; open?: boolean; onToggle?: () => void }) {
  const [open, setOpen] = useState(false), mine = rating.mine, button = useRef<HTMLButtonElement>(null);
  if (!rating.available) return null;
  const gain = mine?.buy && mine.sell ? (mine.sell.priceUsd / mine.buy.priceUsd - 1) * 100 : null;
  const verdict = mine?.verdict as FeedbackVerdict | undefined, Icon = verdict ? ICON[verdict] : ThumbsUp;
  const key = <Button ref={button} type="button" size="sm" variant="secondary" className={`${s.rateButton} ${className ?? ''}`} data-verdict={verdict ?? 'none'} aria-label={`Rate ${symbol}`}
    aria-pressed={onToggle ? Boolean(shown) : rating.marking || open} onClick={onToggle}>
    <span key={rating.saved} className={s.rateIcon} data-pop={rating.saved > 0 || undefined}>{rating.busy ? <LoaderCircle className="animate-spin"/> : <Icon/>}</span>
    {verdict ? FEEDBACK_VERDICTS.find(row => row.id === verdict)!.label : 'Rate'}{gain !== null && <small data-tone={gain >= 0 ? 'up' : 'down'}>{pct(gain)}</small>}
    {rating.saved > 0 && <span key={`burst${rating.saved}`} className={s.rateBurst} aria-hidden>{SPARKS.map(angle => <i key={angle} style={{ '--a': `${angle}deg` } as CSSProperties}/>)}</span>}
  </Button>;
  return <>{onToggle ? key : <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>{key}</PopoverTrigger>
    <PopoverContent align="end" className="w-[24rem] p-3"><RatePanel rating={rating} supply={supply}/></PopoverContent>
  </Popover>}
  <FirstTip id="rate" when={tip} anchor={button} side="bottom" align="end" title="Rate this trade" text="Mark where you’d buy and sell. It trains better setups, and soon tunes strategies live."/></>;
}
