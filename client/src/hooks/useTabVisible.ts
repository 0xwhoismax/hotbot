"use client";
import { useSyncExternalStore } from 'react';

const subscribe = (change: () => void) => {
  document.addEventListener('visibilitychange', change);
  return () => document.removeEventListener('visibilitychange', change);
};

/** Whether this tab is on screen. Live queries that only feed what is drawn skip while it is hidden and keep showing their last result. */
export function useTabVisible() {
  return useSyncExternalStore(subscribe, () => document.visibilityState !== 'hidden', () => true);
}
