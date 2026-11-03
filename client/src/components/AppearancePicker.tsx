"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAtom } from 'jotai';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import { BACKDROP_OPTIONS, CORNER_OPTIONS, DEFAULT_APPEARANCE, LOOK_OPTIONS, SCHEME_OPTIONS, SURFACE_OPTIONS, sameAppearance, type Appearance } from '@/lib/appearance';
import { appearanceAtom } from '@/store/ui/atoms';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type Persist = (value: Appearance | null) => Promise<unknown>;
/** `sheet` opens the phone's sheet from outside, with no trigger of its own (MobileNav's menu). */
export type AppearancePickerProps = { persist?: Persist; iconOnly?: boolean; sheet?: { open: boolean; onOpenChange: (open: boolean) => void } };

/** How round each corner glyph is drawn, so the button shows its own setting. */
const CORNER_GLYPH = { sharp: '1px', crisp: '3px', soft: '6px', round: '9px' } as const;

/** A look's tile: its scheme's colour on this side, drawn with its cards' edge and its corners. */
function lookTile(look: Appearance, dark: boolean): CSSProperties {
  const scheme = SCHEME_OPTIONS.find(option => option.id === look.scheme) ?? SCHEME_OPTIONS[0];
  const edge = look.surface === 'bold' ? { border: '2px solid currentColor', boxShadow: '2px 2px 0 currentColor' }
    : look.surface === 'soft' ? { boxShadow: '0 0.35em 0.8em -0.3em rgb(0 0 0 / 0.4)' } : { boxShadow: 'inset 0 0 0 1px var(--border)' };
  return { background: dark ? scheme.dark : scheme.light, borderRadius: CORNER_GLYPH[look.corners], ...edge };
}

/** A phone gets the choices in a bottom sheet with full-size controls; a wide screen gets them in a popover. */
export function AppearancePicker({ persist, iconOnly = false, sheet }: AppearancePickerProps) {
  const editor = useAppearanceEditor(persist), mobile = useIsMobile();
  const trigger = <Button variant="outline" size={iconOnly ? 'icon' : 'default'} className={iconOnly ? undefined : 'w-full'} aria-label="Theme" title="Theme"><Palette />{!iconOnly && <span>Theme</span>}</Button>;
  if (sheet || mobile) return <Sheet {...sheet}>
    {!sheet && <SheetTrigger asChild>{trigger}</SheetTrigger>}
    <SheetContent side="bottom" aria-describedby={undefined} className="text-base [&_[data-slot=button]]:h-[2.75rem]">
      <SheetHeader className="pt-[0.25em] pb-[0.5em]"><SheetTitle>Theme</SheetTitle></SheetHeader>
      <div className="px-[1em] pb-[1.25em]"><AppearanceOptions editor={editor}/></div>
    </SheetContent>
  </Sheet>;
  return <Popover><PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent align="end" className="w-[22em] max-w-[calc(100vw-2rem)]"><AppearanceOptions editor={editor}/></PopoverContent>
  </Popover>;
}

function useAppearanceEditor(persist?: Persist) {
  const [saved, setAppearance] = useAtom(appearanceAtom);
  const { theme = 'system', resolvedTheme, setTheme } = useTheme(), dark = resolvedTheme !== 'light';
  const [error, setError] = useState<string | null>(null);
  const current = saved ?? DEFAULT_APPEARANCE;
  const pending = useRef<Appearance | null | undefined>(undefined);
  const saving = useRef(false);
  // Preview immediately; serialize writes so quick picks land in order.
  const flush = useCallback(async () => {
    if (!persist || saving.current) return;
    saving.current = true;
    try {
      while (pending.current !== undefined) {
        const value = pending.current;
        pending.current = undefined;
        await persist(value);
      }
      setError(null);
    } catch { setError('Appearance could not be saved to your account. It still applies on this device.'); }
    finally { saving.current = false; }
  }, [persist]);
  useEffect(() => () => { void flush(); }, [flush]);
  function select(value: Appearance | null) {
    setAppearance(value);
    pending.current = value;
    void flush();
  }
  const choose = (patch: Partial<Appearance>) => { const next = { ...current, ...patch }; select(sameAppearance(next, DEFAULT_APPEARANCE) ? null : next); };
  return { current, dark, theme, setTheme, error, select, choose };
}

