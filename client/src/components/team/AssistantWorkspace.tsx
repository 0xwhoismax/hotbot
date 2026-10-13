"use client";
import { useHome } from './useHome';
import { useEffect, useState } from 'react';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { formatMarketCap } from '@/utils/formatterUtils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, ArrowLeft, ArrowRight, ChartNoAxesCombined, Check, ChevronRight, Fingerprint, LoaderCircle, ScanSearch, SlidersHorizontal, Sparkles, Undo2, Wallet } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { applyPatch, keepName, planDraft, type StrategyPatch } from '../../../../types/team';
import type { TeamRules } from '../../../../types/hotbot';
import { shieldOf } from '../../../../types/shield';
import { settingsOfPatch } from '../../../../types/settingsGuide';
import { CAPABILITIES, type AssistantResult, type AssistantShortcut, type Choice, type CoinMatch, type CoinSnapshot, type Interaction, type Ranking, type StrategySummary } from '../../../../types/teamAssistant';
import { DecisionBody, DecisionHead } from './Decision';
import { PlanStep } from './Onboarding';
import { ago, appHref, pct, price, signedSol, sol, tone, usd } from './format';
import { checkCoinAtom, draftBridgeAtom, draftProposalAtom, useCommand, type DraftBridge } from './state';
import { UNREPLAYED, describeChanges } from './Settings';
import { CHECKS } from './checks';
import { stable } from './ExitPlan';
import { AddStrategyButton, CoinPill, DecisionDialog } from './Parts';
import { change } from './data';
import s from './team.module.css';

type Props = { result: AssistantResult; busy?: boolean; onPrompt?: (text: string) => void; onShortcut?: (shortcut: AssistantShortcut) => void; onInteract?: (interaction: Interaction) => void };
const icons = { preset: Sparkles, research: ScanSearch, performance: ChartNoAxesCombined, decisions: Fingerprint, settings: SlidersHorizontal, positions: Wallet };

