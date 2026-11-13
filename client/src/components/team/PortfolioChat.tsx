"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { useAction, useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { toast } from 'sonner';
import { Archive, ArrowUp, Check, ChevronRight, HandCoins, Hourglass, LoaderCircle, Pause, Play, RotateCcw, SlidersHorizontal, WandSparkles, X } from 'lucide-react';
import { api, usePaginatedQuery, useQuery } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { useDictation } from '@/hooks/useDictation';
import { CHAT, LIMIT_KEYS, raisesRisk, type LimitsChange } from '../../../../types/portfolioChat';
import { AUTONOMY_TEXT, LIMIT_TEXT, SettingName, loadout, useAct, type PageData } from './Portfolios';
import { MicButton } from './MicButton';
import { CoinPill, Loading, useNow } from './Parts';
import { Paged } from './Stream';
import { appHref, signedSol, sol, tone } from './format';
import { failure, readOnly, viewAsAtom, viewedAtom } from './state';
import s from './team.module.css';
import { Link, useRouter } from '@/lib/appNavigation';

export type ChatMessage = FunctionReturnType<typeof api.portfolio.chat.messages>['page'][number];
type Proposal = ChatMessage['proposals'][number];
type LimitKey = typeof LIMIT_KEYS[number];

const limitValue = (key: LimitKey, change: LimitsChange) => {
  const value = change[key];
  return value === undefined ? '—' : key === 'autonomy' ? AUTONOMY_TEXT[value as keyof typeof AUTONOMY_TEXT].label : key === 'tradesPerDay' ? String(value) : key === 'stopAllSol' && value === 0 ? 'Off' : sol(value as number, 2);
};
/** What a new limit does, as a value: the room a stop floor leaves under the worth now (or that it sells everything now), and who decides
 *  each trade. Null for a limit whose value says it all. */
const limitResult = (key: LimitKey, change: LimitsChange, worth: number | null) => {
  if (key === 'autonomy') return change.autonomy === 'full' ? 'No asks' : change.autonomy === 'ask' ? 'Asks every trade' : 'Asks past limits';
  if (key !== 'stopAllSol' || change.stopAllSol === undefined) return null;
  return change.stopAllSol <= 0 ? 'No floor' : worth == null ? null : worth <= change.stopAllSol ? 'Sells everything now' : `${sol(worth - change.stopAllSol, 2)} room`;
};
const STATUS_FACE = { paused: { Icon: Pause, title: 'Pause it' }, running: { Icon: Play, title: 'Run it again' }, archived: { Icon: Archive, title: 'Archive it' } } as const;

/** One proposal: what it changes as values, then Dismiss and Apply. A limits change that lets HOTBOT risk more (`raisesRisk`) gets the
 *  warning tint. A mandate is drafted first and then started as a new portfolio. Once answered, it keeps what the tap did; an open one past
 *  `CHAT.proposalMs` can no longer be applied. `viewed` (an admin viewing someone's team) shows no buttons. */
