'use client';

import { useId, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Droplets, ShieldCheck, SlidersHorizontal, UsersRound, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BotPortrait } from './BotPortrait';
import { PlatformBrand, platforms, type PlatformName } from './PlatformBrand';
import s from './hotbot.module.css';

const researchChecks = [
  { name: 'Holders', Icon: UsersRound },
  { name: 'Liquidity', Icon: Droplets },
  { name: 'Security', Icon: ShieldCheck },
] as const;
const strategySources = ['Pump.fun', 'Raydium', 'Jupiter'] as const;

/** Cropped captures of the real app's seeded conversation and composer. */
export function MessagePreview() {
  return <figure className={s.productCapture}>
    <div className={s.windowBar}><span className={s.windowBrand}><BotPortrait role="hotbot" decorative/>HOTBOT</span></div>
    <div className={s.conversationCapture}>
      <img src="/hotbot/screenshots/hotbot-conversation.webp" width="1250" height="394" loading="lazy" decoding="async" alt="Actual HOTBOT conversation: Keep entries at 0.25 SOL. I want to approve each trade. HOTBOT replies that Fresh Runners has an entry ready for approval and Patient Entries is watching POPCAT."/>
      <img src="/hotbot/screenshots/hotbot-composer.webp" width="1810" height="192" loading="lazy" decoding="async" alt="HOTBOT's app composer with conversation context, specialist selection and send control."/>
    </div>
  </figure>;
}

export function WorkspaceDemo() {
  return <>
    <div className={s.workspace}>
      <figure className={s.productCapture}>
        <div className={s.windowBar}><PlatformBrand name="Pump.fun" compact/></div>
        <div className={s.chartCapture}><img src="/hotbot/screenshots/pumpfun-fartcoin.webp" width="1918" height="878" loading="lazy" decoding="async" alt="Actual Pump.fun Fartcoin market, with the native candlestick chart, volume and TradingView controls."/></div>
      </figure>
      <figure className={`${s.productCapture} ${s.teamCapture}`}>
        <div className={s.windowBar}><span className={s.windowBrand}><BotPortrait role="hotbot" decorative/>HOTBOT</span></div>
        <img src="/hotbot/screenshots/hotbot-team.webp" width="640" height="635" loading="lazy" decoding="async" alt="Actual app team panel: HOTBOT, ResearchBot, SniperBot, TraderBot and LaunchBot, each with an assigned mission."/>
      </figure>
    </div>
    <div className={s.platforms} role="region" tabIndex={0} aria-label="Trading platforms">{platforms.map(name => <PlatformBrand key={name} name={name}/>)}</div>
  </>;
}

export function StrategyDemo({ onActivate }: { onActivate: () => void }) {
  const id = useId();
  const [source, setSource] = useState<PlatformName>('Pump.fun');
  const [cap, setCap] = useState('$50K – $2M');
  const [size, setSize] = useState('0.10');
  const [impact, setImpact] = useState('1%');
  const [autoRun, setAutoRun] = useState(false);
  const [checks, setChecks] = useState({ Holders: true, Liquidity: true, Security: true });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onActivate();
  };
  return <>
    <div className={s.strategySplit}>
      <div className={s.sectionCopy}><h2 className={s.strategyHeading}>Give HOTBOT your strategy.<br/><span>Multiply your edge.</span></h2><p>Choose what to watch, what has to pass, and what happens when something matches. Run your Strategy across more of the market while you keep trading.</p><div className={s.principles}><span><Check/>Cover more of the market</span><span><Check/>Keep your rules consistent</span><span><Check/>Skip the repetitive work</span></div></div>
      <form className={s.strategyForm} onSubmit={submit}>
        <div className={s.formHeader}><div><span className={s.smallLabel}>YOUR STRATEGY</span><h3>Fresh runners</h3></div><span className={s.formBadge} aria-hidden="true"><SlidersHorizontal size={19}/></span></div>
        <div className={s.formFields}>
          <div className={s.formField}><Label htmlFor={`${id}-source`}>Source</Label><Select value={source} onValueChange={value => setSource(value as PlatformName)}><SelectTrigger id={`${id}-source`} className="w-full"><SelectValue/></SelectTrigger><SelectContent className={`dark ${s.strategyMenu}`}>{strategySources.map(value => <SelectItem key={value} value={value}><PlatformBrand name={value} compact/></SelectItem>)}</SelectContent></Select></div>
          <div className={s.formField}><Label htmlFor={`${id}-cap`}>Market cap</Label><Select value={cap} onValueChange={setCap}><SelectTrigger id={`${id}-cap`} className="w-full"><SelectValue/></SelectTrigger><SelectContent className={`dark ${s.strategyMenu}`}>{['$50K – $2M', '$2M – $10M', '$10M+'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className={s.formField}><Label htmlFor={`${id}-size`}>Trade size · SOL</Label><Input id={`${id}-size`} type="number" min="0.01" max="100" step="0.01" value={size} onChange={event => setSize(event.target.value)} required/></div>
          <div className={s.formField}><Label htmlFor={`${id}-impact`}>Max price impact</Label><Select value={impact} onValueChange={setImpact}><SelectTrigger id={`${id}-impact`} className="w-full"><SelectValue/></SelectTrigger><SelectContent className={`dark ${s.strategyMenu}`}>{['1%', '2%', '3%'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <fieldset className={s.checks}><legend>Research checks</legend>{researchChecks.map(({ name, Icon }) => <div key={name} data-enabled={checks[name]}><Label htmlFor={`${id}-${name}`}><span className={s.checkIcon} aria-hidden="true"><Icon size={16}/></span>{name}</Label><Switch id={`${id}-${name}`} checked={checks[name]} onCheckedChange={value => setChecks(current => ({ ...current, [name]: value }))}/></div>)}</fieldset>
        <div className={s.autoRun} data-enabled={autoRun}><div><Label htmlFor={`${id}-auto`}><Zap size={16} aria-hidden="true"/>Auto-run</Label><p>{autoRun ? 'Allow trades inside your authorized rules.' : 'Ask before each trade.'}</p></div><Switch id={`${id}-auto`} checked={autoRun} onCheckedChange={setAutoRun}/></div>
        <Button variant="hotbot" type="submit">OPEN HOTBOT<ArrowUpRight/></Button>
      </form>
    </div>
  </>;
}
