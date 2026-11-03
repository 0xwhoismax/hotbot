"use client";
import { useState, type ReactElement, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { toast } from 'sonner';
import { Archive, CopyPlus, FlaskConical, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { labAtom } from '@/store/user/atoms';
import type { HomeData, StrategyRow } from './data';
import { appHref } from './format';
import { ArchiveDialogs, ArchiveStrategyButton } from './ArchiveStrategy';
import { AtLimit, useStrategyLimit } from './Limits';
import { useCommand } from './state';
import s from './team.module.css';
import { useRouter } from '@/lib/appNavigation';

/** Where a copy of `id` opens: New strategy, with its settings to change before Start. */
export const copyHref = (id: string) => `${appHref('new')}?from=${encodeURIComponent(id)}`;

/** One strategy's actions behind `children`, its trigger: Copy (a Practice copy, past the limit a toast), the Lab for those who have it, and
 *  Pause/Run (`run`) and Archive (`archive`) where the place has no button for them. A strategy selling out to its archive keeps only Copy
 *  and the Lab. `onNavigate` closes the sidebar on a phone. */
export function StrategyMenu({ data, strategy, run = false, archive = false, onNavigate, children }: { data: HomeData; strategy: StrategyRow; run?: boolean; archive?: boolean; onNavigate?: () => void; children: ReactElement }) {
  const router = useRouter(), command = useCommand(), hasLab = useAtomValue(labAtom), limit = useStrategyLimit();
  const [dialog, setDialog] = useState<'archive' | 'delete' | null>(null);
  const go = (href: string) => { onNavigate?.(); router.push(href); };
  const settled = strategy.status === 'running' || strategy.status === 'paused', stopped = strategy.loss?.stoppedAt != null;
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        <DropdownMenuItem aria-disabled={limit ? true : undefined} className={limit ? 'opacity-50' : undefined} onSelect={() => limit ? toast(limit.title, { id: 'capacity', description: limit.detail }) : go(copyHref(strategy.id))}><CopyPlus/>Copy</DropdownMenuItem>
        {hasLab && <DropdownMenuItem onSelect={() => go(appHref('lab', strategy.id))}><FlaskConical/>Try in the Lab</DropdownMenuItem>}
        {run && settled && !stopped && <DropdownMenuItem onSelect={() => void command({ type: strategy.status === 'running' ? 'pause' : 'resume', strategyId: strategy.id })}>{strategy.status === 'running' ? <><Pause/>Pause</> : <><Play/>Run</>}</DropdownMenuItem>}
        {archive && settled && <><DropdownMenuSeparator/><DropdownMenuItem onSelect={() => setDialog('archive')}><Archive/>Archive</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
    {archive && <ArchiveDialogs data={data} strategy={strategy} open={dialog} onOpen={setDialog}/>}
  </>;
}

/** A phone's strategy actions in a bottom sheet behind `children`, its trigger: Copy, the Lab for those who have it, what the header has no
 *  room for (`more`), and Archive, or Keep while the strategy sells out to its archive. */
export function StrategySheet({ data, strategy, more, children }: { data: HomeData; strategy: StrategyRow; more?: ReactNode; children: ReactElement }) {
  const router = useRouter(), hasLab = useAtomValue(labAtom), limit = useStrategyLimit(), [open, setOpen] = useState(false);
  const go = (href: string) => { setOpen(false); router.push(href); };
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>{children}</SheetTrigger>
    <SheetContent side="bottom" aria-describedby={undefined} className="text-base">
      <SheetHeader className="pt-[0.25em] pb-[0.5em]"><SheetTitle>{strategy.name}</SheetTitle></SheetHeader>
      <div className={s.strategySheet}>
        <AtLimit limit={limit}><Button variant="secondary" onClick={() => go(copyHref(strategy.id))}><CopyPlus/>Copy</Button></AtLimit>
        {hasLab && <Button variant="secondary" onClick={() => go(appHref('lab', strategy.id))}><FlaskConical/>Try in the Lab</Button>}
        {more}
        {(strategy.status === 'running' || strategy.status === 'paused' || strategy.status === 'archiving') && <ArchiveStrategyButton data={data} strategy={strategy} block/>}
      </div>
    </SheetContent>
  </Sheet>;
}
