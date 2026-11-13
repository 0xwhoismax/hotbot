"use client";
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { ArrowUpRight, Check, Flag, ChevronRight, CornerDownRight, HelpCircle, Minus, X } from 'lucide-react';
import { api, useQuery } from '@/lib/convex';
import type { FunctionReturnType } from 'convex/server';
import { useMarketMark, watchWorkerCoin } from '@/services/market';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { ago, appHref, pct, signedSol, sol, tone } from './format';
import { useCommand, viewAsAtom, type ShownError } from './state';
import { SignedPercentText } from './SignedPercentText';
import { CopyError, useReport } from './Report';
import { SolscanLink } from './Parts';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { isAdminAtom } from '@/store/user/atoms';
import { TRADER_STATUS } from '../../../../types/team';
import { pricedCoin } from '../../../../types/home';
import type { CoinSnapshot } from '../../../../types/teamAssistant';
import { coinLink, keyMode, readCoinRef } from '../../../../types/coinKey';
import s from './team.module.css';
import { Link } from '@/lib/appNavigation';

export type Item = CoinSnapshot;
type Check = Item['checks'][number];
type Role = 'research' | 'sniper' | 'trader';
/** `tx`: the Real SOL transaction the step's fill landed in. */
type Step = { role: Role; verdict: ReactNode; reason?: ReactNode; at?: number | null; state?: 'pending'; tone?: 'warn' | 'up' | 'down'; trigger?: string; tx?: string };
const DECIDED_BY = { rules: 'Rules', jev: 'Jev', 'code-only': 'Rules only · Jev unavailable', glm: 'Jev + second opinion', claw: 'Jev + second opinion', unavailable: 'Unavailable' } as const;

