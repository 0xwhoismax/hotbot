"use client";
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { api } from '@/lib/convex';
import { currentUserIdAtom, priceDisplayAtom } from '@/store/user/atoms';
import { formatTokenPrice, type PriceUnit } from '@/lib/chartUnits';
import type { Command } from '../../../types/team';

/** One account preference, hydrated by the existing user query; no coin subscriptions. */
export function usePriceDisplay() {
  const unit = useAtomValue(priceDisplayAtom), userId = useAtomValue(currentUserIdAtom);
  const [saving, setSaving] = useState(false);
  const save = useMutation(api.team.command).withOptimisticUpdate((store, args) => {
    const command = JSON.parse(args.command) as Command;
    const user = store.getQuery(api.users.getCurrent, {});
    if (user && command.type === 'priceDisplay') store.setQuery(api.users.getCurrent, {}, { ...user, priceDisplay: command.unit });
  });
  async function setUnit(next: PriceUnit) {
    if (!userId || saving || next === unit) return;
    setSaving(true);
    try { await save({ command: JSON.stringify({ type: 'priceDisplay', unit: next } satisfies Command) }); }
    catch { toast.error('Could not save your display preference. Try again.'); }
    finally { setSaving(false); }
  }
  const format = (value: number | null | undefined, supply?: number | null) => formatTokenPrice(value, unit, supply);
  const describe = (value: number | null | undefined, supply?: number | null) => format(value, supply) + (unit === 'marketCap' ? ' mcap' : '');
  return { unit, label: unit === 'marketCap' ? 'Market cap' : 'Price', format, describe, setUnit, saving, ready: Boolean(userId) };
}
