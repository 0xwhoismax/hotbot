"use client";
import { useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useAtom, useAtomValue } from 'jotai';
import { RESET } from 'jotai/utils';
import { ArrowLeft, ArrowUp, Camera, Check, Mic, Square, ChevronDown, Flag, FlaskConical, LoaderCircle, Pencil, ScanSearch, ShieldCheck, ThumbsUp, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/convex';
import { sentApplication, userStateAtom, visitorNow } from '@/store/user/atoms';
import { SavedAppearancePicker } from '@/components/account/SavedAppearancePicker';
import { CopyError, nameProblem, typedName, useAvatarUpload } from '@/components/account/AvatarControls';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { applyPatch, BUDGETS, draftDip, draftRules, keepName, plainBots, planDraft, withFix, type Draft } from '../../../../types/team';
import { EASY_PLANS, MARKETS, budgetPatch, easyChoicePatch, easyPlanName, fixedStop, marketOf, planOf, type EasyChoice } from '../../../../types/easy';
import { trailPct } from '../../../../types/exits';
import type { TeamRules } from '../../../../types/hotbot';
import { AppFlame } from '@/components/hotbot/AppFlame';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useDictation } from '@/hooks/useDictation';
import { EasyEditor } from './EasySettings';
import { newStrategyRow } from './NewStrategy';
import { PlainChips } from './Plain';
import { useSettingsDraft } from './Settings';
import { failToast, launchingAtom, logoutAtom, onboardingStepAtom, pendingPlanAtom, useStepPreview, useSession, type PendingPlan } from './state';
import { useAccess } from './AccessGate';
import { PayStep } from './PassPay';
import { WayIn } from './WayIn';
import { LiveStage, Stage, TeamStrip, laneCoins } from './Stage';
import { Loading, useNow, useTwoColumns } from './Parts';
import { useHome } from './useHome';
import type { HomeData } from './data';
import o from './onboarding.module.css';
import s from './team.module.css';

// The wallets' sign-in code: only someone signed out reaches it, so it loads once onboarding knows that, before the step shows.
const loadSignIn = () => import('./SignInStep');
const SignInStep = dynamic(() => loadSignIn().then(module => module.SignInStep), { ssr: false });

/** A failed let-in tries again behind the loader after the first wait, doubled after each failure up to the last. */
const LET_IN_RETRY_MS = { first: 5_000, last: 60_000 };

/** The beta notes: the agree (paper balance, as `team.start` gives it), Report, with the app's own red flag where it sits at this screen size.
 *  The chat gets a FirstTip on its own control instead. */
const BETA: { title: string; text: ReactNode; icon: ReactNode; value?: string }[] = [
  { title: 'Start on Practice', text: 'Set up your strategies in paper trading first, and move to Real SOL when you feel comfortable. It’s an early beta, so things can break as updates ship.', icon: <FlaskConical/>, value: '10 SOL' },
  { title: 'Report anything', icon: <Flag fill="currentColor"/>, text: <><span className={o.phoneOnly}>Tap the red flag at the top</span><span className={o.wideOnly}>Click Report a problem in the left sidebar (or press F)</span>, then point at anything: data, a bug or an idea.</> },
  { title: 'Rate trades', icon: <ThumbsUp/>, text: 'Say whether you’d have traded a coin and where you’d buy and sell. It makes the setups better.' },
];

/** How many coins the first strategy holds at once. */
const FIRST_COINS = 10;

/** First run: meet the team, read the beta notes, set up the first strategy on Easy settings, start, unlock the pass (types/access.ts), and land on the
 *  launch step with the team live. Sign-in is a step: when starting, or straight from the intro for returning people. */
