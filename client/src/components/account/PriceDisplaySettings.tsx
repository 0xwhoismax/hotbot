"use client";
import { useId } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { formatMarketCap, formatPrice } from '@/utils/formatterUtils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import s from '@/components/team/team.module.css';

/** How coin values read across the account, as one row: the title with its two-word toggle beside it. */
export function PriceDisplaySettings() {
  const { unit, setUnit, ready } = usePriceDisplay(), id = useId();
  return <section className={`${s.surface} ${s.accountCard}`} aria-labelledby={`${id}-title`}>
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
