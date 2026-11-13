"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** The browser's own recognizer (Chrome, Edge and Safari; Firefox has none). A spoken command lasts seconds, so a clip stops itself at 30 s. */
const MAX_MS = 30_000;

type Alternative = { transcript: string };
type Result = { isFinal: boolean; 0: Alternative };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionConstructor = new () => Recognition;
const recognizer = () => {
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};

const PROBLEMS: Record<string, string> = {
  'not-allowed': 'Allow the microphone to talk to HOTBOT.', 'service-not-allowed': 'Allow the microphone to talk to HOTBOT.',
  'audio-capture': 'No microphone found.', 'no-speech': 'Didn’t catch that. Try again a little closer to the mic.',
};
const FAILED = 'Voice didn’t work this time. Type it instead.';

export type DictationState = 'idle' | 'listening' | 'working';

/** Talk instead of typing: the browser's speech recognizer listens until `stop` (or 30 s). `onText` gets the words, and the caller puts them
 *  where the person reads and edits them before sending. */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const recognition = useRef<Recognition | null>(null), mounted = useRef(true), timer = useRef(0), latest = useRef(onText);
  useEffect(() => { latest.current = onText; });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      const current = recognition.current;
      recognition.current = null;
      if (current) { current.onend = null; current.abort(); }
    };
  }, []);

  const stop = useCallback(() => {
    const current = recognition.current;
    if (!current) return;
    clearTimeout(timer.current);
    setState('working');
    current.stop();
  }, []);

  const start = () => {
    if (recognition.current) return;
    const Recognizer = recognizer();
    if (!Recognizer) { toast.error('This browser can’t do voice. Type it instead.'); return; }
    const current = new Recognizer(), finals: string[] = [];
    let problem: string | null = null;
    current.lang = navigator.language || 'en-US';
    current.continuous = true;
    current.interimResults = false;
    current.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal) finals.push(event.results[index][0].transcript.trim());
    };
    current.onerror = event => { problem ??= PROBLEMS[event.error] ?? (event.error === 'aborted' ? '' : FAILED); };
    current.onend = () => {
      clearTimeout(timer.current);
      recognition.current = null;
      if (mounted.current) setState('idle');
      const text = finals.join(' ').trim();
      if (problem) toast.error(problem);
      else if (text) latest.current(text);
      else toast('Didn’t catch that. Try again a little closer to the mic.');
    };
    try { current.start(); } catch { toast.error(FAILED); return; }
    recognition.current = current;
    setState('listening');
    timer.current = window.setTimeout(stop, MAX_MS);
  };

  return { state, start, stop };
}