/** Model-selected components; data and executable actions are resolved by the backend. */
/** Answers that already pointed at their rows, so a dock opened again doesn't point again. */
const pointed = new Set<string>();
export function AssistantWorkspace({ result, busy = false, onPrompt, onShortcut, onInteract }: Props) {
  const openCheck = useSetAtom(checkCoinAtom), card = result.card, interactive = Boolean(onInteract), screen = useAtomValue(draftBridgeAtom);
  // The Settings rows an answer is about glow once, as it arrives: the ones the model named, or the ones a change for the draft touches.
  useEffect(() => {
    const ids = result.highlight ?? (card.kind === 'draftChange' ? settingsOfPatch(card.patch) : []), key = `${result.sessionId}:${result.revision}`;
    if (!ids.length || !screen || pointed.has(key)) return;
    pointed.add(key);
    screen.show(ids);
  }, [result, card, screen]);
  // A typed reply on the tools card (a greeting, a refusal) is headed in the corner; Chat's bubble already says it. Coin searches are headed by their summary, a best/worst strategy by its title.
  const headed = card.kind === 'capabilities' ? result.route !== 'button' : card.kind === 'research' ? Boolean(result.summary) : card.kind === 'strategies' && card.rank ? true : !['preset', 'strategies', 'coin', 'portfolio'].includes(card.kind);
  const choices = (items: Choice[]) => <div className={s.workspaceChoices}>{items.map(choice => <button key={choice.prompt} type="button" disabled={busy || !onPrompt} onClick={() => onPrompt?.(choice.prompt)}><span><b>{choice.label}</b>{choice.detail && <small>{choice.detail}</small>}</span><ChevronRight size={16}/></button>)}</div>;
  return <div className={s.workspaceBody}>
    {result.route && <span className={s.routeTag} data-route={result.route} title="Who answered this request">{result.route === 'jev' ? 'Jev · no model call' : result.route === 'filter' ? 'Filter · no model call' : result.route === 'search' ? 'Search · no model call' : result.route === 'button' ? 'Button · no model call' : 'Model · GLM 5.3 Flash'}</span>}
    {headed && <div className={s.workspaceHeading}><h2>{result.title}</h2>{(card.kind === 'insight' || card.kind === 'draftChange') && result.summary && <p>{result.summary}</p>}</div>}
    {card.kind === 'capabilities' && <>
      <div className={s.capabilityGrid}>{CAPABILITIES.map((tool, index) => { const Icon = icons[tool.id]; return <button type="button" key={tool.id} disabled={busy || !onShortcut} className={s.capabilityTile} data-featured={index === 0 || undefined} onClick={() => onShortcut?.(tool.id)}><span className={s.capabilityIcon}><Icon size={19}/></span><span><b>{tool.title}</b><small>{tool.detail}</small></span><ArrowRight className={s.capabilityArrow} size={14}/></button>; })}</div>
    </>}
    {card.kind === 'preset' && <fieldset className={s.planCard} disabled={busy || !interactive}>
      <PlanStep variant="card" plan={card.draft} onPlan={draft => onInteract?.({ type: 'draft', revision: result.revision, draft })} budget={card.draft.budgetSol}
        setBudget={budgetSol => onInteract?.({ type: 'draft', revision: result.revision, draft: keepName(card.draft, { ...planDraft({ ...card.draft.intent, budgetSol }), matches: null }) })}
        starting={busy} signedIn onStart={() => onInteract?.({ type: 'apply', revision: result.revision })} cta="Create strategy" practice={false}/>
    </fieldset>}
    {card.kind === 'clarify' && choices(card.choices)}
    {card.kind === 'insight' && <>{card.facts.length > 0 && <div className={s.workspaceFacts}>{card.facts.map(fact => <div key={fact.label}><small>{fact.label}</small><b>{fact.value}</b>{fact.detail && <span>{fact.detail}</span>}</div>)}</div>}{card.choices.length > 0 && choices(card.choices)}</>}
    {card.kind === 'portfolio' && <>
      <div className={s.workspaceMoney}><div><small>{card.mode === 'paper' ? 'Practice account' : 'Real SOL account'}</small><b>{sol(card.equity)}</b></div><div><small>Total profit</small><b className={s[tone(card.profit) ?? 'muted']}>{signedSol(card.profit)}</b></div></div>
      <div className={s.workspaceLedger}><span><small>Available</small><b>{sol(card.cash)}</b></span><span><small>In positions</small><b>{sol(card.invested)}</b></span></div>
      <div className={s.workspaceTeam}>{([{ role: 'research', label: 'Checking', count: card.research }, { role: 'sniper', label: 'Watching', count: card.watching }, { role: 'trader', label: 'Holding', count: card.held }] as const).map(bot => <div key={bot.role}><BotAvatar role={bot.role} size={27}/><span><b>{bot.count}</b><small>{bot.label}</small></span></div>)}</div>
      {card.approvals > 0 && <Link className={s.workspaceAttention} href={appHref()}><Activity size={16}/>{card.approvals} {card.approvals === 1 ? 'entry needs' : 'entries need'} your approval<ArrowRight size={14}/></Link>}
    </>}
    {card.kind === 'strategies' && <div className={s.workspaceStrategies}>{card.strategies.map(strategy => <StrategyWorkspace key={strategy.id} strategy={strategy} busy={busy} onPrompt={onPrompt}/>)}</div>}
    {card.kind === 'ranking' && (card.coins.length ? <RankingWorkspace card={card}/> : <>
      <p className={s.empty}>{card.subject === 'sold' ? 'Nothing sold yet in this account.' : 'No coins held right now.'}</p>
      {choices([card.subject === 'sold' ? { label: card.direction === 'worst' ? 'Worst coin held' : 'Best coin held', detail: 'Open positions, by return and SOL', prompt: `What's my ${card.direction} coin I'm holding right now?` } : { label: card.direction === 'worst' ? 'Worst trade' : 'Best trade', detail: 'Sold coins, by return and SOL', prompt: `What's my ${card.direction} trade?` }])}
    </>)}
    {card.kind === 'coin' && <CoinWorkspace item={card.item}/>}
    {card.kind === 'draftChange' && <DraftChangeCard key={result.revision} patch={card.patch} auto={card.auto} at={`${result.sessionId}:${result.revision}`}/>}
    {card.kind === 'research' && card.coins?.length ? <CoinMatches key={result.revision} coins={card.coins} strategyId={card.strategyId} busy={busy}/> : card.kind === 'research' && <div className={s.workspaceResearch}><span className={s.workspaceResearchMark}><ScanSearch size={27}/></span><div><b>{card.query || 'Start with a name or address.'}</b><small>Market data, holder checks and your strategy’s rules.</small></div><Button size="sm" disabled={busy} onClick={() => openCheck({ query: card.query, strategyId: card.strategyId })}>Choose coin<ArrowRight/></Button></div>}
    {card.kind === 'action' && <>
      <div className={s.workspaceChanges}>{card.changes.map((change, index) => <div key={change.label + index}><span><small>{change.label}</small>{change.detail && <span>{change.detail}</span>}</span><b>{change.value}</b></div>)}</div>
      {card.status === 'pending' ? <div className={s.workspaceActions}><span className={s.workspacePending}>Waiting for you</span><Button variant="ghost" size="sm" disabled={busy || !interactive} onClick={() => onInteract?.({ type: 'dismiss', revision: result.revision })}>Dismiss</Button><Button size="sm" disabled={busy || !interactive} onClick={() => onInteract?.({ type: 'apply', revision: result.revision })}>Apply<ArrowRight/></Button></div> : <div className={s.workspaceReceipt}><Check size={15}/>{card.status === 'applied' ? 'Confirmed by your team' : 'No changes made'}{card.href && <Link href={card.href}>Open strategy<ArrowRight size={14}/></Link>}</div>}
    </>}
  </div>;
}