function AppearanceOptions({ editor: { current, dark, theme, setTheme, error, select, choose } }: { editor: ReturnType<typeof useAppearanceEditor> }) {
  const option = (selected: boolean) => ({ variant: 'outline', 'aria-pressed': selected, size: 'sm' } as const);
  // A section that comes and goes opens and closes in place, like every other (ui/collapsible).
  const reveal = (show: boolean, node: ReactNode) => <Collapsible open={show}><CollapsibleContent><div className="pt-[1.1em]">{node}</div></CollapsibleContent></Collapsible>;
  return <>
      <div className="space-y-2"><Label>Look</Label><div className="grid grid-cols-3 gap-[0.4em]">
        {LOOK_OPTIONS.map(({ id, label, look }) => {
          const selected = current.surface === look.surface && current.backdrop === look.backdrop;
          return <button key={id} type="button" aria-pressed={selected} onClick={() => choose(look)}
            className={cn('flex flex-col items-stretch gap-[0.45em] rounded-md p-[0.45em] text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring', selected && 'bg-secondary font-medium')}>
            <span aria-hidden className={cn('h-[2.25em]', look.surface === 'bold' && 'hotbot-arcade-tile')} style={lookTile({ ...current, ...look }, dark)} />
            {label}
          </button>;
        })}
      </div></div>
      <div className="space-y-2 pt-[1.1em]"><Label>Colour</Label><div className="grid grid-cols-5 gap-[0.4em]">
        {SCHEME_OPTIONS.map(scheme => {
          const selected = current.scheme === scheme.id;
          return <button key={scheme.id} type="button" aria-pressed={selected} onClick={() => choose({ scheme: scheme.id })}
            className={cn('flex flex-col items-center gap-[0.35em] rounded-md px-[0.25em] py-[0.5em] text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring', selected && 'bg-secondary font-medium')}>
            <span aria-hidden className={cn('size-[1.75em] rounded-full ring-1 ring-border', selected && 'ring-2 ring-foreground')} style={{ background: `linear-gradient(135deg, ${scheme.dark} 50%, ${scheme.light} 50%)` }} />
            {scheme.label}
          </button>;
        })}
      </div></div>
      <div className="space-y-2 pt-[1.1em]"><Label>Mode</Label><div className="grid grid-cols-3 gap-2">
        <Button {...option(theme === 'dark')} onClick={() => setTheme('dark')}><Moon />Dark</Button>
        <Button {...option(theme === 'light')} onClick={() => setTheme('light')}><Sun />Light</Button>
        <Button {...option(theme === 'system')} onClick={() => setTheme('system')}><Monitor />System</Button>
      </div></div>
      {reveal(current.surface !== 'bold', <div className="space-y-2"><Label>Cards</Label><div className="grid grid-cols-3 gap-2">
        {SURFACE_OPTIONS.map(surface => <Button key={surface.id} {...option(current.surface === surface.id)} onClick={() => choose({ surface: surface.id })}>{surface.label}</Button>)}
      </div></div>)}
      <div className="space-y-2 pt-[1.1em]"><Label>Background</Label><div className="grid grid-cols-2 gap-2">
        {BACKDROP_OPTIONS.map(backdrop => <Button key={backdrop.id} {...option(current.backdrop === backdrop.id)} onClick={() => choose({ backdrop: backdrop.id })}>{backdrop.label}</Button>)}
      </div></div>
      {/* Phones keep round corners, so the choice only shows where it applies. */}
      <div className="hidden space-y-2 pt-[1.1em] md:block"><Label>Corners</Label><div className="grid grid-cols-4 gap-2">
        {CORNER_OPTIONS.map(corner => <Button key={corner.id} {...option(current.corners === corner.id)} onClick={() => choose({ corners: corner.id })}>
          <span aria-hidden className="size-[0.8em] shrink-0 border-l-2 border-t-2 border-current" style={{ borderTopLeftRadius: CORNER_GLYPH[corner.id] }} />{corner.label}
        </Button>)}
      </div></div>
      {reveal(!sameAppearance(current, DEFAULT_APPEARANCE), <Button variant="ghost" className="w-full" onClick={() => select(null)}><RotateCcw />Reset to default</Button>)}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </>;
}
