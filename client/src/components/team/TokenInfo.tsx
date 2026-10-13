"use client";
import { MARKET_MAX_AGE_MS, freshMarketPrice } from '../../../../types/market';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Globe, Layers, Rocket, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usd } from './format';
import { formatNumber } from '@/utils/formatterUtils';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { SignedPercentText } from './SignedPercentText';
import { AddressChip, Hint, Loading } from './Parts';
import s from './team.module.css';

type Details = Record<string, unknown> & { priceObservedAt: number; security?: Record<string, unknown> | null; exchange?: { name?: unknown } | null; largestPoolQuote?: { address?: unknown; symbol?: unknown } | null };
const string = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown) => { const n = typeof value === 'string' ? Number(value) : value; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const pctText = (value: unknown) => { const n = num(value); return n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%'; };
const share = (value: unknown) => { const n = num(value); return n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'; };
const count = (value: unknown) => { const n = num(value); return n == null ? '—' : n.toLocaleString('en-US'); };
const age = (created: unknown) => { const t = typeof created === 'string' ? Date.parse(created) : NaN; if (!Number.isFinite(t)) return '—'; const m = (Date.now() - t) / 60000; return m < 60 ? Math.round(m) + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };

const hasSocials = (socials: unknown) => Object.values((socials ?? {}) as Record<string, unknown>).some(value => typeof value === 'string' && /^https:\/\//i.test(value.trim()));

/** The token page shares this one existing details read with its facts, header and chart. */
export function useTokenDetails(address?: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['token-facts', address],
    queryFn: async ({ signal, queryKey }): Promise<Details | null> => {
      const priceObservedAt = Date.now();
      const response = await fetch('/api-mobula/2/token/details?address=' + encodeURIComponent(address!), { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(MARKET_MAX_AGE_MS)]) });
      if (!response.ok) throw new Error('Token details are unavailable.');
      const data = ((await response.json()) as { data?: Details }).data;
      if (!freshMarketPrice(priceObservedAt)) throw new Error('Market price expired.');
      // Mobula's details sometimes come back with every social empty; keep the coin's last links so they don't blink away.
      const before = client.getQueryData<Details | null>(queryKey)?.socials;
      return data ? { ...data, ...(!hasSocials(data.socials) && hasSocials(before) && { socials: before }), priceObservedAt } : null;
    },
    enabled: Boolean(address),
    staleTime: query => Math.max(0, MARKET_MAX_AGE_MS - (query.state.dataUpdatedAt - (query.state.data?.priceObservedAt ?? 0))),
    refetchInterval: MARKET_MAX_AGE_MS / 2, retry: 2,
  });
  return { ...query, priceFresh: !query.isStale && freshMarketPrice(query.data?.priceObservedAt) };
}
export function tokenDetailsSupply(details: Details | null | undefined) {
  const cap = num(details?.marketCapUSD), price = num(details?.priceUSD);
  const supply = cap && price && cap > 0 && price > 0 ? cap / price : null;
  return supply && Number.isFinite(supply) ? supply : null;
}

