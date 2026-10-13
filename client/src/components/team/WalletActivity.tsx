"use client";
import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { useAtomValue } from 'jotai';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { api } from '@/lib/convex';
import { currentUserIdAtom, currentWalletAddressAtom } from '@/store/user/atoms';
import { getMultipleTokenDetails } from '@/services/marketDataService';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNumber } from '@/utils/formatterUtils';
import type { WalletActivityEvent } from '../../../../types/walletActivity';
import { CoinPill, Loading } from './Parts';
import { SOL_LOGO, type HomeData } from './data';
import { ago } from './format';
import { failure } from './state';
import s from './team.module.css';

const labels = { swap: 'Swap', received: 'Received', sent: 'Sent', movement: 'Token movement', transaction: 'Transaction' };

export function WalletActivityPage({ data }: { data: HomeData }) {
  const tradingWallet = useAtomValue(currentWalletAddressAtom), [selected, setSelected] = useState<string | null>(null);
  const wallets = useMemo(() => {
    const choices = new Map<string, string>();
    if (data.workspace.walletAddress) choices.set(data.workspace.walletAddress, 'Team wallet');
    if (tradingWallet && !choices.has(tradingWallet)) choices.set(tradingWallet, 'Trading wallet');
    return [...choices].map(([address, label]) => ({ address, label }));
  }, [data.workspace.walletAddress, tradingWallet]);
  const address = wallets.find(wallet => wallet.address === selected)?.address ?? wallets[0]?.address ?? null;
  return <div className={s.page}>
    <header className={s.head}>
      <h1 className={s.title}>Wallet activity</h1>
      {address && <Select value={address} onValueChange={setSelected}><SelectTrigger size="sm" aria-label="Wallet to view"><Wallet size={16}/><SelectValue/></SelectTrigger><SelectContent>{wallets.map(wallet => <SelectItem key={wallet.address} value={wallet.address}>{wallet.label} · {wallet.address.slice(0, 4)}…{wallet.address.slice(-4)}</SelectItem>)}</SelectContent></Select>}
    </header>
    <WalletActivity key={address} address={address}/>
  </div>;
}