export const SHORT: Record<string, string> = { liquidity: 'Liq', volume: 'Vol', market_cap: 'MCap', age: 'Age', holders: 'Top 10', authorities: 'Mint & freeze', max_age: 'Age', move_1h: '1h', max_move_1h: '1h move', rugger: 'Deployer', launch_jump: 'Launch', layered_launch: 'Layered', launchpad: 'Launchpad', transfer_fee: 'Fee', smooth_climb: 'Smooth', top10_held: 'Top 10', bundlers_bought: 'Bundles', recent_crash: 'Crash', self_made_pool: 'Pool', meteora_launch: 'Venue', buyers_1h: 'Buyers 1h', dev: 'Dev', insiders: 'Insiders', bundlers: 'Bundlers', snipers: 'Snipers', dev_concentration: 'Dev', insider_concentration: 'Insiders', bundler_concentration: 'Bundlers', holders_count: 'Holders', buy_sell: 'Buy/sell', drawdown: 'From high', lp_burn: 'LP burned', fees: 'Fees 24h', real_trading: 'Real trades', scam_flag: 'Scam flag', pro_holdings: 'Pros', honeypot: 'Selling', excluded: 'Excluded', x_link: 'X', website: 'Website', dex_paid: 'Dex paid', dex_boosted: 'Boosted' };
const keyOf = (check: Check) => check.key ?? check.label;
const compact = (n: number) => '$' + (n >= 1e9 ? +(n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : Math.round(n));
/** Measured values in chip size: money compact, ages in hours, authorities as one word. */
function short(measured: string) {
  const money = measured.match(/^\$([\d,]+(?:\.\d+)?)$/);
  if (money) return compact(Number(money[1].replace(/,/g, '')));
  const minutes = measured.match(/^(\d+) minutes$/);
  if (minutes) { const m = Number(minutes[1]); return m < 60 ? m + 'm' : m < 2880 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }
  if (/^(Mint revoked · freeze revoked|Revoked)$/.test(measured)) return 'revoked';
  return measured.replace(/^Mint (enabled|revoked) · freeze (enabled|revoked)$/, (_, a, b) => [a === 'enabled' ? 'can mint' : '', b === 'enabled' ? 'can freeze' : ''].filter(Boolean).join(' · '));
}
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** A stored research reason in plain words, for stream rows and grouped panels. */
export function plainReason(detail: string | null | undefined) {
  if (!detail) return '';
  // "Fit 63 / 90. Misses too many of your targets. Confidence 58%, needs 65%." → one short user line.
  const fit = detail.match(/^Fit (\d+) \/ (\d+)\.\s*(.*?)\s*(?:Confidence (\d+)%, needs (\d+)%\.)?$/);
  if (fit) {
    const [, score, need, why, sure, min] = fit;
    return [why.replace(/\.$/, ''), `scored ${score}${Number(score) < Number(need) ? `, needs ${need}` : ''}`, sure ? `${sure}% confident, needs ${min}%` : ''].filter(Boolean).join(' · ');
  }
  // "Confidence 53%, needs 60%. Not convincing enough for this strategy." → Jev's overall read decided it.
  const sure = detail.match(/^Confidence (\d+)%, needs (\d+)%\.\s*(.*)$/);
  if (sure) return [sure[3].replace(/\.$/, ''), `${sure[1]}% confident, needs ${sure[2]}%`].filter(Boolean).join(' · ');
  const hard = detail.match(/^Hard rule not (?:met|confirmed): (.*)\.$/);
  if (hard) return `Failed ${lower(hard[1])}`;
  const missing = detail.match(/^Missing data for a hard rule: (.*)\.$/);
  if (missing) return `No data for ${lower(missing[1])}`;
  return detail;
}
/** SniperBot's entry (an armed event's stored detail) in a few words: the dip it waits for, the watch before it, or at market. */
export function entryReason(detail: string | null | undefined) {
  const dip = detail?.match(/−[\d.]+% dip/)?.[0], watch = detail?.match(/^Watching it (\d+) min/)?.[1];
  const how = dip ? `Waits for the ${dip}` : watch ? `Watches ${watch} min, then enters` : 'At market';
  return detail?.startsWith('Back from the queue') ? `Back from the queue · ${lower(how)}` : how;
}

function missing(check: Check) { return check.missing === true || check.measured === 'Unavailable'; }
/** Strategy fit left ungraded because Jev's overall read already decided: that read stands in for it. */
function overallRead(item: Item, check: Check) {
  const read = item.assessment;
  return keyOf(check) === 'instructions' && check.score == null && read?.overall != null && read.minimum != null ? { value: read.overall, minimum: read.minimum } : null;
}
function researchReason(item: Item, passed: boolean) {
  const strengths = item.checks.filter(check => !missing(check) && check.met === true && keyOf(check) !== 'excluded').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const misses = item.checks.filter(check => !missing(check) && check.met === false);
  const unknown = item.checks.filter(missing);
  const evidence = (check: Check) => `${lower(check.label)} was ${short(check.measured)} (target: ${lower(check.target)})`;
  const below = misses.length ? `Below target: ${misses.slice(0, 2).map(evidence).join(' and ')}.` : '';
  // Turned down on Jev's read of the coin: that leads, the rule misses follow.
  const read = item.assessment, unsure = !passed && read?.overall != null && read.minimum != null && read.overall < read.minimum;
  const reason = passed ? strengths.length ? `Passed overall: ${strengths.slice(0, 2).map(evidence).join(' and ')}.` : plainReason(item.reason)
    : unsure ? [`ResearchBot is ${Math.round(read.overall! * 100)}% sure about this coin, this strategy needs ${Math.round(read.minimum! * 100)}%.`, below].filter(Boolean).join(' ')
    : below || plainReason(item.reason);
  // The decision service didn't answer, so the rules alone decided: say so first.
  const alone = read?.codeOnly ? 'Decided on your rules alone: the decision service was unavailable. ' : '';
  const tradeoff = passed && misses.length ? ` Accepted trade-offs: ${misses.slice(0, 2).map(check => `${lower(check.label)} ${short(check.measured)}`).join(', ')}.` : '';
  return alone + reason + tradeoff + (unknown.length ? ` Missing evidence: ${unknown.slice(0, 2).map(check => lower(check.label)).join(', ')}${unknown.length > 2 ? ` and ${unknown.length - 2} more checks` : ''}.` : '');
}

function researchStep(item: Item, price: ReturnType<typeof usePriceDisplay>['describe']): Step {
  const at = item.assessment?.at;
  if (item.stage === 'research') return { role: 'research', verdict: item.checks.length ? 'Recheck queued' : 'Checking it now', reason: item.checks.length ? researchReason(item, false) : 'Pulling market, holder and safety data', at };
  if (item.stage === 'blocked') return { role: 'research', verdict: 'Couldn’t check it', reason: plainReason(item.reason), at: item.at, tone: 'warn' };
  if (item.stage === 'booked' && item.armedPriceUsd == null && !item.entry) return { role: 'research', verdict: 'Checking it on Home', state: 'pending' };
  if (item.stage === 'rejected' || (item.armedPriceUsd == null && !item.entry && item.stage !== 'skipped')) {
    return { role: 'research', verdict: item.researchPriceUsd ? <>Rejected <em>at {price(item.researchPriceUsd, item.supply)}</em></> : 'Rejected', reason: researchReason(item, false), at, tone: 'down' };
  }
  return { role: 'research', verdict: item.researchPriceUsd ? <>Picked it <em>at {price(item.researchPriceUsd, item.supply)}</em></> : 'Picked it', reason: researchReason(item, true), at, tone: 'up' };
}

function sniperStep(item: Item, price: ReturnType<typeof usePriceDisplay>['describe']): Step | null {
  const dip = item.strategy?.dipPct ?? 0;
  const sized = item.confidence != null ? `Sized ${sol(item.amountSol, 3)} from the research assessment · ` : '';
  if (item.entry) return { role: 'sniper', tx: item.mode === 'live' ? item.entry.tx : undefined, verdict: <>Entry at {price(item.entry.priceUsd, item.supply)}</>, reason: sized ? sized + (item.targetPriceUsd ? `waited for the −${dip}% dip` : 'entered at market') : item.targetPriceUsd ? `Waited for the −${dip}% dip, then entered` : 'Entered at market as soon as it passed' };
  if (item.stage === 'approval') return { role: 'sniper', verdict: 'Wants to buy', reason: `${sol(item.amountSol)}${item.markPriceUsd ? ' at ' + price(item.markPriceUsd, item.supply) : ''} · needs your OK`, tone: 'warn' };
  if (item.stage === 'armed') return { role: 'sniper', verdict: 'Waiting to enter', reason: sized ? sized + (item.targetPriceUsd ? `enters under ${price(item.targetPriceUsd, item.supply)}` : 'enters at market') : item.targetPriceUsd ? `Enters when it dips to ${price(item.targetPriceUsd, item.supply)} (−${dip}%)` : 'Entering at market price' };
  if (item.stage === 'buying') return { role: 'sniper', verdict: 'Entry hit', reason: 'Handed to TraderBot to fill' };
  if (item.stage === 'expired') return { role: 'sniper', verdict: 'Let it go', reason: item.askedPriceUsd || item.heldAt ? (item.exitReason ?? 'The price moved too far to still be worth buying') : 'The entry price never came within 2 hours' };
  if (item.stage === 'skipped' && item.armedPriceUsd != null) return { role: 'sniper', verdict: 'Skipped', reason: item.exitReason ?? undefined };
  if (item.stage === 'failed') return { role: 'sniper', verdict: 'Couldn’t buy', reason: plainReason(item.reason), tone: 'down' };
  if (item.stage === 'research') return { role: 'sniper', verdict: 'Picks the entry next', state: 'pending' };
  return null;
}

function traderStep(item: Item): Step | null {
  const change = item.entry && item.markPriceUsd ? (item.markPriceUsd / item.entry.priceUsd - 1) * 100 : null;
  if (item.stage === 'buying') return { role: 'trader', verdict: 'Buying now', reason: `${sol(item.amountSol)} ${item.mode === 'live' ? 'from your wallet' : 'in practice'}` };
  if (item.stage === 'held') { const review = item.lastReview;
    return { role: 'trader', verdict: change === null ? 'Holding' : <>Holding <em>· <SignedPercentText>{pct(change)}</SignedPercentText></em></>, reason: review?.note ? <><SignedPercentText>{review.reason}</SignedPercentText><br/><SignedPercentText>{'Second opinion · ' + review.note}</SignedPercentText></> : review?.reason ?? 'Watching every price move', at: review?.at ?? null,
      trigger: review?.trigger ?? undefined }; }
  if (item.stage === 'selling') return { role: 'trader', verdict: 'Selling', reason: item.exitReason ?? undefined };
  if (item.stage === 'closed') return { role: 'trader', tx: item.mode === 'live' ? item.exit?.tx : undefined, verdict: <>Sold <em>· {signedSol(item.pnlSol)}</em></>, reason: item.exitReason ?? undefined, tone: (item.pnlSol ?? 0) >= 0 ? 'up' : 'down' };
  if (item.stage === 'failed' && item.entry) return { role: 'trader', verdict: 'Hit a problem', reason: plainReason(item.reason), tone: 'down' };
  if (item.stage === 'booked') return { role: 'trader', verdict: 'Has it on Home' };
  if (['research', 'armed', 'approval'].includes(item.stage)) return { role: 'trader', verdict: 'Decides the exit after buying', state: 'pending' };
  return null;
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** What happens next, from what the bot holding the coin stored at its last check; a held coin adds its next look and next sells as chips. */
function nextLine(item: Item, { format }: ReturnType<typeof usePriceDisplay>): { text: ReactNode; chips?: ReactNode[] } | null {
  const review = item.lastReview, later = (at: number | null | undefined) => at != null && at > Date.now();
  switch (item.stage) {
    case 'research': {
      const gaps = item.checks.filter(missing).map(check => lower(check.label));
      if (!gaps.length || item.recheckAt == null) return { text: 'If it passes, SniperBot picks the entry' };
      return { text: <>Rechecks {gaps.slice(0, 2).join(' and ')}{gaps.length > 2 ? ` +${gaps.length - 2}` : ''}{later(item.recheckAt) ? <> at <b>{clock(item.recheckAt!)}</b></> : ' now'}</> };
    }
    case 'armed': return item.targetPriceUsd && later(item.expiresAt) ? { text: <>Lets it go at <b>{clock(item.expiresAt!)}</b> if it never dips</> } : null;
    case 'approval': return { text: <>{review ? `${review.reason} · approve or skip` : 'Approve or skip'}{later(item.expiresAt) ? <> by <b>{clock(item.expiresAt!)}</b></> : null}</> };
    case 'buying': return { text: 'Confirming the fill' };
    case 'held': {
      // A coin whose strategy trades by code alone gets no review: its plan's stops and take-profits are what comes next.
      const codeOnly = item.strategy?.codeOnly === true, look = codeOnly ? null : item.look, sells = item.sells, status = codeOnly ? null : review?.status;
      // A sell to confirm, a second opinion or a take-profit just sold: TraderBot looks again on the next pass, not at a price.
      const soon = look?.now ?? (status === 'confirming' || status === 'second_opinion' ? TRADER_STATUS[status] : null);
      const chips = [
        !soon && look ? <span key="look" className={s.fact}>Next look <b>{format(look.downUsd, item.supply)}–{format(look.upUsd, item.supply)}</b>{later(look.at) ? <b>· {clock(look.at)}</b> : null}</span> : null,
        sells?.stop ? <span key="stop" className={s.fact} title={sells.stop.reason}>Stop <b>{format(sells.stop.priceUsd, item.supply)}</b></span> : null,
        sells?.takeProfit ? <span key="tp" className={s.fact}>{sells.takeProfit.pullbackPct ? 'Take profit after' : 'Take profit'} <b>{format(sells.takeProfit.priceUsd, item.supply)}</b>{sells.takeProfit.sellPct < 100 ? <b>· {sells.takeProfit.sellPct}%</b> : null}</span> : null,
      ].filter(Boolean);
      return { text: soon ?? (status ? TRADER_STATUS[status] : codeOnly ? 'The exit plan sells it' : 'Not reviewed yet'), chips };
    }
    case 'selling': return { text: 'Proceeds go to your balance' };
    default: return null;
  }
}

/** One plain line: which bot has it and what is happening; `withMove` adds a held coin's move, for a head with no worth to show it. */
export function statusLine(item: Item, withMove = true) {
  const change = withMove && item.entry && item.markPriceUsd ? (item.markPriceUsd / item.entry.priceUsd - 1) * 100 : null;
  switch (item.stage) {
    case 'research': return 'ResearchBot is checking it';
    case 'rejected': return 'ResearchBot passed on it';
    case 'blocked': return 'ResearchBot couldn’t check it';
    case 'armed': return 'SniperBot is waiting to buy';
    case 'approval': return 'Waiting for your OK to buy';
    case 'queued': return 'Waiting for room in its strategy';
    case 'buying': return 'TraderBot is buying';
    case 'held': return change === null ? 'TraderBot is holding it' : `TraderBot is holding it · ${pct(change)}`;
    case 'selling': return 'TraderBot is selling';
    case 'closed': return `Sold · ${signedSol(item.pnlSol)}`;
    case 'expired': return item.heldAt ? 'Let go from the queue' : item.askedPriceUsd ? 'Let go after the price moved' : 'The entry never came';
    case 'skipped': return 'Skipped';
    case 'failed': return 'Something went wrong';
    case 'booked': return 'TraderBot has it on Home';
  }
}
const OWNER: Record<Item['stage'], Role> = { research: 'research', rejected: 'research', blocked: 'research', armed: 'sniper', approval: 'sniper', queued: 'sniper', expired: 'sniper', skipped: 'sniper', buying: 'trader', held: 'trader', selling: 'trader', closed: 'trader', failed: 'trader', booked: 'trader' };

/** A coin's page and trail as the team's worker holds them (services/market.ts `watchWorkerCoin`): a practice coin its desk holds since the
 *  paper cutover, which Convex holds no row of (or a `booked` one) until its hour's pack. Null when the worker does not hold it or cannot
 *  answer: with the team topic off it never answers, and with it on a silent worker is given up on after WORKER_COIN_WAIT_MS. Undefined
 *  while the worker may still answer. Only a practice key (types/coinKey.ts) can name such a coin. */
type WorkerPage = { item: NonNullable<FunctionReturnType<typeof api.team.item>>; trail: FunctionReturnType<typeof api.team.trail> };
const WORKER_COIN_WAIT_MS = 3_000;
function useWorkerCoin(id: string) {
  const { ck } = readCoinRef(id), practice = ck !== null && keyMode(ck) === 'paper', flags = useQuery(api.flags.current, {});
  const keyed = practice && flags?.topicAt !== undefined, [page, setPage] = useState<{ id: string; page: WorkerPage | null }>(), [gaveUp, setGaveUp] = useState<string>();
  useEffect(() => {
    if (!keyed) return;
    const timer = setTimeout(() => setGaveUp(id), WORKER_COIN_WAIT_MS);
    const stop = watchWorkerCoin(id, answer => { clearTimeout(timer); setPage({ id, page: 'coin' in answer ? answer.coin as WorkerPage | null : null }); });
    return () => { clearTimeout(timer); stop(); };
  }, [id, keyed]);
  if (!practice) return null;
  return page?.id === id ? page.page : flags === undefined ? undefined : !keyed || gaveUp === id ? null : undefined;
}

/** The coin with its live price from the market gateway, beside the record: a price tick never re-reads the coin's evidence. A coin the
 *  worker's practice desk holds is its page (`useWorkerCoin`); Convex's (its row, or its pack once the desk let it go) stands in otherwise. */
export function useItem(id: string) {
  const stored = useQuery(api.team.item, { id, ...useAtomValue(viewAsAtom) }), worker = useWorkerCoin(id);
  // Convex has no row of a coin only the desk held until its pack: its page waits for the worker's answer.
  const item = worker?.item ?? (stored === null && worker === undefined ? undefined : stored), status = useQuery(api.team.status, item ? {} : 'skip');
  const address = item?.token.address, mark = useMarketMark(address);
  return useMemo(() => item && status !== undefined ? pricedCoin(item, status && { ...status, prices: mark && address ? { [address]: mark } : {} }) : item === null ? null : undefined, [item, status, mark, address]);
}
/** A coin's trail, newest first: Convex's events, and the steps the worker's practice desk keeps of a coin it holds (`useWorkerCoin`). A
 *  buy or sale Convex read back from the coin's pack is the desk's own step at that moment, so it shows once. */
export function useTrail(id: string) {
  const stored = useQuery(api.team.trail, { itemId: id, ...useAtomValue(viewAsAtom) }), worker = useWorkerCoin(id);
  return useMemo(() => {
    const own = worker?.trail;
    if (!own) return stored;
    const twin = (row: NonNullable<typeof stored>[number]) => own.some(step => step.kind === row.kind && Math.abs(step.at - row.at) < TWIN_MS);
    return [...own, ...(stored ?? []).filter(row => !twin(row))].sort((a, b) => b.at - a.at);
  }, [stored, worker]);
}
/** A buy or sale of a coin's pack and the desk's own step for it are this close in time. */
const TWIN_MS = 5_000;

/** Compact page overview; the existing decision dialog carries reasons and evidence. */
export function DecisionCards({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const { describe: price } = usePriceDisplay();
  const steps = [researchStep(item, price), sniperStep(item, price), traderStep(item)].filter((step): step is Step => Boolean(step));
  const names: Record<Role, string> = { research: 'ResearchBot', sniper: 'SniperBot', trader: 'TraderBot' };
  return <div className={s.decisionCards}>{steps.map(step => <Button type="button" variant="secondary" key={step.role} className={s.decisionCard} data-tone={step.tone} data-state={step.state} onClick={onOpen} aria-label={`${names[step.role]} decision and evidence`}>
    <span className={s.decisionCardTop}><BotAvatar role={step.role} size={24}/><span>{names[step.role]}</span><ChevronRight size={14}/></span>
    <b>{step.verdict}</b>
  </Button>)}</div>;
}

/** What a position is worth (or made, once sold): `value` in `tone`'s colour, the SOL that went in and its move. */
export type CoinWorth = { value: string; tone: number | null; paid: number; move: number | null };
/** A coin's head, the same in every coin dialog: its logo, symbol (with `badge` beside it) and status line, and at the right its worth, with
 *  `warn` under it: a fact about that worth that needs the person (an old or missing price). */
export function CoinHead({ address, symbol, badge, status, worth, warn }: { address: string; symbol: string; badge?: ReactNode; status: ReactNode; worth?: CoinWorth | null; warn?: ReactNode }) {
  return <div className={s.coinHead}>
    <div className={s.decisionHead}>
      <TokenAvatar className="size-11 rounded-[28%]" address={address} symbol={symbol}/>
      <div className={s.decisionIdentity}>
        <span className={s.coinName}><b className={s.decisionName}>{symbol}</b>{badge}</span>
        <small className={s.decisionStatus}>{status}</small>
      </div>
    </div>
    {(worth || warn) && <div className={s.tokenPosition}>
      {worth && <>
        <b className={`${s.big} ${s[tone(worth.tone) ?? 'muted']}`}>{worth.value}</b>
        <div className={s.tokenReturns}><span>in {sol(worth.paid, 2).replace(' SOL', '')}</span>{worth.move !== null && <><i aria-hidden/><b className={s[tone(worth.move) ?? 'muted']}>{pct(worth.move)}</b></>}</div>
      </>}
      {warn && <small className={s.coinWarn}>{warn}</small>}
    </div>}
  </div>;
}

/** A pipeline coin's head: its owner bot's status and its strategy as a link, and a Real SOL tag beside a live coin's name (practice is the
 *  default, so it shows nothing); `warn` and `worth` as in CoinHead. */
export function DecisionHead({ item, warn, worth }: { item: Item; warn?: ReactNode; worth?: CoinWorth | null }) {
  return <CoinHead address={item.token.address} symbol={item.token.symbol} worth={worth} warn={warn}
    badge={item.mode !== 'paper' && <span className={s.pill} data-tone="ember">Real SOL</span>}
    status={<><BotAvatar role={OWNER[item.stage]} size={14}/><span>
      <SignedPercentText>{statusLine(item, !worth)}</SignedPercentText>
      {item.strategy && <><span className={s.coinSep}> · </span><Link href={appHref('strategies', item.strategy.id)} className={s.coinStrategy} aria-label={`Open strategy ${item.strategy.name}`}>{item.strategy.name}<ArrowUpRight aria-hidden/></Link></>}
    </span></>}/>;
}

/** How many of the coin's research checks had data to read. */
export const availableChecks = (item: Item) => item.checks.filter(check => !missing(check)).length;

/** Decisions (one step per bot, verdict and reason) and the evidence behind them. */
export function DecisionBody({ item }: { item: Item }) {
  return <><DecisionSteps item={item}/><DecisionEvidence item={item}/></>;
}

/** One step per bot: its verdict, a plain reason and when; the full view adds the reason's trigger and what comes next. */
export function DecisionSteps({ item, compact = false }: { item: Item; compact?: boolean }) {
  const display = usePriceDisplay(), price = display.describe;
  const steps = [researchStep(item, price), sniperStep(item, price), traderStep(item)].filter((step): step is Step => Boolean(step));
  const next = nextLine(item, display);
  return <div>
    {compact ? <div className={s.stepsCompact}>{steps.map(step => <div key={step.role} className={s.stepLine} data-state={step.state} data-tone={step.tone}>
      <BotAvatar role={step.role} size={20}/><b>{step.verdict}</b><SolscanLink kind="tx" value={step.tx} label="View the fill on Solscan"/>{step.reason && <span className={s.stepReason}>{typeof step.reason === 'string' ? <SignedPercentText>{step.reason}</SignedPercentText> : step.reason}</span>}{step.at ? <time>{ago(step.at)}</time> : null}
    </div>)}</div>
    : <div className={s.steps}>{steps.map(step => <div key={step.role} className={s.step} data-state={step.state} data-tone={step.tone}>
      <BotAvatar role={step.role} size={28}/>
      <b>{step.verdict}<SolscanLink kind="tx" value={step.tx} label="View the fill on Solscan"/></b>
      {step.at ? <time>{ago(step.at)}</time> : <span/>}
      {step.reason && <p>{typeof step.reason === 'string' ? <SignedPercentText>{step.reason}</SignedPercentText> : step.reason}</p>}
      {step.trigger && <span className={s.stepMeta}><span className={s.pill}><SignedPercentText>{step.trigger}</SignedPercentText></span></span>}
    </div>)}</div>}
    {next && !compact && <div className={s.next}><CornerDownRight/><div className={s.nextBody}><span>{next.text}</span>{next.chips?.length ? <span className={s.nextChips}>{next.chips}</span> : null}</div></div>}
  </div>;
}

/** The research evidence: a chip per check, and every check in full behind a toggle. `label`: its own heading, left out where a tab names it. */
export function DecisionEvidence({ item, label = true }: { item: Item; label?: boolean }) {
  const facts = item.checks, passed = item.armedPriceUsd != null || item.entry != null, isAdmin = useAtomValue(isAdminAtom);
  if (!facts.length) return null;
  // Admins see who made the coin's latest call and how, first among the checks it rests on.
  const review = item.source?.review, research = item.source?.research, decidedBy = !isAdmin ? null : review ? DECIDED_BY[review.by] : research ? DECIDED_BY[research.method] : null;
  const sourceBot = review ? review.role === 'trader' ? 'TraderBot' : 'SniperBot' : 'ResearchBot';
  return <div>
    {label && <p className={s.label}>Research evidence · {availableChecks(item)}/{facts.length} available</p>}
    <div className={s.evidence}>{decidedBy && <span className={s.fact} data-tone="muted" aria-label={`${sourceBot} source: ${decidedBy}`}
      title={[review ? `${sourceBot} latest review` : 'ResearchBot assessment', decidedBy, !review && research?.model, new Date((review ?? research)!.at).toLocaleString()].filter(Boolean).join(' · ')}>Source <b>{decidedBy}</b></span>}
      {facts.map(check => { const key = keyOf(check), unavailable = missing(check), sure = overallRead(item, check), ungraded = check.met == null && check.score == null && check.probability == null && sure == null;
      const weak = key === 'instructions' ? (check.score ?? 100) < 85 : check.met !== false && (check.score ?? 100) < 100;
      const doubtful = sure != null && sure.value < sure.minimum;
      const tone = unavailable || ungraded ? 'muted' : check.met === false || doubtful ? (passed ? 'warn' : 'down') : weak ? 'weak' : undefined;
      return <span key={check.label} className={s.fact} data-tone={tone} title={`${check.label}: ${check.measured}. Rule: ${check.target}.`}>
        {unavailable || ungraded ? <HelpCircle/> : check.met === false || doubtful ? (passed ? <Minus/> : <X/>) : weak ? <Minus/> : <Check/>}
        <>{SHORT[key] ?? check.label} <b><SignedPercentText>{unavailable ? 'No data' : sure != null ? `${Math.round(sure.value * 100)}% sure` : key === 'instructions' || key.startsWith('custom_') ? check.score == null ? 'Not graded' : 'Fit ' + Math.round(check.score) : short(check.measured)}</SignedPercentText></b></>
      </span>; })}</div>
    <Collapsible className={s.workspaceDetails}><CollapsibleTrigger>Every check<ChevronRight size={13}/></CollapsibleTrigger><CollapsibleContent><div className={s.researchChecks}>{facts.map(check => <div key={check.key ?? check.label} data-missing={missing(check) || undefined}>
      <span><b>{check.label}</b><small>{check.target}</small>{check.mode && <small>{check.mode === 'hard' ? 'Required' : `Weighted · ×${check.weight ?? 1}`}</small>}</span>
      <span><b>{missing(check) ? 'No data' : short(check.measured)}</b><small>{missing(check) ? 'Not verified' : check.met === false ? passed ? 'Accepted trade-off' : 'Below target' : check.met === true ? 'Target met' : check.score != null ? `Fit ${Math.round(check.score)} / 125` : overallRead(item, check) ? `Overall fit ${Math.round(overallRead(item, check)!.value * 100)}%${overallRead(item, check)!.minimum ? `, needs ${Math.round(overallRead(item, check)!.minimum * 100)}%` : ', no minimum'}` : check.probability != null ? `Assessment ${Math.round(check.probability * 100)}%` : 'Not graded'}</small></span>
    </div>)}</div></CollapsibleContent></Collapsible>
  </div>;
}

/** `rate`: the Rate button, beside Report (the coin page's and the quick look's). */
export function DecisionActions({ item, inPanel = false, rate, onNavigate }: { item: Item; inPanel?: boolean; rate?: ReactNode; onNavigate?: () => void }) {
  const command = useCommand(), report = useReport();
  return <div className={s.decisionActions}>
    {item.stage === 'held' && <Button size="sm" onClick={() => command({ type: 'sell', itemId: item.id })}>Sell</Button>}
    {item.mode === item.strategyMode && item.stage === 'approval' && <><Button size="sm" onClick={() => command({ type: 'approve', itemId: item.id, ...(item.strategy ? { seen: item.strategy.rev } : {}) })}><Check/>Buy it</Button><Button size="sm" variant="ghost" onClick={() => command({ type: 'skip', itemId: item.id })}>Skip</Button></>}
    {item.mode === item.strategyMode && item.stage === 'armed' && <><Button size="sm" variant="outline" onClick={() => command({ type: 'buyNow', itemId: item.id, ...(item.strategy ? { seen: item.strategy.rev } : {}) })}>Buy now</Button><Button size="sm" variant="ghost" onClick={() => command({ type: 'cancel', itemId: item.id })}>Skip</Button></>}
    {inPanel && <Button size="sm" variant={item.stage === 'held' || item.stage === 'approval' || item.stage === 'armed' ? 'outline' : 'default'} asChild><Link href={appHref('tokens', coinLink(item))} onClick={onNavigate}>Open page</Link></Button>}
    {item.stage === 'failed' && <CopyError size="sm" error={itemError(item)}/>}
    {rate}
    <Button size="sm" variant="ghost" className={rate ? undefined : s.reportButton} onClick={() => report.write({ target: { type: 'coin', id: item.id, label: item.token.symbol }, shown: JSON.stringify(item), kind: item.stage === 'closed' || item.stage === 'held' ? 'strategy' : 'data' })} aria-label={`Report a problem with ${item.token.symbol}`}><Flag className={s.reportFlag}/>{rate ? <span className={s.wideLabel}>Report</span> : 'Report'}</Button>
  </div>;
}

/** A coin whose buy (or, holding, a sale) gave up, with the coin and strategy it belongs to. */
const itemError = (item: Item): ShownError => ({ title: `${item.entry ? 'Hit a problem with' : 'Couldn’t buy'} ${item.token.symbol}`, error: item.reason ?? undefined, key: `item:${item.id}:${item.reason}`, report: true,
  target: { type: 'coin', id: item.id, label: item.token.symbol },
  context: { coin: item.token.symbol, mint: item.token.address, item: item.id, strategy: item.strategy ? `${item.strategy.name} · ${item.strategy.id}` : item.strategyId, stage: item.stage, mode: item.mode, amountSol: item.amountSol } });

