'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Copy, Layers3, ShieldCheck, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BotPortrait, botInfo, type BotRole } from './BotPortrait';
import { CloudWorld } from './CloudWorld';
import { PlatformBrand } from './PlatformBrand';
import { FlameMark } from './FlameMark';
import { TokenSculpture } from './TokenSculpture';
import { MessagePreview, StrategyDemo, WorkspaceDemo } from './ProductDemos';
import s from './hotbot.module.css';

type LaunchLinks = { app: string | null; buy: string; contract: string };
const crew = ['research', 'sniper', 'hotbot', 'trader', 'launch'] as const;
const worlds = ['research', 'sniper', 'trader', 'launch'] as const;
const worldCopy = {
  research: { title: '47 tabs. Zero sleep.', description: 'Your eyes on the trenches. Checks wallets, holders, and liquidity across Strategy matches, so you’re not opening every token yourself.' },
  sniper: { title: 'Target acquired.', description: 'Watches entries across your Strategy matches. Waits for the conditions you set, then gets the trade ready.' },
  trader: { title: 'Emotionally overleveraged.', description: 'Handles execution with the wallet, size, and permissions you set. Uses the work already done, so you don’t have to rebuild each trade.' },
  launch: { title: 'Just one more launch.', description: 'Handles launches in its own lane. Prepares the token, wallet, and funding details while the other specialists keep working.' },
};

const pokeLines = {
  research: ['My alpha!', 'Not priced in!', 'Trust the thread.'],
  sniper: ['My entry!', 'Missed it!', 'Easy, degen.'],
  hotbot: ['Too hot!', 'Still cooking.', 'Easy, chief.'],
  trader: ['My leverage!', 'Liquidated!', 'That wick!'],
  launch: ['Abort!', 'Wrong button!', 'Not yet!'],
} as const;

function CrewMember({ role, index, interactive }: { role: BotRole; index: number; interactive: boolean }) {
  const sequence = useRef(0);
  const [reaction, setReaction] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(null), 1100);
    return () => clearTimeout(timer);
  }, [reaction]);
  const poke = () => {
    const id = ++sequence.current;
    setReaction({ id, text: pokeLines[role][(id - 1) % pokeLines[role].length] });
  };
  return <div className={`${s.crewMember} ${role === 'hotbot' ? s.crewLeader : ''}`} data-reacting={!!reaction} style={{ '--bot-color': botInfo[role].color, '--bot-delay': `${index * -.73}s` } as CSSProperties}>
    <div className={s.crewPortrait}><BotPortrait role={role} animated={interactive} decorative={interactive} reaction={reaction?.id}/></div>
    <span>{botInfo[role].name}</span><small>{botInfo[role].job}</small>
    {interactive && <>
      <div className={s.pokeCaption} role="status" aria-live="polite" aria-atomic="true">{reaction && <span key={reaction.id} className={s.pokeText}>{reaction.text}</span>}</div>
      <Button type="button" variant="ghost" className={s.crewPoke} aria-label={`Poke ${botInfo[role].name}`} onClick={poke}/>
    </>}
  </div>;
}

function Crew({ small = false }: { small?: boolean }) {
  return <div className={`${s.crew} ${small ? s.smallCrew : ''}`} data-ambient-motion aria-label="HOTBOT and its four specialists">
    {crew.map((role, index) => <CrewMember key={role} role={role} index={index} interactive={!small}/>)}
  </div>;
}

