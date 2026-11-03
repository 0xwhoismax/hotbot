"use client";
import { useState, type ReactNode } from 'react';
import { useAtom } from 'jotai';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Dialog, DialogBody, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CoinChart, trailMarkers } from './CoinChart';
import { change } from './data';
import { DecisionActions, DecisionEvidence, DecisionHead, DecisionSteps, availableChecks, useItem, useTrail } from './Decision';
import { RateButton, RatePanel, useCoinRating } from './Rating';
import { signedSol, sol } from './format';
import { coinLookAtom } from './state';
import { priceAgeNote, useNow } from './Parts';
import { useCoinLaunchedAt } from './TokenInfo';
import { ACTIVE_STAGES } from '../../../../types/team';
import s from './team.module.css';

/** A coin in a dimmed dialog, one frame wherever a coin opens (the quick look, Portfolios' coins): `children` (its head, its chart, then the
 *  rest) scroll, and `dock`'s actions sit under them where they never scroll away (on phones, a capsule in the tab bar's place). It sizes to
 *  its content. Nothing in it is chosen on open, so focus goes to the sheet itself, not to its first control. */
export function CoinSheet({ title, dock, onClose, children }: { title: string; dock?: ReactNode; onClose: () => void; children: ReactNode }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex flex-col overflow-hidden p-0 sm:max-w-[40rem]" onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogBody className={`${s.decision} ${s.coinLook} pb-4`}>{children}</DialogBody>
      {dock && <div className={`${s.dialogDock} ${s.lookDock}`}>{dock}</div>}
    </DialogContent>
  </Dialog>;
}

/** One pipeline coin from any screen: its chart with the bots' pins, the position, the bots' decisions and the research checks as two tabs,
 *  and the actions (trade, Rate, the coin's page). Rate, pressed, shows the person's rating in the tabs' place. Any row or button opens it
 *  through `coinLookAtom`; `DecisionDialog` (Parts), which every activity row opens, does too. It opens once the coin has loaded. Marking a
 *  rating happens on this chart. */
export function CoinLook() {
  const [id, setId] = useAtom(coinLookAtom);
  return id ? <Look key={id} id={id} onClose={() => setId(null)}/> : null;
}

function Look({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useItem(id), rating = useCoinRating(item ? { mint: item.token.address, symbol: item.token.symbol, itemId: item.id } : item), [rate, setRate] = useState(false);
  // The coin page's trail draws the pins; one read of the coin's launch sizes Auto's candles.
  const trail = useTrail(id), launchedAt = useCoinLaunchedAt(item?.token.address), now = useNow();
  if (item === undefined) return null;
  if (!item) return <CoinSheet title="Coin" onClose={onClose}><p className={s.empty}>This coin is no longer in your pipeline.</p></CoinSheet>;
  const closed = item.stage === 'closed', holding = item.stage === 'booked' ? null : item.entry;
  const move = closed ? item.entry && item.entry.sol > 0 && item.pnlSol != null ? item.pnlSol / item.entry.sol * 100 : null : change(item);
  const age = closed || !holding ? null : priceAgeNote(item, now);
  return <CoinSheet title={item.token.symbol} onClose={onClose} dock={<DecisionActions item={item} inPanel onNavigate={onClose} rate={<RateButton rating={rating} symbol={item.token.symbol} supply={item.supply ?? null} tip={false} open={rate}
    onToggle={() => { if (rate) rating.stop(); setRate(!rate); }}/>}/>}>
    <DecisionHead item={item} warn={age} worth={holding && { value: closed ? signedSol(item.pnlSol) : sol(item.valueSol), tone: closed ? item.pnlSol : move, paid: holding.sol, move }}/>
    <CoinChart address={item.token.address} supply={item.supply ?? null} entryPriceUsd={item.entry?.priceUsd} markPriceUsd={ACTIVE_STAGES.includes(item.stage) ? item.markPriceUsd : null} launchedAt={launchedAt} markers={trailMarkers(trail, item)} rating={rating.chart}/>
    {/* Rate swaps the person's rating in for the bots' reasons, so only one of them asks for attention. */}
    <div className={s.lookWhy}>
      <Collapsible open={!rate}><CollapsibleContent>
        {item.checks.length ? <Tabs defaultValue="decisions" className="gap-2.5">
          <TabsList variant="line" aria-label="Why the bots acted"><TabsTrigger value="decisions">Decisions</TabsTrigger><TabsTrigger value="checks">Checks<TabsCount>{availableChecks(item)}/{item.checks.length}</TabsCount></TabsTrigger></TabsList>
          <TabsContent value="decisions"><DecisionSteps item={item} compact/></TabsContent>
          <TabsContent value="checks"><DecisionEvidence item={item} label={false}/></TabsContent>
        </Tabs> : <DecisionSteps item={item} compact/>}
      </CollapsibleContent></Collapsible>
      <Collapsible open={rate}><CollapsibleContent><RatePanel rating={rating} supply={item.supply ?? null}/></CollapsibleContent></Collapsible>
    </div>
  </CoinSheet>;
}