const age = (at: number) => { const days = (Date.now() - at) / 864e5; return days >= 365 ? Math.floor(days / 365) + 'y' : days >= 60 ? Math.floor(days / 30) + 'mo' : ago(at); };
const short = (address: string) => address.slice(0, 4) + '…' + address.slice(-4);

/** Coins from a search: pick one to see it here, then research it against a strategy like Check a coin does. */
function CoinMatches({ coins, strategyId, busy }: { coins: CoinMatch[]; strategyId?: string; busy: boolean }) {
  const { unit, label } = usePriceDisplay();
  const [picked, setPicked] = useState<CoinMatch | null>(coins.length === 1 ? coins[0] : null);
  if (!picked) return <div className={s.coinMatches}>{coins.map(coin => <button type="button" key={coin.address} className={s.row} onClick={() => setPicked(coin)}>
    <TokenAvatar className="size-8 rounded-[28%]" address={coin.address} logoUrl={coin.logo} symbol={coin.symbol} network="solana" fallback="letter" disableDetailFallback/>
    <span className={s.grow}><b>{coin.symbol}</b><small>{coin.name}</small></span>
    <span className={s.end}><b title={label}>{unit === 'marketCap' ? formatMarketCap(coin.marketCap) + ' mcap' : price(coin.price)}</b><small className={s[tone(coin.change24h) ?? 'muted']}>{pct(coin.change24h)}</small></span>
    <ChevronRight size={16} className={s.muted}/>
  </button>)}</div>;
  return <CoinPick coin={picked} strategyId={strategyId} busy={busy} onBack={coins.length > 1 ? () => setPicked(null) : undefined}/>;
}

