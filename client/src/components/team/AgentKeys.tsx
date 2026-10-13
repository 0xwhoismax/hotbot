"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction, useMutation } from 'convex/react';
import { Bot, Check, Copy, KeyRound, LoaderCircle, Plug, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, useQuery, type Id } from '@/lib/convex';
import { failToast } from './state';
import { SettingRow } from './Parts';
import { ago } from './format';
import s from './team.module.css';

/** At most this many keys; Convex refuses more (`agentApi/keys` KEYS.max). */
const MAX_KEYS = 5;
/** The Agent API's address: Convex's HTTP site beside its client URL (`.convex.cloud` → `.convex.site`; locally the next port). */
const MCP_URL = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? (process.env.NEXT_PUBLIC_CONVEX_URL ?? '').replace(/\.convex\.cloud\/?$/, '.convex.site')).replace(/\/$/, '') + '/mcp';

/** People's own agents (Claude, Codex, Cursor) read and change the team over MCP: with a key made here, or as an app
 *  connected by OAuth sign-in (claude.ai, ChatGPT). Both list here, and deleting either cuts it off. */
export function AgentKeys() {
  const keys = useQuery(api.agentApi.keys.list, {});
  return <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="agent-keys-title">
    <div className={s.accountCardHead}>
      <span className={s.accountIcon}><Bot size={18}/></span>
      <div className={s.grow}><h2 id="agent-keys-title">Your agents</h2><small>Claude, ChatGPT, Codex or Cursor runs your team</small></div>
      <NewKey full={(keys?.length ?? 0) >= MAX_KEYS}/>
    </div>
    <div className={s.steps}>
      <div className={s.step}><span className={s.stepIcon}><Plug size={14}/></span><b>claude.ai or ChatGPT</b><p>Add a custom connector with the server address below, then sign in to HOTBOT and tap Allow.</p></div>
      <div className={s.step}><span className={s.stepIcon}><KeyRound size={14}/></span><b>Claude Code, Codex or Cursor</b><p>Make a key with New key and paste the line it shows.</p></div>
    </div>
    <CopyRow label="Server address" text={MCP_URL}/>
    {keys === undefined ? <p className={s.empty}><LoaderCircle className="inline size-4 animate-spin"/></p>
      : keys.length ? <div>{keys.map(key => <SettingRow key={key.id} label={key.name}
          sub={<>{key.kind === 'app' ? <><Plug className="inline size-3"/> {key.prefix}</> : <code>{key.prefix}…</code>} · {key.lastUsedAt ? `used ${ago(key.lastUsedAt) === 'now' ? 'just now' : ago(key.lastUsedAt) + ' ago'}` : 'never used'}</>}
          control={<><span className={s.pill} data-tone={key.trade ? 'ember' : undefined}>{key.trade ? 'Trades' : 'Reads'}</span><DeleteKey id={key.id} name={key.name}/></>}/>)}</div>
      : <p className={s.empty}>No agents connected yet. Selling everything and other risky moves always wait for your tap here.</p>}
  </section>;
}

/** Makes a key and shows it once, with the line that adds HOTBOT to Claude Code. */
function NewKey({ full }: { full: boolean }) {
  const create = useAction(api.agentApi.keys.create);
  const [open, setOpen] = useState(false), [name, setName] = useState('Claude'), [trade, setTrade] = useState(true), [busy, setBusy] = useState(false), [key, setKey] = useState<string | null>(null);
  function show(next: boolean) { setOpen(next); if (!next) { setKey(null); setName('Claude'); setTrade(true); } }
  async function make() {
    setBusy(true);
    try { setKey(await create({ name, trade })); } catch (cause) { failToast(cause, { call: 'agentApi.keys.create' }); }
    setBusy(false);
  }
  return <Dialog open={open} onOpenChange={show}>
    <DialogTrigger asChild><Button size="sm" variant="secondary" disabled={full} title={full ? `You keep up to ${MAX_KEYS} keys` : undefined}><Plus/>New key</Button></DialogTrigger>
    <DialogContent className="sm:max-w-[30rem]" aria-describedby={undefined}>
      {key ? <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><KeyRound size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Copy your key now</b></DialogTitle><small>HOTBOT shows it only this once</small></span></div>
        <CopyRow label="Key" text={key}/>
        <CopyRow label="Add to Claude Code" text={`claude mcp add --transport http hotbot ${MCP_URL} --header "Authorization: Bearer ${key}"`}/>
        <p className={s.accountNote}>Other agents: add an MCP server at <code>{MCP_URL}</code> with the header <code>Authorization: Bearer</code> and the key.</p>
        <div className={s.accountActions}><DialogClose asChild><Button>Done</Button></DialogClose></div>
      </div> : <form className={s.decision} onSubmit={event => { event.preventDefault(); if (!busy && name.trim()) void make(); }}>
        <div className={s.decisionHead}><span className={s.accountIcon}><Bot size={18}/></span><span className={s.grow}><DialogTitle asChild><b>New agent key</b></DialogTitle><small>For one agent on one machine</small></span></div>
        <div className={s.inviteField}><Label htmlFor="agent-key-name">Name</Label><Input id="agent-key-name" maxLength={40} value={name} onChange={event => setName(event.target.value)}/></div>
        <label className={s.adminToggle}>
          <span className={s.grow}><b>Can trade</b><small>Risky moves wait for your tap</small></span>
          <Switch variant="accent" checked={trade} onCheckedChange={setTrade}/>
        </label>
        <div className={s.accountActions}>
          <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="animate-spin"/> : <KeyRound/>}Make key</Button>
        </div>
      </form>}
    </DialogContent>
  </Dialog>;
}

