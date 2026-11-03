"use client";
import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { LoaderCircle, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { searchCoins, type MarketHit } from '@/services/solanaTokenSearch';
import type { HomeData } from './data';
import { appHref, usd } from './format';
import { checkCoinAtom, useCommand } from './state';
import s from './team.module.css';
import { useRouter } from '@/lib/appNavigation';

/** Check any coin: search by name, ticker or contract address, pick the strategy whose rules apply, and ResearchBot takes it from there. */
export function CheckCoin({ data }: { data: HomeData }) {
  const [state, setState] = useAtom(checkCoinAtom);
  return <Dialog open={Boolean(state)} onOpenChange={open => { if (!open) setState(null); }}>
    <DialogContent className="sm:max-w-[30rem]">
      <DialogTitle className="sr-only">Check a coin</DialogTitle>
      {state && <Body key={JSON.stringify(state)} data={data} query={state.query ?? ''} strategyId={state.strategyId ?? (data.strategies.find(row => row.status === 'running') ?? data.strategies[0])?.id ?? ''} onDone={() => setState(null)}/>}
    </DialogContent>
  </Dialog>;
}

function Body({ data, query: initialQuery, strategyId: initialStrategy, onDone }: { data: HomeData; query: string; strategyId: string; onDone: () => void }) {
  const command = useCommand(), router = useRouter();
  const [query, setQuery] = useState(initialQuery), [results, setResults] = useState<{ query: string; rows: MarketHit[] } | null>(null), [strategyId, setStrategyId] = useState(initialStrategy);
  const searching = query.trim().length >= 2 && results?.query !== query.trim();
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => searchCoins(text, controller.signal).then(rows => { if (!controller.signal.aborted) setResults({ query: text, rows: rows.slice(0, 8) }); }).catch(() => {}), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  const pick = async (token: MarketHit) => {
    if (token.decimals === undefined) return;
    const id = await command({ type: 'research', token: { address: token.address, name: token.name, symbol: token.symbol, decimals: token.decimals }, strategyId: strategyId || undefined });
    if (id) { onDone(); router.push(appHref('tokens', id)); }
  };
  const rows = query.trim().length >= 2 ? results?.rows ?? [] : [];
  return <div className={s.decision}>
    <div className={s.decisionHead}><BotAvatar role="research" size={40}/><span className={s.grow}><b>Check a coin</b><small>ResearchBot checks it against {data.strategies.length > 1 ? 'the strategy you pick' : 'your rules'}; if it passes, SniperBot buys.</small></span></div>
    <label className={s.search}><Search/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, ticker or contract address" aria-label="Coin"/>{searching && <LoaderCircle className="animate-spin"/>}</label>
    {data.strategies.length > 1 && <div className={s.strategyPicks}>{data.strategies.map(row => <button type="button" key={row.id} aria-pressed={row.id === strategyId} onClick={() => setStrategyId(row.id)}>{row.name}</button>)}</div>}
    <div className={s.results}>{rows.map(row => <button type="button" key={row.address} className={s.row} disabled={row.decimals === undefined} onClick={() => void pick(row)}>
      <TokenAvatar className="size-8 rounded-[28%]" address={row.address} symbol={row.symbol}/>
      <span className={s.grow}><b>{row.symbol}</b><small>{row.name}</small></span>
      <span className={s.end}><b>{usd(row.marketCapUsd)}</b><small>mcap</small></span>
    </button>)}{!searching && query.trim().length >= 2 && !rows.length && <p className={s.empty}>No Solana coin matches that.</p>}</div>
  </div>;
}