function CoinPick({ coin, strategyId, busy, onBack }: { coin: CoinMatch; strategyId?: string; busy: boolean; onBack?: () => void }) {
  const { unit, label } = usePriceDisplay();
  const home = useHome(), command = useCommand(), router = useRouter();
  const strategies = home?.strategies ?? [], [chosen, setChosen] = useState(strategyId), [sending, setSending] = useState(false);
  const target = chosen ?? (strategies.find(row => row.status === 'running') ?? strategies[0])?.id;
  const research = async () => {
    setSending(true);
    const id = await command({ type: 'research', token: { address: coin.address, name: coin.name, symbol: coin.symbol, decimals: coin.decimals, ...(coin.logo ? { logoUri: coin.logo } : {}) }, strategyId: target });
    setSending(false);
    if (id) router.push(appHref('tokens', String(id)));
  };
  return <div className={s.coinPick}>
    {onBack && <button type="button" className={s.coinPickBack} onClick={onBack}><ArrowLeft size={13}/>All matches</button>}
    <div className={s.coinPickHead}>
      <TokenAvatar className="size-10 rounded-[28%]" address={coin.address} logoUrl={coin.logo} symbol={coin.symbol} network="solana" fallback="letter" disableDetailFallback/>
      <span className={s.grow}><b>{coin.name}<small>{coin.symbol}</small></b><small>{short(coin.address)}{coin.createdAt ? ' · ' + age(coin.createdAt) + ' old' : ''}</small></span>
      <span className={s.end}><b title={label}>{unit === 'marketCap' ? formatMarketCap(coin.marketCap) + ' mcap' : price(coin.price)}</b><small className={s[tone(coin.change24h) ?? 'muted']}>{pct(coin.change24h)} 24h</small></span>
    </div>
    <div className={s.coinPickStats}>{([['Market cap', coin.marketCap], ['Liquidity', coin.liquidity], ['24h volume', coin.volume24h]] as const).map(([label, value]) => <span key={label}><small>{label}</small><b>{usd(value)}</b></span>)}</div>
    {strategies.length > 1 && <div className={s.coinPickWith}><small>Research with</small><div className={s.presets}>{strategies.map(row => <button type="button" key={row.id} aria-pressed={row.id === target} onClick={() => setChosen(row.id)}>{row.name}</button>)}</div></div>}
    <div className={s.coinPickGo}>{home && !strategies.length ? <AddStrategyButton/> : <Button size="sm" disabled={busy || sending || !target} onClick={() => void research()}>{sending ? 'Sending to ResearchBot…' : 'Research ' + coin.symbol}<ArrowRight/></Button>}</div>
  </div>;
}

/** A best or worst answer as one short ranked list, leader first. When another coin leads on return, both leaders are tagged. */
function RankingWorkspace({ card }: { card: Ranking }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = card.subject === 'sold' ? card.coins.map(trade => ({ id: trade.id, token: trade.token, sol: trade.pnlSol, pct: trade.changePct, sub: `${sol(trade.inSol)} in · sold ${ago(trade.closedAt)} ago` }))
    : card.coins.map(coin => ({ id: coin.id, token: coin.token, sol: coin.valueSol - (coin.entry?.sol ?? 0), pct: change(coin) ?? 0, sub: coin.entry ? `${sol(coin.entry.sol)} in · holding` : 'Holding' }));
  // The server puts the leader in SOL first.
  const worst = card.direction === 'worst', byPct = rows.reduce((top, row) => (worst ? top.pct - row.pct : row.pct - top.pct) > 0 ? row : top), split = byPct !== rows[0];
  const tag = (row: typeof rows[number], index: number) => split && index === 0 ? (worst ? 'Worst in SOL' : 'Best in SOL') : split && row === byPct ? (worst ? 'Worst return' : 'Best return') : null;
  return <div className={s.rankList}>
    {rows.map((row, index) => <button type="button" key={row.id} className={s.row} data-lead={index === 0 || undefined} onClick={() => setOpen(row.id)}>
      <TokenAvatar className="size-8 rounded-[28%]" address={row.token.address} logoUrl={row.token.logoUri} symbol={row.token.symbol} network="solana" fallback="letter" disableDetailFallback/>
      <span className={s.grow}><b>{row.token.symbol}{tag(row, index) && <i className={s.rankTag}>{tag(row, index)}</i>}</b><small>{row.sub}</small></span>
      <span className={`${s.end} ${s[tone(row.sol) ?? 'muted']}`}><b>{signedSol(row.sol)}</b><small>{pct(row.pct)}</small></span>
    </button>)}
    {open && <DecisionDialog id={open} onClose={() => setOpen(null)}/>}
  </div>;
}

