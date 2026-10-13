"use client";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useAction, useMutation } from 'convex/react';
import { useAtom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, ClipboardPaste, Crown, Flame, Footprints, Link2, LoaderCircle, Rocket, ScanSearch, ShieldCheck, Sprout, Timer, TrendingUp, Wallet, X } from 'lucide-react';
import { api } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { formatNumber } from '@/utils/formatterUtils';
import { APPLICATION, APPLICATION_POST, EXPERIENCE, TERMINALS, TOOLS, isSolanaAddress, telegramHandle, xHandle, type ExperienceId, type TerminalId, type ToolId } from '../../../../types/application';
import { HOTBOT_MINT, type AgentRole } from '../../../../types/hotbot';
import { failure } from './state';
import o from './onboarding.module.css';

type Draft = {
  holds: boolean | null; wallet: string; x: string; telegram: string;
  trades: boolean | null; terminals: { id: TerminalId; handle: string }[];
  experience: ExperienceId | null; tools: ToolId[]; noTools: boolean; toolsUsed: string; why: string; comment: string; sent: boolean;
};
const EMPTY: Draft = { holds: null, wallet: '', x: '', telegram: '', trades: null, terminals: [], experience: null, tools: [], noTools: false, toolsUsed: '', why: '', comment: '', sent: false };
/** The answers so far, kept in this browser: on a phone people leave to copy their wallet, and coming back (or a reload) keeps what they typed. */
const draftAtom = atomWithStorage<Draft>('hotbot-application', EMPTY,
  createJSONStorage<Draft>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }));

type QuestionId = 'hotbot' | 'x' | 'telegram' | 'terminals' | 'experience' | 'tools' | 'toolsUsed' | 'why' | 'comment';
/** Each question has a bot hosting it; it hops when the question is answered. */
const QUESTIONS: { id: QuestionId; host: AgentRole; title: string; lead?: string; optional?: true }[] = [
  { id: 'hotbot', host: 'coordinator', title: 'Do you hold $HOTBOT?', lead: 'Holding it isn’t required to apply.' },
  { id: 'x', host: 'research', title: 'What’s your X?', lead: 'Your handle, or paste a link to your profile.' },
  { id: 'telegram', host: 'sniper', title: 'And your Telegram?', lead: 'If you get in, this is where we reach you.' },
  { id: 'terminals', host: 'trader', title: 'Do you trade on other terminals?' },
  { id: 'experience', host: 'research', title: 'How long have you been trading?' },
  { id: 'tools', host: 'trader', title: 'Which of these have you traded with?', lead: 'Pick all that apply.', optional: true },
  { id: 'toolsUsed', host: 'sniper', title: 'What tools do you use today?', lead: 'Charts, trackers, bots, alerts: anything in your setup.', optional: true },
  { id: 'why', host: 'coordinator', title: 'Why should you get access?', lead: 'One or two sentences.' },
  { id: 'comment', host: 'sniper', title: 'Did you comment on our application post?', lead: 'Paste the link to your comment.', optional: true },
];
const LAST = QUESTIONS.length, SEND = LAST + 1;

/** What stops a question counting as answered, in the words shown under it. Optional questions only fail on length. */
function problem(id: QuestionId, d: Draft): string | null {
  switch (id) {
    case 'hotbot': return d.holds === null ? 'Pick one.' : d.holds && !isSolanaAddress(d.wallet.trim()) ? d.wallet.trim() ? 'That isn’t a Solana wallet address.' : 'Paste the wallet that holds it.' : null;
    case 'x': return xHandle(d.x) ? null : d.x.trim() ? 'That isn’t an X handle.' : 'Add your X handle.';
    case 'telegram': return telegramHandle(d.telegram) ? null : d.telegram.trim() ? 'That isn’t a Telegram handle.' : 'Add your Telegram handle.';
    case 'terminals': return d.trades === null ? 'Pick one.' : d.trades && !d.terminals.length ? 'Pick at least one.' : null;
    case 'experience': return d.experience ? null : 'Pick one.';
    case 'tools': return null;
    case 'toolsUsed': return d.toolsUsed.trim().length > APPLICATION.toolsUsed ? `Keep it under ${APPLICATION.toolsUsed} characters.` : null;
    case 'comment': return d.comment.trim().length > APPLICATION.comment ? `Keep it under ${APPLICATION.comment} characters.` : null;
    case 'why': { const length = d.why.trim().length; return length < APPLICATION.whyMin ? 'Tell us why in a sentence or two.' : length > APPLICATION.why ? `Keep it under ${APPLICATION.why} characters.` : null; }
  }
}
const answered = (id: QuestionId, d: Draft) => id === 'tools' ? d.noTools || d.tools.length > 0 : id === 'toolsUsed' ? Boolean(d.toolsUsed.trim()) : id === 'comment' ? Boolean(d.comment.trim()) : !problem(id, d);