export function Onboarding() {
  const session = useSession(), start = useMutation(api.team.start);
  const [step, setStep] = useAtom(onboardingStepAtom), [starting, setStarting] = useState(false), [open, setOpen] = useState<string | null>(null);
  // Memoized: the draft starts over whenever its base changes.
  const base = useMemo(() => { const row = newStrategyRow(); return { ...row, rules: applyPatch(row.rules, budgetPatch(row.rules.allocationSol, FIRST_COINS)) }; }, []), draft = useSettingsDraft(base)!;
  const [pending, setPending] = useAtom(pendingPlanAtom), signedIn = session.signedIn && session.connected, launched = useRef(false);
  const [launching, setLaunching] = useAtom(launchingAtom), data = useHome(signedIn);
  const logout = useAtomValue(logoutAtom), pass = useAccess(data);
  // The way in is the same for every account, however it signed in: one with no team is let in (`applications.letIn`), pays the pass
  // first, then sets up and starts its team.
  const me = useQuery(api.access.mine, signedIn ? {} : 'skip'), clock = useNow(60_000);
  const paidNow = Boolean(me && (me.admin || (me.paidUntil ?? 0) > (clock ?? Date.now())));
  const letIn = useMutation(api.applications.letIn);
  const noTeam = signedIn && data === null && !pending && !launching, preview = useStepPreview();
  // A started team stays on the unlock step until its pass opens; the launch step follows. Before that a saved strategy waiting for sign-in (also
  // after X's redirect reloads the page) shows the sign-in step, and an account let in without a paid pass shows the pay step.
  const shown = preview ?? (launching ? pass?.access.open ? 'live' : 'unlock' : signedIn && (starting || pending) ? 'signin'
    : noTeam && me && !paidNow ? 'pay' : step === 'pay' && !signedIn ? 'check' : step);
  // A link's "Check status", "Sign in" or "I already have an account" (from /join or the landing) opens the check or the sign-in, once; their Back
  // shows the intro's way in, like any other Back from them.
  const arrived = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const check = url.searchParams.has('check'), signin = url.searchParams.has('signin');
    if (!check && !signin) return;
    url.searchParams.delete('check'); url.searchParams.delete('signin');
    window.history.replaceState(window.history.state, '', url);
    arrived.current = true;
    if (!signedIn) setStep(check ? 'check' : 'signin');
  }, []);
  // Signed out, a browser that signed in before opens the sign-in; its Back shows the way in with Sign in first. One that only applied sees its
  // application, with Check status first.
  const greeted = useRef(false), [visitor] = useState(visitorNow), returning = visitor === 'signedIn' || visitor === 'returning';
  const [applied] = useState(() => visitor === 'applied' ? sentApplication() : null);
  // Check status shows the application that this browser sent as in before its sign-in, since that sign-in lets the account in.
  const [stored] = useState(sentApplication);
  useEffect(() => {
    if (greeted.current || !session.ready || session.signedIn) return;
    greeted.current = true;
    if (step === 'intro' && !pending && !arrived.current && returning) setStep('signin');
  }, [session.ready, session.signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Signed in with no team: one let in goes to the pay step, which carries on to the beta notes once the pass is paid.
  useEffect(() => {
    if (noTeam && me?.seated && (step === 'signin' || step === 'check' || step === 'intro')) setStep('pay');
  }, [noTeam, me?.seated, step, setStep]);
  // An account signed in with no team is let in, with the X handle this browser applied with, also after Google's and Apple's redirects,
  // which start the page over. Nothing stops the way in: a failed call tries again behind the loader, which offers another account.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    if (!signedIn || me?.seated !== false) return;
    let timer = 0, wait = LET_IN_RETRY_MS.first, stopped = false;
    const enter = () => void letIn({ x: sentApplication()?.x || undefined }).catch(cause => {
      if (stopped) return;
      if (wait === LET_IN_RETRY_MS.first) { failToast(cause); setStalled(true); }
      timer = window.setTimeout(enter, wait); wait = Math.min(wait * 2, LET_IN_RETRY_MS.last);
    });
    enter();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [signedIn, me?.seated]); // eslint-disable-line react-hooks/exhaustive-deps
  // Dots: intro, the check for anyone who arrived signed out, the pass, beta, Easy settings and the launch. The count is set once, so it never grows mid-flow.
  const [withSignin] = useState(() => !signedIn || Boolean(pending));
  useEffect(() => { if (withSignin) void loadSignIn(); }, [withSignin]);
  const steps = withSignin ? ['intro', 'check', 'pay', 'beta', 'easy', 'live'] : ['intro', 'pay', 'beta', 'easy', 'live'];
  const at = steps.indexOf(shown === 'signin' ? 'check' : shown === 'unlock' ? 'pay' : shown);

  // The launch step shows from the moment the team starts: the gate keeps onboarding up while `launching`, since the new team can reach `useHome` before `team.start` returns.
  const launch = async (next: NonNullable<PendingPlan>) => {
    setStarting(true); setLaunching(true);
    try { await start({ budgetSol: next.budgetSol, askFirst: next.askFirst, mode: 'paper', name: next.name, patch: JSON.stringify(next.patch) }); }
    // A failed start drops the saved strategy (no retry loop); Easy settings come back with its changes to press Start again.
    catch (cause) { failToast(cause); setLaunching(false); launched.current = false; draft.set(next.patch); setStep('easy'); }
    finally { setStarting(false); setPending(RESET); }
  };
  // "Go to my team": onboarding steps aside and the gate shows Home.
  const done = () => { setStep('intro'); setLaunching(false); };
  // A strategy set up before sign-in starts as soon as the account is let in.
  useEffect(() => {
    if (!signedIn || launched.current || !pending || !me?.seated) return;
    launched.current = true;
    void launch(pending);
  }, [signedIn, pending, me?.seated]); // eslint-disable-line react-hooks/exhaustive-deps

  // A market tile names the kind of coin, so the person picks one before Start, and the strategy takes its name.
  const market = marketOf(draft.rules);
  const confirm = () => {
    if (draft.error || !market) return;
    // The coin count and per-coin size always go: the draft leaves out a value equal to its base, and the server rebuilds the start at the new budget.
    const next = { name: market.name, budgetSol: draft.rules.allocationSol, askFirst: draft.rules.mode === 'ask', patch: { ...draft.patch, maxOpen: draft.rules.maxOpenPositions, tradeSol: draft.rules.amountSol } };
    if (signedIn) { void launch(next); return; }
    setPending(next);
    setStep('signin');
  };

  // The launch step's lanes, worked out once for the Stage beside it and the strip that stands in for it on narrower pages.
  const lanes = shown === 'live' && data ? laneCoins(data, false) : undefined;
  // Signed in with no team, the way in waits for `access.mine` and the let-in behind the gate's own loader, so a return from Google or
  // Apple never flashes the intro first.
  if (!preview && noTeam && (me === undefined || !me.seated)) return <div className={s.page}>
    <Loading variant="page" label="Loading your team"/>
    {stalled && logout && <button type="button" className={o.link} onClick={() => void logout.run()}>Use another account</button>}
  </div>;
  return <StageShell stage={shown === 'live' ? <LiveStage data={data} lanes={lanes}/> : undefined}>
    <div className={o.progress} aria-hidden>{steps.map((name, index) => <span key={name} data-on={index <= at || undefined}/>)}</div>

    {shown === 'check' && <SignInStep check title={stored?.x ? 'You’re in' : 'Check if you’re in'} handle={stored?.x || undefined} lead="Sign in with your email." busy={false} onBack={() => setStep('intro')}/>}

    {shown === 'intro' && <div className={o.step} key="intro">
      <div className={o.crew}><BotAvatar role="coordinator" size={64}/><BotAvatar role="research" size={50}/><BotAvatar role="sniper" size={50}/><BotAvatar role="trader" size={50}/></div>
      {applied && !signedIn ? <>
        <span className={o.livePill} data-on><Check size={14} aria-hidden/>Application sent</span>
        <h1 className={o.title}>You’re on the list.</h1>
        {(applied.x || applied.telegram) && <div className={o.sentHandles}>{applied.x && <span><small>X</small>@{applied.x}</span>}{applied.telegram && <span><small>Telegram</small>@{applied.telegram}</span>}</div>}
      </> : <>
        <h1 className={o.title}>Your own trading team.</h1>
        <p className={o.lead}>Three bots find coins, pick the entry and manage every trade, around the clock. You decide how much they play with.</p>
        <ul className={o.facts}>
          <li><ScanSearch/><span><b>ResearchBot checks every coin</b> against your rules</span></li>
          <li><Timer/><span><b>Runs around the clock</b>, even with this tab closed</span></li>
          <li><ShieldCheck/><span><b>TraderBot decides the exits</b> on every price move</span></li>
        </ul>
      </>}
      <div className={o.actions}>
        {signedIn ? <Button size="lg" className={o.cta} onClick={() => setStep('beta')}>Build my team</Button>
          : <WayIn keys={applied ? ['check', 'edit', 'signin'] : returning ? ['signin', 'apply', 'check'] : ['apply', 'signin', 'check']}
            on={{ apply: '/join/apply', edit: '/join/apply', signin: () => setStep('signin'), check: () => setStep('check') }}/>}
        {signedIn && logout && <Button size="lg" variant="outline" className={o.cta} onClick={() => void logout.run()}>Use another account</Button>}
      </div>
    </div>}

    {shown === 'beta' && <BetaStep onBack={() => setStep('intro')} onNext={() => setStep('easy')}/>}

    {/* The same Easy settings as a strategy's Settings, on the new start; Advanced waits in Settings once the team runs. */}
    {shown === 'easy' && <div className={o.step} key="easy">
      <button type="button" className={o.back} onClick={() => setStep('beta')}><ArrowLeft size={15}/>Back</button>
      <div className={o.named}><h1 className={o.title}>Set up your team</h1><TellHotbot rules={draft.rules} onChoice={choice => { draft.set(easyChoicePatch(draft.rules, choice)); setOpen(null); }}/></div>
      <p className={o.lead}>Pick what to trade and when to sell. You can change it any time!</p>
      <div className={o.easySet}><EasyEditor draft={draft} open={open} setOpen={setOpen} askInRows/></div>
      {draft.error && <p className={o.inviteError} role="alert">{draft.error}</p>}
      <div className={o.actions}><Button size="lg" className={o.cta} disabled={starting || Boolean(draft.error) || !market} onClick={confirm}>{starting ? 'Starting…' : 'Start my team'}</Button>{(!market || !signedIn) && <p className={o.fine}>{!market ? 'Pick what to trade to start.' : 'Next, sign in with a wallet or email.'}</p>}</div>
    </div>}

    {shown === 'signin' && <SignInStep title={pending ? 'Sign in to start your team' : 'Welcome back'} lead={pending ? 'Wallet or email. It takes a few seconds.' : 'Sign in to see your team.'} busy={starting} onBack={() => { if (pending) draft.set(pending.patch); setStep(pending ? 'easy' : 'intro'); setPending(RESET); }}/>}

    {/* The pass first: stake and fee in one approval, then the beta notes. */}
    {shown === 'pay' && <PayStep leave={logout ? { label: 'Use another account', run: () => void logout.run().then(() => setStep('check')) } : undefined} onDone={() => setStep('beta')}/>}

    {shown === 'unlock' && data && pass && <PayStep leave={{ label: 'Later', run: done }} onDone={done}/>}

    {shown === 'live' && <LaunchStep data={data} lanes={lanes} onDone={done}/>}
  </StageShell>;
}

