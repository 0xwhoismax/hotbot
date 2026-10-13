"use client";
import { useEffect, useRef, useState, type FormEvent, type PropsWithChildren, type ReactNode } from 'react';
import { useAction, useConvex, useMutation } from 'convex/react';
import { useAtom, useAtomValue } from 'jotai';
import { RESET } from 'jotai/utils';
import { ArrowLeft, ArrowUp, Camera, Check, ChevronDown, Flag, Flame, FlaskConical, LoaderCircle, LockKeyhole, Pencil, ScanSearch, Scissors, Shield, ShieldCheck, Sparkles, Timer, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api, useQuery } from '@/lib/convex';
import { isAdminAtom, userStateAtom } from '@/store/user/atoms';
import { SavedAppearancePicker } from '@/components/account/SavedAppearancePicker';
import { CopyError, nameProblem, typedName, useAvatarUpload } from '@/components/account/AvatarControls';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { BUDGETS, draftDip, draftPatch, draftRules, keepName, plainBots, planDraft, withFix, type Draft, type PresetId } from '../../../../types/team';
import { PlainChips } from './Plain';
import { failToast, failure, inviteAtom, launchingAtom, onboardingStepAtom, pendingPlanAtom, useInvite, useSession } from './state';
import { SignInStep } from './SignInStep';
import { LiveStage, Stage, TeamStrip, laneCoins } from './Stage';
import { useTwoColumns } from './Parts';
import { useHome } from './useHome';
import type { HomeData } from './data';
import o from './onboarding.module.css';

export const STYLES: { id: PresetId; name: string; text: string; icon: typeof Shield }[] = [
  { id: 'oracle', name: 'Oracle', text: 'A model trained on our own trades ranks every coin; only the top fifth gets bought.', icon: Sparkles },
  { id: 'clips', name: 'Clips', text: 'New coins, small quick wins. Out fast when one turns.', icon: Scissors },
  { id: 'runners', name: 'Balanced', text: 'Coins that are already moving, with volume behind them.', icon: Zap },
  { id: 'degen', name: 'Degen', text: 'Brand-new coins. Big swings in both directions.', icon: Flame },
];

/** The beta notes: the agree (paper balance, as `team.start` gives it) and Report, with the app's own red flag where it sits at this screen size.
 *  The chat, the Lab and ratings get a FirstTip on their own controls instead. */
const BETA: { title: string; text: ReactNode; icon: ReactNode; report?: true; value?: string }[] = [
  { title: 'Early beta, paper only', text: 'Things can break as updates ship. No real funds while we test.', icon: <FlaskConical/>, value: '10 SOL' },
  { title: 'Report anything', report: true, icon: <Flag fill="currentColor"/>, text: <><span className={o.phoneOnly}>Tap the red flag at the top</span><span className={o.wideOnly}>Click Report a problem in the left sidebar (or press F)</span>, then point at anything: data, a bug or an idea.</> },
];

/** First run: meet the team, pick how to play, see the plan in plain words, start, and land on the launch step with the team live. Sign-in is a step: when starting,
 *  or straight from the intro for returning people. HOTBOT is invite-only: the intro asks for an invite until one is in hand (from an invite link or typed), and signing in takes its seat. */