const phone = () => window.matchMedia('(max-width: 48rem)').matches;
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tint = (color: string) => ({ '--style-color': color }) as CSSProperties;

/** /join: the application to get into HOTBOT. Wide screens scroll through every question with the one in the middle in focus; phones show one a screen. */
export function Join() {
  const [stored, setStored] = useAtom(draftAtom), draft = { ...EMPTY, ...stored };
  const set = (patch: Partial<Draft>) => setStored(current => ({ ...EMPTY, ...current, ...patch }));
  const submit = useMutation(api.applications.submit);
  const [at, setAt] = useState(0), [dir, setDir] = useState<'next' | 'back'>('next'), [active, setActive] = useState(0);
  const [tried, setTried] = useState<ReadonlySet<QuestionId>>(() => new Set()), [sending, setSending] = useState(false), [error, setError] = useState<string | null>(null), [again, setAgain] = useState(false);
  const sections = useRef<(HTMLElement | null)[]>([]), advancing = useRef(0);

  // Wide screens: the section crossing the middle of the window is in focus (the rest dim), and is where a phone-sized window picks up.
  useEffect(() => {
    if (draft.sent) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { const index = Number((entry.target as HTMLElement).dataset.index); setActive(index); if (!phone()) setAt(Math.min(index, LAST)); }
    }, { rootMargin: '-45% 0px -45% 0px' });
    sections.current.forEach(section => { if (section) observer.observe(section); });
    return () => observer.disconnect();
  }, [draft.sent]);
  useEffect(() => () => window.clearTimeout(advancing.current), []);

  const focusIn = (index: number) => sections.current[index]?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  const go = (index: number) => {
    window.clearTimeout(advancing.current);
    setError(null);
    if (phone()) { setDir(index < at ? 'back' : 'next'); setAt(index); window.scrollTo({ top: 0 }); requestAnimationFrame(() => focusIn(index)); return; }
    sections.current[index]?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' });
    setActive(index);
    focusIn(index);
  };
  /** A pick that answers the question on its own moves on after a beat, so the choice is seen first. */
  const advance = (index: number) => { window.clearTimeout(advancing.current); advancing.current = window.setTimeout(() => go(index + 1), 380); };
  const next = (index: number) => {
    const question = QUESTIONS[index - 1];
    if (question && problem(question.id, draft)) { setTried(current => new Set(current).add(question.id)); return; }
    if (index === LAST && phone()) void send(); else go(index + 1);
  };
  const send = async () => {
    const missing = QUESTIONS.filter(question => problem(question.id, draft));
    if (missing.length) { setTried(new Set(missing.map(question => question.id))); go(QUESTIONS.indexOf(missing[0]) + 1); return; }
    setSending(true); setError(null);
    try {
      const result = await submit({ wallet: draft.holds ? draft.wallet.trim() : null, x: draft.x, telegram: draft.telegram, terminals: draft.trades ? draft.terminals : null,
        experience: draft.experience ?? '', tools: draft.noTools ? [] : draft.tools, toolsUsed: draft.toolsUsed, why: draft.why, comment: draft.comment });
      setAgain(result.again); set({ sent: true }); setTried(new Set()); window.scrollTo({ top: 0 });
    } catch (cause) { setError(failure(cause).message); } finally { setSending(false); }
  };

  const done = QUESTIONS.filter(question => answered(question.id, draft)).length;
  const header = (back: boolean) => <header className={o.joinTop} style={{ '--answered': done / LAST, '--step': Math.min(at, LAST) / LAST } as CSSProperties}>
    {back && <button type="button" className={o.joinBack} onClick={() => go(at - 1)} aria-label="Previous question"><ArrowLeft/></button>}
    <Link href="/" className={o.joinBrand}><BotAvatar role="coordinator" size={24}/>HOTBOT</Link>
    {!draft.sent && <span className={o.joinCount}><span className={o.wideOnly}>{done} of {LAST} answered</span><span className={o.phoneOnly}>{at ? `${at} of ${LAST}` : 'Apply'}</span></span>}
    {!draft.sent && <span className={o.joinBar} aria-hidden><i/></span>}
  </header>;

  if (draft.sent) return <div className={o.join}>
    {header(false)}
    <main className={o.joinBody}><Sent draft={draft} again={again} onEdit={() => { set({ sent: false }); requestAnimationFrame(() => go(1)); }}/></main>
  </div>;

  const missing = QUESTIONS.filter(question => problem(question.id, draft)).length;
  return <div className={o.join} data-dir={dir}>
    {header(at > 0)}
    <main className={o.joinBody}>
      <section ref={element => { sections.current[0] = element; }} data-index={0} className={o.joinHero} data-current={at === 0 || undefined} aria-labelledby="join-title">
        <div className={o.crew}><BotAvatar role="coordinator" size={72}/><BotAvatar role="research" size={54}/><BotAvatar role="sniper" size={54}/><BotAvatar role="trader" size={54}/></div>
        <span className={o.livePill} data-on><span className={o.livePulse} aria-hidden/>Applications open</span>
        <h1 className={o.title} id="join-title">Join the HOTBOT team.</h1>
        <p className={o.lead}>HOTBOT is invite-only. Answer {LAST} quick questions, about two minutes, and we read every one.</p>
        <ul className={o.facts}>
          <li><ScanSearch/><span><b>ResearchBot checks every coin</b> against your rules</span></li>
          <li><Timer/><span><b>Runs around the clock</b>, even with the tab closed</span></li>
          <li><ShieldCheck/><span><b>TraderBot decides the exits</b> on every price move</span></li>
        </ul>
        <Button size="lg" className={`${o.cta} ${o.joinStart} ${o.wideOnly}`} onClick={() => go(1)}>Start<ArrowDown/></Button>
      </section>

      {QUESTIONS.map((question, index) => {
        const number = index + 1, shown = tried.has(question.id) ? problem(question.id, draft) : null, errorId = shown ? `join-${question.id}-error` : undefined;
        const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
          event.preventDefault(); next(number);
        };
        return <section key={question.id} ref={element => { sections.current[number] = element; }} data-index={number} className={o.q} data-current={at === number || undefined} data-active={active === number || undefined}
          aria-labelledby={`join-${question.id}`} onKeyDown={onKeyDown} onPointerDown={() => setActive(number)}>
          <div className={o.qHead}>
            <span className={o.host} data-happy={answered(question.id, draft) || undefined}><BotAvatar role={question.host} size={40}/></span>
            <span className={o.qNum}>{number} / {LAST}</span>{question.optional && <span className={o.qTag}>Optional</span>}
          </div>
          <h2 className={o.qTitle} id={`join-${question.id}`}>{question.title}</h2>
          {question.lead && <p className={o.qLead}>{question.lead}</p>}
          <div className={o.qBody}><Answer id={question.id} draft={draft} set={set} invalid={Boolean(shown)} errorId={errorId} onPicked={() => advance(number)}/></div>
          {shown && <p className={o.qError} id={errorId} role="alert" key={`${shown}-${tried.size}`}>{shown}</p>}
          <div className={o.qNext}>
            <Button size="lg" onClick={() => next(number)}>{question.optional && !answered(question.id, draft) ? 'Skip' : 'OK'}<Check/></Button>
            <span>or press <kbd>Enter ↵</kbd></span>
          </div>
        </section>;
      })}

      <section ref={element => { sections.current[SEND] = element; }} data-index={SEND} className={`${o.q} ${o.joinSend}`} data-active={active === SEND || undefined} aria-labelledby="join-send">
        <div className={o.qHead}><span className={o.host} data-happy={!missing || undefined}><BotAvatar role="coordinator" size={56}/></span></div>
        <h2 className={o.qTitle} id="join-send">{missing ? `${missing} more to go.` : 'All set. Send it over?'}</h2>
        <p className={o.qLead}>{missing ? 'Send takes you to the first one left.' : 'You can change your answers later by applying again with the same X.'}</p>
        <Button size="lg" className={o.cta} disabled={sending} onClick={() => void send()}>{sending ? <><LoaderCircle className="animate-spin"/>Sending…</> : 'Send application'}</Button>
        {error && <p className={o.qError} role="alert">{error}</p>}
      </section>
    </main>

    <nav className={o.joinNav} aria-label="Application">
      {error && at === LAST && <p className={o.qError} role="alert">{error}</p>}
      {at === 0 ? <Button size="lg" className={o.cta} onClick={() => go(1)}>Start</Button>
        : <Button size="lg" className={o.cta} disabled={sending} onClick={() => next(at)}>{at === LAST ? sending ? <><LoaderCircle className="animate-spin"/>Sending…</> : 'Send application'
          : QUESTIONS[at - 1]?.optional && !answered(QUESTIONS[at - 1].id, draft) ? 'Skip' : 'Next'}</Button>}
    </nav>
  </div>;
}