/** The Easy step's settings in words, as Jev reads them against what is on screen. */
const easyNow = (rules: TeamRules) => { const plan = planOf(rules.exits), stop = fixedStop(rules.exits), trail = trailPct(rules.exits);
  return [marketOf(rules)?.name ?? 'no kind of coin picked', `take profit ${plan ? easyPlanName(plan) : 'custom'}`, stop ? `stop loss ${stop}%` : 'no stop loss', trail ? `trailing stop ${trail}%` : 'no trailing stop',
    `${rules.allocationSol} SOL`, `${rules.maxOpenPositions} coins at once`, rules.mode === 'ask' ? 'asks before each buy' : 'buys without asking'].join('; '); };
/** What a reply changed, as the toast says it. */
const choiceLine = (choice: EasyChoice) => [MARKETS.find(row => row.id === choice.market)?.name, EASY_PLANS.find(row => row.id === choice.plan)?.name,
  choice.stop !== undefined ? choice.stop ? `stop ${choice.stop}%` : 'no stop loss' : undefined, choice.trail !== undefined ? choice.trail ? `trail ${choice.trail}%` : 'no trailing stop' : undefined,
  choice.budget !== undefined ? `${choice.budget} SOL` : undefined, choice.coins !== undefined ? `${choice.coins} coins` : undefined,
  choice.askFirst !== undefined ? choice.askFirst ? 'asks first' : 'buys without asking' : undefined].filter(Boolean).join(' · ');

