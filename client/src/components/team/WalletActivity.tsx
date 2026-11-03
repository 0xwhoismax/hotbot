"use client";
import { useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { useAtomValue } from 'jotai';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { api, useQuery as useLiveQuery } from '@/lib/convex';
import { currentUserIdAtom } from '@/store/user/atoms';
import { marketCoins } from '@/services/market';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/utils/formatterUtils';
import type { WalletActivityEvent, WalletMovement } from '../../../../types/walletActivity';
import { Loading, SolscanLink } from './Parts';
import { Paged } from './Stream';
import type { HomeData } from './data';
import { ago, signedSol, sol, solscan, tone } from './format';
import { failure, viewAsAtom } from './state';
import s from './team.module.css';

const labels = { swap: 'Swap', received: 'Received', sent: 'Sent', movement: 'Token movement', transaction: 'Transaction' };
/** Rows the ledger's activity adds each time the reader asks for older ones. */
const LEDGER_PAGE = 50;
const ledgerLabels = { buy: 'Buy', sell: 'Sale', sweep: 'Sweep', fail: 'Failed swap', gone: 'Closed, nothing left', opening: 'Opening balance', deposit: 'Received',
  dust: 'Small credits', withdraw: 'Withdrawal', float: 'Fee float', activate: 'Activation', external: 'Unexplained transfer' };
/** The market's coin data for the mints a list has loaded, in one batched read; the earlier answer stays while more mints load. */
const useCoins = (mints: string[]) => useQuery({ queryKey: ['wallet-activity-metadata', mints], queryFn: async ({ signal }) => Object.fromEntries((await marketCoins(mints, signal)).map(coin => [coin.address, coin])),
  enabled: mints.length > 0, staleTime: 5 * 60_000, refetchOnWindowFocus: false, placeholderData: previous => previous });

const WSOL = 'So11111111111111111111111111111111111111112';
const shortMint = (mint: string) => `${mint.slice(0, 4)}…${mint.slice(-4)}`;
const FILTERS = [['all', 'All'], ['swap', 'Swaps'], ['movement', 'Movements']] as const;
type Coins = Record<string, { symbol?: string }> | undefined;
type Amount = { value: string; unit: string; tone?: string };

/** The filters on the left, the wallet and its refresh on the right. */
function Toolbar({ address, filter, onFilter, refresh }: { address: string; filter: string; onFilter: (value: string) => void; refresh?: { busy: boolean; run: () => void } }) {
  return <div className={s.walletActivityBar}>
    <div className={s.walletActivityFilters} role="group" aria-label="Wallet activity type">{FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => onFilter(value)}>{label}</button>)}</div>
    <div className={s.walletActivityTools}>
      <VaultPill address={address}/>
      {refresh && <Button variant="ghost" size="icon" aria-label="Refresh" title="Refresh" disabled={refresh.busy} onClick={refresh.run}><RefreshCw className={refresh.busy ? 'animate-spin' : undefined}/></Button>}
    </div>
  </div>;
}

/** One event as a row: its coin, or an arrow for plain SOL, what it was and when, and what it moved with the biggest figure first. */
function ActivityRow({ coin, arrow, title, hint, sub, amounts, tx, label }: { coin?: { address: string; symbol: string }; arrow: 'in' | 'out' | 'swap'; title: string; hint?: string; sub: ReactNode; amounts: Amount[]; tx: string | null; label: string }) {
  const Icon = arrow === 'in' ? ArrowDownLeft : arrow === 'out' ? ArrowUpRight : ArrowLeftRight;
  return <article className={s.walletRow}>
    {coin ? <TokenAvatar className="size-9 shrink-0 rounded-[28%]" address={coin.address} symbol={coin.symbol}/> : <span className={s.walletLead} data-tone={arrow === 'in' ? 'up' : arrow === 'out' ? 'down' : undefined}><Icon size={18}/></span>}
    <div className={s.walletMain}><b title={hint}>{title}</b><small>{sub}</small></div>
    <div className={s.walletAmounts}>{amounts.map(amount => <span key={amount.unit + amount.value} data-tone={amount.tone}>{amount.value}<i>{amount.unit}</i></span>)}</div>
    {tx && solscan('tx', tx) ? <SolscanLink kind="tx" value={tx} label={label}/> : <span className={s.walletTransactionNone} aria-hidden/>}
  </article>;
}
const when = (at: number | null, slot?: number) => <time dateTime={at ? new Date(at).toISOString() : undefined} title={at ? new Date(at).toLocaleString() : undefined}>{at ? ago(at) : `Slot ${slot}`}</time>;