type AnswerProps = { id: QuestionId; draft: Draft; set: (patch: Partial<Draft>) => void; invalid: boolean; errorId?: string; onPicked: () => void };
/** The controls for one question. */
function Answer({ id, draft, set, invalid, errorId, onPicked }: AnswerProps) {
  const described = { 'aria-invalid': invalid || undefined, 'aria-describedby': errorId };
  switch (id) {
    case 'hotbot': return <>
      <div className={o.qChoices} role="radiogroup" aria-labelledby="join-hotbot" {...described}>
        <Choice checked={draft.holds === true} onPick={event => { set({ holds: true }); const section = event.currentTarget.closest('section'); requestAnimationFrame(() => section?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })); }} icon={<Flame/>} color="var(--ember)" name="Yes, I hold $HOTBOT" text="Paste the wallet that holds it."/>
        <Choice checked={draft.holds === false} onPick={() => { set({ holds: false }); onPicked(); }} icon={<X/>} name="Not yet" text="That’s fine."/>
      </div>
      {draft.holds !== true && <a className={`${o.link} ${o.buy}`} href={`https://pump.fun/coin/${HOTBOT_MINT}`} target="_blank" rel="noopener noreferrer"><img src="/icons/launchpads/pumpfun.webp" alt="" width={16} height={16}/>Buy $HOTBOT on Pump.fun<ArrowUpRight aria-hidden/></a>}
      <Collapsible open={draft.holds === true}><CollapsibleContent><div className={o.reveal}>
        <WalletField value={draft.wallet} onChange={wallet => set({ wallet })} invalid={invalid && draft.holds === true} errorId={errorId}/>
      </div></CollapsibleContent></Collapsible>
    </>;
    case 'x': return <HandleField value={draft.x} onChange={x => set({ x })} normalize={xHandle} placeholder="handle or x.com link" label="X handle" {...{ invalid, errorId }}/>;
    case 'telegram': return <HandleField value={draft.telegram} onChange={telegram => set({ telegram })} normalize={telegramHandle} placeholder="handle or t.me link" label="Telegram handle" {...{ invalid, errorId }}/>;
    case 'terminals': {
      const picked = new Map(draft.terminals.map(row => [row.id, row.handle]));
      const toggle = (terminal: TerminalId) => set({ terminals: picked.has(terminal) ? draft.terminals.filter(row => row.id !== terminal) : [...draft.terminals, { id: terminal, handle: '' }] });
      return <>
        <div className={o.qChoices} role="radiogroup" aria-labelledby="join-terminals" {...described}>
          <Choice checked={draft.trades === true} onPick={() => set({ trades: true })} icon={<Rocket/>} color="var(--info)" name="Yes" text="Pick them below."/>
          <Choice checked={draft.trades === false} onPick={() => { set({ trades: false }); onPicked(); }} icon={<X/>} name="No" text="That’s fine."/>
        </div>
        <Collapsible open={draft.trades === true}><CollapsibleContent><div className={o.reveal}>
          <div className={o.terms} role="group" aria-label="Terminals you trade on">
            {TERMINALS.map(terminal => <button type="button" key={terminal.id} className={o.term} aria-pressed={picked.has(terminal.id)} onClick={() => toggle(terminal.id)}>
              <img src={terminal.icon} alt="" width={38} height={38} decoding="async"/><span>{terminal.name}</span><i className={o.termCheck} aria-hidden><Check/></i>
            </button>)}
          </div>
          {TERMINALS.filter(terminal => picked.has(terminal.id)).map(terminal => <label key={terminal.id} className={o.termRow}>
            <img src={terminal.icon} alt="" width={32} height={32}/>
            <input className={o.field} value={picked.get(terminal.id) ?? ''} maxLength={APPLICATION.terminalHandle} placeholder={`Your ${terminal.name} name or link (optional)`} aria-label={`Your ${terminal.name} name or link`} autoComplete="off" autoCapitalize="off" spellCheck={false}
              onChange={event => set({ terminals: draft.terminals.map(row => row.id === terminal.id ? { ...row, handle: event.target.value } : row) })}/>
          </label>)}
        </div></CollapsibleContent></Collapsible>
      </>;
    }
    case 'experience': return <div className={o.qChoices} role="radiogroup" aria-labelledby="join-experience" {...described}>
      {EXPERIENCE.map((row, index) => {
        const Icon = [Sprout, Footprints, TrendingUp, Crown][index], color = ['var(--positive)', 'var(--info)', 'var(--warning)', 'var(--ember)'][index];
        return <Choice key={row.id} checked={draft.experience === row.id} onPick={() => { set({ experience: row.id }); onPicked(); }} icon={<Icon/>} color={color} name={row.name} text={row.text}/>;
      })}
    </div>;
    case 'tools': return <div className={o.picks} role="group" aria-labelledby="join-tools">
      {TOOLS.map(row => { const on = !draft.noTools && draft.tools.includes(row.id); return <button type="button" key={row.id} className={o.pick} aria-pressed={on}
        onClick={() => set({ noTools: false, tools: on ? draft.tools.filter(tool => tool !== row.id) : [...draft.tools, row.id] })}>{on && <Check/>}{row.name}</button>; })}
      <button type="button" className={o.pick} aria-pressed={draft.noTools} onClick={() => set({ noTools: !draft.noTools, tools: [] })}>{draft.noTools && <Check/>}None yet</button>
    </div>;
    case 'toolsUsed': return <textarea data-autofocus className={o.describe} value={draft.toolsUsed} maxLength={APPLICATION.toolsUsed} onChange={event => set({ toolsUsed: event.target.value })}
      placeholder="Dexscreener, Bubblemaps, a Telegram bot…" aria-labelledby="join-toolsUsed" {...described}/>;
    case 'comment': return <>
      <div className={o.handle} data-invalid={invalid || undefined}>
        <Link2 aria-hidden/>
        <input data-autofocus value={draft.comment} maxLength={APPLICATION.comment} onChange={event => set({ comment: event.target.value })} placeholder="Link to your comment" aria-label="Link to your comment" aria-invalid={invalid || undefined} aria-describedby={errorId}
          autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" enterKeyHint="done"/>
        <Paste onPaste={comment => set({ comment })}/>
      </div>
      <a className={`${o.link} ${o.buy}`} href={APPLICATION_POST} target="_blank" rel="noopener noreferrer">Open the application post<ArrowUpRight aria-hidden/></a>
    </>;
    case 'why': {
      const length = draft.why.trim().length;
      return <>
        <textarea data-autofocus className={o.describe} value={draft.why} maxLength={APPLICATION.why + 40} onChange={event => set({ why: event.target.value })}
          placeholder="I trade new launches every day and want a team that never sleeps…" aria-labelledby="join-why" {...described}/>
        <span className={o.count} data-over={length > APPLICATION.why || undefined} aria-live="polite">{length} / {APPLICATION.why}</span>
      </>;
    }
  }
}

