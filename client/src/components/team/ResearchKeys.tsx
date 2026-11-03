"use client";
import { useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { AtSign, KeyRound, LoaderCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, useQuery } from '@/lib/convex';
import { INTEL } from '../../../../types/coinIntel';
import { KEY_PATTERN, RESEARCH_PROVIDERS, type ResearchProvider, type ResearchStatus } from '../../../../types/researchKeys';
import { failToast } from './state';
import { SettingRow } from './Parts';
import s from './team.module.css';

/** What each status reads as: the pill, and the line under the key when it does not read. `warn` marks the ones that need the person. */
const STATUS: Record<ResearchStatus, { pill: string; line?: string; warn?: boolean }> = {
  ok: { pill: 'Reading' },
  refused: { pill: 'Refused', line: 'Remove it and paste a new key', warn: true },
  empty: { pill: 'No credit', line: 'Add credit; HOTBOT tries again tomorrow', warn: true },
  limited: { pill: 'Paused', line: 'Rate limited; back within the hour' },
};
const label = (provider: ResearchProvider) => RESEARCH_PROVIDERS.find(row => row.id === provider)!.label;

export function ResearchKeys() {
  const saved = useQuery(api.researchKeys.mine, {});
  return <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="research-key-title">
    <div className={s.accountCardHead}>
      <span className={s.accountIcon}><AtSign size={18}/></span>
      <div className={s.grow}><h2 id="research-key-title">X research key</h2><small>Reads X about your portfolio coins, at most {INTEL.xKeyDaily} times a day</small></div>
    </div>
    {saved === undefined ? <p className={s.empty}><LoaderCircle className="inline size-4 animate-spin"/></p>
      : saved ? <SettingRow label={label(saved.provider)} warn={STATUS[saved.status].warn}
          sub={<><code>…{saved.last4}</code>{STATUS[saved.status].line ? ` · ${STATUS[saved.status].line}` : ''}</>}
          control={<><span className={s.pill} data-tone={STATUS[saved.status].warn ? 'warn' : undefined}>{STATUS[saved.status].pill}</span><RemoveKey/></>}/>
      : <SaveKey/>}
  </section>;
}

function SaveKey() {
  const save = useAction(api.researchKeys.save);
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false);
  const valid = KEY_PATTERN.test(key.trim());
  async function submit() {
    setBusy(true);
    try { await save({ key }); setKey(''); toast.success('X key saved'); } catch (cause) { failToast(cause, { call: 'researchKeys.save' }); }
    setBusy(false);
  }
  return <form className={s.inviteField} onSubmit={event => { event.preventDefault(); if (valid && !busy) void submit(); }}>
    <Label htmlFor="research-key">Bearer token</Label>
    <div className={s.planSave}>
      <Input id="research-key" type="password" autoComplete="off" spellCheck={false} value={key} disabled={busy} onChange={event => setKey(event.target.value)}/>
      <Button type="submit" disabled={!valid || busy}>{busy ? <LoaderCircle className="animate-spin"/> : <KeyRound/>}Save</Button>
    </div>
  </form>;
}

/** Removing the key stops its reads at the agents service's next turn. */
function RemoveKey() {
  const remove = useMutation(api.researchKeys.remove), [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try { await remove({}); toast.success('Key removed'); } catch (cause) { failToast(cause, { call: 'researchKeys.remove' }); }
    setBusy(false);
  }
  return <Button size="icon-sm" variant="ghost" aria-label="Remove the key" disabled={busy} onClick={() => void run()}><Trash2/></Button>;
}
