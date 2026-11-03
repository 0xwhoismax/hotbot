"use client";
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useAtomValue } from 'jotai';
import { Plus, Ticket } from 'lucide-react';
import { api } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { ACCESS_TIERS, amountText } from '../../../../types/access';
import type { HomeData } from './data';
import { viewedAtom } from './state';
import { SolscanLink } from './Parts';
import { AccessPill, AccessTiles, day, useAccess } from './AccessGate';
import { PassPay } from './PassPay';
import s from './team.module.css';

/** Account → Access: the pass and its stake, how to unlock, move the stake into the HOTBOT wallet or renew, and its receipts. */
export function AccessCard({ data }: { data: HomeData }) {
  const state = useAccess(data), viewed = useAtomValue(viewedAtom), [renew, setRenew] = useState(false);
  if (!state) return null;
  const { access, now } = state, paid = access.paidUntil !== null && access.paidUntil > now, tier = ACCESS_TIERS[access.tier];
  const unlocking = !paid || renew || access.short > 0 || access.outside !== null;
  return <section id="access" className={`${s.surface} ${s.accountCard}`} aria-labelledby="access-title">
    <div className={s.accountCardHead}><span className={s.accountIcon}><Ticket size={18}/></span><div className={s.grow}><h2 id="access-title">HOTBOT pass</h2>
      <small>{access.open ? access.why === 'admin' ? 'Always on' : `Runs to ${day(access.until!)}` : 'Your team is paused'}</small></div><AccessPill access={access} now={now}/></div>
    {!viewed && access.why !== 'admin' && unlocking ? <PassPay renew={renew} onPaid={() => setRenew(false)}/> : <AccessTiles access={access} now={now}/>}
    {!viewed && access.why !== 'admin' && paid && !renew && <div className={s.accountActions}><Button variant="secondary" onClick={() => setRenew(true)}><Plus/>Add {tier.days} days</Button></div>}
    {!viewed && <Receipts/>}
  </section>;
}

function Receipts() {
  const rows = useQuery(api.access.payments, {});
  if (!rows?.length) return null;
  return <dl className={s.walletBreakdown} aria-label="Payments">{rows.map(row => <div key={row.id} title={`${amountText(row.currency, row.amount)} ${row.currency}`}>
    <dt>{day(row.at)} – {day(row.until)}</dt>
    <dd className={s.walletRecoveryValue}>${row.usd}<SolscanLink kind="tx" value={row.tx} label="View the payment on Solscan"/></dd>
  </div>)}</dl>;
}
