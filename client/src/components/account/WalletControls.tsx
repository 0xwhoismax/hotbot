"use client";
import { useId, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { userSolBalanceAtom } from '@/store/user/queries';
import { currentWalletAddressAtom } from '@/store/user/atoms';
import { solPriceAtom } from '@/store/positions/atoms';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { formatMarketCap, formatPrice } from '@/utils/formatterUtils';
import { toast } from 'sonner';
import { ArrowUpRight, ChartNoAxesCombined, Copy } from 'lucide-react';
import { LogoSolanaColor } from '@/shared/icons/logo-solana-color';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SendSolModal } from '@/components/dialogs/SendSolModal';
import { invalidateNativeBalanceAfterSwap } from '@/store/positions/actions';
import { usd } from '@/components/team/format';
import s from '@/components/team/team.module.css';

/** The trading wallet (shown once the person has one: Phase 2's HOTBOT wallet) and how coin values display. */
export function WalletControls() {
  const address = useAtomValue(currentWalletAddressAtom);
  return <>
    {address && <TradingWallet address={address}/>}
    <PriceDisplaySettings/>
  </>;
}

function TradingWallet({ address }: { address: string }) {
  const balance = useAtomValue(userSolBalanceAtom), solPrice = useAtomValue(solPriceAtom).data;
  const [sending, setSending] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  const copy = () => navigator.clipboard.writeText(address).then(() => toast.success('Address copied'), () => toast.error('Could not copy the address'));
  return <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="trading-wallet-title">
    <div className={s.accountCardHead}>
      <span className={s.accountIcon}><LogoSolanaColor className="size-5"/></span>
      <div className={s.grow}><h2 id="trading-wallet-title">Trading wallet</h2><small>For your manual trades</small></div>
    </div>
    <div className={s.accountBalance}><b>{balance.balance === null ? '—' : balance.balance.toLocaleString(undefined, { maximumFractionDigits: 9 })}<small>SOL</small></b><span>{balance.balance !== null && solPrice != null ? usd(balance.balance * solPrice) : '—'} · on Solana</span></div>
    <button type="button" className={s.walletAddress} title={address} aria-label={`Copy trading wallet address ${address}`} onClick={() => void copy()}><code>{address.slice(0, 6)}…{address.slice(-6)}</code><Copy size={14}/></button>
    <div className={s.accountActions}>
      <Button ref={trigger} variant="secondary" disabled={balance.balance === null || balance.balance < 0.0051} onClick={() => setSending(true)}><ArrowUpRight/>Send / withdraw</Button>
    </div>
    {balance.error && <div className={s.accountFeedback} role="status">Unable to refresh balance.<Button variant="ghost" size="sm" onClick={() => void balance.refetch()}>Refresh</Button></div>}
    <SendSolModal key={address} open={sending} onOpenChange={setSending} balance={balance.balance} solPrice={solPrice}
      onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} onSuccess={invalidateNativeBalanceAfterSwap}/>
  </section>;
}

/** How coin values read across the account, as one row: the title with its two-word toggle beside it. */
function PriceDisplaySettings() {
  const { unit, setUnit, ready } = usePriceDisplay(), id = useId();
  return <section className={`${s.surface} ${s.accountCard} ${s.priceDisplaySettings}`} aria-labelledby={`${id}-title`}>
    <div className={s.accountCardHead}>
      <span className={s.accountIcon}><ChartNoAxesCombined size={18}/></span>
      <div className={s.grow}><h2 id={`${id}-title`}>Coin display</h2><small>Across your account</small></div>
      <ToggleGroup type="single" value={unit} disabled={!ready} aria-label="Display coin values as" onValueChange={value => { if (value) void setUnit(value as typeof unit); }}>
        <ToggleGroupItem value="marketCap" aria-label={`Market cap, like ${formatMarketCap(123000)}`}>Mcap</ToggleGroupItem>
        <ToggleGroupItem value="price" aria-label={`Price, like ${formatPrice(0.0000123, { prefix: '$' })}`}>Price</ToggleGroupItem>
      </ToggleGroup>
    </div>
  </section>;
}