export function Onboarding({ preview = false }: { preview?: boolean }) {
  const session = useSession(), start = useMutation(api.team.start), draftPlan = useAction(api.team.draft), redeem = useMutation(api.invites.redeem);
  const [step, setStep] = useAtom(onboardingStepAtom), [style, setStyle] = useState<PresetId>('oracle');
  const [describing, setDescribing] = useState(false), [words, setWords] = useState('');
  const [plan, setPlan] = useState<Draft | null>(null), [budget, setBudget] = useState(1), [loading, setLoading] = useState(false), [starting, setStarting] = useState(false);
  // The step an invite's used-up drafts sent the person from to sign in: it shows the ask there while signed out, and signing in returns to it.
  const [signInFor, setSignInFor] = useState<'style' | 'plan' | null>(null);
  const [pending, setPending] = useAtom(pendingPlanAtom), signedIn = session.signedIn && session.connected, launched = useRef(false);
  const [launching, setLaunching] = useAtom(launchingAtom), data = useHome(signedIn);
  const [invite, setInvite] = useInvite(), checked = useQuery(api.invites.check, invite ? { code: invite } : 'skip');
  const isAdmin = useAtomValue(isAdminAtom), invited = useAtomValue(userStateAtom).profileData?.invited === true;
  // Let in: an admin, an account that joined with an invite, or an open invite in hand. A stored code still being checked waits.
  const letIn = preview || (signedIn && (isAdmin || invited)) || checked?.state === 'open', checking = Boolean(invite) && checked === undefined;
  // The launch step from the moment the team starts; before that a saved plan waiting for sign-in (also after X's redirect reloads the page) shows the sign-in step.
  const shown = launching ? 'live' : !preview && signedIn && (starting || pending) ? 'signin' : !letIn && !checking && (step === 'beta' || step === 'style' || step === 'plan') ? 'intro' : step;
  // Signed in from the sign-in step with no team and no saved plan: carry on choosing a style, or back to the invite when there is none.
  useEffect(() => {
    if (preview || !signedIn || step !== 'signin' || pending || checking) return;
    setStep(signInFor ?? (letIn ? 'beta' : 'intro'));
  }, [preview, signedIn, step, pending, checking, letIn, signInFor, setStep]);
  // Signing in with an invite in hand takes its seat (a saved plan takes it as it starts); the account then counts as invited.
  const takeSeat = async () => { if (invite && !isAdmin && !invited) await redeem({ code: invite }); };
  useEffect(() => {
    if (preview || !signedIn || pending || isAdmin || invited || checked?.state !== 'open') return;
    void takeSeat().then(() => setInvite(null), cause => { failToast(cause); setInvite(null); });
  }, [preview, signedIn, pending, isAdmin, invited, checked?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Dots: intro, beta, style, plan, sign-in for anyone who arrived signed out, and the launch. The count is set once, so it never grows mid-flow.
  const [withSignin] = useState(() => preview || !signedIn || Boolean(pending));
  const steps = withSignin ? ['intro', 'beta', 'style', 'plan', 'signin', 'live'] : ['intro', 'beta', 'style', 'plan', 'live'], at = shown === 'signin' && !plan && !pending ? 0 : steps.indexOf(shown);

  // The launch step shows from the moment the team starts: the gate keeps onboarding up while `launching`, since the new team can reach `useHome` before `team.start` returns.
  const launch = async (draft: Draft, budgetSol: number) => {
    setStarting(true); setLaunching(true);
    try { await takeSeat(); setInvite(null); await start({ preset: draft.preset, budgetSol, askFirst: draft.askFirst, mode: 'paper', name: draft.name, description: draft.description, patch: JSON.stringify(draftPatch(draft, budgetSol)) }); }
    // A failed start drops the saved plan (no retry loop); the plan step comes back with it to press Start again.
    catch (cause) { failToast(cause); setLaunching(false); launched.current = false; setPlan(current => current ?? draft); setBudget(budgetSol); setStep('plan'); }
    finally { setStarting(false); setPending(RESET); }
  };
  // "Go to my team": onboarding steps aside and the gate shows Home.
  const done = () => { setStep('intro'); setLaunching(false); };
  // A plan chosen before sign-in starts as soon as the account connects.
  useEffect(() => {
    if (preview || !signedIn || launched.current || !pending) return;
    launched.current = true;
    void launch(pending.draft, pending.budget);
  }, [preview, signedIn, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPlan = async () => {
    setLoading(true);
    const custom = describing && words.trim();
    try {
      const draft = await draftPlan(custom ? { text: words.trim(), invite: invite ?? undefined } : { text: '', preset: style, invite: invite ?? undefined });
      if ('signIn' in draft) { setSignInFor('style'); return; }
      setPlan(draft);
      setBudget(draft.budgetSol);
      setStep('plan');
    } catch (cause) { failToast(cause); } finally { setLoading(false); }
  };
  const confirm = () => {
    if (!plan) return;
    if (preview) { toast('Preview only. No team was started.'); return; }
    if (signedIn) { void launch(plan, budget); return; }
    setPending({ draft: plan, budget });
    setStep('signin');
  };

  // The launch step's lanes, worked out once for the Stage beside it and the strip that stands in for it on narrower pages.
  const lanes = shown === 'live' && data ? laneCoins(data, false) : undefined;
  return <StageShell stage={shown === 'live' ? <LiveStage data={data} lanes={lanes}/> : undefined}>
    <div className={o.progress} aria-hidden>{steps.map((name, index) => <span key={name} data-on={index <= at || undefined}/>)}</div>

    {shown === 'intro' && <div className={o.step} key="intro">
      <div className={o.crew}><BotAvatar role="coordinator" size={64}/><BotAvatar role="research" size={50}/><BotAvatar role="sniper" size={50}/><BotAvatar role="trader" size={50}/></div>
      <span className={o.invite} data-on={letIn || undefined}>{letIn ? <><Check aria-hidden/>You’re invited</> : checking ? <><LoaderCircle className={o.spin} aria-hidden/>Checking your invite</> : <><LockKeyhole aria-hidden/>Invite only</>}</span>
      <h1 className={o.title}>Your own trading team.</h1>
      <p className={o.lead}>{signedIn && !letIn && !checking ? 'This account doesn’t have a team yet. HOTBOT is invite-only: enter your invite code to build one.' : 'Three bots find coins, pick the entry and manage every trade, around the clock. You decide how much they play with.'}</p>
      <ul className={o.facts}>
        <li><ScanSearch/><span><b>ResearchBot checks every coin</b> against your rules</span></li>
        <li><Timer/><span><b>Runs around the clock</b>, even with this tab closed</span></li>
        <li><ShieldCheck/><span><b>TraderBot decides the exits</b> on every price move</span></li>
      </ul>
      <div className={o.actions}>
        {letIn ? <Button size="lg" className={o.cta} onClick={() => setStep('beta')}>Build my team</Button>
          : <InviteField key={invite ?? ''} initial={invite ?? ''} refused={checked && 'message' in checked ? checked.message : null} checking={checking} onAccept={code => { setInvite(code); setStep('beta'); }}/>}
        {!preview && !signedIn && <Button size="lg" variant="outline" className={o.cta} onClick={() => setStep('signin')}>I already have an account</Button>}
        <p className={o.fine}>Starts with 10 free practice SOL. No deposit needed.</p>
      </div>
    </div>}

    {shown === 'beta' && <BetaStep onBack={() => setStep('intro')} onNext={() => setStep('style')}/>}

    {shown === 'style' && <div className={o.step} key="style">
      <button type="button" className={o.back} onClick={() => setStep('beta')}><ArrowLeft size={15}/>Back</button>
      <h1 className={o.title}>How do you like to play?</h1>
      <p className={o.lead}>Pick one. You can change it any time.</p>
      <div className={o.options} role="radiogroup" aria-label="Play style">
        {STYLES.map(row => <button type="button" key={row.id} role="radio" aria-checked={!describing && style === row.id} data-style={row.id} className={o.option} onClick={() => { setStyle(row.id); setDescribing(false); }}>
          <span className={o.icon}><row.icon/></span>
          <span className={o.optionText}><strong>{row.name}</strong><span>{row.text}</span></span>
          <span className={o.radio}/>
        </button>)}
      </div>
      {describing
        ? <textarea className={o.describe} autoFocus value={words} onChange={event => setWords(event.target.value)} placeholder="New memecoins under $5M market cap with rising volume. Quick flips, sell if it drops 12%." aria-label="Describe your strategy"/>
        : <button type="button" className={o.link} onClick={() => setDescribing(true)}>Or describe it in your own words</button>}
      {signInFor === 'style' && !signedIn && <SignInToDraft onSignIn={() => setStep('signin')}/>}
      <div className={o.actions}><Button size="lg" className={o.cta} disabled={loading || Boolean(describing && !words.trim())} onClick={buildPlan}>{loading ? 'Building your plan…' : 'See my plan'}</Button></div>
    </div>}

    {shown === 'signin' && <SignInStep title={signInFor && !signedIn ? 'Sign in to keep going' : plan ? 'Sign in to start your team' : 'Welcome back'} lead={signInFor && !signedIn ? 'Wallet or email. Your plan stays here.' : plan ? 'Wallet or email. It takes a few seconds.' : 'Sign in to see your team.'} busy={starting} onBack={() => setStep(signInFor ?? (plan ? 'plan' : 'intro'))}/>}

    {shown === 'plan' && plan && <PlanStep plan={plan} onPlan={setPlan} budget={budget} setBudget={setBudget} starting={starting} signedIn={signedIn} onBack={() => setStep('style')} onStart={confirm} onSignIn={() => { setSignInFor('plan'); setStep('signin'); }}/>}

    {shown === 'live' && <LaunchStep data={data} lanes={lanes} onDone={done}/>}
  </StageShell>;
}

/** For invited beta testers, before the style pick: two notes as cards, and the button is the agree. */
function BetaStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return <div className={o.step} key="beta">
    <button type="button" className={o.back} onClick={onBack}><ArrowLeft size={15}/>Back</button>
    <h1 className={o.betaTitle}>Welcome to the beta.</h1>
    <ul className={o.betaCards}>{BETA.map(row => <li key={row.title} data-report={row.report}>
      <span className={o.betaIcon} aria-hidden>{row.icon}</span>
      <span className={o.betaText}><b>{row.title}{row.value && <span className={o.betaValue}>{row.value}</span>}</b><span>{row.text}</span></span>
    </li>)}</ul>
    <p className={o.betaMore}>The chat, the Lab and trade ratings: we’ll point them out as you go.</p>
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
        <input className={o.field} value={name} placeholder="Your name" aria-label="Your name" aria-invalid={Boolean(error) || undefined} aria-describedby={error ? 'launch-error' : undefined} maxLength={20} autoComplete="nickname" spellCheck={false} disabled={saving} onChange={event => { setEdited(typedName(event.target.value)); setError(null); }} onKeyDown={event => { if (event.key === 'Enter' && ready && name.trim()) void finish(); }}/>
      </div>
      {/* Optional: the same Theme menu as the sidebar's, saved to the account. */}
      <SavedAppearancePicker iconOnly={false} />
      {error ? <p className={o.inviteError} id="launch-error" role="alert">{error}</p> : message ? <CopyError message={message} /> : null}
    </div>
    <div className={o.actions}><Button size="lg" className={o.cta} disabled={!ready || saving || busy || !name.trim()} onClick={() => void finish()}>{saving ? 'Saving…' : 'Go to my team'}</Button></div>
  </div>;
}

/** The invite code box: checked as it is sent, so a good code goes straight on to choosing a style. */
function InviteField({ initial, refused, checking, onAccept }: { initial: string; refused: string | null; checking: boolean; onAccept: (code: string) => void }) {
  const convex = useConvex(), [code, setCode] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const shownError = error ?? (code === initial ? refused : null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await convex.query(api.invites.check, { code });
      if (result.state === 'open') onAccept(result.code); else setError(result.message);
    } catch (cause) { setError(failure(cause).message); } finally { setBusy(false); }
  };
  return <form className={o.inviteForm} onSubmit={submit}>
    <div className={o.inline}>
      <input className={`${o.field} ${o.inviteCode}`} value={code} onChange={event => { setCode(event.target.value.toUpperCase()); setError(null); }} placeholder="Invite code" aria-label="Invite code" aria-invalid={Boolean(shownError) || undefined} aria-describedby={shownError ? 'invite-error' : undefined} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} disabled={busy || checking}/>
      <Button type="submit" size="lg" className={o.inlineButton} disabled={!code.trim() || busy || checking}>{busy || checking ? <LoaderCircle className={o.spin} aria-hidden/> : null}Join</Button>
    </div>
    {shownError && <p className={o.inviteError} id="invite-error" role="alert">{shownError}</p>}
  </form>;
}

/** The first-run layout shared with /app/new: the steps column, and the live Stage beside it only when the page area fits both. `stage` replaces the
 *  market preview (the launch step shows the team's own lanes). */
export function StageShell({ stage, children }: PropsWithChildren<{ stage?: ReactNode }>) {
  const [page, wide] = useTwoColumns(60);
  return <div ref={page} className={o.shell} data-wide={wide || undefined}><div className={o.side}><div className={o.column}>{children}</div></div>{wide && <div className={o.stageWrap}>{stage ?? <Stage/>}</div>}</div>;
}

/** In place of an error when an invite's drafts in words for the hour are used: signing in gives the person their own allowance, and the plan stays. */
function SignInToDraft({ onSignIn }: { onSignIn: () => void }) {
  return <div className={o.advice} role="status">
    <p><BotAvatar role="coordinator" size={22}/>Sign in to keep shaping your plan. It takes a few seconds.</p>
    <div className={o.fixes}><button type="button" onClick={onSignIn}>Sign in</button></div>
  </div>;
}

/** The plan in plain words: a name to rename, one line per bot (ResearchBot's with the live count and its other checks behind a toggle), HOTBOT's one note with its fixes, a closed box to change anything, then the budget. */
/** `card` is the same plan inside HOTBOT's reply: the composer is its change box, so there is no back button, no typing here and no count call. */
/** `onSignIn`: where an invite's used-up drafts send the person (onboarding only). */
export function PlanStep({ plan, onPlan, budget, setBudget, starting, signedIn, onBack, onStart, onSignIn, cta = 'Start my team', practice = true, variant = 'page' }: { plan: Draft; onPlan: (plan: Draft) => void; budget: number; setBudget: (value: number) => void; starting: boolean; signedIn: boolean; onBack?: () => void; onStart: () => void; onSignIn?: () => void; cta?: string; practice?: boolean; variant?: 'page' | 'card' }) {
  const refine = useAction(api.team.draft), invite = useAtomValue(inviteAtom), [signInAsked, setSignInAsked] = useState(false);
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
      const next = await refine({ text: value, current: JSON.stringify({ ...plan.intent, budgetSol: budget }), invite: invite ?? undefined });
      if ('signIn' in next) { setSignInAsked(true); setChanging(false); return; }
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
              <span className={o.stack}>{plan.matches.tokens.slice(0, 4).map((token, index) => <TokenAvatar key={token.address || token.symbol + index} className="size-5 rounded-[28%]" address={token.address || undefined} logoUrl={token.logo ?? undefined} symbol={token.symbol} network="solana" fallback="letter" disableDetailFallback/>)}</span>
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
    {signInAsked && onSignIn && <SignInToDraft onSignIn={onSignIn}/>}
    <div className={o.budgetHead}><span>{practice ? 'Practice budget' : 'Budget'}</span><span>Up to {rules.amountSol} SOL a coin · {rules.maxOpenPositions} at once</span></div>
    <div className={o.segmented} role="radiogroup" aria-label={practice ? 'Practice budget' : 'Budget'}>{budgets.map(value => <button type="button" key={value} role="radio" aria-checked={budget === value} onClick={() => setBudget(value)}>{value} SOL</button>)}</div>
    <div className={o.actions}><Button size="lg" className={o.cta} disabled={starting || busy} onClick={onStart}>{starting ? 'Starting…' : cta}</Button>{!signedIn && variant === 'page' && <p className={o.fine}>Next, sign in with a wallet or email.</p>}</div>
    {variant === 'card' && suggest}
  </div>;
}
