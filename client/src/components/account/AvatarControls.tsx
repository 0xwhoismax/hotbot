"use client";
import { useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { CircleAlert, Camera, Check, Copy, Loader2, Pencil, X } from 'lucide-react';
import { api, type Id } from '@/lib/convex';
import { userStateAtom } from '@/store/user/atoms';
import { compressAvatar } from '@/lib/media';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import s from '@/components/team/team.module.css';
import { ConvexError } from 'convex/values';
/** A name as it is typed: letters, numbers and single spaces, at most 20 characters. */
export const typedName = (text: string) => text.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').replace(/^\s+/, '').slice(0, 20);
/** What is wrong with a finished name, or null when it can be saved. */
export const nameProblem = (value: string) => !value ? 'Username is required' : value.length > 20 || !/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u.test(value) ? 'Use up to 20 letters, numbers and single spaces' : null;

/** A failure kept out of sight: a small button that copies the error text for a report. */
export function CopyError({ message }: { message: string }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); toast.success('Error copied'); }
    catch { toast.error('Could not copy'); }
  };
  return <button type="button" onClick={() => void copy()} title={`Copy error: ${message}`} aria-label="Copy error" className="inline-flex h-7 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CircleAlert className="size-3.5" aria-hidden /><Copy className="size-3.5" aria-hidden /></button>;
}

/** Uploads a picture as the account's avatar (compressed to WebP, or JPEG in Safari, first); one upload at a time. Success is a quick toast; `message` holds only a failure. */
export function useAvatarUpload() {
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const locked = useRef(false);
  async function upload(file: File) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(null);
    try {
      const image = await compressAvatar(file);
      const postUrl = await generateUploadUrl({});
      const response = await fetch(postUrl, { method: 'POST', headers: { 'Content-Type': image.type }, body: image });
      if (!response.ok) throw new Error('Avatar upload failed. Please try again.');
      const result = await response.json() as { storageId?: string };
      if (!result.storageId) throw new Error('Avatar upload returned no storage ID');
      await setAvatar({ storageId: result.storageId as Id<'_storage'> }); toast.success('Avatar updated');
    } catch (cause) { /* A refusal from Convex (the hourly upload limit) carries its words in `data`. */ setMessage(cause instanceof ConvexError && typeof cause.data === 'string' ? cause.data : cause instanceof Error ? cause.message : 'Avatar upload failed'); }
    finally { locked.current = false; setBusy(false); }
  }
  return { busy, message, setMessage, upload };
}

export function AvatarControls({ prominent = false }: { prominent?: boolean }) {
  const profile = useAtomValue(userStateAtom).profileData;
  const updateUsername = useMutation(api.users.updateUsername);
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false), [name, setName] = useState(''), [saving, setSaving] = useState(false), [nameError, setNameError] = useState<string | null>(null);
  const nameLock = useRef(false);
  const { busy, message, upload } = useAvatarUpload();
  async function saveName() {
    if (nameLock.current) return;
    const value = name.trim(), problem = nameProblem(value);
    if (problem) { setNameError(problem); return; }
    nameLock.current = true; setSaving(true); setNameError(null);
    try { await updateUsername({ username: value }); setEditing(false); toast.success('Username updated'); }
    catch (cause) { setNameError(cause instanceof Error ? cause.message : 'Could not update username'); }
    finally { nameLock.current = false; setSaving(false); }
  }
  return <div className={prominent ? s.profileIdentity : "space-y-2"}>
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Change avatar" disabled={busy} onClick={() => input.current?.click()} className={`${prominent ? s.profileAvatar : ''} group relative size-18 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
        <Avatar className="size-18"><AvatarImage src={profile?.avatar ?? undefined} alt="Profile" /><AvatarFallback>{profile?.username?.charAt(0).toUpperCase() || 'U'}</AvatarFallback></Avatar>
        <span className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/30 transition-opacity ${busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>{busy ? <Loader2 className="size-5 animate-spin text-white" /> : <Camera className="size-4 text-white" />}</span>
      {prominent && <span className={s.avatarCamera}><Camera size={12}/></span>}
      </button>
      <input ref={input} className="hidden" aria-label="Avatar image" type="file" accept="image/*" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
      <div className="min-w-0 flex-1 space-y-1">{editing ? <form className={prominent ? s.profileNameForm : "flex flex-wrap gap-2"} onSubmit={event => { event.preventDefault(); void saveName(); }}>
        <Input aria-label="Username" aria-invalid={!!nameError} value={name} autoFocus maxLength={20} disabled={saving} onChange={event => { setName(typedName(event.target.value)); setNameError(null); }} onKeyDown={event => { if (event.key === 'Escape' && !saving) { event.preventDefault(); event.stopPropagation(); setEditing(false); } }} />
        <Button type="submit" size="icon" disabled={saving || !name.trim()} aria-label="Save name">{saving ? <Loader2 className="animate-spin" /> : <Check />}</Button><Button type="button" variant="ghost" size="icon" disabled={saving} aria-label="Cancel name change" onClick={() => { setEditing(false); setNameError(null); }}><X /></Button>
      </form> : <div className="flex items-center gap-1"><span className={prominent ? s.profileName : "truncate font-semibold"} title={profile?.username}>{profile?.username || 'Your name'}</span><Button variant="ghost" size="icon" aria-label="Edit name" onClick={() => { setName(profile?.username ?? ''); setEditing(true); setNameError(null); }}><Pencil /></Button></div>}
      </div>
    </div>
    {nameError && <p role="alert" className="text-sm text-destructive">{nameError}</p>}
    {message && <CopyError message={message} />}</div>;
}