/** What a chain event was, said as a person would: SOL out and one coin in is a buy, the other way a sale, and a coin alone is received or sent. */
function describeChain(event: WalletActivityEvent, coins: Coins) {
  const isSol = (movement: WalletMovement) => movement.native || movement.mint === WSOL, symbolOf = (movement: WalletMovement) => movement.native ? 'SOL' : movement.mint === WSOL ? 'WSOL' : coins?.[movement.mint]?.symbol || shortMint(movement.mint);
  const solMoved = event.movements.filter(isSol).reduce((sum, movement) => sum + movement.amount, 0), tokens = event.movements.filter(movement => !isSol(movement)), token = tokens.length === 1 ? tokens[0] : undefined;
  const trade = token && solMoved * token.amount < 0 ? (token.amount > 0 ? 'Bought' : 'Sold') : undefined;
  const title = trade ? `${trade} ${symbolOf(token!)}` : token && !solMoved ? `${token.amount > 0 ? 'Received' : 'Sent'} ${symbolOf(token)}` : labels[event.kind];
  const amounts: Amount[] = [...tokens, ...event.movements.filter(isSol)].map(movement => ({ value: `${movement.amount > 0 ? '+' : '−'}${formatNumber(Math.abs(movement.amount))}`, unit: symbolOf(movement), tone: movement.amount > 0 ? 'up' : 'down' }));
  return { title, swap: event.kind === 'swap' || trade !== undefined, coin: token && (trade || !solMoved) ? { address: token.mint, symbol: symbolOf(token) } : undefined,
    arrow: event.kind === 'received' ? 'in' as const : event.kind === 'sent' ? 'out' as const : 'swap' as const, amounts };
}

/** A team whose Real SOL the ledger keeps (`ledger`) reads its HOTBOT wallet's activity from the ledger; any other wallet's comes from the chain. */
export function WalletActivityPage({ data }: { data: HomeData }) {
  const address = data.workspace.wallet?.address ?? null;
  return <div className={s.page}>
    <header className={s.head}><h1 className={s.title}>Wallet activity</h1></header>
    {data.workspace.ledger && address ? <LedgerActivity key={address} address={address}/> : <WalletActivity key={address} address={address}/>}
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
  const metadata = useCoins(mints);
  const rows = events.map(event => ({ event, view: describeChain(event, metadata.data) })).filter(({ event, view }) => filter === 'all' || (filter === 'swap' ? view.swap : !view.swap && event.movements.length > 0));
  const issue = history.error ? failure(history.error) : null;
  if (!address) return <div className={s.walletActivityEmpty}><Wallet size={26}/><b>No wallet yet</b><span>Wallet activity appears once your wallet is ready.</span></div>;
  return <section className={s.walletActivity} aria-label="Wallet swaps and token movements" aria-busy={history.isFetching}>
    <Toolbar address={address} filter={filter} onFilter={setFilter} refresh={{ busy: history.isFetching, run: () => void history.refetch() }}/>
    {issue && <div className={s.workspaceError} role="alert"><span>{issue.message}{issue.detail && <code>{issue.detail}</code>}</span><Button variant="outline" size="xs" disabled={history.isFetching} onClick={() => void (history.isFetchNextPageError ? history.fetchNextPage() : history.refetch())}>Try again</Button></div>}
    {history.isPending && !issue ? <Loading label="Loading wallet activity"/> : !rows.length && !issue ? <div className={s.walletActivityEmpty}><Wallet size={26}/><b>{events.length ? 'No matching activity' : 'No on-chain activity yet'}</b><span>{events.length ? 'Try another view or load older activity.' : 'Swaps and token movements in this wallet will appear here.'}</span></div> : null}
    <div className={rows.length ? `${s.walletActivityRows} ${s.surface}` : s.walletActivityRows}>{rows.map(({ event, view }) =>
      <ActivityRow key={event.signature} coin={view.coin} arrow={view.arrow} title={view.title} amounts={view.amounts} tx={event.signature} label={`View ${view.title.toLowerCase()} transaction on Solscan`}
        sub={<>{event.status === 'failed' && <span className={s.warnText}>Failed · </span>}{when(event.at, event.slot)}{event.feeSol > 0 && ` · Fee ${formatNumber(event.feeSol, { precision: 9 })}`}</>}/>)}</div>
    {history.hasNextPage && <Button variant="outline" size="sm" disabled={history.isFetching} className={s.walletActivityMore} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? 'Loading…' : 'Load older activity'}</Button>}
  </section>;
}

