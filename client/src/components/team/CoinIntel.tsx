"use client";
import { useAtomValue } from 'jotai';
import { BadgeCheck, Eye, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { api, useQuery } from '@/lib/convex';
import s from './team.module.css';
import { ago, pct, tone, usd } from './format';
import { Hint, useNow } from './Parts';
import { viewAsAtom } from './state';
import type { IntelCallout, IntelHolder, IntelProfile, IntelThesis } from '../../../../types/coinIntel';

/** X handles are 1–15 letters, digits or underscores; anything else is not linked. */
const handle = (x?: string) => x && /^[A-Za-z0-9_]{1,15}$/.test(x) ? x : undefined;
/** The creator's DexScreener banner. Its socials and website stay in the coin's Links card, which already lists them. */
function Banner({ profile }: { profile: IntelProfile }) {
  return profile.header ? <div className={s.intelBanner}><img src={profile.header} alt="" loading="lazy" referrerPolicy="no-referrer"/></div> : null;
}

function Holder({ row, supply }: { row: IntelHolder; supply: number | null }) {
  const share = supply ? row.held / supply * 100 : null, x = handle(row.x);
  return <li className={s.intelHolder}>
    <span className={s.intelAvatar} aria-hidden>{(row.name || row.wallet).slice(0, 1).toUpperCase()}</span>
    <span className={s.intelWho}>
      <b>{row.name || row.wallet.slice(0, 4) + '…' + row.wallet.slice(-4)}{row.verified && <BadgeCheck aria-label="Verified on pump.fun"/>}</b>
      <small>{x ? <a href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer nofollow">@{x}</a> : row.wallet.slice(0, 4) + '…' + row.wallet.slice(-4)}{share != null && <> · {share < 0.01 ? '<0.01' : share.toFixed(2)}% of supply</>}</small>
    </span>
    <Hint text={`pump.fun's accounting: bought for ${usd(row.costUsd)}${row.realizedUsd ? `, ${usd(row.realizedUsd)} already taken` : ''}.`}>
      <span className={s.intelMoney}><b className={`${s.num} ${s[tone(row.pnlUsd) ?? 'muted']}`}>{row.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(row.pnlUsd))}</b><small className={s[tone(row.pnlPct) ?? 'muted']}>{pct(row.pnlPct)}</small></span>
    </Hint>
  </li>;
}

function Callout({ call, now }: { call: IntelCallout; now: number }) {
  const since = (call.multiple - 1) * 100, x = handle(call.x);
  return <li className={s.intelCallout}>
    <div className={s.intelCallHead}>
      <b>{call.name || call.wallet.slice(0, 4) + '…'}</b>
      {x && <a href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer nofollow">@{x}</a>}
      <span className={s.muted}>{now ? ago(call.at, now) : ''}</span>
    </div>
    <p>{call.text}</p>
    <div className={s.intelChips}>
      <Hint text={`Price now against the price at the call, which came at a ${usd(call.capUsd)} market cap. Best since: ×${call.maxMultiple.toFixed(2)}.`}><span className={`${s.intelChip} ${s[tone(since) ?? 'muted']}`}>{pct(since)} since the call</span></Hint>
      <span className={s.intelChip}><Heart aria-hidden/>{call.likes}<span className="sr-only"> likes</span></span>
      <span className={s.intelChip}><MessageCircle aria-hidden/>{call.replies}<span className="sr-only"> replies</span></span>
      <span className={s.intelChip}><Repeat2 aria-hidden/>{call.reposts}<span className="sr-only"> reposts</span></span>
      <span className={s.intelChip}><Eye aria-hidden/>{call.views}<span className="sr-only"> views</span></span>
    </div>
  </li>;
}

/** A Fomo thesis: what a trader wrote with a trade, their position now, and its reach. */
function Thesis({ row, now }: { row: IntelThesis; now: number }) {
  const x = handle(row.x);
  return <li className={s.intelCallout}>
    <div className={s.intelCallHead}>
      <b>{row.name || row.handle}{row.verified && <BadgeCheck aria-label="Verified on Fomo"/>}</b>
      {x ? <a href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer nofollow">@{x}</a> : row.handle ? <span className={s.muted}>@{row.handle}</span> : null}
      <span className={s.muted}>{now ? ago(row.at, now) : ''}</span>
    </div>
    <p>{row.text}</p>
    <div className={s.intelChips}>
      {(row.positionUsd >= 1 || Math.abs(row.pnlUsd) >= 1) && <Hint text={`Their position on Fomo now, with its profit. They wrote this at a ${usd(row.capUsd)} market cap.`}>
        <span className={`${s.intelChip} ${s[tone(row.pnlUsd) ?? 'muted']}`}>{row.positionUsd >= 1 ? `holds ${usd(row.positionUsd)}` : 'sold'} · {row.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(row.pnlUsd))}</span>
      </Hint>}
      <span className={s.intelChip}><Heart aria-hidden/>{row.likes}<span className="sr-only"> likes</span></span>
      <span className={s.intelChip}><MessageCircle aria-hidden/>{row.replies}<span className="sr-only"> replies</span></span>
    </div>
  </li>;
}

/** What pump.fun, Fomo and DexScreener say about the coin: the creator's banner and links, the biggest pump.fun holders by name, and the callouts
 *  of people who still hold it, and Fomo's most liked theses. The agents service reads them (`convex/teamIntel.ts`) only for coins held or about to be bought (`active`).
 *  `trusted` is false for a coin research turned down, whose creator's banner is not shown. */
export function CoinIntel({ address, supply, trusted, active }: { address: string; supply: number | null; trusted: boolean; active: boolean }) {
  const intel = useQuery(api.teamIntel.coin, { address, ...useAtomValue(viewAsAtom) }), now = useNow(60_000);
  const pump = intel?.pump, fomo = intel?.fomo, readAt = Math.max(pump?.readAt ?? 0, fomo?.readAt ?? 0, intel?.profile?.readAt ?? 0);
  return <section className={`${s.surface} ${s.coinIntel}`} aria-label="Holders and callouts">
    <div className={s.sectionHead}><h2>Holders and callouts{pump?.users ? <small>{pump.users.toLocaleString('en-US')} pump.fun users hold it</small> : null}</h2>{readAt > 0 && now > 0 && <span>{ago(readAt, now) === 'now' ? 'Read just now' : `Read ${ago(readAt, now)} ago`}</span>}</div>
    {intel === undefined ? <p className={s.empty}>Loading…</p>
      : intel === null ? <p className={s.empty}>{active ? 'Not read yet. HOTBOT reads pump.fun, Fomo and DexScreener within a few minutes of a pick or a buy.' : 'Not read. HOTBOT reads holders and callouts only for coins it holds or is about to buy.'}</p>
      : <>
        {trusted && intel.profile && <Banner profile={intel.profile}/>}
        {!pump?.users && !fomo?.count ? <p className={s.empty}>No pump.fun holders, callouts or Fomo theses for this coin yet.</p>
          : <div className={s.intelCols}>
            {pump?.users ? <div className={s.intelCol}>
              <h3>Biggest pump.fun holders</h3>
              <ul className={s.intelHolders}>{pump.holders.slice(0, 8).map(row => <Holder key={row.wallet} row={row} supply={supply}/>)}</ul>
            </div> : null}
            <div className={s.intelCol}>
              {pump?.users ? <>
                <h3>Callouts{pump.callouts.length ? <small>{pump.callouts.length}</small> : null}</h3>
                {pump.callouts.length ? <ul className={s.intelCallouts}>{pump.callouts.slice(0, 4).map(call => <Callout key={call.id} call={call} now={now}/>)}</ul>
                  : <p className={s.empty}>No callouts from current holders.</p>}
              </> : null}
              {fomo && <>
                <h3 className={s.intelSubhead}>On Fomo{fomo.count ? <small>{fomo.count.toLocaleString('en-US')} theses</small> : null}</h3>
                {fomo.theses.length ? <ul className={s.intelCallouts}>{fomo.theses.slice(0, 4).map(row => <Thesis key={row.id} row={row} now={now}/>)}</ul>
                  : <p className={s.empty}>No theses on Fomo yet.</p>}
              </>}
            </div>
          </div>}
      </>}
  </section>;
}
