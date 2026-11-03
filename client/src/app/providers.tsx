"use client";
import { type PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';
import { isLandingPath } from '@/lib/landing';
import { Provider } from 'jotai';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientAtom } from 'jotai-tanstack-query';
import { queryClient } from '@/lib/queryClient';
import { store } from '@/store/store';
import { ThemeProvider } from '@/components/theme toggle/theme-provider';
import { AppearanceBackdrop } from '@/components/AppearanceBackdrop';
import { useResizeQuiet } from '@/hooks/use-resize-quiet';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
store.set(queryClientAtom, queryClient);
export function Providers({ children }: PropsWithChildren) {
  const isLanding = isLandingPath(usePathname());
  useResizeQuiet();
  useVisualViewport();
  return <Provider store={store}><QueryClientProvider client={queryClient}><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange><TooltipProvider><div className="relative isolate min-h-svh">{!isLanding && <AppearanceBackdrop />}{children}<Toaster /></div></TooltipProvider></ThemeProvider></QueryClientProvider></Provider>;
}