function Offer({ messageId, at, proposal, data, now, viewed }: { messageId: ChatMessage['id']; at: number; proposal: Proposal; data: PageData; now: number; viewed: boolean }) {
  const answer = useMutation(api.portfolio.chat.answer), draft = useAction(api.portfolio.chat.draft), act = useAct(), router = useRouter();
  const [busy, setBusy] = useState<'apply' | 'dismiss' | null>(null);
  const state = proposal.state === 'open' && now > 0 && at + CHAT.proposalMs <= now ? 'expired' : proposal.state;
  const tap = async (apply: boolean) => {
    if (busy) return;
    setBusy(apply ? 'apply' : 'dismiss');
    if (apply && proposal.kind === 'mandate' && !proposal.draft) { await act(() => draft({ messageId, proposalId: proposal.id })); setBusy(null); return; }
    const done = await act(() => answer({ messageId, proposalId: proposal.id, apply }));
    setBusy(null);
    if (!done) return;
    if (done.state === 'dismissed') { if (done.why) toast(done.why); return; }
    if (proposal.kind === 'status' && proposal.to === 'archived') router.push(appHref('portfolios'));
    else if (done.portfolioId) router.push(appHref('portfolios', done.portfolioId));
  };

  let Icon = SlidersHorizontal, title: ReactNode, values: ReactNode = null, apply = 'Apply', tiles = false, risk = false;
  switch (proposal.kind) {
    case 'limits': {
      title = 'New limits';
      const worth = data.book.value;
      const keys = LIMIT_KEYS.filter(key => proposal.to[key] !== undefined);
      risk = keys.some(key => raisesRisk(key, proposal.from[key], proposal.to[key]));
      values = keys.map(key => {
        const result = state === 'open' ? limitResult(key, proposal.to, worth) : null;
        return <span key={key} data-risk={raisesRisk(key, proposal.from[key], proposal.to[key]) || undefined}><small><SettingName name={LIMIT_TEXT[key].label} note={LIMIT_TEXT[key].note}/></small><b>{limitValue(key, proposal.from)} → {limitValue(key, proposal.to)}</b>{result && <em>{result}</em>}</span>;
      });
      break;
    }
    case 'status': ({ Icon, title } = STATUS_FACE[proposal.to]); break;
    case 'mandate':
      Icon = WandSparkles;
      if (proposal.draft) {
        title = <>{proposal.draft.name}<span className={s.pill} data-tone="ember">Draft</span></>;
        values = <>{loadout(proposal.draft.mandate).map(([label, value, note]) => <span key={label}><small><SettingName name={label} note={note}/></small><b>{value}</b></span>)}{proposal.draft.fits.length > 0 && <CoinPill coins={proposal.draft.fits}/>}</>;
        apply = 'Start portfolio'; tiles = true;
      } else { title = 'New portfolio from your words'; values = <q className={s.folioOfferWords}>{proposal.words}</q>; apply = 'Draft it'; }
      break;
    case 'sell': {
      Icon = HandCoins;
      const coin = data.coins.find(row => row.id === proposal.coin.id), worth = coin && data.solUsd > 0 ? coin.position.qty * coin.mark.priceUsd / data.solUsd : null;
      title = <>{proposal.part >= 1 ? 'Sell all of' : `Sell ${Math.round(proposal.part * 100)}% of`}<CoinPill coins={[proposal.coin]}/></>;
      values = proposal.done?.sol != null ? <span><small>Sold for</small><b>{sol(proposal.done.sol, 3)}</b>{proposal.done.pnlSol != null && <b className={s[tone(proposal.done.pnlSol, 3) ?? 'muted']}>{signedSol(proposal.done.pnlSol, 3)}</b>}</span>
        : worth != null && state === 'open' ? <span><small>About</small><b>{sol(worth * Math.min(1, proposal.part), 2)}</b></span> : null;
      break;
    }
    case 'keep':
      Icon = Hourglass;
      title = <>Keep<CoinPill coins={[proposal.coin]}/></>;
      break;
  }
  return <li className={s.folioOffer} data-state={state} data-risk={risk || undefined} aria-busy={busy !== null || undefined}>
    <span className={s.folioOfferIcon} aria-hidden><Icon/></span>
    <span className={s.folioOfferBody}><b>{title}</b>{values && <span className={s.folioOfferValues} data-tiles={tiles || undefined}>{values}</span>}</span>
    <span className={s.folioOfferFoot}>
      {state === 'open' ? viewed ? <span className={s.pill}>Open</span> : <>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void tap(false)}>{busy === 'dismiss' ? <LoaderCircle className="animate-spin"/> : <X/>}Dismiss</Button>
        <Button size="sm" disabled={busy !== null} onClick={() => void tap(true)}>{busy === 'apply' ? <LoaderCircle className="animate-spin"/> : proposal.kind === 'mandate' && proposal.draft ? <Play/> : <Check/>}{apply}</Button>
      </> : state === 'applied' ? <>
        <span className={s.pill} data-tone="ember"><Check aria-hidden/>Applied</span>
        {proposal.done?.portfolioId && <Button size="sm" variant="secondary" asChild><Link href={appHref('portfolios', proposal.done.portfolioId)}>Open<ChevronRight/></Link></Button>}
      </> : <span className={s.pill} title={proposal.why}>{state === 'expired' ? 'Expired' : 'Dismissed'}</span>}
    </span>
  </li>;
}

/** One of HOTBOT's answers: its words, then its proposals. */
function Answer({ message, data, now, viewed }: { message: ChatMessage; data: PageData; now: number; viewed: boolean }) {
  return <div className={s.folioChatAgent}>
    <BotAvatar role="coordinator" size={28}/>
    <div>
      <p>{message.text}</p>
      {message.proposals.length > 0 && <ul className={s.folioOffers} aria-label="Proposals">{message.proposals.map(proposal => <Offer key={proposal.id} messageId={message.id} at={message.at} proposal={proposal} data={data} now={now} viewed={viewed}/>)}</ul>}
    </div>
  </div>;
}

/** The portfolio's chat with HOTBOT: the thread, each answer's proposals as cards that apply with one tap, and a composer with the mic. It
 *  reads only while its tab is open: the newest `CHAT.page` messages live, older pages as the reader scrolls up (`Paged`). The lesson ids
 *  each turn returns go back with the next one, so a visit ranks the team's lessons once. The composer shows the day's messages left only
 *  under `CHAT.fewLeft`. `sample` stands in for the thread on /dev/portfolio. */