/** One answer of a single-choice question: the onboarding's option row. */
function Choice({ checked, onPick, icon, color = 'var(--foreground)', name, text }: { checked: boolean; onPick: (event: SyntheticEvent<HTMLElement>) => void; icon: ReactNode; color?: string; name: string; text: ReactNode }) {
  return <div role="radio" tabIndex={0} aria-checked={checked} className={o.option} onClick={onPick} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onPick(event); } }}>
    <span className={o.icon} style={tint(color)}>{icon}</span>
    <span className={o.optionText}><strong>{name}</strong><span>{text}</span></span>
    <span className={o.radio}/>
  </div>;
}

function Paste({ onPaste }: { onPaste: (text: string) => void }) {
  return <button type="button" className={o.paste} onClick={async event => {
    const field = event.currentTarget.parentElement?.querySelector('input');
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) onPaste(text); else field?.focus(); } catch { field?.focus(); }
  }}><ClipboardPaste aria-hidden/>Paste</button>;
}

/** An X or Telegram handle: "@" in front, links and a typed "@" trimmed to the handle as they arrive. */
function HandleField({ value, onChange, normalize, placeholder, label, invalid, errorId }: { value: string; onChange: (value: string) => void; normalize: (text: string) => string; placeholder: string; label: string; invalid: boolean; errorId?: string }) {
  const take = (text: string) => onChange(/[/.]/.test(text) && normalize(text) ? normalize(text) : text.replace(/^\s*@/, ''));
  return <div className={o.handle} data-invalid={invalid || undefined}>
    <b aria-hidden>@</b>
    <input data-autofocus value={value} onChange={event => take(event.target.value)} placeholder={placeholder} aria-label={label} aria-invalid={invalid || undefined} aria-describedby={errorId}
      autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" maxLength={80}/>
    <Paste onPaste={take}/>
  </div>;
}