export function HotbotLanding({ links }: { links: LaunchLinks }) {
  const root = useRef<HTMLDivElement>(null);
  const worldSection = useRef<HTMLElement>(null);
  const [applyInView, setApplyInView] = useState(true);
  const [worldVisible, setWorldVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [dialog, setDialog] = useState<'launch' | 'token' | null>(null);
  const [world, setWorld] = useState<(typeof worlds)[number]>('trader');
  const [specialist, setSpecialist] = useState<BotRole>('hotbot');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      entry.target.setAttribute('data-motion-visible', String(entry.isIntersecting));
    }));
    element.querySelectorAll('[data-ambient-motion]').forEach(stage => observer.observe(stage));
    const visibility = () => { element.setAttribute('data-document-hidden', String(document.hidden)); setDocumentVisible(!document.hidden); };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.setAttribute('data-entered', 'true'); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    element.querySelectorAll('[data-reveal]').forEach(section => observer.observe(section));
    element.setAttribute('data-reveal-ready', 'true');
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const section = worldSection.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => setWorldVisible(entry.isIntersecting), { threshold: .2 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // The phone pill shows only while neither page Apply button (hero, closing) is on screen.
    const buttons = root.current?.querySelectorAll('[data-apply]');
    if (!buttons?.length) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      setApplyInView(visible.size > 0);
    });
    buttons.forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!worldVisible || !documentVisible) return;
    // Let each character's complete story play; a manual tab change restarts this timer.
    const timer = setInterval(() => {
      if (worldSection.current?.contains(document.activeElement) && document.activeElement?.matches(':focus-visible')) return;
      setWorld(current => worlds[(worlds.indexOf(current) + 1) % worlds.length]);
    }, 16000);
    return () => clearInterval(timer);
  }, [world, worldVisible, documentVisible]);
  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), 2200);
    return () => clearTimeout(timer);
  }, [copyState]);
  const copyContract = async () => {
    try { await navigator.clipboard.writeText(links.contract); setCopyState('copied'); }
    catch { setCopyState('error'); setDialog('token'); }
  };
  const scrollToSection = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    const hash = anchor?.getAttribute('href');
    const target = hash && hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (!target || !root.current?.contains(target)) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.pushState(null, '', hash);
  };
  const specialistDescription = specialist === 'hotbot'
    ? 'HOTBOT sends Strategy matches to the right specialists, keeps the work moving, and brings you in when something needs your attention.'
    : worldCopy[specialist].description;
  return <div ref={root} onClick={scrollToSection} className={`dark ${s.page}`} style={{ '--hot-brand': botInfo.hotbot.color } as CSSProperties}>
    <a className={s.skipLink} href="#hotbot-main">Skip to content</a>
    <header className={s.header}>
      <div className={s.navInner}>
        <a className={s.brand} href="#top" aria-label="HOTBOT home"><FlameMark/><span>hotbot</span></a>
        <nav className={s.navActions} aria-label="Main navigation"><a className={s.litepaperLink} href="/litepaper">Litepaper</a><Button asChild variant="outline"><a href="/join">APPLY</a></Button></nav>
      </div>
    </header>

    <main id="hotbot-main">
      <section id="top" className={s.hero}>
        <div className={s.heroAtmosphere} aria-hidden="true"/>
        <div className={s.heroCopy}><h1>Your private <span>trading team.</span></h1><p className={s.heroDescription}>Specialist bots working together wherever you trade.</p><p className={s.heroCapabilities}>research | snipe | trade | launch + more</p><div className={s.heroActions}><Button asChild variant="hotbot"><a href="/join" data-apply>APPLY FOR BETA ACCESS<ArrowRight/></a></Button><Button asChild variant="outline"><a href={links.buy} target="_blank" rel="noopener noreferrer">BUY TOKEN<ArrowUpRight/></a></Button></div></div>
        <Crew/>
        <div className={s.heroBottom}><a href="#hot" aria-label="Explore HOTBOT"><ArrowDown size={17}/></a></div>
      </section>

      <section id="hot" className={`${s.tokenSection} ${s.container}`} data-reveal>
        <div className={s.tokenCopy}><h2>Buy $HOTBOT<br/><span>on Pump.fun</span></h2><p>The token behind HOTBOT.<br/>Be part of what comes next.</p><div className={s.buttonRow}><Button asChild variant="hotbot"><a href={links.buy} target="_blank" rel="noopener noreferrer">BUY $HOTBOT<ArrowUpRight/></a></Button></div><button type="button" className={s.contractRow} onClick={copyContract} aria-label="Copy contract address"><PlatformBrand name="Pump.fun" compact/><span className={s.contractAddress}>{links.contract.slice(0, 6)}…{links.contract.slice(-6)}</span><span className={s.contractCopy} data-copied={copyState === 'copied'}>{copyState === 'copied' ? <Check/> : <Copy/>}{copyState === 'copied' ? 'COPIED' : 'COPY CA'}</span></button></div>
        <TokenSculpture/>
      </section>

      <section id="product" className={`${s.section} ${s.container} ${s.messageSection}`} data-reveal>
        <div className={s.sectionCopy}><h2>Message HOTBOT<br/><span>like your trading team.</span></h2><p>Tell HOTBOT what you want done, from desktop or mobile. Research a token, watch an entry, prepare a trade, or launch something.</p><p>HOTBOT gets the right specialists on it and brings you back in when something needs your attention.</p><a className={s.textLink} href="#strategies">Give HOTBOT your Strategy<ArrowRight size={17}/></a></div><MessagePreview/>
      </section>

      <section id="specialists" ref={worldSection} className={s.specialistsSection} data-reveal>
        <div className={`${s.container} ${s.centerHeading}`}><h2>Built different. <span>Up all night.</span></h2><p>Four specialists. <span className={s.worldSubtitle}>Questionable sleep schedules.</span></p></div>
        <Tabs value={world} onValueChange={value => setWorld(value as typeof world)} className="gap-0">
          <div className={s.worldTabs}><div className={s.worldTabGroup}><TabsList>{worlds.map(role => <TabsTrigger key={role} value={role} aria-label={botInfo[role].name} style={{ '--bot-color': botInfo[role].color } as CSSProperties}><BotPortrait role={role} className={s.worldTabIcon} decorative/><span className={s.fullRoleName}>{botInfo[role].name}</span><span className={s.shortRoleName} aria-hidden="true">{botInfo[role].name.replace("Bot", "")}</span></TabsTrigger>)}</TabsList></div></div>
          <TabsContent key={world} value={world} forceMount><CloudWorld role={world}/><div className={`${s.container} ${s.worldCaption}`}><span className={s.worldTagline}>{worldCopy[world].title}</span><div className={s.worldDescription}><p>{worldCopy[world].description}</p></div></div></TabsContent>
        </Tabs>
      </section>

      <section className={`${s.section} ${s.container}`} data-reveal>
        <div className={s.centerHeading}><h2>HOTBOT works<br/><span>wherever you trade.</span></h2><p>Keep using the trading tools you already use. Let HOTBOT handle the repetitive work between them.</p></div><WorkspaceDemo/>
      </section>

      <section id="strategies" className={`${s.section} ${s.container}`} data-reveal><StrategyDemo onActivate={() => { if (links.app) window.location.assign(links.app); else setDialog('launch'); }}/></section>

      <section className={`${s.section} ${s.container} ${s.orchestratorSection}`} data-reveal>
        <div className={s.teamNetwork} aria-label="HOTBOT coordinates four specialists">
          <svg className={s.teamConnections} viewBox="0 0 500 400" preserveAspectRatio="none" aria-hidden="true">{worlds.map((role, index) => <path key={role} d={`M170 200H210Q235 200 235 ${index < 2 ? 175 : 225}V${50 + index * 100 + (index < 2 ? 25 : -25)}Q235 ${50 + index * 100} 260 ${50 + index * 100}H295`} data-active={specialist === role || specialist === 'hotbot'} style={{ '--bot-color': botInfo[role].color } as CSSProperties}/>)}</svg>
          <div className={s.teamCoordinator}><BotPortrait role="hotbot" decorative/><strong>HOTBOT</strong><span>Your Strategy</span></div>
          <div className={s.networkJobs}>{worlds.map(role => <div key={role} className={s.networkJob} data-active={specialist === role || specialist === 'hotbot'} style={{ '--bot-color': botInfo[role].color } as CSSProperties}><BotPortrait role={role} decorative/><div><strong>{botInfo[role].name}</strong><span>{botInfo[role].job}</span></div><i/></div>)}</div>
        </div>
        <div className={s.sectionCopy}><h2>Give each specialist<br/><span>a job.</span></h2><div className={s.rolePicker} aria-label="Explore each specialist">{(['hotbot', ...worlds] as const).map(role => <Button key={role} variant={specialist === role ? 'secondary' : 'ghost'} size="sm" aria-pressed={specialist === role} onClick={() => setSpecialist(role)} style={{ '--bot-color': botInfo[role].color } as CSSProperties}>{role === 'hotbot' ? 'HOTBOT' : botInfo[role].name}</Button>)}</div><p className={s.specialistDescription} aria-live="polite">{specialistDescription}</p><div className={s.principles}><span><Check/>Multiple setups in progress</span><span><Check/>Findings shared between specialists</span><span><Check/>Your rules applied every time</span></div></div>
      </section>

      <section className={`${s.platformSection} ${s.container}`} data-reveal><div><h2 className={s.foundationBrand}>Built on <PlatformBrand name="ClawPump"/>.</h2><p>ClawPump gives the agents wallets and crypto capabilities. HOTBOT turns them into your private trading team.</p></div><div className={s.foundationFeatures}><span><ShieldCheck/>Wallets with your permissions</span><span><Layers3/>Market data for your setups</span><span><Workflow/>Swaps and token launches</span></div></section>

      <section className={s.finalSection} data-reveal><h2>Meet your<br/><span>trading team.</span></h2><p>You keep trenching. Your team handles the repetition.</p><Button asChild variant="hotbot"><a href="/join" data-apply>APPLY FOR BETA ACCESS<ArrowRight/></a></Button><Crew small/></section>
    </main>
    <footer className={`${s.footer} ${s.container}`}><a className={s.brand} href="#top"><FlameMark/><span>usehotbot<span className={s.brandSuffix}>.com</span></span></a><nav aria-label="Footer"><a href="#product">Product</a><a href="#specialists">The team</a><a href="#strategies">Strategies</a><a href="/litepaper">Litepaper</a></nav><small>© {new Date().getFullYear()} HOTBOT</small></footer>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent className={`dark ${s.landingDialog}`}>{dialog === 'launch' ? <><DialogHeader><DialogTitle>HOTBOT is coming soon</DialogTitle><DialogDescription>Your private trading team is getting ready. Check back soon.</DialogDescription></DialogHeader><Button variant="hotbot" onClick={() => setDialog(null)}>ok gotchu</Button></> : <><DialogHeader><DialogTitle>The $HOTBOT token</DialogTitle><DialogDescription>The official contract address on Pump.fun.</DialogDescription></DialogHeader><div className="space-y-3"><p className="break-all text-sm">{links.contract}</p><Button variant="outline" onClick={copyContract}>{copyState === 'copied' ? <Check/> : <Copy/>}{copyState === 'copied' ? 'Copied' : 'Copy contract'}</Button>{copyState === 'error' && <p className="text-sm text-muted-foreground">Copy wasn’t available. You can select the address above.</p>}</div><Button variant="outline" onClick={() => setDialog(null)}>Back to the team</Button></>}</DialogContent></Dialog>
    <a className={s.applyPill} href="/join" data-visible={!applyInView}>APPLY FOR BETA ACCESS<ArrowRight size={16}/></a>
  </div>;
}
