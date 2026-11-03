'use client';

import { useEffect, useRef, useState } from 'react';
import o from '@/components/team/onboarding.module.css';

/** The sections of a legal page as links: a sticky column on desktop, a sticky strip under the header on phones. The section being read is marked,
 *  and on the strip it scrolls into view. */
export function LegalNav({ items }: { items: readonly { id: string; title: string }[] }) {
  const [active, setActive] = useState(items[0]?.id), nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const seen = new Set<string>();
    const watch = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.isIntersecting) seen.add(entry.target.id); else seen.delete(entry.target.id); }
      const first = items.find(item => seen.has(item.id));
      if (first) setActive(first.id);
    }, { rootMargin: '-15% 0px -75% 0px' });
    for (const item of items) { const section = document.getElementById(item.id); if (section) watch.observe(section); }
    return () => watch.disconnect();
  }, [items]);
  useEffect(() => {
    const strip = nav.current, current = strip?.querySelector<HTMLElement>('[aria-current]');
    if (strip && current && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);
  return <nav ref={nav} aria-label="Contents" className={o.legalToc}>
    {items.map(item => <a key={item.id} href={`#${item.id}`} aria-current={item.id === active ? 'true' : undefined}>{item.title}</a>)}
  </nav>;
}