type Read = { address: string } & ({ state: 'reading' } | { state: 'read'; hotbot: number; sol: number } | { state: 'failed' });
/** The wallet that holds $HOTBOT. A full address is read at once and its balances shown; submitting reads them again on the server. */
function WalletField({ value, onChange, invalid, errorId }: { value: string; onChange: (value: string) => void; invalid: boolean; errorId?: string }) {
  const readWallet = useAction(api.applications.wallet), [read, setRead] = useState<Read | null>(null);
  const take = (text: string) => {
    onChange(text);
    const address = text.trim();
    if (!isSolanaAddress(address) || read?.address === address) return;
    setRead({ address, state: 'reading' });
    const settle = (next: Read) => setRead(current => current?.address === address ? next : current);
    readWallet({ address }).then(balances => settle({ address, state: 'read', ...balances }), () => settle({ address, state: 'failed' }));
  };
  const shown = read?.address === value.trim() ? read : null, holds = shown?.state === 'read' && shown.hotbot > 0;
  return <>
    <div className={o.handle} data-invalid={invalid || undefined}>
      <Wallet aria-hidden/>
      <input data-autofocus className={o.address} value={value} onChange={event => take(event.target.value)} placeholder="Solana wallet address" aria-label="Wallet address" aria-invalid={invalid || undefined} aria-describedby={errorId}
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" maxLength={60}/>
      <Paste onPaste={take}/>
    </div>
    {shown && <span className={o.holding} data-tone={holds ? 'ember' : undefined} role="status">
      {shown.state === 'reading' ? <><LoaderCircle className={o.spin} aria-hidden/>Reading wallet</>
        : shown.state === 'failed' ? 'Couldn’t read this wallet right now. We’ll check it after you send.'
        : <>{holds ? <Flame aria-hidden/> : <Wallet aria-hidden/>}{holds ? <b>{formatNumber(shown.hotbot, { compact: true })} $HOTBOT</b> : 'No $HOTBOT in this wallet'}<span>· {formatNumber(shown.sol, { precision: 2 })} SOL</span></>}
    </span>}
  </>;
}