export function PortfolioChat({ data, sample }: { data: PageData; sample?: ChatMessage[] }) {
  const as = useAtomValue(viewAsAtom), viewed = useAtomValue(viewedAtom);
  const pages = usePaginatedQuery(api.portfolio.chat.messages, sample ? 'skip' : { id: data.id, ...as }, { initialNumItems: CHAT.page });
  const live = useMemo(() => pages.status === 'LoadingFirstPage' ? undefined : [...pages.results].reverse(), [pages.status, pages.results]);
  const left = useQuery(api.portfolio.chat.left, sample || viewed ? 'skip' : {}), lessons = useRef<string[] | undefined>(undefined);
  const rows = sample ?? live, send = useAction(api.portfolio.chat.send), now = useNow(30_000), thread = useRef<HTMLDivElement>(null), landed = useRef(false);
  const [text, setText] = useState(''), [error, setError] = useState<string | null>(null);
  // The sent message shows at once and stays until the thread holds the saved turn (`after` is the newest seq when it was sent).
  const [pending, setPending] = useState<{ text: string; after: number; done?: boolean } | null>(null);
  const dictation = useDictation(words => setText(previous => previous.trim() ? `${previous.trimEnd()} ${words}` : words));
  const newest = rows?.at(-1)?.seq ?? 0, waiting = pending !== null && !(pending.done && newest > pending.after);
  // The thread opens at its end and follows each new message; a tap on an older proposal leaves it where it is.
  const loaded = rows !== undefined;
  useEffect(() => {
    const box = thread.current;
    if (!box || !loaded) return;
    box.scrollTo({ top: box.scrollHeight, behavior: landed.current && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    landed.current = true;
  }, [loaded, newest, waiting, error]);

  const submit = async (value: string) => {
    const ask = value.trim();
    if (!ask || waiting || rows === undefined) return;
    if (viewed) { toast.error(readOnly(viewed)); return; }
    dictation.stop();
    setError(null); setText(''); setPending({ text: ask, after: newest });
    // A turn that saved nothing (the portfolio left meanwhile) has no row to wait for.
    try {
      const done = await send({ id: data.id, text: ask, ...(lessons.current ? { lessons: lessons.current } : {}) });
      lessons.current = done.lessons;
      setPending(previous => previous && done.id ? { ...previous, done: true } : null);
    }
    catch (cause) { setPending(null); setError(failure(cause).message); setText(previous => previous.trim() ? previous : ask); }
  };

  if (rows === undefined) return <section className={`${s.surface} ${s.folioChat}`} aria-label="Chat"><Loading rows={3}/></section>;
  const held = data.coins.find(coin => coin.status === 'held'), few = left != null && left < CHAT.fewLeft;
  const asks = [held ? `Why do you hold ${held.symbol}?` : 'What are you looking for?', 'What have you learned so far?', 'What should I change?'];
  return <section className={`${s.surface} ${s.folioChat}`} aria-label={`Chat about ${data.name}`}>
    <div ref={thread} className={s.folioChatThread} role="log" aria-live="polite" aria-busy={waiting}>
      {rows.length === 0 && !waiting ? <div className={s.folioChatEmpty}>
        <BotAvatar role="coordinator" size={56}/>
        <b>Ask me about {data.name}</b>
        <span className={s.folioChatAsks}>{asks.map(ask => <Button key={ask} size="sm" variant="secondary" className="rounded-full" onClick={() => void submit(ask)}>{ask}</Button>)}</span>
      </div> : <Paged edge="start" className={s.folioChatPages} status={sample ? 'Exhausted' : pages.status} onMore={() => pages.loadMore(CHAT.page)}>
        {rows.map(message => message.role === 'person' ? <p key={message.id} className={s.folioChatMine}>{message.text}</p> : <Answer key={message.id} message={message} data={data} now={now} viewed={Boolean(viewed)}/>)}
      </Paged>}
      {waiting && pending && <>
        <p className={s.folioChatMine} data-pending>{pending.text}</p>
        <div className={s.folioChatAgent} role="status" aria-label="HOTBOT is answering"><BotAvatar role="coordinator" size={28} mood="scan"/><span className={s.folioChatTyping} aria-hidden><i/><i/><i/></span></div>
      </>}
      {error && <div className={s.folioChatError} role="alert"><span>{error}</span><Button size="xs" variant="outline" disabled={!text.trim()} onClick={() => void submit(text)}><RotateCcw/>Try again</Button></div>}
    </div>
    <form className={s.chatComposer} onSubmit={event => { event.preventDefault(); void submit(text); }}>
      <Textarea variant="composer" value={text} maxLength={CHAT.text} placeholder={`Ask about ${data.name}…`} aria-label="Message HOTBOT"
        onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(text); } }}/>
      <div className={s.composerTools}>
        <MicButton dictation={dictation}/>
        {few && <span className={`${s.pill} ${s.folioChatLeft}`} data-tone={left === 0 ? 'warn' : undefined} aria-label={`${left} messages left today`}>{left} left today</span>}
        <Button type="submit" size="icon" className="rounded-full" aria-label="Send" title="Send" disabled={!text.trim() || waiting || left === 0}>{waiting ? <LoaderCircle className="animate-spin"/> : <ArrowUp/>}</Button>
      </div>
    </form>
  </section>;
}