function StrategyWorkspace({ strategy, busy, onPrompt }: { strategy: StrategySummary; busy: boolean; onPrompt?: (text: string) => void }) {
  const [tab, setTab] = useState<'research' | 'execution' | 'coins'>('research');
  const values = tab === 'research' ? strategy.rules : strategy.execution;
  return <article className={s.workspaceStrategy}>
    <header><span><b>{strategy.name}</b><small><i data-running={strategy.status === 'running' || undefined}/>{strategy.status === 'running' ? 'Running' : 'Paused'}</small></span><span className={s.workspaceReturn}><b className={`${s.workspaceProfit} ${s[tone(strategy.profit) ?? 'muted']}`}>{signedSol(strategy.profit)}</b><small>{pct(strategy.returnPct)} of budget</small></span></header>
    <div className={s.workspaceLedger}><span><small>Budget</small><b>{sol(strategy.budget)}</b></span><span><small>Per coin, max</small><b>{sol(strategy.perCoin)}</b></span><span><small>Holding</small><b>{strategy.held}</b></span></div>
    <div className={s.workspaceTags}><span>{strategy.askFirst ? 'Asks before buying' : 'Automatic entries'}</span><span>{strategy.dipPct ? '−' + strategy.dipPct + '% dip' : 'Market entry'}</span></div>
    <div className={s.seg} aria-label="Strategy detail">{(['research', 'execution', 'coins'] as const).map(view => <button key={view} type="button" aria-pressed={tab === view} onClick={() => setTab(view)}>{view === 'research' ? `Research · ${strategy.rules.length}` : view === 'execution' ? 'Execution' : 'Coins'}</button>)}</div>
    {tab !== 'coins' && <div className={s.workspaceRules}>{values?.map(rule => <span key={rule.label}><small>{rule.label}</small><b>{rule.value}</b>{rule.detail && <small>{rule.detail}</small>}</span>)}</div>}
    {tab === 'research' && strategy.assessment && <Collapsible className={s.workspaceDetails}><CollapsibleTrigger>Pass requirements<ChevronRight size={13}/></CollapsibleTrigger><CollapsibleContent><div className={s.workspaceRules}>{strategy.assessment.map(fact => <span key={fact.label}><small>{fact.label}</small><b>{fact.value}</b>{fact.detail && <small>{fact.detail}</small>}</span>)}</div></CollapsibleContent></Collapsible>}
    {tab === 'coins' && <div className={s.workspaceCoinList}>{strategy.coins?.length ? strategy.coins.map(coin => <div key={coin.id}><CoinPill coins={[coin]} href={appHref('tokens', coin.id)} note={coin.stage}/>{coin.reason && <small>{coin.reason}</small>}<Button size="xs" variant="ghost" disabled={busy || !onPrompt} onClick={() => onPrompt?.('Explain the recorded ResearchBot checks and why the coin with item ID ' + coin.id + ' passed or was rejected.')}>Why this coin?<ArrowRight size={13}/></Button></div>) : <span className={s.empty}>No active coins.</span>}</div>}
    <Link className={s.workspaceLink} href={appHref('strategies', strategy.id)}>Open strategy<ArrowRight size={14}/></Link>
  </article>;
}