/** HOTBOT beside the Easy step's title: words or voice set Easy's own rows (Jev reads them, `team.easy`); nothing else on the strategy changes. */
function TellHotbot({ rules, onChoice }: { rules: TeamRules; onChoice: (choice: EasyChoice) => void }) {
  const read = useAction(api.team.strategyDraft.easy);
  const [open, setOpen] = useState(false), [words, setWords] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState<string | null>(null);
  const dictation = useDictation(said => setWords(previous => previous.trim() ? `${previous.trimEnd()} ${said}` : said));
  const listening = dictation.state === 'listening', { stop } = dictation;
  useEffect(() => { if (!open) stop(); }, [open, stop]);
  const send = async () => {
    const text = words.trim();
    if (!text || busy) return;
    setBusy(true); setNote(null);
    try {
      const reply = await read({ text, current: easyNow(rules) });
      if ('signIn' in reply) { setNote('Sign in to keep asking HOTBOT. Your settings stay here.'); return; }
      const line = choiceLine(reply.choice);
      if (!line) { setNote('HOTBOT couldn’t tell what to change. Try “new pairs, sell at 2x, 1 SOL”.'); return; }
      onChoice(reply.choice); setWords(''); setOpen(false); toast.success(line);
    } catch (cause) { failToast(cause); } finally { setBusy(false); }
  };
  const voice = listening ? 'Listening…' : dictation.state === 'working' ? 'Writing it down…' : null;
  return <>
    <button type="button" className={o.hotbotAsk} aria-label="Set it up with HOTBOT" title="Set it up with HOTBOT" onClick={() => setOpen(true)}><AppFlame size={22}/></button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[28rem]" aria-describedby={undefined}>
        <div className={o.askHead}><BotAvatar role="coordinator" size={28}/><DialogTitle asChild><b>Tell HOTBOT</b></DialogTitle></div>
        <form className={o.askBox} onSubmit={event => { event.preventDefault(); void send(); }}>
          <textarea className={o.describe} autoFocus value={words} maxLength={600} disabled={busy} placeholder="New pairs, sell at 2x, 1 SOL, ask me before each buy." aria-label="Tell HOTBOT how to set up your team"
            onChange={event => setWords(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>
          {note && <p className={o.inviteError} role="status">{note}</p>}
          <div className={o.askTools}>
            {voice && <span className={o.fine} role="status">{voice}</span>}
            <button type="button" className={o.askMic} data-on={listening || undefined} aria-pressed={listening} disabled={dictation.state === 'working' || busy}
              aria-label={listening ? 'Stop and write it down' : 'Talk to HOTBOT'} onClick={listening ? stop : () => void dictation.start()}>{dictation.state === 'working' ? <LoaderCircle className={o.spin}/> : listening ? <Square fill="currentColor"/> : <Mic/>}</button>
            <button type="submit" className={o.send} aria-label="Send" disabled={busy || !words.trim()}>{busy ? <LoaderCircle className={o.spin}/> : <ArrowUp/>}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

/** For invited beta testers, before Easy settings: two notes as cards, and the button is the agree. */
function BetaStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return <div className={o.step} key="beta">
    <button type="button" className={o.back} onClick={onBack}><ArrowLeft size={15}/>Back</button>
    <h1 className={o.betaTitle}>Welcome to the beta.</h1>
    <ul className={o.betaCards}>{BETA.map(row => <li key={row.title}>
      <span className={o.betaIcon} aria-hidden>{row.icon}</span>
      <span className={o.betaText}><b>{row.title}{row.value && <span className={o.betaValue}>{row.value}</span>}</b><span>{row.text}</span></span>
    </li>)}</ul>
    <p className={o.betaMore}>The chat: we’ll point it out as you go.</p>
    <div className={o.actions}><Button size="lg" className={o.cta} onClick={onNext}>I understand, continue</Button></div>
  </div>;
}

/** A first guess at a name from the sign-in email (letters and numbers of the part before @, capitalised); wallets start blank. */
const suggestedName = (email: string | undefined) => email ? typedName(email.split('@')[0].replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).replace(/\b\p{L}/gu, letter => letter.toUpperCase()).trim() : '';

/** The last step: the team is live. On wide pages the Stage beside it shows each bot on its real coins; narrower, a strip does. Then the person:
 *  picture, name (prefilled, saved on the way out) and, if they like, the Theme menu. "Go to my team" opens Home. */
function LaunchStep({ data, lanes, onDone }: { data: HomeData | null | undefined; lanes?: ReturnType<typeof laneCoins>; onDone: () => void }) {
  const profile = useAtomValue(userStateAtom).profileData, updateUsername = useMutation(api.users.updateUsername);
  const [edited, setEdited] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const { busy, message, upload } = useAvatarUpload(), file = useRef<HTMLInputElement>(null);
  const strategy = data?.strategies[0], ready = Boolean(strategy), name = edited ?? (profile?.username || suggestedName(profile?.email));
  const finish = async () => {
    const value = name.trim();
    if (value !== profile?.username) {
      const problem = nameProblem(value);
      if (problem) { setError(problem); return; }
      setSaving(true);
      try { await updateUsername({ username: value }); }
      catch (cause) { setError(/already taken/i.test(cause instanceof Error ? cause.message : '') ? 'That name is taken. Try another.' : 'That name didn’t save. Try another.'); setSaving(false); return; }
    }
    onDone();
  };
  const budget = strategy?.rules.allocationSol, practice = strategy?.mode !== 'live';
  return <div className={o.step} key="live">
    <span className={o.livePill} data-on={ready || undefined}><span className={o.livePulse} aria-hidden/>{ready ? 'Live' : 'Starting'}</span>
    <h1 className={o.title}>{ready ? 'Your team is live.' : 'Starting your team…'}</h1>
    <p className={o.lead}>{strategy && budget != null ? <>{strategy.name} trades {budget} SOL{practice && data ? <> of your {data.workspace.paperStartSol} practice SOL</> : null}. They keep working with this tab closed.</> : 'ResearchBot starts checking coins in a few seconds.'}</p>
    {lanes && <div className={o.launchStrip}><TeamStrip {...lanes}/></div>}
    <div className={o.you}>
      <div className={o.youRow}>
        <button type="button" className={o.youPhoto} disabled={busy} onClick={() => file.current?.click()} aria-label={profile?.avatar ? 'Change your picture' : 'Add a picture'}>
          <Avatar className="size-14"><AvatarImage src={profile?.avatar ?? undefined} alt=""/><AvatarFallback>{(name || 'You').charAt(0).toUpperCase()}</AvatarFallback></Avatar>
          <span className={o.youCamera} aria-hidden>{busy ? <LoaderCircle className={o.spin}/> : <Camera/>}</span>
        </button>
        <input ref={file} className="hidden" type="file" accept="image/*" aria-label="Picture" disabled={busy} onChange={event => { const picked = event.target.files?.[0]; if (picked) void upload(picked); event.target.value = ''; }}/>
        <Input className={o.field} value={name} placeholder="Your name" aria-label="Your name" aria-invalid={Boolean(error) || undefined} aria-describedby={error ? 'launch-error' : undefined} maxLength={20} autoComplete="nickname" spellCheck={false} disabled={saving} onChange={event => { setEdited(typedName(event.target.value)); setError(null); }} onKeyDown={event => { if (event.key === 'Enter' && ready && name.trim()) void finish(); }}/>
      </div>
      {/* Optional: the same Theme menu as the sidebar's, saved to the account. */}
      <SavedAppearancePicker iconOnly={false} />
      {error ? <p className={o.inviteError} id="launch-error" role="alert">{error}</p> : message ? <CopyError message={message} /> : null}
    </div>
    <div className={o.actions}><Button size="lg" className={o.cta} disabled={!ready || saving || busy || !name.trim()} onClick={() => void finish()}>{saving ? 'Saving…' : 'Go to my team'}</Button></div>
  </div>;
}

/** The first-run layout shared with /app/new: the steps column, and the live Stage beside it only when the page area fits both. `stage` replaces the
 *  market preview (the launch step shows the team's own lanes). */
export function StageShell({ stage, children }: PropsWithChildren<{ stage?: ReactNode }>) {
  const [page, wide] = useTwoColumns(60);
  return <div ref={page} className={o.shell} data-wide={wide || undefined}><div className={o.side}><div className={o.column}>{children}</div></div>{wide && <div className={o.stageWrap}>{stage ?? <Stage/>}</div>}</div>;
}

/** The plan in plain words: a name to rename, one line per bot (ResearchBot's with the live count and its other checks behind a toggle), HOTBOT's one note with its fixes, a closed box to change anything, then the budget. */
/** `card` is the same plan inside HOTBOT's reply: the composer is its change box, so there is no back button, no typing here and no count call. */
export function PlanStep({ plan, onPlan, budget, setBudget, starting, signedIn, onBack, onStart, cta = 'Start my team', practice = true, variant = 'page' }: { plan: Draft; onPlan: (plan: Draft) => void; budget: number; setBudget: (value: number) => void; starting: boolean; signedIn: boolean; onBack?: () => void; onStart: () => void; cta?: string; practice?: boolean; variant?: 'page' | 'card' }) {
  const refine = useAction(api.team.draft);
  const [busy, setBusy] = useState(false), [words, setWords] = useState(''), [renaming, setRenaming] = useState(false), [name, setName] = useState(''), [changing, setChanging] = useState(false);
  const rules = draftRules(plan, budget), bots = plainBots(rules, draftDip(plan)), budgets = [...new Set([...BUDGETS, budget])].sort((a, b) => a - b);
  // Words change what they mention and keep the rest; the old plan stays on screen, dimmed, until the new one arrives.
  const latest = useRef(0);
  const change = async (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    const request = ++latest.current;
    try {
      const next = await refine({ text: value, current: JSON.stringify({ ...plan.intent, budgetSol: budget }) });
      if ('signIn' in next) return;
      if (request === latest.current) { onPlan(keepName(plan, next)); setBudget(next.budgetSol); setWords(''); }
    } catch (cause) { failToast(cause); } finally { setBusy(false); }
  };
  // A suggestion or a fix is already a choice: the plan changes at once in code, and the live count follows with no model call.
  const choose = (next: Draft) => {
    const shown = keepName(plan, next), request = ++latest.current;
    onPlan(shown);
    if (variant === 'card') return;
    refine({ text: '', current: JSON.stringify({ ...next.intent, budgetSol: budget }) })
      .then(counted => { if (!('signIn' in counted) && request === latest.current) onPlan({ ...shown, matches: counted.matches, note: counted.note, fixes: counted.fixes }); })
      .catch(() => { /* The plan stands without a count. */ });
  };
  const rename = () => { const next = name.trim(); setRenaming(false); if (next && next !== plan.name) onPlan({ ...plan, name: next }); };
  // A click or Tab away closes the change box unless a change is on its way; unsent words stay for when it opens again.
  const box = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement>(null);
  const closeBox = () => { setChanging(false); requestAnimationFrame(() => opener.current?.focus()); };
  useEffect(() => {
    if (!changing || busy) return;
    const away = (target: EventTarget | null) => { if (target instanceof Node && !box.current?.contains(target)) setChanging(false); };
    const onDown = (event: PointerEvent) => away(event.target), onFocus = (event: FocusEvent) => away(event.target);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('focusin', onFocus);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('focusin', onFocus); };
  }, [changing, busy]);
  const { intent } = plan, suggestions: { label: string; intent: Partial<Draft['intent']> }[] = [
    intent.risk === 'low' ? { label: 'Take more risk', intent: { risk: 'medium' } } : { label: 'Safer', intent: { risk: 'low' } },
    intent.askFirst ? { label: 'Buy without asking', intent: { askFirst: false } } : { label: 'Ask me before buying', intent: { askFirst: true } },
    intent.age === 'new' ? { label: 'Any age', intent: { age: null } } : { label: 'Only brand-new coins', intent: { age: 'new' } },
    intent.hold === 'quick' ? { label: 'Hold for bigger moves', intent: { hold: 'moon' } } : { label: 'Take quick profits', intent: { hold: 'quick' } },
  ];
  const suggest = <div className={o.suggest}>{suggestions.map(row => <button type="button" key={row.label} disabled={busy} onClick={() => choose({ ...planDraft({ ...intent, ...row.intent, budgetSol: budget }), matches: null })}>{row.label}</button>)}</div>;
  return <div className={o.step} key="plan" aria-busy={busy} data-variant={variant}>
    {onBack && <button type="button" className={o.back} onClick={onBack}><ArrowLeft size={15}/>Back</button>}
    {renaming
      ? <form onSubmit={event => { event.preventDefault(); rename(); }}><input className={o.nameInput} autoFocus value={name} maxLength={60} aria-label="Strategy name" onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false); }}/></form>
      : <h1 className={`${o.title} ${o.named}`}><span>{plan.name}</span><button type="button" className={o.pencil} aria-label="Rename" onClick={() => { setName(plan.name); setRenaming(true); }}><Pencil/></button></h1>}
    <div className={o.planBody} data-busy={busy || undefined}>
      <div className={o.plan}>
        <div className={o.planRow}><BotAvatar role="research" size={40}/><div>
          <small>ResearchBot</small><span>{bots.research}</span>
          <Collapsible>
          <div className={o.found}>
            {plan.matches && plan.matches.count > 0 && <span className={o.fit}>
              <span className={o.stack}>{plan.matches.tokens.slice(0, 4).map((token, index) => <TokenAvatar key={token.address || token.symbol + index} className="size-5 rounded-[28%]" address={token.address || undefined} symbol={token.symbol}/>)}</span>
              <span><b>{plan.matches.count} coins</b> fit right now</span>
            </span>}
            {bots.checks.length > 0 && <CollapsibleTrigger className={o.checks}>{bots.checks.length} more {bots.checks.length === 1 ? 'check' : 'checks'}<ChevronDown/></CollapsibleTrigger>}
          </div>
          {bots.checks.length > 0 && <CollapsibleContent><PlainChips chips={bots.checks}/></CollapsibleContent>}
          </Collapsible>
        </div></div>
        <div className={o.planRow}><BotAvatar role="sniper" size={40}/><div><small>SniperBot</small><span>{bots.sniper}</span></div></div>
        <div className={o.planRow}><BotAvatar role="trader" size={40}/><div><small>TraderBot</small><span>{bots.trader}</span></div></div>
      </div>
      {plan.note && <div className={o.advice} role="status">
        <p><BotAvatar role="coordinator" size={22}/>{plan.note}</p>
        {plan.fixes.length > 0 && <div className={o.fixes}>{plan.fixes.map(fix => <button type="button" key={fix.label} onClick={() => choose(withFix(plan, fix))}>{fix.label}</button>)}</div>}
      </div>}
    </div>
    {/* The link and the box share one spot and swap with the shared Collapsible open and close, so they move like every other section that opens in place.
        In chat the plan card keeps its quick changes under its button instead, so they never sit between the plan and its budget. */}
    {variant === 'page' && <div className={o.swap}>
      <Collapsible open={!changing}><CollapsibleContent>
        <button ref={opener} type="button" className={`${o.link} ${o.change}`} onClick={() => setChanging(true)}>Change something</button>
      </CollapsibleContent></Collapsible>
      <Collapsible open={changing}><CollapsibleContent ref={box}>
        <form className={o.refine} onSubmit={event => { event.preventDefault(); void change(words); }}>
          <input value={words} autoFocus maxLength={300} placeholder="Change anything…" aria-label="Change anything about the plan" disabled={busy} onChange={event => setWords(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') closeBox(); }}/>
          <button type="submit" className={o.send} aria-label="Update the plan" disabled={busy || !words.trim()}>{busy ? <LoaderCircle className="animate-spin"/> : <ArrowUp/>}</button>
        </form>
        {suggest}
      </CollapsibleContent></Collapsible>
    </div>}
    <div className={o.budgetHead}><span>{practice ? 'Practice budget' : 'Budget'}</span><span>Up to {rules.amountSol} SOL a coin · {rules.maxOpenPositions} at once</span></div>
    <div className={o.segmented} role="radiogroup" aria-label={practice ? 'Practice budget' : 'Budget'}>{budgets.map(value => <button type="button" key={value} role="radio" aria-checked={budget === value} onClick={() => setBudget(value)}>{value} SOL</button>)}</div>
    <div className={o.actions}><Button size="lg" className={o.cta} disabled={starting || busy} onClick={onStart}>{starting ? 'Starting…' : cta}</Button>{!signedIn && variant === 'page' && <p className={o.fine}>Next, sign in with a wallet or email.</p>}</div>
    {variant === 'card' && suggest}
  </div>;
}
