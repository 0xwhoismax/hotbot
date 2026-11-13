"use client";
import { useState, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { LockKeyhole, Ticket } from 'lucide-react';
import { Link, useShellPathname } from '@/lib/appNavigation';
import { isAdminAtom } from '@/store/user/atoms';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ACCESS_TIERS, DAY_MS, HOTBOT_DECIMALS, RENEW_DAYS, USDC_MINT, accessOf, amountText, feeText, type Access } from '../../../../types/access';
import type { HomeData } from './data';
import { viewedAtom } from './state';
import { appHref } from './format';
import { InfoTip, useNow } from './Parts';
import s from './team.module.css';

export const tokens = (value: number) => Math.floor(value).toLocaleString('en-US');
/** A token amount a withdrawal moves (raw units): $HOTBOT in whole tokens, USDC in cents. */
export const tokenText = (token: { mint: string; raw: number }) =>
  token.mint === USDC_MINT ? `${amountText('USDC', token.raw)} USDC` : `${tokens(token.raw / 10 ** HOTBOT_DECIMALS)} $HOTBOT`;
/** Where the pass's $HOTBOT stake sits (types/access.ts). */
export const STAKE_WHERE = 'Your $HOTBOT stays in your HOTBOT wallet, locked while your pass runs.';
export const left = (ms: number) => ms >= 2 * DAY_MS ? `${Math.floor(ms / DAY_MS)}d` : ms >= 3_600_000 ? `${Math.floor(ms / 3_600_000)}h` : `${Math.max(1, Math.ceil(ms / 60_000))}m`;
export const day = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** The team's pass now, on this browser's clock (null before the clock runs): an admin's own team is always open; an admin viewing someone sees that person's. */
export function useAccess(data: HomeData | null | undefined) {
  const admin = useAtomValue(isAdminAtom), viewed = useAtomValue(viewedAtom), now = useNow(60_000);
  if (!data || !now) return null;
  const { paidUntil, freeUntil, tier, wallet, held } = data.workspace.access;
  return { access: accessOf({ paidUntil: paidUntil ?? undefined, freeUntil: freeUntil ?? undefined, tier: tier ?? undefined, wallet: wallet ?? undefined, held: held ?? undefined },
    data.workspace.wallet?.hotbot ?? 0, admin && !viewed, now), now };
}

/** The pass as a pill: how long it runs; a locked team and an admin's always-open team show none. */
export function AccessPill({ access, now }: { access: Access; now: number }) {
  if (access.why === 'admin' || !access.open) return null;
  const rest = access.until! - now;
  return <span className={s.pill} data-tone={rest < RENEW_DAYS * DAY_MS ? 'warn' : 'ember'}>{access.why === 'free' ? 'Free' : 'Pass'} · {left(rest)}</span>;
}

/** The pass's two figures: the fee and how long it runs, and the $HOTBOT stake against the tier's, locked in the HOTBOT wallet while the
 *  pass runs, or in the outside wallet that still counts for it. */
export function AccessTiles({ access, now }: { access: Access; now: number }) {
  const tier = ACCESS_TIERS[access.tier], paid = access.paidUntil !== null && access.paidUntil > now;
  return <div className={s.tiles}>
    <div className={s.tile} data-warn={(!paid && access.why !== 'free' && access.why !== 'admin') || undefined}>
      <small>Pass</small>
      <span className={s.tileValue}>{feeText(access.tier)}<em>/ {tier.days} days</em></span>
      {access.why !== 'admin' && <span className={s.tileHint}>{paid ? `Paid to ${day(access.paidUntil!)}` : access.why === 'free' ? `Free for ${left(access.until! - now)}` : access.paidUntil ? `Ended ${day(access.paidUntil)}` : 'Not paid'}</span>}
    </div>
    <div className={s.tile} data-warn={(access.short > 0 && access.why !== 'admin') || undefined}>
      <small>$HOTBOT stake<InfoTip text={STAKE_WHERE} label="the $HOTBOT stake"/></small>
      <span className={s.tileValue}>{tokens(access.hotbot)}<em>/ {tokens(access.stake)}</em></span>
      <div className={s.meter} data-tone={access.short ? undefined : 'ember'}><i style={{ '--fill': Math.min(1, access.hotbot / access.stake) } as CSSProperties}/></div>
      {access.outside ? <span className={s.tileHint}>In {short(access.outside)}</span> : access.locked > 0 && <span className={s.tileHint}>Locked to {day(access.paidUntil!)}</span>}
    </div>
  </div>;
}

/** Over every page but Account: the team is locked (or its pass ends soon), with the pass at a glance and the way to Account → Access. It asks
 *  once a session for each state. */
export function AccessGate({ data }: { data: HomeData }) {
  const state = useAccess(data), pathname = useShellPathname(), viewed = useAtomValue(viewedAtom), [seen, setSeen] = useState<string | null>(null);
  if (!state || viewed) return null;
  const { access, now } = state, ending = access.open && access.why !== 'admin' && access.until! - now < RENEW_DAYS * DAY_MS;
  const key = !access.open ? `locked:${access.why}` : ending ? `ending:${access.why}` : null;
  const open = key !== null && seen !== key && pathname !== appHref('account');
  return <Dialog open={open} onOpenChange={next => { if (!next) setSeen(key); }}>
    <DialogContent className="sm:max-w-[28rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}>{access.open ? <Ticket size={18}/> : <LockKeyhole size={18}/>}</span><span className={s.grow}>
          <DialogTitle asChild><b>{access.open ? `${access.why === 'free' ? 'Free days end' : 'Pass ends'} in ${left(access.until! - now)}` : access.why === 'stake' ? 'Add $HOTBOT' : 'Unlock HOTBOT'}</b></DialogTitle>
        </span><AccessPill access={access} now={now}/></div>
        <AccessTiles access={access} now={now}/>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary">Not now</Button></DialogClose>
          <Button variant="ember" asChild><Link href={appHref('account') + '#access'} onClick={() => setSeen(key)}>{access.why === 'stake' ? 'Add $HOTBOT' : access.open ? 'Renew' : 'Unlock'}</Link></Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
