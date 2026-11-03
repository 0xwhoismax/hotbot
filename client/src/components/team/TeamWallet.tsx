"use client";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { ArrowDownLeft, Check, ChevronDown, Coins, Copy, Eye, EyeOff, History, KeyRound, LoaderCircle, Plus, QrCode, RotateCcw, Wallet as WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import { encode } from 'uqr';
import type { Wallet as StandardWallet } from '@wallet-standard/base';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/lib/appNavigation';
import { onWalletsChange, payingWallets, sendSol, sentStatus } from '@/lib/solanaWallets';
import { isAdminAtom, userStateAtom } from '@/store/user/atoms';
import { copyBudget, copyRules, PRACTICE_TOP_UP_MAX_SOL, tradesAs } from '../../../../types/team';
import { MIN_BUY_SOL, type TeamRules } from '../../../../types/hotbot';
import { recoveryFrom } from '../../../../types/recovery';
import type { HomeData, StrategyRow } from './data';
import { AtLimit, useStrategyLimit } from './Limits';
import { foldedCardsAtom, useCommand, viewedAtom } from './state';
import { appHref, signedSol, sol, tone, usd } from './format';
import { SettingRow, SolscanLink, Val } from './Parts';
import { realSolShort, stopText } from './LossStop';
import { GoLiveEntry, ModeSwitch, RealSolTermsButton } from './GoLive';
import { WithdrawDialog } from './Withdraw';
import { tokenText } from './AccessGate';
import s from './team.module.css';

/** The sidebar balance's dialog: the card of the portfolio shown. */
export function TeamWalletDialog({ data, children, modeSwitch = true }: { data: HomeData; children: ReactNode; modeSwitch?: boolean }) {
  const live = data.workspace.mode === 'live';
  return <Dialog><DialogTrigger asChild>{children}</DialogTrigger><DialogContent className={s.teamWalletDialog} aria-describedby={undefined}><DialogTitle className="sr-only">{live ? 'Wallet' : 'Practice'}</DialogTitle>
    {live ? <TeamWallet data={data} modeSwitch={modeSwitch}/> : <PracticeCard data={data} modeSwitch={modeSwitch}/>}
  </DialogContent></Dialog>;
}

type Money = HomeData['money'];

/** A money card's head: its balance top right and the fold that hides its figures (`foldedCardsAtom`, kept on this device). */
function CardHead({ id, icon, title, note, money }: { id: string; icon: ReactNode; title: string; note?: ReactNode; money: Money }) {
  return <div className={`${s.accountCardHead} ${s.walletHead}`}>
    <span className={s.accountIcon}>{icon}</span>
    <div className={s.grow}><h2 id={id}>{title}</h2>{note}</div>
    <div className={s.walletTotal}><b>{money.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small>SOL</small></b><span>{usd(money.equity * money.solUsd)}</span></div>
    <CollapsibleTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`${title} figures`}><ChevronDown className={s.legalChevron}/></Button></CollapsibleTrigger>
  </div>;
}

function useFold(card: string) {
  const [folded, setFolded] = useAtom(foldedCardsAtom), shut = folded.includes(card);
  return [shut, (open: boolean) => setFolded(now => open ? now.filter(one => one !== card) : [...new Set([...now, card])])] as const;
}

/** The figures a money card folds away. The negative top margin takes back the card's gap, and the padding puts it inside the animated
 *  height, so the card shrinks smoothly to its head and does not jump when the closed figures unmount. */
function Figures({ children }: { children: ReactNode }) {
  return <CollapsibleContent className="-mt-3 pt-3"><dl className={s.walletBreakdown}>{children}</dl></CollapsibleContent>;
}

/** A portfolio's money: its cash, its coins at the latest prices, the account deposits of Real SOL the ledger keeps (the rent parked in its
 *  coins' accounts, which the balance counts) and what its closed trades made. */
function PortfolioRows({ money }: { money: Money }) {
  return <>
    <div><dt>Ready to trade</dt><dd>{sol(money.cash)}</dd></div>
    <div><dt>In coins</dt><dd>{sol(money.invested)}</dd></div>
    {money.deposits != null && <div><dt>Account deposits</dt><dd>{sol(money.deposits)}</dd></div>}
    <div><dt>From closed trades</dt><dd className={s[tone(money.realizedPnlSol) ?? '']}>{signedSol(money.realizedPnlSol)}</dd></div>
  </>;
}

/** The Real SOL wallet, on Account and in the wallet dialog, whichever portfolio is shown: its money, the Real SOL budgets, then the HOTBOT
 *  wallet. `modeSwitch` off where the page carries the switch elsewhere. */
export function TeamWallet({ data, modeSwitch = true, termsAction = true }: { data: HomeData; modeSwitch?: boolean; termsAction?: boolean }) {
  const titleId = useId(), wallet = data.workspace.wallet, [folded, setOpen] = useFold('wallet');
  // The Real SOL budgets: what they add up to and what the wallet is short of them, which stays in the head while the figures are folded.
  const budgets = data.strategies.some(row => row.mode === 'live'), shortSol = realSolShort(data), short = budgets && shortSol > 0.0005;
  if (data.workspace.mode !== 'live' && !wallet) return null;
  const note = wallet && !wallet.active ? 'Send 0.01 SOL to go live' : folded && short ? `${sol(shortSol)} short` : null;
  return <Collapsible asChild open={!folded} onOpenChange={setOpen}><section className={`${s.surface} ${s.accountCard} ${s.teamWallet}`} aria-labelledby={titleId}>
    <CardHead id={titleId} icon={<WalletIcon size={18}/>} title="Wallet" note={note && <small className={s.warnText}>{note}</small>} money={data.portfolios.live}/>
    {modeSwitch && <ModeSwitch data={data}/>}
    <GoLiveEntry data={data}/>
    <Figures>
      <PortfolioRows money={data.portfolios.live}/>
      {budgets && <div><dt>Budgets</dt><dd>{sol(data.workspace.liveBudgetSol)}</dd></div>}
      {short && <div><dt>Short</dt><dd className={s.warnText}>{sol(shortSol)}</dd></div>}
    </Figures>
    {wallet && <HotbotWallet wallet={wallet} bare team={data}/>}
    {termsAction && <div className={s.walletFoot}><RealSolTermsButton data={data}/></div>}
  </section></Collapsible>;
}

/** Practice, on Account and in the wallet dialog, whichever portfolio is shown: its money, the practice SOL put in, adding to it and starting
 *  over. Admins also leave archived strategies' losses out of the totals (Hide loss). An admin viewing someone's team sees the figures only:
 *  commands act on one's own team. */
export function PracticeCard({ data, modeSwitch = false }: { data: HomeData; modeSwitch?: boolean }) {
  const titleId = useId(), command = useCommand(), viewed = useAtomValue(viewedAtom), admin = useAtomValue(isAdminAtom), [folded, setOpen] = useFold('practice');
  const hide = data.workspace.hideArchivedLosses;
  const [text, setText] = useState('10'), [busy, setBusy] = useState(false), field = useRef<HTMLInputElement>(null);
  const amount = Number(text), valid = Number.isFinite(amount) && amount > 0 && amount <= PRACTICE_TOP_UP_MAX_SOL;
  // HOTBOT's "Top up" (AlertToast) links to Account with #practice-sol: the amount is ready to type over.
  useEffect(() => {
    const focus = () => { if (window.location.hash === '#practice-sol') { field.current?.focus(); field.current?.select(); } };
    focus();
    window.addEventListener('hashchange', focus);
    return () => window.removeEventListener('hashchange', focus);
  }, []);
  const losses = data.archived.reduce((sum, row) => sum + Math.min(0, row.realizedPnlSol), 0);
  async function add() {
    setBusy(true);
    if (await command({ type: 'addPaperSol', amountSol: amount }) !== false) toast.success(`Added ${sol(amount)} to practice`);
    setBusy(false);
  }
  return <Collapsible asChild open={!folded} onOpenChange={setOpen}><section className={`${s.surface} ${s.accountCard} ${s.practiceCard}`} aria-labelledby={titleId}>
    <CardHead id={titleId} icon={<Coins size={18}/>} title="Practice" money={data.portfolios.paper}/>
    {modeSwitch && <ModeSwitch data={data}/>}
    <Figures>
      <PortfolioRows money={data.portfolios.paper}/>
      <div><dt>Put in</dt><dd>{sol(data.workspace.paperStartSol)}</dd></div>
    </Figures>
    {!viewed && <form className={s.practiceAdd} onSubmit={event => { event.preventDefault(); if (valid && !busy) void add(); }}>
      <Input ref={field} id="practice-sol" type="number" min={0} max={PRACTICE_TOP_UP_MAX_SOL} step="any" inputMode="decimal" value={text} aria-label="Practice SOL to add" aria-invalid={!valid || undefined} onChange={event => setText(event.target.value)}/>
      <Button type="submit" variant="secondary" className={s.keyIn} disabled={!valid || busy}>{busy ? <LoaderCircle className="animate-spin"/> : <Plus/>}Add</Button>
    </form>}
    {!viewed && <div className={s.accountActions}>
      <ResetPractice data={data}/>
      {admin && <Button variant="secondary" aria-pressed={hide} title={losses < 0 ? signedSol(losses) : undefined} onClick={() => void command({ type: 'hideArchivedLosses', hide: !hide })}>{hide ? <EyeOff/> : <Eye/>}Hide loss</Button>}
    </div>}
  </section></Collapsible>;
}

/** Copies practice strategies to Real SOL: each copy trades real SOL with the same rules at a budget of its own (the twin's, or the wallet's
 *  SOL no budget holds yet when that is less: `copyBudget`), its size per coin scaled to it (`copyRules`), and the practice one keeps running
 *  beside it to compare. A practice strategy whose twin already trades Real SOL shows as copied. `only`: that one strategy's copy, from its
 *  page and its Settings, there while it has no copy yet. Without it, the strategies to pick
 *  from, opened by a header button there while a practice strategy has no copy yet (`pill`: Go live's own button). */
export function RealSolCopies({ data, only, pill }: { data: HomeData; only?: StrategyRow; pill?: boolean }) {
  const command = useCommand(), viewed = useAtomValue(viewedAtom), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [picked, setPicked] = useState<ReadonlySet<string>>(new Set()), [typedBudgets, setTypedBudgets] = useState<Readonly<Record<string, number>>>({});
  const active = data.strategies.filter(row => row.status === 'running' || row.status === 'paused'), trading = active.filter(row => row.mode === 'live');
  const copied = new Set(trading.map(row => tradesAs(row))), rows = active.filter(row => row.mode === 'paper' && (!only || row.id === only.id));
  const chosen = only ? new Set(rows.map(row => row.id)) : picked;
  // Each chosen copy, in the order it was picked, takes its budget out of the SOL no budget holds yet before the next one's default is worked out.
  const shortSol = realSolShort(data), copies = new Map<string, TeamRules>();
  let unbudgeted = data.workspace.wallet?.active ? -shortSol : null;
  for (const id of chosen) {
    const row = rows.find(candidate => candidate.id === id);
    if (!row) continue;
    const rules = copyRules(row.rules, typedBudgets[id] ?? copyBudget(row.rules.allocationSol, unbudgeted));
    copies.set(id, rules);
    if (unbudgeted !== null) unbudgeted -= rules.allocationSol;
  }
  const added = [...copies.values()].reduce((sum, rules) => sum + rules.allocationSol, 0), shortAfter = shortSol + added;
  // The team's Real SOL budgets as the wallet card shows them (a strategy selling out to its archive keeps its budget until its last sale), with the copies'.
  const budgets = data.workspace.liveBudgetSol + added;
  const full = useStrategyLimit(), over = useStrategyLimit(copies.size), [recoverable, setRecoverable] = useState<boolean | null>(null);
  function show(next: boolean) {
    if (next) { setPicked(new Set()); setTypedBudgets({}); }
    setOpen(next);
  }
  async function copy() {
    setBusy(true);
    const ids = [...copies.keys()];
    if (await command({ type: 'realSolCopy', strategyIds: ids, budgets: ids.map(id => copies.get(id)!.allocationSol) }) !== false) { setOpen(false); toast.success(`${ids.length} ${ids.length === 1 ? 'copy trades' : 'copies trade'} Real SOL`); }
    setBusy(false);
  }
  const breakdown = (row: StrategyRow, rules: TeamRules) => <dl className={s.walletBreakdown}>
    <div><dt>Budget</dt><dd><Val editing value={rules.allocationSol} kind="sol" min={MIN_BUY_SOL} label={`${row.name} Real SOL budget`} post=" SOL" onChange={n => setTypedBudgets(typed => ({ ...typed, [row.id]: n }))}/></dd></div>
    <div><dt>Per coin</dt><dd>{sol(rules.amountSol)}</dd></div>
    <div><dt>Drawdown</dt><dd>{stopText(rules)}</dd></div>
  </dl>;
  const trigger = pill ? <button type="button" className={s.walletReset}><WalletIcon size={14}/>{trading.length ? `${trading.length} on Real SOL · copy more` : 'Copy strategies to Real SOL'}</button>
    : <Button size="sm" variant={only ? 'secondary' : 'outline'}><WalletIcon/>{only ? 'Copy to Real' : <span className={s.wideLabel}>Copy to Real</span>}</Button>;
  const offered = only ? only.mode === 'paper' && only.status !== 'archiving' && !copied.has(tradesAs(only)) : pill || rows.some(row => !copied.has(tradesAs(row)));
  if (viewed || !offered) return null;
  return <Dialog open={open} onOpenChange={show}>
    <AtLimit limit={full}><DialogTrigger asChild>{trigger}</DialogTrigger></AtLimit>
    <DialogContent className="max-h-[min(44rem,calc(var(--view-h)-2rem))] overflow-y-auto sm:max-w-[28rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><WalletIcon size={18}/></span><span className={s.grow}><DialogTitle asChild><b>{only ? `Copy ${only.name} to Real SOL` : 'Copy to Real SOL'}</b></DialogTitle><small>{only ? 'The practice one keeps running beside its copy' : 'The practice ones keep running beside their copies'}</small></span></div>
        <RecoveryStep data={data} onDone={setRecoverable}/>
        {!rows.length ? <p className={s.empty}>No practice strategy to copy.</p>
          : only ? breakdown(rows[0], copies.get(rows[0].id)!)
          : <div>{rows.map(row => {
            const twin = copied.has(tradesAs(row)), rules = copies.get(row.id);
            return <SettingRow key={row.id} open={Boolean(rules)} label={row.name} sub={twin ? 'Already on Real SOL' : `${sol(row.rules.allocationSol)} budget${row.status === 'paused' ? ' · paused' : ''}`}
              control={<Switch variant="accent" checked={twin || picked.has(row.id)} disabled={twin} aria-label={`Copy ${row.name} to Real SOL`} onCheckedChange={on => setPicked(now => { const next = new Set(now); if (on) next.add(row.id); else next.delete(row.id); return next; })}/>}>
              {rules && breakdown(row, rules)}
            </SettingRow>;
          })}</div>}
        <dl className={s.walletBreakdown}>
          <div><dt>Wallet</dt><dd>{sol(data.portfolios.live.cash)}</dd></div>
          <div><dt>Budgets</dt><dd>{sol(budgets)}</dd></div>
          {shortAfter > 0.0005 && <div><dt>Short</dt><dd className={s.warnText}>{sol(shortAfter)}</dd></div>}
        </dl>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <AtLimit limit={over}><Button disabled={busy || !copies.size || recoverable === false} onClick={() => void copy()}>{only ? 'Copy to Real SOL' : copies.size ? `Copy ${copies.size} to Real SOL` : 'Pick a strategy'}</Button></AtLimit>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Starts practice over at the starting balance. Earlier practice coins stay on record but stop counting and trading. */
function ResetPractice({ data }: { data: HomeData }) {
  const command = useCommand(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const start = data.workspace.paperStartSol, paper = data.portfolios.paper, coins = data.bags.filter(bag => bag.mode === 'paper').length, profit = paper.openPnl + paper.realizedPnlSol;
  async function reset() {
    setBusy(true);
    if (await command({ type: 'resetPractice' }) !== false) { setOpen(false); toast.success(`Practice reset to ${sol(start)}`); }
    setBusy(false);
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="secondary"><RotateCcw/>Reset</Button></DialogTrigger>
    <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><RotateCcw size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Start practice over?</b></DialogTitle><small>Strategies and Real SOL stay as they are</small></span></div>
        <dl className={s.walletBreakdown}>
          <div><dt>Balance</dt><dd>{sol(paper.equity)} → {sol(start)}</dd></div>
          <div><dt>Practice coins</dt><dd>{coins ? `${coins} cleared` : 'None held'}</dd></div>
          <div><dt>Profit</dt><dd><span className={s[tone(profit) ?? '']}>{signedSol(profit)}</span> → {signedSol(0)}</dd></div>
        </dl>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="secondary" className={s.stopTeam} disabled={busy} onClick={() => void reset()}><RotateCcw/>Reset to {sol(start)}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

type Wallet = HomeData['workspace']['wallet'];
const short = (address: string) => address.slice(0, 4) + '…' + address.slice(-4);
async function copy(address: string, message: string) {
  try { await navigator.clipboard.writeText(address); toast.success(message); }
  catch { toast.error('Could not copy the address'); }
}

/** The person's own Crossmint wallet the bots trade from and the pass's $HOTBOT stake sits in: where to deposit, Withdraw, its activity and
 *  who recovers it. Wallet card, Home and chat; `bare` leaves out its header where the surrounding card or step already names the wallet and
 *  its status. With `team` (the wallet card, whose head holds the balance) it leaves out its SOL, and Withdraw shows what an amount leaves
 *  the Real SOL budgets short. */
export function HotbotWallet({ wallet, bare = false, team }: { wallet: Wallet; bare?: boolean; team?: HomeData }) {
  if (!wallet) return <div className={s.hotbotWallet} aria-busy="true">
    {!bare && <div className={s.hotbotWalletHead}><b>HOTBOT wallet</b><small className={s.muted}><LoaderCircle size={12} className="mr-1.5 inline animate-spin"/>Setting up</small></div>}
    <span className={s.hotbotWalletSkeleton}/>
  </div>;
  const request = wallet.request, moving = request && (request.status === 'prepared' || request.status === 'approved');
  return <div className={s.hotbotWallet}>
    {!bare && <div className={s.hotbotWalletHead}><b>HOTBOT wallet</b>{!wallet.active && <small className={s.warnText}>Send 0.01 SOL to go live</small>}</div>}
    <VaultAddress address={wallet.address}/>
    {!team && <dl className={s.walletBreakdown}><div><dt>SOL</dt><dd>{sol(wallet.balanceSol)}</dd></div></dl>}
    {request && moving && <div className={s.hotbotWalletPending}><LoaderCircle size={14} className="animate-spin"/>
      <span className={s.grow}>{request.status === 'approved' || request.approving ? 'Withdrawing' : 'Approve'} <b>{request.token ? tokenText(request.token) : sol(request.lamports / 1e9)}</b>{` to ${short(request.to)}`}</span>
      <SolscanLink kind="tx" value={request.hash} label="View the transaction on Solscan"/></div>}
    <div className={s.accountActions}>
      <DepositDialog wallet={wallet}/>
      <WithdrawDialog wallet={wallet} team={team}/>
      <Button variant="secondary" asChild><Link href={appHref('wallet-activity')}><History/>Activity</Link></Button>
    </div>
  </div>;
}

/** The vault's address: copy it, or see it on Solscan. */
export function VaultAddress({ address }: { address: string }) {
  return <div className={s.walletAddressRow}>
    <button type="button" className={s.walletAddress} title={address} onClick={() => void copy(address, 'Address copied · send SOL on Solana')} aria-label={`Copy HOTBOT wallet address ${address}`}><code>{address.slice(0, 6)}…{address.slice(-6)}</code><Copy size={14}/></button>
    <SolscanLink kind="account" value={address} label="View the HOTBOT wallet on Solscan"/>
  </div>;
}

function DepositDialog({ wallet }: { wallet: NonNullable<Wallet> }) {
  return <Dialog>
    <DialogTrigger asChild><Button variant="secondary" className={s.keyIn}><ArrowDownLeft/>Deposit</Button></DialogTrigger>
    <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><ArrowDownLeft size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Deposit SOL</b></DialogTitle><small>{sol(wallet.balanceSol)} in your HOTBOT wallet</small></span></div>
        <DepositPanel wallet={wallet}/>
      </div>
    </DialogContent>
  </Dialog>;
}

/** SOL into the vault: sent from a wallet in this browser that can send (`payingWallets`), or to the address and its QR code from anywhere.
 *  `suggest`: the amount filled in and asked for in the QR code. */
export function DepositPanel({ wallet, suggest }: { wallet: NonNullable<Wallet>; suggest?: number }) {
  const [wallets, setWallets] = useState<readonly StandardWallet[]>([]), [how, setHow] = useState<'wallet' | 'address'>('wallet');
  useEffect(() => { const read = () => setWallets(payingWallets()); read(); return onWalletsChange(read); }, []);
  const fromWallet = how === 'wallet' && wallets.length > 0;
  return <div className={s.deposit}>
    {wallets.length > 0 && <div className={s.accountMode} role="group" aria-label="Deposit from">
      <button type="button" aria-pressed={fromWallet} onClick={() => setHow('wallet')}><WalletIcon size={14}/>From a wallet</button>
      <button type="button" aria-pressed={!fromWallet} onClick={() => setHow('address')}><QrCode size={14}/>Address</button>
    </div>}
    {fromWallet ? <WalletDeposit vault={wallet.address} wallets={wallets} suggest={suggest}/> : <AddressDeposit wallet={wallet} suggest={suggest}/>}
  </div>;
}

/** A transfer sent from the picked wallet: the amount, the wallet signs and sends, then the chain's answer. A wallet that refuses goes back to the amount. */
type Sending = { stage: 'idle' } | { stage: 'signing' } | { stage: 'pending' | 'landed'; signature: string; lastValidBlockHeight: bigint; amount: number } | { stage: 'failed'; signature: string; reason: string };
/** How often a sent deposit's status is read while it is pending. */
const SENT_POLL_MS = 2_000;
function WalletDeposit({ vault, wallets, suggest }: { vault: string; wallets: readonly StandardWallet[]; suggest?: number }) {
  const [picked, setPicked] = useState(wallets[0]!.name), [amount, setAmount] = useState(suggest ? String(suggest) : ''), [sending, setSending] = useState<Sending>({ stage: 'idle' }), [error, setError] = useState<string | null>(null);
  const source = wallets.find(item => item.name === picked) ?? wallets[0]!, value = Number(amount), valid = Number.isFinite(value) && value >= 0.001;
  useEffect(() => {
    if (sending.stage !== 'pending') return;
    let live = true;
    const timer = setInterval(() => void sentStatus(sending.signature, sending.lastValidBlockHeight).then(status => {
      if (!live || status === 'pending') return;
      setSending(status === 'landed' ? { ...sending, stage: 'landed' } : { stage: 'failed', signature: sending.signature, reason: status === 'failed' ? 'Failed on chain' : 'Not landed' });
    }).catch(() => {}), SENT_POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [sending]);
  async function send() {
    setError(null); setSending({ stage: 'signing' });
    try { setSending({ stage: 'pending', amount: value, ...await sendSol(source, vault, BigInt(Math.round(value * 1e9))) }); }
    catch (problem) { setSending({ stage: 'idle' }); setError(problem instanceof Error ? problem.message : `${source.name} did not send it`); }
  }
  if (sending.stage === 'pending' || sending.stage === 'landed') return <div className={s.hotbotWalletPending} data-done={sending.stage === 'landed' || undefined}>
    {sending.stage === 'pending' ? <LoaderCircle size={14} className="animate-spin"/> : <Check size={14}/>}
    <span className={s.grow}>{sending.stage === 'pending' ? 'Sending' : 'Sent'} <b>{sol(sending.amount)}</b></span>
    <SolscanLink kind="tx" value={sending.signature} label="View the deposit on Solscan"/>
    {sending.stage === 'landed' && <button type="button" className={s.walletReset} onClick={() => setSending({ stage: 'idle' })}>Send more</button>}
  </div>;
  return <form className={s.deposit} onSubmit={event => { event.preventDefault(); if (valid && sending.stage === 'idle') void send(); }}>
    {wallets.length > 1 && <div className={s.depositWallets} role="group" aria-label="Send from">{wallets.map(item => <button type="button" key={item.name} aria-pressed={item === source} onClick={() => setPicked(item.name)}>
      <img src={item.icon} alt="" width={18} height={18}/>{item.name}</button>)}</div>}
    <div className={s.withdrawAmount}>
      <Input type="number" inputMode="decimal" step="any" min={0.001} placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} aria-label="Amount in SOL"/>
      <span>SOL</span>
    </div>
    {sending.stage === 'failed' && <div className={s.depositProblem}><span className={s.pill} data-tone="warn">{sending.reason}</span><SolscanLink kind="tx" value={sending.signature} label="View the deposit on Solscan"/></div>}
    {error && <div className={s.depositProblem}><span className={s.pill} data-tone="warn" title={error}>Not sent</span><small className={s.muted}>{error}</small></div>}
    <Button type="submit" disabled={!valid || sending.stage === 'signing'}>{sending.stage === 'signing' ? <LoaderCircle className="animate-spin"/> : <img src={source.icon} alt="" width={16} height={16}/>}
      {sending.stage === 'signing' ? `Approve in ${source.name}` : `Send${valid ? ' ' + sol(value) : ''} from ${source.name}`}</Button>
  </form>;
}

/** The vault's address and its Solana Pay QR code, for a wallet on any device; SOL only, since another token sent there is not traded. It
 *  shows what arrived since it opened, as the worker reads the vault. */
function AddressDeposit({ wallet, suggest }: { wallet: NonNullable<Wallet>; suggest?: number }) {
  const [opened] = useState(wallet.balanceSol), received = wallet.balanceSol - opened;
  return <div className={s.depositAddress}>
    <Qr value={`solana:${wallet.address}${suggest ? `?amount=${suggest}` : ''}`} label={`QR code of the HOTBOT wallet address${suggest ? `, asking ${sol(suggest)}` : ''}`}/>
    <div className={s.depositAddressSide}>
      <span className={s.depositPills}><span className={s.pill} data-tone="warn">SOL only</span><span className={s.pill}>Solana</span>{suggest ? <span className={s.pill}>{sol(suggest)}</span> : null}</span>
      <VaultAddress address={wallet.address}/>
      {received > 1e-9 ? <span className={s.pill} data-tone="ember"><Check size={11}/>Received {sol(received)}</span>
        : <span className={s.pill}><LoaderCircle size={11} className="animate-spin"/>Waiting for SOL</span>}
    </div>
  </div>;
}

/** A QR code drawn as one SVG path, dark on white whatever the theme, so every scanner reads it. */
export function Qr({ value, label }: { value: string; label: string }) {
  const { size, data } = useMemo(() => encode(value, { ecc: 'M', border: 2 }), [value]);
  const path = data.flatMap((row, y) => row.flatMap((on, x) => on ? [`M${x} ${y}h1v1h-1z`] : [])).join('');
  return <svg className={s.depositQr} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges"><rect width={size} height={size} fill="#fff"/><path d={path} fill="#000"/></svg>;
}

/** A step of going live that is the wallet's (GoLive.tsx numbers them and skips the done ones): it reports whether it is done (`onDone`)
 *  and renders nothing once it is. */
type WalletStep = { data: HomeData; onDone: (done: boolean) => void };
/** The first deposit asked for: what activates the wallet (0.01 SOL), or the smallest buy of a strategy on Real SOL plus its 0.01 SOL reserve
 *  and what activation spends (about 0.005). */
export function firstDepositSol(data: HomeData) {
  const sizes = data.strategies.filter(row => row.status === 'running' && row.mode === 'live').map(row => row.rules.amountSol);
  return Math.max(0.01, +((sizes.length ? Math.min(...sizes) : 0) + 0.015).toFixed(3));
}
/** Fund the wallet: from a wallet in this browser or to its address, until the first deposit activated it. */
export function Deposit({ data, onDone }: WalletStep) {
  const wallet = data.workspace.wallet, done = Boolean(wallet?.active);
  useEffect(() => onDone(done), [done, onDone]);
  return done ? null : wallet ? <DepositPanel wallet={wallet} suggest={firstDepositSol(data)}/> : <HotbotWallet wallet={wallet} bare/>;
}
/** How the person recovers the wallet, which approves each withdrawal: the wallet's own recovery once it exists, before that the Solana
 *  sign-in or email it will take (types/recovery.ts `recoveryFrom`). With neither (a Telegram-only account) the steps after it are blocked.
 *  Reports nothing until the profile is read. */
export function RecoveryStep({ data, onDone }: WalletStep) {
  const profile = useAtomValue(userStateAtom).profileData, recovery = data.workspace.wallet?.recovery ?? (profile ? recoveryFrom(profile.methods, profile.email) : null);
  const known = Boolean(data.workspace.wallet || profile), done = recovery !== null;
  useEffect(() => { if (known) onDone(done); }, [known, done, onDone]);
  if (done || !known) return null;
  return <div className={s.depositProblem}>
    <p className={s.accountNote}>Your email or Solana wallet controls your HOTBOT wallet: it creates the wallet and approves every withdrawal.</p>
    <DialogClose asChild><Button size="sm" variant="secondary" asChild><Link href={appHref('account') + '#sign-in-title'}><KeyRound/>Add an email</Link></Button></DialogClose>
  </div>;
}
