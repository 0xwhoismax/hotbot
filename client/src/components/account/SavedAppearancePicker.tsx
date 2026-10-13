"use client";
import { useCallback, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useSetAtom } from 'jotai';
import { api } from '@/lib/convex';
import type { Appearance } from '@/lib/appearance';
import { appearanceAtom } from '@/store/ui/atoms';
import { AppearancePicker } from '@/components/AppearancePicker';

/** The account's saved look feeds the picker; one subscription, one mutation per pick. */
export function SavedAppearancePicker({ iconOnly = true }: { iconOnly?: boolean }) {
  const value = useQuery(api.users.getMyAppearance, {});
  const save = useMutation(api.users.setAppearance);
  const setAppearance = useSetAtom(appearanceAtom);
  const valueKey = value === undefined ? undefined : JSON.stringify(value);
  useEffect(() => { if (valueKey !== undefined) setAppearance(JSON.parse(valueKey)); }, [valueKey, setAppearance]);
  const persist = useCallback((value: Appearance | null) => save({ value }), [save]);
  return <AppearancePicker persist={persist} iconOnly={iconOnly} />;
}
