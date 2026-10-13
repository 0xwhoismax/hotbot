"use client";

import { useLayoutEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import styles from './scrollbar.module.css';

/** A compact left-side rail controlling an existing native scroll viewport. */
export function Scrollbar({ viewport, fallback, className }: {
  viewport: HTMLElement | null;
  fallback: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const id = useId(), rail = useRef<HTMLDivElement>(null), target = useRef<HTMLElement | null>(null);
  const drag = useRef<{ pointer: number; offset: number } | null>(null);
  const geometry = useRef({ height: 0, thumb: 0, offset: 0, max: 0 });
  const [state, setState] = useState({ overflow: false, percent: 0, controls: '' });

  useLayoutEffect(() => {
    const element = viewport ?? fallback.current, track = rail.current;
    if (!element || !track) return;
    target.current = element;
    const previousId = element.id;
    if (!previousId) element.id = `scroll-viewport-${id}`;
    element.dataset.scrollRail = id;
    element.classList.add(styles.viewport);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const height = track.clientHeight, max = Math.max(0, element.scrollHeight - element.clientHeight);
      const overflow = max > 1 && element.clientHeight > 0;
      const ratio = max ? Math.max(0, Math.min(1, element.scrollTop / max)) : 0;
      const thumb = Math.min(height, Math.max(32, height * element.clientHeight / Math.max(1,element.scrollHeight)));
      geometry.current = { height, thumb, offset: ratio * (height - thumb), max };
      track.style.setProperty('--scroll-thumb-height', `${thumb}px`);
      track.style.setProperty('--scroll-thumb-offset', `${geometry.current.offset}px`);
      const percent = Math.round(ratio * 100);
      setState(previous => previous.overflow === overflow && previous.percent === percent && previous.controls === element.id ? previous : { overflow, percent, controls: element.id });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(track);
    resize.observe(element);
    let children: Element[] = [];
    const observeContent = () => {
      children.forEach(child => resize.unobserve(child));
      children = Array.from(element.children);
      children.forEach(child => resize.observe(child));
    };
    observeContent();
    const mutation = new MutationObserver(records => {
      if (records.some(record => record.target === element && record.type === 'childList')) observeContent();
      schedule();
    });
    mutation.observe(element, { childList: true, subtree: true, characterData: true });
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY || event.ctrlKey) return;
      event.preventDefault();
      // Preserve viewport handlers, including upward history pagination.
      const forwarded = new WheelEvent('wheel', { deltaY: event.deltaY, deltaX: event.deltaX, deltaMode: event.deltaMode, bubbles: true, cancelable: true });
      if (element.dispatchEvent(forwarded)) element.scrollBy({ top: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1), behavior: 'instant' });
    };
    track.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('scroll', schedule, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect(); mutation.disconnect();
      track.removeEventListener('wheel', wheel);
      element.removeEventListener('scroll', schedule);
      if (element.dataset.scrollRail === id) {
        delete element.dataset.scrollRail;
        element.classList.remove(styles.viewport);
      }
      if (!previousId && element.id === `scroll-viewport-${id}`) element.removeAttribute('id');
      if (drag.current && track.hasPointerCapture(drag.current.pointer)) track.releasePointerCapture(drag.current.pointer);
      drag.current = null; delete track.dataset.dragging;
      if (target.current === element) target.current = null;
    };
  }, [viewport, fallback, id]);

  function seek(clientY: number, offset: number) {
    const element = target.current, track = rail.current;
    if (!element || !track) return;
    const { height, thumb, max } = geometry.current;
    const ratio = Math.max(0,Math.min(1,(clientY-track.getBoundingClientRect().top-offset)/Math.max(1,height-thumb)));
    element.scrollTo({ top: ratio * max, behavior: 'instant' });
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !state.overflow) return;
    event.preventDefault();
    const track = event.currentTarget, { thumb, offset } = geometry.current;
    const y = event.clientY-track.getBoundingClientRect().top;
    drag.current = { pointer: event.pointerId, offset: y >= offset && y <= offset+thumb ? y-offset : thumb/2 };
    track.dataset.dragging = 'true'; track.focus({ preventScroll: true }); track.setPointerCapture(event.pointerId);
    seek(event.clientY,drag.current.offset);
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null; delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const element = target.current;
    if (!element) return;
    const page = element.clientHeight * 0.9;
    const amount = event.key === 'ArrowUp' ? -40 : event.key === 'ArrowDown' ? 40 : event.key === 'PageUp' || event.key === ' ' && event.shiftKey ? -page : event.key === 'PageDown' || event.key === ' ' ? page : null;
    if (amount === null && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const forwarded = new window.KeyboardEvent('keydown', { key: event.key, shiftKey: event.shiftKey, bubbles: true, cancelable: true });
    if (!element.dispatchEvent(forwarded)) return;
    element.scrollTo({ top: event.key === 'Home' ? 0 : event.key === 'End' ? element.scrollHeight : element.scrollTop + (amount ?? 0), behavior: 'instant' });
  }

  return <div ref={rail} className={cn(styles.rail,className)} role="scrollbar" aria-label="Page scroll position" aria-orientation="vertical" aria-controls={state.controls || undefined} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent} aria-valuetext={`${state.percent}% through page`} aria-hidden={!state.overflow} tabIndex={state.overflow ? 0 : -1} data-overflow={state.overflow}
    onPointerDown={pointerDown} onPointerMove={event => { if (drag.current?.pointer === event.pointerId) seek(event.clientY,drag.current.offset); }} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={keyDown}>
    <div className={styles.dots} aria-hidden/>
    <div className={styles.thumb} aria-hidden/>
  </div>;
}