/** When the coin launched (ms), from the same details read; null when market data has no creation time. */
export function tokenDetailsLaunchedAt(details: Details | null | undefined) {
  const t = typeof details?.createdAt === 'string' ? Date.parse(details.createdAt) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** What each fact measures, in plain words, for its tooltip. */
const FACT_HINTS: Record<string, string> = {
  Price: 'The latest price from market data.', 'Market cap': 'The latest market cap: price times the circulating supply.',
  Liquidity: 'Value in the coin’s largest pool, in USD. Thin liquidity means small trades move the price a lot.', '24h volume': 'USD traded in the last 24 hours.',
  '1h': 'Price change over the last hour.', '24h': 'Price change over the last 24 hours.', 'Buys / sells 24h': 'Buy trades against sell trades in the last 24 hours.', 'Buys / sells': 'Buy trades against sell trades in the last 24 hours.', 'Vol 24h': 'USD traded in the last 24 hours.', Mcap: 'The latest market cap: price times the circulating supply.',
  Holders: 'Wallets holding the coin.', 'Top 10': 'Share of the supply held by the ten largest wallets.', Dev: 'Share of the supply held by the deployer’s wallets.',
  Insiders: 'Share of the supply held by wallets market data links to the team.', Bundlers: 'Share of the supply bought in bundled transactions at launch.', Snipers: 'Share of the supply bought in the first moments after launch.',
  Age: 'Time since the coin was created.', Mint: 'Whether more tokens can still be minted. Revoked is safer.', Freeze: 'Whether the deployer can freeze wallets from selling. Revoked is safer.',
  'LP burned': 'Share of the pool’s liquidity tokens burned, so that liquidity can’t be pulled.', 'Fees 24h': 'Trading fees paid on the coin in the last 24 hours.', 'From high': 'How far the price sits below its all-time high.',
};

/** What a social link reads as in a line of links: the X handle, the website's domain, or the network's name. */
function socialLabel(name: string, href: string) {
  try {
    const url = new URL(href), path = url.pathname.split('/').filter(Boolean);
    if (name === 'X') return path.length === 1 ? '@' + path[0] : 'X';
    if (name === 'Website') return url.hostname.replace(/^www\./, '');
  } catch {}
  return name;
}

/** The coin's own X, website and Telegram links: round icon buttons, or quiet labelled links beside its pair and pool. Nothing renders for a coin without them. */
export function SocialLinks({ details, variant = 'icons', className }: { details: ReturnType<typeof useTokenDetails>; variant?: 'icons' | 'links'; className?: string }) {
  const socials = (details.data?.socials ?? null) as Record<string, unknown> | null;
  // Only https links open: the coin's creator typed them into the launchpad.
  const link = (value: unknown) => { const u = string(value); return u && /^https:\/\//i.test(u) ? u : null; };
  const social = [
    { name: 'X', href: link(socials?.twitter), icon: <span className={s.xMark} aria-hidden>𝕏</span> },
    { name: 'Website', href: link(socials?.website), icon: <Globe/> },
    { name: 'Telegram', href: link(socials?.telegram), icon: <Send/> },
  ].filter((entry): entry is typeof entry & { href: string } => entry.href != null);
  if (!social.length) return null;
  if (variant === 'links') return <span className={`${s.tokenLinks} ${className ?? ''}`}>{social.map(entry => <Tooltip key={entry.name}><TooltipTrigger asChild><Button variant="secondary" size="xs" asChild><a href={entry.href} target="_blank" rel="noopener noreferrer">{entry.icon}<span>{socialLabel(entry.name, entry.href)}</span><ArrowUpRight/></a></Button></TooltipTrigger><TooltipContent sideOffset={6}>{entry.name}</TooltipContent></Tooltip>)}</span>;
  return <div className={`${s.socialLinks} ${className ?? ''}`}>{social.map(entry => <Tooltip key={entry.name}><TooltipTrigger asChild><a className={s.socialLink} href={entry.href} target="_blank" rel="noopener noreferrer" aria-label={entry.name}>{entry.icon}</a></TooltipTrigger><TooltipContent sideOffset={6}>{entry.href.replace(/^https:\/\/(www\.)?/, '')}</TooltipContent></Tooltip>)}</div>;
}

/** The coin's market figures in the page header, from the same details read as its facts. Every figure keeps its place while the read loads, so the header never jumps. */
export function TokenFigures({ details }: { details: ReturnType<typeof useTokenDetails> }) {
  const { unit, format } = usePriceDisplay();
  const d = details.data;
  const tone = (n: unknown) => { const v = num(n); return v == null ? undefined : v > 0 ? s.up : v < 0 ? s.down : undefined; };
  const cash = (value: unknown) => { const n = num(value); return n == null ? '—' : formatNumber(n, { compact: n >= 1000, prefix: '$' }); };
  const many = (value: unknown) => { const n = num(value); return n == null ? '—' : formatNumber(n, { compact: n >= 10_000 }); };
  const first = unit === 'marketCap' ? 'Mcap' : 'Price';
  const figures: { label: string; value: ReactNode; className?: string }[] = [
    { label: first, value: d ? format(num(d.priceUSD), tokenDetailsSupply(d)) : '—', className: d && !details.priceFresh ? s.muted : undefined },
    { label: 'Liquidity', value: cash(d?.liquidityUSD) }, { label: 'Vol 24h', value: cash(d?.volume24hUSD) }, { label: 'Holders', value: many(d?.holdersCount) },
    { label: '1h', value: pctText(d?.priceChange1hPercentage), className: tone(d?.priceChange1hPercentage) }, { label: '24h', value: pctText(d?.priceChange24hPercentage), className: tone(d?.priceChange24hPercentage) },
    { label: 'Buys / sells', value: <><span className={s.up}>{many(d?.buys24h)}</span><i>/</i><span className={s.down}>{many(d?.sells24h)}</span></> },
  ];
  return <div className={s.tokenFigures} aria-label="Market figures" aria-busy={details.isLoading || undefined}>{figures.map(fig => <Hint key={fig.label} text={fig.label === first && d && !details.priceFresh ? `${FACT_HINTS[fig.label]} This read is out of date.` : FACT_HINTS[fig.label] ?? fig.label} className={s.tokenFigure}>
    <small>{fig.label}</small><b className={fig.className}>{typeof fig.value === 'string' ? <SignedPercentText>{fig.value}</SignedPercentText> : fig.value}</b>
  </Hint>)}</div>;
}

/** Where the coin launched and trades, as quiet links. */
export function TokenVenues({ details, className }: { details: ReturnType<typeof useTokenDetails>; className?: string }) {
  const d = details.data;
  const exchange = string(d?.exchange?.name);
  const launchpad = string(d?.source) ?? string((d?.sourceMetadata as Record<string, unknown> | null | undefined)?.name);
  const pool = string(d?.poolAddress);
  const launchpadUrl = string(d?.launchpadUrl);
  const launchHref = launchpadUrl && /^https:\/\//i.test(launchpadUrl) ? launchpadUrl : null;
  if (!launchpad && !exchange) return null;
  return <span className={`${s.tokenLinks} ${className ?? ''}`}>
    {launchpad && <Tooltip><TooltipTrigger asChild>{launchHref ? <Button variant="secondary" size="xs" asChild><a href={launchHref} target="_blank" rel="noopener noreferrer"><Rocket/><span>{launchpad}</span><ArrowUpRight/></a></Button> : <span className={s.tokenMetaPill}><Rocket size={13}/>{launchpad}</span>}</TooltipTrigger><TooltipContent sideOffset={6}>Launchpad</TooltipContent></Tooltip>}
    {exchange && <Tooltip><TooltipTrigger asChild>{pool ? <Button variant="secondary" size="xs" asChild><a href={`https://solscan.io/account/${encodeURIComponent(pool)}`} target="_blank" rel="noopener noreferrer"><Layers/><span>{exchange}</span><ArrowUpRight/></a></Button> : <span className={s.tokenMetaPill}><Layers size={13}/>{exchange}</span>}</TooltipTrigger><TooltipContent sideOffset={6}>Exchange · largest pool</TooltipContent></Tooltip>}
  </span>;
}

/** The coin's holder and safety facts and its links from our own market data. Phones list here what the desktop header carries (market facts, holders, venues) and keep their socials in the header; desktops list the socials, pair and pool as a Links card. */
export function TokenFacts({ details, tags }: { details: ReturnType<typeof useTokenDetails>; tags?: ReactNode }) {
  const { label, format } = usePriceDisplay();
  const d = details.data;
  if (!d) return details.isLoading ? <Loading variant="box" height="10rem" label="Loading market facts"/> : <p className={s.empty}>Market facts are unavailable right now.</p>;
  const sec = d.security ?? null, mint = typeof sec?.noMintAuthority === 'boolean' ? !sec.noMintAuthority : null, freeze = typeof sec?.isFreezable === 'boolean' ? sec.isFreezable : null;
  const tone = (n: unknown) => { const v = num(n); return v == null ? undefined : v > 0 ? s.up : v < 0 ? s.down : undefined; };
  const groups: { title: string; phone?: boolean; facts: { label: string; value: string; className?: string; phone?: boolean }[] }[] = [
    { title: 'Market', phone: true, facts: [
      { label: details.priceFresh ? label : `${label} · stale`, value: format(num(d.priceUSD), tokenDetailsSupply(d)) }, { label: 'Liquidity', value: usd(num(d.liquidityUSD)) }, { label: '24h volume', value: usd(num(d.volume24hUSD)) },
      { label: '1h', value: pctText(d.priceChange1hPercentage), className: tone(d.priceChange1hPercentage) }, { label: '24h', value: pctText(d.priceChange24hPercentage), className: tone(d.priceChange24hPercentage) }, { label: 'Buys / sells 24h', value: `${count(d.buys24h)} / ${count(d.sells24h)}` },
    ] },
    { title: 'Holders', facts: [
      { label: 'Holders', value: count(d.holdersCount), phone: true }, { label: 'Top 10', value: share(d.top10HoldingsPercentage) }, { label: 'Dev', value: share(d.devHoldingsPercentage) },
      { label: 'Insiders', value: share(d.insidersHoldingsPercentage) }, { label: 'Bundlers', value: share(d.bundlersHoldingsPercentage) }, { label: 'Snipers', value: share(d.snipersHoldingsPercentage) },
    ] },
    { title: 'Safety', facts: [
      { label: 'Age', value: age(d.createdAt) }, { label: 'Mint', value: mint == null ? '—' : mint ? 'Can mint' : 'Revoked', className: mint ? s.down : mint === false ? s.up : undefined }, { label: 'Freeze', value: freeze == null ? '—' : freeze ? 'Can freeze' : 'Revoked', className: freeze ? s.down : freeze === false ? s.up : undefined },
      { label: 'LP burned', value: share(d.liquidityBurnPercentage) }, { label: 'Fees 24h', value: usd(num(d.feesPaid24hUSD)) }, { label: 'From high', value: (() => { const ath = num(d.athUSD), now = num(d.priceUSD); const dd = ath && now ? Math.max(0, (1 - now / ath) * 100) : null; return dd == null ? '—' : dd < 1 ? 'At its high' : '−' + dd.toFixed(0) + '%'; })() },
    ] },
  ];
  const quote = d.largestPoolQuote;
  const pool = string(d.poolAddress);
  const addresses = <>
    {string(quote?.address) && <AddressChip label={`Pair · ${string(quote?.symbol) ?? 'token'}`} address={string(quote?.address)!}/>}
    {pool && <AddressChip label="Pool" address={pool}/>}
  </>;
  return <section className={s.tokenFacts} aria-label="Token details">
    <div className={`${s.tokenIdentity} ${s.phoneOnly}`}><TokenVenues details={details}/>{addresses}</div>
    <div className={s.factGroups}>{groups.map(group => <div key={group.title} className={group.phone ? `${s.factGroup} ${s.phoneOnly}` : s.factGroup}>
      <p className={s.label}>{group.title}</p>
      <div className={s.facts}>{group.facts.map(fact => <div key={fact.label} className={fact.phone ? s.phoneOnly : undefined}><Hint text={FACT_HINTS[fact.label] ?? fact.label} className={s.factHint}><small>{fact.label}</small><b className={fact.className}><SignedPercentText>{fact.value}</SignedPercentText></b></Hint></div>)}</div>
    </div>)}
      <div className={`${s.factGroup} ${s.desktopOnly}`} aria-label="Links"><div className={s.factLinks}>{tags && <span className={s.tokenTags}>{tags}</span>}<TokenVenues details={details}/><SocialLinks details={details} variant="links"/>{addresses}</div></div>
    </div>
  </section>;
}