/** Sparks thrown out from behind the team when the application lands. */
const SPARKS = Array.from({ length: 14 }, (_, index) => {
  const angle = (index / 14) * Math.PI * 2 - Math.PI / 2, reach = 80 + (index % 3) * 26;
  return { '--x': `${Math.round(Math.cos(angle) * reach)}px`, '--y': `${Math.round(Math.sin(angle) * reach * 0.8)}px`, animationDelay: `${0.25 + (index % 4) * 0.05}s` } as CSSProperties;
});

function Sent({ draft, again, onEdit }: { draft: Draft; again: boolean; onEdit: () => void }) {
  const x = xHandle(draft.x), telegram = telegramHandle(draft.telegram);
  return <section className={o.sent} aria-labelledby="join-sent">
    <div className={o.sentCrew}>
      {SPARKS.map((style, index) => <i key={index} className={o.spark} style={style} aria-hidden/>)}
      <BotAvatar role="research" size={58}/><BotAvatar role="coordinator" size={92}/><BotAvatar role="trader" size={58}/>
    </div>
    <span className={o.livePill} data-on><Check size={14} aria-hidden/>{again ? 'Application updated' : 'Application sent'}</span>
    <h1 className={o.title} id="join-sent">You’re on the list.</h1>
    <p className={o.lead}>We read every application. If you get in, we’ll message you.</p>
    <div className={o.sentHandles}>{x && <span><small>X</small>@{x}</span>}{telegram && <span><small>Telegram</small>@{telegram}</span>}</div>
    <div className={o.actions}>
      <Button asChild size="lg" className={o.cta}><Link href="/">Back to HOTBOT</Link></Button>
      <button type="button" className={o.link} onClick={onEdit}>Change my answers</button>
    </div>
  </section>;
}
