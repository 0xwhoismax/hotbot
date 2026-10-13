import { atom } from 'jotai';
export type DebugLogEntry = {
  id: string;
  timestamp: number;
  label: string;
  detail: string;
  level: 'info' | 'warn' | 'error';
};

const DEBUG_LOG_MAX = 150;

export const debugLogEntriesAtom = atom<DebugLogEntry[]>([]);

export const pushDebugLogAtom = atom(
  null,
  (get, set, entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => {
    const next: DebugLogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    const prev = get(debugLogEntriesAtom);
    set(debugLogEntriesAtom, [next, ...prev].slice(0, DEBUG_LOG_MAX));
  },
);


import { APPEARANCE_STORAGE_KEY, normalizeAppearance, type Appearance } from '@/lib/appearance';

const loadAppearance = (): Appearance | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
        return raw ? normalizeAppearance(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
};

const _appearanceBase = atom<Appearance | null>(null);
_appearanceBase.onMount = (setAtom) => {
    setAtom(loadAppearance());
};

/**
 * The person's appearance, `null` = the default look. Mirrored to localStorage so
 * reloads paint instantly before Convex responds; the backend value
 * (userSettings.appearance) is the source of truth, synced in by SavedAppearancePicker.
 */
export const appearanceAtom = atom(
    (get) => get(_appearanceBase),
    (_get, set, value: Appearance | null) => {
        set(_appearanceBase, value);
        if (typeof window !== 'undefined') {
            try {
                if (value === null) window.localStorage.removeItem(APPEARANCE_STORAGE_KEY);
                else window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
            } catch { }
        }
    }
);