/** The HOTBOT wallet's swaps and other moves from the ledger, newest first: a swap's coin (its strategy on a row that names no coin), what
 *  each moved in the vault, its fees, a sale's profit, the account deposit it opened or got back and its transaction on Solscan. A row the
 *  ledger made itself (an opening, a day's small credits, a position closed with nothing left) has no transaction. Older rows keep the list
 *  on screen while they load. */
function LedgerActivity({ address }: { address: string }) {
  const [limit, setLimit] = useState(LEDGER_PAGE), [filter, setFilter] = useState('all'), fetched = useLiveQuery(api.ledger.activity, { limit, ...useAtomValue(viewAsAtom) });
  const [kept, setKept] = useState(fetched);
  if (fetched !== undefined && fetched !== kept) setKept(fetched);
  const ledger = fetched ?? kept, rows = (ledger?.rows ?? []).filter(row => filter === 'all' || (filter === 'swap') === row.swap);
  const mints = useMemo(() => [...new Set((ledger?.rows ?? []).flatMap(row => row.mint ? [row.mint] : []))].sort(), [ledger]);
  const metadata = useCoins(mints);
  return <section className={s.walletActivity} aria-label="Wallet swaps and moves" aria-busy={fetched === undefined}>
    <Toolbar address={address} filter={filter} onFilter={setFilter}/>
    {ledger === undefined ? <Loading label="Loading wallet activity"/> : !rows.length ? <div className={s.walletActivityEmpty}><Wallet size={26}/><b>{ledger?.rows.length ? 'No matching activity' : 'No activity yet'}</b><span>{ledger?.rows.length ? 'Try another view.' : 'Swaps and transfers of this wallet will appear here.'}</span></div> : null}
    <Paged status={!ledger?.more ? 'Exhausted' : fetched === undefined ? 'LoadingMore' : 'CanLoadMore'} onMore={() => setLimit(n => n + LEDGER_PAGE)} size={rows.length}>
    <div className={rows.length ? `${s.walletActivityRows} ${s.surface}` : s.walletActivityRows}>{rows.map(row => {
      const symbol = row.mint ? metadata.data?.[row.mint]?.symbol || shortMint(row.mint) : undefined, title = symbol ? `${ledgerLabels[row.kind]} ${symbol}` : ledgerLabels[row.kind];
      const amounts: Amount[] = [...(row.sol !== 0 ? [{ value: signedSol(row.sol, 6).replace(' SOL', ''), unit: 'SOL', tone: tone(row.sol, 6) }] : []), ...(row.pnl !== null ? [{ value: signedSol(row.pnl, 6).replace(' SOL', ''), unit: 'profit', tone: tone(row.pnl, 6) }] : [])];
      const extras = [!row.mint && row.strategy, row.fees > 0 && `Fees ${sol(row.fees, 6)}`, row.rent !== 0 && `Account deposit ${signedSol(row.rent, 6)}`].filter(Boolean).join(' · ');
      return <ActivityRow key={`${row.swap ? 'swap' : 'move'}:${row.tx}`} coin={row.mint ? { address: row.mint, symbol: symbol! } : undefined} arrow={row.kind === 'fail' ? 'swap' : row.sol > 0 ? 'in' : row.sol < 0 ? 'out' : 'swap'}
        title={title} hint={row.error ?? undefined} amounts={amounts} tx={row.tx} label={`View ${ledgerLabels[row.kind].toLowerCase()} transaction on Solscan`}
        sub={<>{when(row.at)}{extras && ` · ${extras}`}</>}/>;
    })}</div>
    </Paged>
  </section>;
}

/** The wallet's address, on Solscan when it is a well-formed one. */
function VaultPill({ address }: { address: string }) {
  const href = solscan('account', address), body = <><Wallet size={14}/><code>{address.slice(0, 6)}…{address.slice(-6)}</code>{href && <ExternalLink size={12}/>}</>;
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className={s.pill} title={address}>{body}</a> : <span className={s.pill} title={address}>{body}</span>;
}
