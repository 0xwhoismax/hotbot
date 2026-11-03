"use client";
import { useAtomValue, useSetAtom } from 'jotai';
import { useMutation } from 'convex/react';
import { Ban, Brain, LoaderCircle, Pause, Play, X } from 'lucide-react';
import { api, useQuery, type Id } from '@/lib/convex';
import { MEMORY, MEMORY_LABELS } from '../../../../types/teamMemory';
import { Button } from '@/components/ui/button';
import { AvatarControls } from '@/components/account/AvatarControls';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import type { HomeData } from './data';
import { emailRevealedAtom, failToast, profileTargetAtom, useCommand, viewedAtom } from './state';
import { PracticeCard, TeamWallet } from './TeamWallet';
import { ModeSwitch, RealSolTermsButton } from './GoLive';
import { AccessCard } from './Access';
import { AgentKeys } from './AgentKeys';
import { ResearchKeys } from './ResearchKeys';
import { SettingRow } from './Parts';
import { ago } from './format';
import s from './team.module.css';

/** Personal identity, connected accounts, and the team's money: the wallet, practice and the pass in one column. In one column (phones) the
 *  wallet and practice come right under the profile (the stylesheet reorders the cards). */
export function AccountPage({ data }: { data: HomeData }) {
  const command = useCommand(), setProfileTarget = useSetAtom(profileTargetAtom), viewed = useAtomValue(viewedAtom);
  const live = data.workspace.mode === 'live';
  return <div className={`${s.page} ${s.accountPage}`}>
    <header className={s.accountHeader}><h1 className={s.title}>Account</h1>{!viewed && <RealSolTermsButton data={data}/>}</header>
    <ProfileHero data={viewed ? undefined : data}/>
    <div className={s.accountGrid}>
      <div className={s.accountStack}>
        <div className={s.accountStack} ref={setProfileTarget}/>
        <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="team-controls-title">
          <div className={s.accountCardHead}><span className={s.accountIcon}><Pause size={18}/></span><div className={s.grow}><h2 id="team-controls-title">You’re in control</h2><small>{data.workspace.halted ? 'Your team is stopped' : 'Step in whenever you need'}</small></div></div>
          <div className={s.accountActions}>
            <Button variant="secondary" onClick={() => command({ type: 'sellAll' })}>{live ? 'Sell live coins' : 'Sell practice coins'}</Button>
            {data.workspace.halted ? <Button variant="ember" onClick={() => command({ type: 'resumeAll' })}><Play/>Resume team</Button> : <Button variant="secondary" className={s.stopTeam} onClick={() => command({ type: 'stopAll' })}><Pause/>Stop both & sell</Button>}
          </div>
        </section>
        {!viewed && <Remembered/>}
        {!viewed && <AgentKeys/>}
        {!viewed && <ResearchKeys/>}
      </div>
      <div className={s.accountStack}>
        <TeamWallet data={data} modeSwitch={Boolean(viewed)} termsAction={false}/>
        <PracticeCard data={data}/>
        <AccessCard data={data}/>
      </div>
    </div>
  </div>;
}

export function BannedPage() {
  const setProfileTarget = useSetAtom(profileTargetAtom);
  return <div className={`${s.page} ${s.accountPage}`}>
    <h1 className="sr-only">Account</h1>
    <ProfileHero/>
    <div className={s.accountGrid}>
      <div className={s.accountStack} ref={setProfileTarget}/>
      <div className={s.accountStack}>
        <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="banned-title">
          <div className={s.accountCardHead}><span className={s.accountIcon}><Ban size={18}/></span><div className={s.grow}><h2 id="banned-title">Account banned</h2></div></div>
        </section>
      </div>
    </div>
  </div>;
}

/** The person, with the Practice / Real SOL switch at its bottom left (`data`: the own team's, which a page showing someone else's team leaves out). */
function ProfileHero({ data }: { data?: HomeData }) {
  // The crew shuts its eyes while the email shows.
  const mood = useAtomValue(emailRevealedAtom) ? 'shy' : undefined;
  return <section className={`${s.surface} ${s.profileHero}`} aria-label="Your profile">
    <div className={s.profilePerson}>
      <AvatarControls prominent/>
      {data && <ModeSwitch data={data}/>}
    </div>
    <div className={s.profileCrew} aria-hidden>
      <span className={s.crewOrbit}/><span className={s.crewOrbit}/>
      <div className={s.crewFlame}><BotAvatar role="coordinator" size={112} mood={mood} faceLeft/></div>
      <div className={s.crewClouds}><BotAvatar role="research" size={57} mood={mood}/><BotAvatar role="sniper" size={57} mood={mood}/><BotAvatar role="trader" size={57} mood={mood}/></div>
    </div>
  </section>;
}

/** What HOTBOT keeps from what the person tells it, which goes into its model calls for them (`team/memory`). Each row can be forgotten. */
function Remembered() {
  const facts = useQuery(api.team.memory.list, {}), forget = useMutation(api.team.memory.forget);
  const drop = async (id: Id<'teamMemories'>) => { try { await forget({ id }); } catch (cause) { failToast(cause, { call: 'team.memory.forget' }); } };
  return <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="remembered-title">
    <div className={s.accountCardHead}><span className={s.accountIcon}><Brain size={18}/></span><div className={s.grow}><h2 id="remembered-title">What HOTBOT remembers</h2>
      <small>{facts?.length ? `${facts.length} of ${MEMORY.max} · used in HOTBOT’s chat and your portfolios’ picks` : 'Used in HOTBOT’s chat and your portfolios’ picks'}</small></div></div>
    {facts === undefined ? <p className={s.empty}><LoaderCircle className="inline size-4 animate-spin"/></p>
      : facts.length ? <div>{facts.map(fact => <SettingRow key={fact.id} label={fact.text}
          sub={<>{MEMORY_LABELS[fact.kind]}{fact.count > 1 ? ` · said ${fact.count} times` : ''} · {ago(fact.seenAt) === 'now' ? 'just now' : ago(fact.seenAt) + ' ago'}</>}
          control={<Button size="icon-sm" variant="ghost" aria-label={`Forget: ${fact.text}`} title="Forget" onClick={() => void drop(fact.id)}><X/></Button>}/>)}</div>
      : <p className={s.empty}>Nothing yet. Tell HOTBOT what you like or avoid, such as “no dog coins” or “short answers”, and it keeps it here.</p>}
  </section>;
}
