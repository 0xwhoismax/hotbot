"use client";
import { useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Coins, LoaderCircle, LogOut, Pause, Play, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AvatarControls } from '@/components/account/AvatarControls';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { isAdminAtom } from '@/store/user/atoms';
import type { HomeData } from './data';
import { emailRevealedAtom, logoutAtom, profileTargetAtom, useCommand, viewedAtom } from './state';
import { TeamWallet } from './TeamWallet';
import { AgentKeys } from './AgentKeys';
import { signedSol, sol, tone } from './format';
import s from './team.module.css';

/** Personal identity with Log out at the profile card's bottom left, connected accounts, and the team's separate trading budget. In one column (phones) the team wallet
 *  and practice SOL come right under the profile (the stylesheet reorders the cards). */
export function AccountPage({ data }: { data: HomeData }) {
  const command = useCommand(), setProfileTarget = useSetAtom(profileTargetAtom), isAdmin = useAtomValue(isAdminAtom), viewed = useAtomValue(viewedAtom), logout = useAtomValue(logoutAtom);
  const live = data.workspace.mode === 'live';
  // The crew shuts its eyes while the email shows, and shakes its head while Log out is pointed at or focused.
  const [leaving, setLeaving] = useState(false), mood = useAtomValue(emailRevealedAtom) ? 'shy' : leaving ? 'worried' : undefined;
  return <div className={`${s.page} ${s.accountPage}`}>
    <h1 className="sr-only">Account</h1>
    <section className={`${s.surface} ${s.profileHero}`} aria-label="Your profile">
      <div className={s.profilePerson}>
        <AvatarControls prominent/>
        {logout && <Button variant="secondary" className={s.accountLogout} onClick={() => void logout.run()} onPointerEnter={() => setLeaving(true)} onPointerLeave={() => setLeaving(false)}
          onFocus={() => setLeaving(true)} onBlur={() => setLeaving(false)}><LogOut/>Log out</Button>}
      </div>
      <div className={s.profileCrew} aria-hidden>
        <span className={s.crewOrbit}/><span className={s.crewOrbit}/>
        <div className={s.crewFlame}><BotAvatar role="coordinator" size={112} mood={mood}/></div>
        <div className={s.crewClouds}><BotAvatar role="research" size={57} mood={mood}/><BotAvatar role="sniper" size={57} mood={mood}/><BotAvatar role="trader" size={57} mood={mood}/></div>
      </div>
    </section>
    <div className={s.accountGrid}>
      <div className={s.accountStack}>
        <div className={s.accountStack} ref={setProfileTarget}/>
        {!viewed && <PracticeMoney data={data} admin={isAdmin}/>}
      </div>
      <div className={s.accountStack}>
        <TeamWallet data={data}/>
        <section className={`${s.surface} ${s.accountCard} ${s.accountSafety}`} aria-labelledby="team-controls-title">
          <div className={s.accountCardHead}><span className={s.accountIcon}><Pause size={18}/></span><div className={s.grow}><h2 id="team-controls-title">You’re in control</h2><small>{data.workspace.halted ? 'Your team is stopped' : 'Step in whenever you need'}</small></div></div>
          <div className={s.accountActions}>
            <Button variant="secondary" onClick={() => command({ type: 'sellAll' })}>{live ? 'Sell live coins' : 'Sell practice coins'}</Button>
            {data.workspace.halted ? <Button variant="hotbot" onClick={() => command({ type: 'resumeAll' })}><Play/>Resume team</Button> : <Button variant="secondary" className={s.stopTeam} onClick={() => command({ type: 'stopAll' })}><Pause/>Stop both & sell</Button>}
          </div>
        </section>
        {!viewed && <AgentKeys/>}
      </div>
    </div>
  </div>;
}

/** On your own team: practice SOL added on top of the balance; admins also leave archived strategies' losses out of the totals. */
function PracticeMoney({ data, admin }: { data: HomeData; admin: boolean }) {
  const command = useCommand(), [text, setText] = useState('10'), [busy, setBusy] = useState(false), field = useRef<HTMLInputElement>(null);
  const amount = Number(text), valid = Number.isFinite(amount) && amount > 0;
  // HOTBOT's "Top up" (AlertToast) links here with #practice-sol: the amount is ready to type over.
  useEffect(() => {
    const focus = () => { if (window.location.hash === '#practice-sol') { field.current?.focus(); field.current?.select(); } };
    focus();
    window.addEventListener('hashchange', focus);
    return () => window.removeEventListener('hashchange', focus);
  }, []);
  const losses = data.archived.reduce((sum, row) => sum + Math.min(0, row.realizedPnlSol), 0), hide = data.workspace.hideArchivedLosses;
  async function add() {
    setBusy(true);
    if (await command({ type: 'addPaperSol', amountSol: amount }) !== false) toast.success(`Added ${sol(amount)} to practice`);
    setBusy(false);
  }
  return <section className={`${s.surface} ${s.accountCard} ${s.practiceMoney}`} aria-labelledby="practice-money-title">
    <div className={s.accountCardHead}><span className={s.accountIcon}><Coins size={18}/></span><div className={s.grow}><h2 id="practice-money-title">Practice SOL</h2><small>{sol(data.workspace.paperStartSol)} put in so far</small></div></div>
    <form className={s.inviteField} onSubmit={event => { event.preventDefault(); if (valid && !busy) void add(); }}>
      <Label htmlFor="practice-sol">Add practice SOL</Label>
      <div className={s.adminAdd}>
        <Input ref={field} id="practice-sol" type="number" min={0} step="any" inputMode="decimal" value={text} aria-invalid={!valid || undefined} onChange={event => setText(event.target.value)}/>
        <Button type="submit" disabled={!valid || busy}>{busy ? <LoaderCircle className="animate-spin"/> : <Plus/>}Add{valid ? ' ' + sol(amount) : ''}</Button>
      </div>
    </form>
    {admin && <label className={s.adminToggle}>
      <span className={s.grow}><b>Hide archived losses</b><small className={s[tone(losses) ?? 'muted']}>{losses < 0 ? signedSol(losses) : 'None'}</small></span>
      <Switch variant="accent" checked={hide} onCheckedChange={value => void command({ type: 'hideArchivedLosses', hide: value })}/>
      <span className={s.pill} data-tone="ember"><ShieldCheck size={12}/>Admin</span>
    </label>}
  </section>;
}