const pct1 = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)}%`;
/** Changes HOTBOT put in a draft on arrival, by card, with what the draft held for those settings before, for Undo. */
const autoApplied = new Map<string, StrategyPatch>();
const touchedBy = (patch: StrategyPatch) => [...Object.keys(patch), ...(patch.exitPlan !== undefined ? ['exits'] : [])] as (keyof StrategyPatch)[];
/** A change as the draft takes it: ShieldBot fields join the draft's own, so one changed field doesn't drop others edited before. */
const intoDraft = (screen: DraftBridge, patch: StrategyPatch) => screen.apply(patch.shield ? { ...patch, shield: { ...shieldOf(screen.rules), ...patch.shield } } : patch);
function DraftChangeCard({ patch, auto, at }: { patch: StrategyPatch; auto?: true; at: string }) {
  const screen = useAtomValue(draftBridgeAtom), propose = useSetAtom(draftProposalAtom), key = JSON.stringify(patch);
  useEffect(() => { propose(patch); return () => propose(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const describe = (rules: TeamRules, dip: number) => { try { return describeChanges(patch, rules, applyPatch(rules, patch), dip); } catch (cause) { return [cause instanceof Error ? cause.message : 'The draft can’t take this change']; } };
  // The change as it read against the draft when it arrived, so trying it doesn't turn "20K → 50K" into "50K → 50K".
  const [first] = useState(() => screen ? describe(screen.rules, screen.dip) : null);
  const [undone, setUndone] = useState(false);
  useEffect(() => {
    if (!auto || !screen || autoApplied.has(at)) return;
    autoApplied.set(at, Object.fromEntries(touchedBy(patch).filter(field => field in screen.patch).map(field => [field, screen.patch[field]])));
    intoDraft(screen, patch);
  }, [auto, at, screen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!screen) return <div className={s.workspaceActions}><span className={s.workspacePending}>Open a strategy’s Settings or the Lab to try this on a draft</span><Button size="sm" variant="outline" asChild><Link href={appHref('lab')}>Open the Lab</Link></Button></div>;
  const lines = first ?? describe(screen.rules, screen.dip), lab = screen.page === 'lab';
  // Already in the draft: the change leaves its rules and entry as they are.
  let inDraft = false;
  try { inDraft = stable(applyPatch(screen.rules, patch)) === stable(screen.rules) && (patch.dipPct ?? screen.dip) === screen.dip; } catch { inDraft = false; }
  const before = autoApplied.get(at), undo = () => { screen.drop(touchedBy(patch)); if (before && Object.keys(before).length) screen.apply(before); setUndone(true); };
  const unreplayed = Object.keys(patch).every(field => UNREPLAYED.has(field) || CHECKS.some(row => row.key === field && row.noReplay));
  const replay = screen.replayed?.key === key ? screen.replayed : null, gain = replay ? replay.sol - replay.base.sol : 0, more = replay ? replay.picks - replay.base.picks : 0;
  return <div className={s.workspaceLab}>
    <ul>{lines.map(line => <li key={line}>{line}</li>)}</ul>
    {inDraft ? null : unreplayed ? <div className={s.workspaceLabReplay}><span className={s.workspacePending}>The replay can’t show this change</span></div> : replay ? <div className={s.workspaceLabReplay}>
      <span><small>{lab ? 'On the Lab’s days' : 'On the last days'}</small><b className={s[tone(gain) ?? 'muted']}>{signedSol(gain, 2)}</b></span>
      <span><small>Picks</small><b>{more ? `${more > 0 ? '+' : '−'}${Math.abs(more)}` : 'Same'}</b></span>
      <span><small>A trade</small><b><em className={s[tone(replay.mean - replay.base.mean) ?? 'muted']}>{pct1(replay.mean)}</em></b></span>
    </div> : <div className={s.workspaceLabReplay} data-loading><LoaderCircle size={14} className="animate-spin"/>Replaying against the draft…</div>}
    <div className={s.workspaceActions}>{inDraft ? <>
      <span className={s.workspacePending}><Check size={14}/>In the draft. {lab ? 'Apply it in the Lab' : 'Save'} to keep it.</span>
      {before && !undone && <Button size="sm" variant="ghost" onClick={undo}><Undo2/>Undo</Button>}
    </> : <Button size="sm" className={s.emberButton} onClick={() => { intoDraft(screen, patch); setUndone(false); }}><Sparkles/>Try it</Button>}</div>
  </div>;
}

function CoinWorkspace({ item }: { item: CoinSnapshot }) {
  return <div className={s.workspaceDecision}><DecisionHead item={item}/><DecisionBody item={item}/><Link className={s.workspaceLink} href={appHref('tokens', item.id)}>Open coin<ArrowRight size={14}/></Link></div>;
}