/** One paged on-chain history; refreshing retains the visible rows. Metadata is batched across the loaded mints. */
function WalletActivity({ address }: { address: string | null }) {
  const userId = useAtomValue(currentUserIdAtom), convex = useConvex(), [filter, setFilter] = useState('all');
  const history = useInfiniteQuery({
    queryKey: ['wallet-activity', userId, address], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => convex.action(api.walletActivity.page, { address: address!, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: page => page.nextCursor ?? undefined, enabled: Boolean(userId && address),
    staleTime: Infinity, gcTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const events = useMemo(() => {
    const unique = new Map<string, WalletActivityEvent>();
    for (const page of history.data?.pages ?? []) for (const event of page.items) if (!unique.has(event.signature)) unique.set(event.signature, event);
    return [...unique.values()].sort((a, b) => b.slot - a.slot || b.position - a.position);
  }, [history.data]);
  const mints = useMemo(() => [...new Set(events.flatMap(event => event.movements.filter(movement => !movement.native).map(movement => movement.mint)))].sort(), [events]);
  const metadata = useQuery({ queryKey: ['wallet-activity-metadata', mints], queryFn: () => getMultipleTokenDetails(mints), enabled: mints.length > 0, staleTime: 5 * 60_000, refetchOnWindowFocus: false, placeholderData: previous => previous });
  const rows = events.filter(event => filter === 'all' || (filter === 'swap' ? event.kind === 'swap' : event.kind !== 'swap' && event.movements.length > 0));
  const issue = history.error ? failure(history.error) : null;
  if (!address) return <div className={s.walletActivityEmpty}><Wallet size={26}/><b>No wallet yet</b><span>Wallet activity appears once your wallet is ready.</span></div>;
  return <section className={s.walletActivity} aria-label="Wallet swaps and token movements" aria-busy={history.isFetching}>
    <div className={s.walletActivityBar}>
      <a href={`https://solscan.io/account/${address}`} target="_blank" rel="noreferrer" className={s.pill} title={address}><Wallet size={14}/><code>{address.slice(0, 6)}…{address.slice(-6)}</code><ExternalLink size={12}/></a>
      <span className={s.muted}>On-chain · Real SOL</span>
      <Button variant="ghost" size="sm" disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw size={14}/>{history.isFetching && !history.isFetchingNextPage ? 'Refreshing…' : 'Refresh'}</Button>
    </div>
    <div className={s.walletActivityFilters} role="group" aria-label="Wallet activity type">{[['all', 'All'], ['swap', 'Swaps'], ['movement', 'Movements']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {issue && <div className={s.workspaceError} role="alert"><span>{issue.message}{issue.detail && <code>{issue.detail}</code>}</span><Button variant="outline" size="xs" disabled={history.isFetching} onClick={() => void (history.isFetchNextPageError ? history.fetchNextPage() : history.refetch())}>Try again</Button></div>}
    {history.isPending && !issue ? <Loading label="Loading wallet activity"/> : !rows.length && !issue ? <div className={s.walletActivityEmpty}><Wallet size={26}/><b>{events.length ? 'No matching activity' : 'No on-chain activity yet'}</b><span>{events.length ? 'Try another view or load older activity.' : 'Swaps and token movements in this wallet will appear here.'}</span></div> : null}
    <div className={s.walletActivityRows}>{rows.map(event => {
      const Icon = event.kind === 'received' ? ArrowDownLeft : event.kind === 'sent' ? ArrowUpRight : ArrowLeftRight;
      return <article key={event.signature} className={s.walletActivityRow}>
        <span className={s.eventIcon} data-tone={event.kind === 'received' ? 'up' : event.kind === 'sent' ? 'down' : undefined}><Icon size={18}/></span>
        <div className={s.walletActivityBody}>
          <div className={s.walletActivityRowHead}><b>{labels[event.kind]}</b>{event.status === 'failed' && <span className={s.warnText}>Failed</span>}<time dateTime={event.at ? new Date(event.at).toISOString() : undefined} title={event.at ? new Date(event.at).toLocaleString() : `Slot ${event.slot}`}>{event.at ? ago(event.at) : `Slot ${event.slot}`}</time></div>
          <div className={s.walletMovements}>{event.movements.map(movement => {
            const token = metadata.data?.[movement.mint], symbol = movement.native ? 'SOL' : movement.mint === 'So11111111111111111111111111111111111111112' ? 'WSOL' : token?.symbol || `${movement.mint.slice(0, 4)}…${movement.mint.slice(-4)}`;
            return <span className={s.walletMovement} key={movement.mint + movement.native} title={movement.mint}><b className={s[movement.amount > 0 ? 'up' : 'down']}>{movement.amount > 0 ? '+' : '−'}{formatNumber(Math.abs(movement.amount))}</b><CoinPill coins={[{ address: movement.mint, symbol, logo: movement.native ? SOL_LOGO : token?.logo_uri }]}/></span>;
          })}</div>
          {event.feeSol > 0 && <small className={s.muted}>Network fee {formatNumber(event.feeSol, { precision: 9 })} SOL</small>}
        </div>
        <a className={s.walletTransactionLink} href={`https://solscan.io/tx/${event.signature}`} target="_blank" rel="noreferrer" aria-label={`View ${labels[event.kind].toLowerCase()} transaction on Solscan`} title="View transaction"><ExternalLink size={16}/></a>
      </article>;
    })}</div>
    {history.hasNextPage && <Button variant="outline" size="sm" disabled={history.isFetching} className={s.walletActivityMore} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? 'Loading…' : 'Load older activity'}</Button>}
  </section>;
}
