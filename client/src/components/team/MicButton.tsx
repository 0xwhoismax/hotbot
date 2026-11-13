"use client";
import { LoaderCircle, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useDictation } from '@/hooks/useDictation';
import s from './team.module.css';

/** The person's own words, or speech turned into words in the browser (useDictation), with what the voice is doing beside it. */
export function MicButton({ dictation }: { dictation: ReturnType<typeof useDictation> }) {
  const listening = dictation.state === 'listening';
  const status = listening ? 'Listening…' : dictation.state === 'working' ? 'Writing it down…' : null;
  return <span className={s.folioVoice}>
    <Button size="icon" variant="secondary" type="button" className={s.folioMic} data-state={dictation.state} aria-pressed={listening} disabled={dictation.state === 'working'}
      aria-label={listening ? 'Stop and write it down' : 'Say it'} title={listening ? 'Stop and write it down' : 'Say it'} onClick={listening ? dictation.stop : () => void dictation.start()}>
      {dictation.state === 'working' ? <LoaderCircle className="animate-spin"/> : listening ? <Square fill="currentColor"/> : <Mic/>}
    </Button>
    {status && <small role="status">{status}</small>}
  </span>;
}
