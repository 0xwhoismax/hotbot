"use client";
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { Link, useBack, usePlace } from '@/lib/appNavigation';
import { ACTIVE_STAGES } from '../../../../types/team';
import { change, type HomeData } from './data';
import { DecisionActions, DecisionCards, useItem, useTrail } from './Decision';
import { CoinChart, chartLaunchedAt, trailMarkers } from './CoinChart';
import { CoinIntel } from './CoinIntel';
import { RateButton, useCoinRating } from './Rating';
import { SocialLinks, TokenFacts, TokenFigures, tokenDetailsSupply, useTokenDetails } from './TokenInfo';
import { appHref, pct, signedSol, sol, tone } from './format';
import { costSol, rentSol } from '../../../../types/home';
import { Back, CopyName, DecisionDialog, Hint, Loading, priceAgeNote, useNow } from './Parts';
import { Trail } from './Stream';
import s from './team.module.css';

/** One coin: its name, links and market figures in one header with the position, chart beside its own activity, one decision overview and live token facts. Every figure explains itself on hover. */
export function TokenPage({ id }: { id: string; data: HomeData }) {
  const { format: price, label, unit } = usePriceDisplay();
  const item = useItem(id), trail = useTrail(id);
  // A sold coin's return is its profit on the SOL that went in; a held one's is the latest price against the entry price.
  const move = item ? item.stage === 'closed' ? item.entry && item.entry.sol > 0 && item.pnlSol != null ? item.pnlSol / item.entry.sol * 100 : null : change(item) : null;
  const details = useTokenDetails(item?.token.address);
  const supply = tokenDetailsSupply(details.data) ?? item?.supply ?? null;
  // The decision open in the dialog: this coin's, or an earlier pick's from the chart or its activity.
  const [decision, setDecision] = useState<string | null>(null);
  // The activity row under the pointer lights up its cloud on the chart.
  const [hovered, setHovered] = useState<string | null>(null);
  const markers = trailMarkers(trail, item), rating = useCoinRating(item ? { mint: item.token.address, symbol: item.token.symbol, itemId: item.id } : item);
  const launchedAt = chartLaunchedAt(details);
  const back = useBack(item?.strategy ? { href: appHref('strategies', item.strategy.id), label: item.strategy.name } : { href: appHref(), label: 'Home' });
  usePlace(item?.token.symbol, item?.strategyId);
  // A coin the practice desk took over (`booked`) keeps the record of its buy, but Convex no longer holds it: its worth is on Home.
  const holding = item && item.stage !== 'booked' ? item.entry : null;
  const closed = item?.stage === 'closed', partSold = Boolean(item?.sold?.rungs), now = useNow(), age = item && !closed ? priceAgeNote({ ...item, entry: holding }, now) : null;
  const figureHint = !item ? null : closed ? 'Profit on this trade in SOL: what the sale returned minus what went in.' : holding ? 'What is still held, valued in SOL at the latest price. It moves with every price tick.' : `The coin's latest ${unit === 'marketCap' ? 'market cap' : 'price'} from market data. Nothing is held yet.`;
  const inHint = closed ? 'The SOL that went into the buy.' : partSold ? 'The SOL still in the part held: the original buy minus what take-profits already sold.' : 'The SOL the buy paid for the coin, its fees included.';
  const moveHint = closed ? 'Return on the trade: its SOL profit against the SOL that went in.' : 'Latest price against the price paid at the buy. The sale’s fees and slippage count once it sells.';
  // Practice is the default and shows nothing; a live coin wears Real SOL beside its name, and the strategy is a quiet link under it.
  const live = item?.mode !== 'paper';
  // A held coin's buy is what the coin cost; the rent of the accounts it opened (Real SOL) is a deposit beside it, in neither the cost nor the return.
  const paid = holding && !closed ? costSol(holding) : holding?.sol ?? 0, rent = holding && !closed && live ? rentSol(holding) : 0;
  return <div className={`${s.page} ${s.tokenPage}`}>
    <Back {...back}/>
    {item === undefined ? <Loading variant="page" label="Loading the coin"/> : !item ? <p className={s.empty}>This coin is no longer in your pipeline.</p> : <>
      <header className={s.tokenHead}>
        <TokenAvatar className="size-11 rounded-[28%]" address={item.token.address} symbol={item.token.symbol}/>
        <div className={s.tokenName}>
          <h1 className={s.title}>{item.token.symbol}{live && <Hint text="Traded with real SOL from your wallet."><span className={s.pill} data-tone="ember">Real SOL</span></Hint>}</h1>
          <SocialLinks details={details} className={s.phoneOnly}/>
          <div className={s.tokenNameMeta}>
            <CopyName name={item.token.name} address={item.token.address}/>
            {item.strategy && <Link href={appHref('strategies', item.strategy.id)} className={s.coinStrategy} aria-label={`Open strategy ${item.strategy.name}`}>{item.strategy.name}<ArrowUpRight aria-hidden/></Link>}
          </div>
        </div>
        <TokenFigures details={details}/>
        <div className={s.tokenValue}>
          <div className={s.tokenPosition}>
            <Hint text={figureHint}><b className={`${s.big} ${s[tone(closed ? item.pnlSol : holding ? move : null) ?? 'muted']}`}>{closed ? signedSol(item.pnlSol) : holding ? sol(item.valueSol) : price(item.markPriceUsd ?? item.armedPriceUsd ?? item.researchPriceUsd, supply)}</b></Hint>
            {!holding && <small className={s.muted}>{label}</small>}
            {holding && <div className={s.tokenReturns}><Hint text={inHint}><span>in {sol(paid, 2).replace(' SOL', '')}</span></Hint>{rent >= 0.0001 && <><i aria-hidden/><Hint text="Rent for the accounts this buy opened, paid from your wallet. It is a deposit, not profit or loss. The coin’s own account returns its rent when the coin sells."><span>{sol(rent, 4).replace(' SOL', '')} rent</span></Hint></>}<i aria-hidden/><Hint text={moveHint}><b className={s[tone(move) ?? 'muted']}>{pct(move)}</b></Hint></div>}
            {age && <small className={s.coinWarn}>{age}</small>}
          </div>
          <DecisionActions item={item} rate={<RateButton rating={rating} symbol={item.token.symbol} supply={supply}/>}/>
        </div>
      </header>
      <div className={s.tokenBody}>
        {/* The worker stops pricing a coin once it leaves the pipeline, so a sold or turned-down coin's last mark is stale: its candles alone set the live price. */}
        <CoinChart address={item.token.address} supply={supply} entryPriceUsd={item.entry?.priceUsd} markPriceUsd={ACTIVE_STAGES.includes(item.stage) ? item.markPriceUsd : null} launchedAt={launchedAt} markers={markers} focus={hovered} onOpenMarker={marker => setDecision(marker.itemId ?? item.id)} rating={rating.chart}/>
        <section className={`${s.surface} ${s.tokenActivity}`} aria-label={`${item.token.symbol} activity`}>
          <div className={s.sectionHead}><h2>Activity{trail?.length ? <small>{trail.length}</small> : null}</h2><span>Every move on this coin</span></div>
          <div className={s.tokenTrail}><div><Trail events={trail} onOpen={row => setDecision(row.itemId ?? item.id)} onHover={row => setHovered(row?.id ?? null)}/></div></div>
        </section>
      </div>
      <DecisionCards item={item} onOpen={() => setDecision(item.id)}/>
      <TokenFacts details={details}/>
      <CoinIntel address={item.token.address} supply={supply} trusted={item.stage !== 'rejected' && item.stage !== 'blocked'} active={ACTIVE_STAGES.includes(item.stage)}/>
      {decision && <DecisionDialog id={decision} onClose={() => setDecision(null)}/>}
    </>}
  </div>;
}