function CopyRow({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { toast.error('Could not copy it.'); }
  }
  return <div className={s.inviteField}><Label>{label}</Label>
    <button type="button" className={s.walletAddress} onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}><code className={s.fullAddress}>{text}</code>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>
  </div>;
}

/** Deleting a key revokes it: the agent's next call is refused. */
function DeleteKey({ id, name }: { id: Id<'agentKeys'>; name: string }) {
  const revoke = useMutation(api.agentApi.keys.revoke), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try { await revoke({ id }); setOpen(false); toast.success(`${name} can no longer reach your team`); } catch (cause) { failToast(cause, { call: 'agentApi.keys.revoke' }); }
    setBusy(false);
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Delete ${name}`}><Trash2/></Button></DialogTrigger>
    <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><Trash2 size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Delete {name}?</b></DialogTitle><small>The agent loses access at once</small></span></div>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="secondary" className={s.stopTeam} disabled={busy} onClick={() => void remove()}><Trash2/>Delete key</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Consent for an app that signs in with OAuth (`agentApi/oauth`): the app's sign-in link opens /app/connect, over the Account page. Nothing
 *  sends the person anywhere until Convex has checked the app and its return address; Deny returns only to a checked address. */
export function ConnectAgent() {
  const router = useRouter(), approve = useAction(api.agentApi.oauth.approve);
  // Read once: the address does not change while the dialog is open, and reading it here needs no Suspense boundary.
  const [params] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search));
  const clientId = params.get('client_id') ?? '', redirectUri = params.get('redirect_uri') ?? '', state = params.get('state') ?? undefined, scope = (params.get('scope') ?? '').split(/\s+/).filter(Boolean);
  const wellFormed = params.get('response_type') === 'code' && params.get('code_challenge_method') === 'S256' && /^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') ?? '') && Boolean(clientId && redirectUri);
  const app = useQuery(api.agentApi.oauth.client, wellFormed ? { clientId, redirectUri } : 'skip');
  const [trade, setTrade] = useState(!scope.length || scope.includes('trade')), [busy, setBusy] = useState(false);
  const leave = () => router.replace('/app/account');
  function back(params: Record<string, string>) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries({ ...params, ...(state !== undefined ? { state } : {}) })) url.searchParams.set(key, value);
    window.location.assign(url.href);
  }
  async function allow() {
    setBusy(true);
    try { window.location.assign(await approve({ clientId, redirectUri, codeChallenge: params.get('code_challenge')!, codeChallengeMethod: 'S256', state, resource: params.get('resource') ?? undefined, trade })); }
    catch (cause) { failToast(cause, { call: 'agentApi.oauth.approve' }); setBusy(false); }
  }
  const invalid = !wellFormed || app === null;
  return <Dialog open onOpenChange={open => { if (!open) leave(); }}>
    <DialogContent className="sm:max-w-[28rem]" aria-describedby={undefined}>
      {invalid ? <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><Plug size={18}/></span><span className={s.grow}><DialogTitle asChild><b>This sign-in link is not valid</b></DialogTitle><small>Start the connection again in your agent</small></span></div>
        <div className={s.accountActions}><Button onClick={leave}>Close</Button></div>
      </div> : app === undefined ? <div className={s.decision}>
        <DialogTitle className="sr-only">Checking the app</DialogTitle><p className={s.empty}><LoaderCircle className="inline size-4 animate-spin"/></p>
      </div> : <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><Plug size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Connect {app.name}?</b></DialogTitle><small>It reads and runs your HOTBOT team</small></span></div>
        <dl className={s.walletBreakdown}>
          <div><dt>Sends you back to</dt><dd className={app.known ? undefined : s.warnText}>{app.host}</dd></div>
          <div><dt>Disconnect</dt><dd>Any time, on Account</dd></div>
        </dl>
        {!app.known && <p className={`${s.accountNote} ${s.warnText}`}>Connect only if you started this in {app.name} yourself. HOTBOT hands access to {app.host}.</p>}
        <label className={s.adminToggle}>
          <span className={s.grow}><b>Can trade</b><small>Risky moves wait for your tap</small></span>
          <Switch variant="accent" checked={trade} onCheckedChange={setTrade}/>
        </label>
        <div className={s.accountActions}>
          <Button variant="secondary" disabled={busy} onClick={() => back({ error: 'access_denied' })}>Deny</Button>
          <Button disabled={busy} onClick={() => void allow()}>{busy ? <LoaderCircle className="animate-spin"/> : <Plug/>}Allow</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
