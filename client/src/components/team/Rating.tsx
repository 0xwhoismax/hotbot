"use client";
import { useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, LoaderCircle, MousePointerClick, ThumbsUp, X } from 'lucide-react';
import { api, useQuery, type Id } from '@/lib/convex';
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
const SHORT: Record<FeedbackVerdict, string> = { want: 'Would trade', untradable: 'Scam', not: 'Not for me' };

/** A person's rating of a coin (convex/feedback.ts): whether they'd trade it and where they'd buy and sell, marked on the chart. Every pick
 *  saves at once; marking places the buy and then the sell on the chart and saves when both are down. Nobody rates while an admin views
 *  someone else's team. */
export function useCoinRating(coin: RateCoin | null | undefined) {
  const viewed = useAtomValue(viewedAtom), available = Boolean(coin) && !viewed;
  const mine = useQuery(api.feedback.mine, coin && !viewed ? { mint: coin.mint } : 'skip');
  const write = useMutation(api.feedback.save), erase = useMutation(api.feedback.remove), [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState<{ mode: 'buy' | 'sell'; buy: FeedbackMark | null } | null>(null);
  const save = async (change: Partial<Saved>) => {
    if (!coin) return;
    // A rating needs a verdict: marks alone say the person would trade it.
    const next = { verdict: change.verdict ?? mine?.verdict ?? 'want', buy: 'buy' in change ? change.buy! : mine?.buy ?? null, sell: 'sell' in change ? change.sell! : mine?.sell ?? null, note: change.note ?? mine?.note ?? '' };
    setBusy(true);
    try {
      await write({ ...(coin.itemId ? { itemId: coin.itemId as Id<'teamItems'> } : { coin: { mint: coin.mint, symbol: coin.symbol } }), verdict: next.verdict,
        ...(next.buy ? { buy: next.buy } : {}), ...(next.sell ? { sell: next.sell } : {}), ...(next.note.trim() ? { note: next.note.trim() } : {}) });
    } catch (cause) { failToast(cause); } finally { setBusy(false); }
  };
  const remove = async () => { if (!coin) return; setBusy(true); try { await erase({ mint: coin.mint }); toast.success('Rating removed'); } catch (cause) { failToast(cause); } finally { setBusy(false); } };
  // Marking: the buy first, then the sell after it; both down saves them.
  const onMark = (kind: 'buy' | 'sell', mark: FeedbackMark) => {
    if (!marking) return;
    if (kind === 'buy' || !marking.buy) return setMarking({ mode: 'sell', buy: mark });
    if (mark.t <= marking.buy.t) return toast('Mark your sell after your buy.');
    setMarking(null);
    void save({ buy: marking.buy, sell: mark }).then(() => toast.success(`Marked ${coin?.symbol}: ${pct((mark.priceUsd / marking.buy!.priceUsd - 1) * 100)}`));
  };
  const stop = () => setMarking(null);
  const chart: ChartRating | undefined = marking
    ? { mode: marking.mode, buy: marking.buy, sell: null, onMark, prompt: marking.mode === 'buy' ? 'Click the candle where you would buy' : 'Now click where you would sell', onCancel: stop }
    : mine ? { mode: null, buy: mine.buy, sell: mine.sell, onMark: () => {} } : undefined;
  return { available, mine, busy, save, remove, marking: Boolean(marking), mark: () => setMarking({ mode: 'buy', buy: null }), stop, chart };
}

/** Rate beside Report: one button that shows the saved verdict, opening a small card. A verdict saves on click; Mark on chart closes the card
 *  and puts the chart in marking; the note saves when it loses focus. Nothing on the page moves. */
export function RateButton({ rating, symbol, supply = null, className }: { rating: CoinRating; symbol: string; supply?: number | null; className?: string }) {
  const { format } = usePriceDisplay(), [open, setOpen] = useState(false), mine = rating.mine;
  const [note, setNote] = useState<string | null>(null), button = useRef<HTMLButtonElement>(null);
  if (!rating.available) return null;
  const gain = mine?.buy && mine.sell ? (mine.sell.priceUsd / mine.buy.priceUsd - 1) * 100 : null;
  return <><Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setNote(null); }}>
    <PopoverTrigger asChild>
      <button ref={button} type="button" className={`${s.rateButton} ${className ?? ''}`} data-verdict={mine?.verdict} aria-pressed={rating.marking || open}>
        {rating.busy ? <LoaderCircle className="animate-spin"/> : <ThumbsUp/>}{mine ? SHORT[mine.verdict as FeedbackVerdict] : 'Rate'}{gain !== null && <small data-tone={gain >= 0 ? 'up' : 'down'}>{pct(gain)}</small>}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className={`w-[21rem] p-3 ${s.ratePop}`}>
      <b className={s.rateTitle}>Rate {symbol}</b>
      <div className={s.rateVerdicts} role="group" aria-label="Would you trade it?">{FEEDBACK_VERDICTS.map(v =>
        <button key={v.id} type="button" aria-pressed={mine?.verdict === v.id} disabled={rating.busy} title={v.detail} onClick={() => void rating.save({ verdict: v.id })}>{mine?.verdict === v.id && <Check/>}{v.title}</button>)}</div>
      <div className={s.rateMarks}>
        <button type="button" className={s.rateMark} disabled={rating.busy} onClick={() => { setOpen(false); rating.mark(); }}><MousePointerClick/>{mine?.buy ? 'Mark again on the chart' : 'Mark buy and sell on the chart'}</button>
        {mine?.buy && <span className={s.rateMarked}>
          <span><ArrowUp/>{format(mine.buy.priceUsd, supply)}</span>{mine.sell && <span><ArrowDown/>{format(mine.sell.priceUsd, supply)}</span>}{gain !== null && <b data-tone={gain >= 0 ? 'up' : 'down'}>{pct(gain)}</b>}
          <button type="button" aria-label="Clear the marks" disabled={rating.busy} onClick={() => void rating.save({ buy: null, sell: null })}><X/></button>
        </span>}
      </div>
      <input className={s.rateNote} value={note ?? mine?.note ?? ''} maxLength={FEEDBACK.note} placeholder={mine ? 'What tells you? Optional' : 'Pick a verdict, then add a note'} aria-label="Note" disabled={!mine || rating.busy}
        onChange={e => setNote(e.target.value)} onBlur={() => { if (note !== null && note !== (mine?.note ?? '')) void rating.save({ note }); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}/>
      {mine && <button type="button" className={s.rateRemove} disabled={rating.busy} onClick={() => { setOpen(false); void rating.remove(); }}>Remove rating</button>}
    </PopoverContent>
  </Popover>
  <FirstTip id="rate" anchor={button} side="bottom" align="end" title="Rate this trade" text="Mark where you’d buy and sell. It trains better setups, and soon tunes strategies live."/></>;
}
